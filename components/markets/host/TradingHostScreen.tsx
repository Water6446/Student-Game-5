"use client";

import type { HostActions, HostModel } from "./model";
import { TradingLobby } from "./TradingLobby";
import { TradingRoundControl } from "./TradingRoundControl";
import { TradingHostFinished } from "./TradingHostFinished";

/** The host's screen for each session status, from the model alone. */
export function TradingHostScreen({ model, actions }: { model: HostModel; actions: HostActions }) {
  if (model.status === "lobby") return <TradingLobby model={model} actions={actions} />;
  if (model.status === "finished") return <TradingHostFinished model={model} actions={actions} />;
  return <TradingRoundControl model={model} actions={actions} />;
}
