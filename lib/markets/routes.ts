// Where the Markets section's screens live. One place, so the redirects from
// /play/<id> and /host/<id>, the join form and the dashboard agree.
import { isTrading, type SessionConfig } from "../game/types";

export const MARKETS_HUB = "/markets";
export const TRADE_NEW = "/markets/trade/new";

export const tradePlayPath = (sessionId: string) => `/markets/trade/play/${sessionId}`;
export const tradeHostPath = (sessionId: string) => `/markets/trade/host/${sessionId}`;
export const tradePresentPath = (sessionId: string) => `/markets/trade/host/${sessionId}/present`;

// The screens for any session, by game type. Links built from these skip the
// redirect hop through /play/<id> and /host/<id>; those redirects stay, for
// links that only know a session id (the resume strip, account history).
type HasConfig = { config: SessionConfig | null | undefined };
const trading = (s: HasConfig) => (s.config ? isTrading(s.config) : false);

/** The student's game screen. */
export const playPath = (id: string, s: HasConfig) => (trading(s) ? tradePlayPath(id) : `/play/${id}`);
/** The host's control screen. */
export const hostPath = (id: string, s: HasConfig) => (trading(s) ? tradeHostPath(id) : `/host/${id}`);
/** The projector. */
export const presentPath = (id: string, s: HasConfig) =>
  trading(s) ? tradePresentPath(id) : `/host/${id}/present`;
