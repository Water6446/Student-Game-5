#!/usr/bin/env node
// =============================================================================
// db-selftest.mjs — the offline database self-tests. No Docker, no cloud.
//
//   npm run test:db              both suites
//   npm run test:db -- game      scripts/db_selftest.sql only
//   npm run test:db -- accounts  scripts/accounts_selftest.sql only
//
// Each suite gets a fresh, throwaway Postgres (PGlite: real Postgres compiled to
// WebAssembly, in-process), then:
//   1. scripts/_supabase_mock.sql — just enough of Supabase's auth surface
//   2. EVERY file in supabase/migrations, in order — the schema as deployed
//   3. the suite, through a small psql emulator (see runScript below)
//
// A suite fails on the first statement that errors; every assertion in the SQL
// is a RAISE, so that is also the first broken invariant. Exit code 1.
// =============================================================================
import { PGlite } from "@electric-sql/pglite";
import { readFileSync, readdirSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const HERE = dirname(fileURLToPath(import.meta.url));
const ROOT = join(HERE, "..");
const MIGRATIONS = join(ROOT, "supabase", "migrations");

const SUITES = {
  game: "db_selftest.sql",
  accounts: "accounts_selftest.sql",
};

// PGlite ships without pgcrypto. The migrations only need gen_random_uuid(),
// which is core Postgres since 13, so the extension line is dropped here — and
// only here; the deployed migrations are untouched.
const forPglite = (sql) => sql.replace(/create extension if not exists pgcrypto;/gi, "");

const read = (path) => readFileSync(path, "utf8");

async function freshDatabase() {
  const db = new PGlite();
  await db.exec(forPglite(read(join(HERE, "_supabase_mock.sql"))));
  const files = readdirSync(MIGRATIONS).filter((f) => f.endsWith(".sql")).sort();
  for (const f of files) {
    try {
      await db.exec(forPglite(read(join(MIGRATIONS, f))));
    } catch (e) {
      throw new Error(`migration ${f} failed to apply: ${e.message}`);
    }
  }
  return { db, migrations: files.length };
}

// ---- psql emulation ----------------------------------------------------------
// The suites are psql scripts. They use exactly three psql features, handled
// here: `\set name 'value'`, a trailing `\gset` (store the row's columns as
// variables), and variable interpolation — :'name' (quoted literal), :"name"
// (quoted identifier) and :name (raw). Like psql, nothing is interpolated inside
// string literals, quoted identifiers, dollar-quoted bodies or comments, and
// `::` is a cast, not a variable.

/** Split a script into SQL statements and backslash meta-commands. */
function splitScript(text) {
  const items = [];
  let buf = "";
  let i = 0;
  const n = text.length;
  const flush = (gset) => {
    if (buf.trim()) items.push({ kind: "sql", sql: buf.trim(), gset });
    buf = "";
  };

  while (i < n) {
    const c = text[i];

    // A backslash command on a line of its own (only when no statement is open).
    if (c === "\\" && !buf.trim()) {
      const end = text.indexOf("\n", i);
      const line = text.slice(i, end === -1 ? n : end).trim();
      items.push({ kind: "meta", line });
      i = end === -1 ? n : end + 1;
      continue;
    }
    // `\gset` ends the open statement and captures its row.
    if (c === "\\" && text.startsWith("\\gset", i)) {
      flush(true);
      i += "\\gset".length;
      continue;
    }
    // Comments are kept inside a statement but dropped between statements, so
    // a trailing comment never becomes an empty "statement" of its own.
    if (c === "-" && text[i + 1] === "-") {
      const end = text.indexOf("\n", i);
      const stop = end === -1 ? n : end;
      if (buf.trim()) buf += text.slice(i, stop);
      i = stop;
      continue;
    }
    if (c === "/" && text[i + 1] === "*") {
      const end = text.indexOf("*/", i + 2);
      const stop = end === -1 ? n : end + 2;
      if (buf.trim()) buf += text.slice(i, stop);
      i = stop;
      continue;
    }
    if (c === "'" || c === '"') {
      const stop = closeQuote(text, i, c);
      buf += text.slice(i, stop);
      i = stop;
      continue;
    }
    if (c === "$") {
      const tag = text.slice(i).match(/^\$[A-Za-z_]*\$/);
      if (tag) {
        const end = text.indexOf(tag[0], i + tag[0].length);
        const stop = end === -1 ? n : end + tag[0].length;
        buf += text.slice(i, stop);
        i = stop;
        continue;
      }
    }
    if (c === ";") {
      buf += c;
      flush(false);
      i++;
      continue;
    }
    buf += c;
    i++;
  }
  flush(false);
  return items;
}

/** Index just past the quote opened at `start` ('' and "" are escapes). */
function closeQuote(text, start, q) {
  let i = start + 1;
  while (i < text.length) {
    if (text[i] === q) {
      if (text[i + 1] === q) {
        i += 2;
        continue;
      }
      return i + 1;
    }
    i++;
  }
  return text.length;
}

/** psql variable interpolation, outside quotes, comments and dollar quotes. */
function interpolate(sql, vars) {
  let out = "";
  let i = 0;
  const n = sql.length;
  const name = (from) => sql.slice(from).match(/^[A-Za-z_][A-Za-z0-9_]*/)?.[0];
  const need = (k) => {
    if (!(k in vars)) throw new Error(`psql variable :${k} is not set`);
    return String(vars[k]);
  };

  while (i < n) {
    const c = sql[i];
    if (c === ":" && sql[i + 1] === ":") {
      out += "::";
      i += 2;
      continue;
    }
    if (c === ":" && (sql[i + 1] === "'" || sql[i + 1] === '"')) {
      const q = sql[i + 1];
      const k = name(i + 2);
      if (k && sql[i + 2 + k.length] === q) {
        const v = need(k);
        out += q === "'" ? `'${v.replace(/'/g, "''")}'` : `"${v.replace(/"/g, '""')}"`;
        i += 3 + k.length;
        continue;
      }
    }
    if (c === ":") {
      const k = name(i + 1);
      if (k && k in vars) {
        out += String(vars[k]);
        i += 1 + k.length;
        continue;
      }
    }
    if (c === "-" && sql[i + 1] === "-") {
      const end = sql.indexOf("\n", i);
      const stop = end === -1 ? n : end;
      out += sql.slice(i, stop);
      i = stop;
      continue;
    }
    if (c === "/" && sql[i + 1] === "*") {
      const end = sql.indexOf("*/", i + 2);
      const stop = end === -1 ? n : end + 2;
      out += sql.slice(i, stop);
      i = stop;
      continue;
    }
    if (c === "'" || c === '"') {
      const stop = closeQuote(sql, i, c);
      out += sql.slice(i, stop);
      i = stop;
      continue;
    }
    if (c === "$") {
      const tag = sql.slice(i).match(/^\$[A-Za-z_]*\$/);
      if (tag) {
        const end = sql.indexOf(tag[0], i + tag[0].length);
        const stop = end === -1 ? n : end + tag[0].length;
        out += sql.slice(i, stop);
        i = stop;
        continue;
      }
    }
    out += c;
    i++;
  }
  return out;
}

async function runScript(db, script) {
  const vars = {};
  let statements = 0;
  let passes = 0;
  const onNotice = (msg) => {
    if (!["NOTICE", "WARNING", "INFO"].includes(msg.severity)) return;
    if (msg.message.startsWith("PASS")) passes++;
    console.log(`  ${msg.message}`);
  };

  for (const item of splitScript(script)) {
    if (item.kind === "meta") {
      const set = item.line.match(/^\\set\s+([A-Za-z_][A-Za-z0-9_]*)\s+'(.*)'$/);
      if (set) vars[set[1]] = set[2];
      // anything else (\set ON_ERROR_STOP on) is psql session config: a no-op
      // here, since this runner always stops on the first error
      continue;
    }

    const sql = interpolate(item.sql, vars);
    statements++;
    let res;
    try {
      res = await db.query(sql, [], { onNotice });
    } catch (e) {
      const where = sql.length > 600 ? `${sql.slice(0, 600)}\n  …` : sql;
      throw new Error(`statement ${statements} failed: ${e.message}\n\n${where}`);
    }
    if (item.gset) {
      const row = res.rows[0];
      if (!row) throw new Error(`statement ${statements}: \\gset got no row\n\n${sql}`);
      Object.assign(vars, row);
    }
  }
  return { statements, passes };
}

// ---- main ------------------------------------------------------------------
const requested = process.argv.slice(2);
const unknown = requested.filter((s) => !(s in SUITES));
if (unknown.length) {
  console.error(`Unknown suite: ${unknown.join(", ")}. Choose from: ${Object.keys(SUITES).join(", ")}.`);
  process.exit(2);
}
const suites = requested.length ? requested : Object.keys(SUITES);

let failed = false;
for (const suite of suites) {
  const file = SUITES[suite];
  console.log(`\n==> ${file}`);
  try {
    const { db, migrations } = await freshDatabase();
    console.log(`  (mock + ${migrations} migrations applied)`);
    const { statements, passes } = await runScript(db, read(join(HERE, file)));
    console.log(`  -- ${passes} assertions passed, ${statements} statements`);
    await db.close();
  } catch (e) {
    failed = true;
    console.error(`\nFAILED in ${file}: ${e.message}`);
    break;
  }
}

console.log(failed ? "\nDB SELF-TEST FAILED" : "\nDB SELF-TEST PASSED");
process.exit(failed ? 1 : 0);
