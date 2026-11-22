import { describe, expect, it } from "vitest";
import { EXPORT_FIXTURE as T } from "./__fixtures__/export";
import { armsCsv, eventsCsv, exportFileName, fillsCsv, ordersCsv, playersCsv, roundsCsv } from "./export";
import { allMetrics, metricsByArm } from "./metrics";

const lines = (csv: string) => csv.split("\r\n");

describe("research CSVs", () => {
  it("has one row per student, pseudonym first, knobs and metrics alongside", () => {
    const csv = lines(playersCsv(T, allMetrics(T)));
    expect(csv).toHaveLength(3);
    const header = csv[0].split(",");
    expect(header.slice(0, 3)).toEqual(["pid", "arm", "consented"]);
    expect(header).toContain("cooldown_seconds");
    expect(header).toContain("disposition");
    expect(header).not.toContain("display_name");
    expect(csv[1].startsWith("P1,low,true,true,")).toBe(true);
  });

  it("writes orders with their decision context as JSON", () => {
    const csv = lines(ordersCsv(T));
    expect(csv[0]).toBe(
      "order_id,pid,round,slot,side,order_type,quantity,notional,limit_price,stop_price,tif,status,reject_reason,placed_at,closed_at,context",
    );
    expect(csv[1]).toContain('"{""ticket_ms"":4000,""review_ms"":1000,""from"":""stock""}"');
    expect(csv[4].endsWith(",")).toBe(true); // no context: an empty cell
  });

  it("writes fills and each round's clock", () => {
    expect(lines(fillsCsv(T))).toHaveLength(1 + T.fills.length);
    const rounds = lines(roundsCsv(T));
    expect(rounds[0]).toBe(
      "round,status,opened_at,closes_at,locked_at,revealed_at,first_game_day,last_game_day,index_return,movers",
    );
    expect(rounds[1].startsWith("1,revealed,2026-01-01T09:58:00Z,")).toBe(true);
  });

  it("defuses a payload a spreadsheet would run as a formula", () => {
    const csv = eventsCsv([
      { id: 7, pid: "P1", round: 2, type: "tap", client_ts: null, server_ts: "t", payload: { note: "=1+1" } },
    ]);
    expect(lines(csv)[1]).toBe('7,P1,2,tap,,t,"{""note"":""=1+1""}"');
  });

  it("summarizes each friction arm in one row", () => {
    const csv = lines(armsCsv(metricsByArm(allMetrics(T))));
    expect(csv[0].startsWith("arm,players,orders_per_round,")).toBe(true);
    expect(csv).toHaveLength(3);
    expect(csv[2].startsWith("low,1,")).toBe(true);
  });

  it("names the files", () => {
    expect(exportFileName("AB12CD", "orders")).toBe("sharpesim-research-AB12CD-orders.csv");
  });
});
