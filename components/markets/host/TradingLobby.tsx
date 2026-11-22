"use client";

import { useState } from "react";
import Link from "next/link";
import { QRCodeSVG } from "qrcode.react";
import { joinDisplayUrl, joinUrl } from "@/lib/game/db";
import { COLOR } from "@/lib/design/colors";
import { tradePresentPath } from "@/lib/markets/routes";
import { roundsLine } from "@/lib/markets/trading/summary";
import {
  Banner,
  Button,
  Card,
  SectionTitle,
  buttonClasses,
} from "@/components/ui";
import { ArrowRight, Check, Monitor, Trash, Users } from "@/components/icons";
import { CondensedList } from "@/components/CondensedList";
import { useConfirm } from "@/components/ConfirmDialog";
import { useToast } from "@/components/Toast";
import type { HostActions, HostModel } from "./model";
import { DevDataBanner, RealDates, SettingsDisclosure } from "./parts";
import { isSimulatedMarket } from "@/lib/markets/trading/config";

// The lobby is a live roster, not a ranking: every name stays visible until the
// list is long enough that ~100 animated chips become a real jank source.
const LOBBY_CONDENSE = { threshold: 24 };

const ON_INK =
  "shadow-[3px_3px_0_rgb(var(--brand))] hover:shadow-[4px_4px_0_rgb(var(--brand))]";

/**
 * Before the game: the join panel the room can scan, the roster as it fills,
 * and Start. Below them, the companies the class will trade (by their game
 * names), the session's settings and, for the host only, the real era.
 */
export function TradingLobby({
  model,
  actions,
}: {
  model: HostModel;
  actions: HostActions;
}) {
  const confirm = useConfirm();
  const toast = useToast();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);
  const { players, cfg } = model;
  const link = joinUrl(model.joinCode);

  async function run(fn: () => Promise<string | null>) {
    setBusy(true);
    setError(null);
    const e = await fn();
    // on success the session row flips to 'active' and the page re-renders
    if (e) {
      setError(e);
      setBusy(false);
    }
  }

  async function deleteSession() {
    const ok = await confirm({
      title: `Delete session ${model.joinCode}?`,
      body: "This permanently removes the lobby and everyone who has joined it. It cannot be undone.",
      confirmLabel: "Delete session",
      tone: "danger",
    });
    if (ok) void run(actions.deleteSession);
  }

  async function copyLink() {
    try {
      await navigator.clipboard.writeText(link);
      setCopied(true);
      toast("Join link copied");
      setTimeout(() => setCopied(false), 1500);
    } catch {
      toast("Couldn't copy: the link is shown above the button", {
        tone: "error",
      });
    }
  }

  const equities = model.instruments.filter((i) => i.kind === "equity");
  const index = model.instruments.find((i) => i.kind === "index_fund");

  return (
    <main className="mx-auto max-w-5xl px-4 py-6 sm:px-6 sm:py-10">
      {model.devData ? (
        <div className="mb-6">
          <DevDataBanner />
        </div>
      ) : null}
      <div className="grid grid-cols-1 gap-8 lg:grid-cols-2">
        {/* shadow-lift-brand, never shadow-lift: an ink offset under an ink
            panel shows only as a notch at two corners (DESIGN.md §4). */}
        <div className="flex animate-pop-in flex-col items-center rounded-2xl border-2 border-ink bg-ink p-6 text-center text-paper-inverse shadow-lift-brand">
          <p className="font-display text-sm font-extrabold uppercase tracking-[0.2em] text-paper-inverse/70">
            Game code
          </p>
          {/* text-5xl below sm: six 0.9em tiles must fit a 375px phone */}
          <p className="flex font-mono text-5xl font-black text-paper-inverse sm:text-7xl">
            {model.joinCode.split("").map((ch, i) => (
              <span
                key={i}
                className="stagger inline-block w-[0.9em] animate-count-pop text-center"
                style={{ "--i": i + 2 } as React.CSSProperties}
              >
                {ch}
              </span>
            ))}
          </p>
          <div className="my-6 rounded-2xl border-2 border-ink bg-white p-4 shadow-card">
            <div className="w-[180px] sm:w-[220px]">
              <QRCodeSVG
                value={link}
                size={220}
                fgColor={COLOR.ink}
                className="h-auto w-full"
              />
            </div>
          </div>
          <p className="break-all font-editorial italic text-paper-inverse/75">
            join at {joinDisplayUrl()}
          </p>
          <div className="mt-6 flex flex-wrap items-center justify-center gap-3">
            <Button
              variant="secondary"
              onClick={copyLink}
              className={`min-w-[9.5rem] ${ON_INK}`}
            >
              {copied ? (
                <>
                  <Check /> Copied
                </>
              ) : (
                "Copy link"
              )}
            </Button>
            <Link
              href={tradePresentPath(model.sessionId)}
              target="_blank"
              className={buttonClasses("secondary", "md", ON_INK)}
              title="Open the projector view in a new tab"
            >
              <Monitor /> Present
            </Link>
          </div>
        </div>

        <Card className="flex flex-col">
          <SectionTitle
            action={
              <span
                key={players.length}
                className="flex animate-count-pop items-center gap-2 rounded-full border-2 border-ink bg-play-soft px-3 py-1 font-mono text-2xl font-bold text-ink shadow-card"
                aria-label={`${players.length} joined`}
              >
                <Users className="text-[0.8em] text-ink-muted" />
                {players.length}
              </span>
            }
          >
            Players joined
          </SectionTitle>

          {players.length === 0 ? (
            <div className="mt-4 flex flex-1 flex-col items-center justify-center gap-3 rounded-xl border-2 border-dashed border-ink/30 px-4 py-10 text-center">
              <span className="flex gap-1.5" aria-hidden="true">
                {[0, 1, 2].map((i) => (
                  <span
                    key={i}
                    className="h-2.5 w-2.5 animate-pulse-soft rounded-full bg-ink-muted"
                    style={{ animationDelay: `${i * 0.25}s` }}
                  />
                ))}
              </span>
              <p className="font-editorial italic text-ink-muted">
                Waiting for players: share the code or the QR.
              </p>
            </div>
          ) : (
            <CondensedList
              items={players}
              keyOf={(p) => p.id}
              as="ul"
              options={LOBBY_CONDENSE}
              moreNoun="players"
              className="mt-4 flex max-h-[42vh] flex-1 flex-wrap content-start gap-2 overflow-y-auto p-1"
              gapClassName="font-editorial text-sm italic text-ink-muted hover:text-ink"
              toggleClassName="mt-2 font-editorial text-sm italic text-ink-muted hover:text-ink"
              renderItem={(p, i) => (
                <li
                  className={`flex max-w-full animate-pop-in items-center gap-1 rounded-full border-2 border-ink py-1 pl-3.5 pr-1.5 font-semibold text-ink shadow-card ${
                    [
                      "bg-brand-soft",
                      "bg-play-soft",
                      "bg-gain-soft",
                      "bg-surface",
                    ][i % 4]
                  }`}
                >
                  <span className="min-w-0 truncate">{p.display_name}</span>
                  {actions.manage ? (
                    actions.manage(p)
                  ) : (
                    <span className="w-2" />
                  )}
                </li>
              )}
            />
          )}

          {error ? (
            <div className="mt-4">
              <Banner kind="error">{error}</Banner>
            </div>
          ) : null}

          <div className="mt-6">
            {/* The headline "start" CTA is gold (DESIGN.md §7). */}
            <Button
              variant="gold"
              onClick={() => run(actions.start)}
              disabled={busy || players.length === 0}
              className="w-full text-lg shadow-pop"
            >
              {busy ? (
                "Starting…"
              ) : (
                <>
                  Start the game <ArrowRight />
                </>
              )}
            </Button>
            <p className="mt-2 text-center font-editorial text-sm italic text-ink-muted">
              {players.length === 0
                ? "Needs at least one player to start."
                : `${roundsLine(cfg)} · late joiners ${
                    cfg.allow_late_join
                      ? "can still get in"
                      : "are locked out once it starts"
                  }`}
            </p>
            <div className="mt-3 flex justify-center">
              <Button
                variant="ghost"
                size="sm"
                onClick={deleteSession}
                disabled={busy}
                className="text-loss hover:bg-loss-soft hover:text-loss"
              >
                <Trash /> Delete session
              </Button>
            </div>
          </div>
        </Card>
      </div>

      <div className="mt-8 grid grid-cols-1 gap-6 lg:grid-cols-2">
        <Card>
          <SectionTitle
            info={
              isSimulatedMarket(cfg)
                ? "The names students trade under, in a simulated market."
                : "The game names students trade under. The real companies are revealed when the game ends."
            }
            infoLabel="About the market"
          >
            The market
          </SectionTitle>
          <p className="mt-1 text-sm text-ink-muted">
            {equities.length} companies{index ? " and an index fund" : ""}
          </p>
          <ul className="mt-3 flex max-h-72 flex-wrap gap-1.5 overflow-y-auto p-0.5">
            {index ? (
              <li className="flex items-center gap-1.5 rounded-lg border-2 border-ink bg-play-soft px-2 py-1 text-sm font-semibold text-ink">
                <span className="font-mono text-xs font-extrabold">
                  {index.ticker}
                </span>
                {index.name}
              </li>
            ) : null}
            {equities.map((i) => (
              <li
                key={i.slot}
                className="flex items-center gap-1.5 rounded-lg border-2 border-ink bg-surface px-2 py-1 text-sm text-ink"
                title={`${i.name} · ${i.sector}`}
              >
                <span className="font-mono text-xs font-extrabold">
                  {i.ticker}
                </span>
                <span className="max-w-[10rem] truncate">{i.name}</span>
              </li>
            ))}
          </ul>
        </Card>
        <div className="space-y-4">
          <SettingsDisclosure
            cfg={cfg}
            knobs={model.knobs}
            conditions={model.conditions}
          />
          {isSimulatedMarket(cfg) ? null : (
            <RealDates
              loadTruth={actions.loadTruth}
              instruments={model.instruments}
            />
          )}
        </div>
      </div>
    </main>
  );
}
