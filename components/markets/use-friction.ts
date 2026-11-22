"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { FrictionProfile, SessionConfig } from "@/lib/game/types";
import { tradingConfigOf } from "@/lib/markets/trading/config";
import { CONSENT_VERSION } from "@/lib/research/consent";
import { FRICTION_PRESETS, knobsFor, KNOB_KEYS, type FrictionKnobs } from "@/lib/research/friction";

/**
 * The session's own friction: its profile with its overrides on top. What the
 * host's screens describe, and what every student gets in a one-profile
 * session. Students read theirs through useMyConditions, which also covers
 * per-player arms.
 */
export function useFriction(config: SessionConfig): FrictionKnobs {
  return useMemo(() => knobsFor(tradingConfigOf(config)), [config]);
}

export interface MyConditions {
  knobs: FrictionKnobs;
  researchMode: boolean;
  /** null until the student answers the consent screen (research mode only) */
  consent: boolean | null;
}

/** A get_my_conditions payload read defensively: a knob it lacks stays at the standard preset. */
export function parseConditions(data: unknown): MyConditions | null {
  if (!data || typeof data !== "object") return null;
  const d = data as { knobs?: Partial<FrictionKnobs>; research_mode?: unknown; consent?: unknown };
  const knobs = { ...FRICTION_PRESETS.standard };
  for (const k of KNOB_KEYS) {
    const v = d.knobs?.[k];
    if (v !== undefined) (knobs as Record<string, unknown>)[k] = v;
  }
  return {
    knobs,
    researchMode: d.research_mode === true,
    consent: d.consent === true ? true : d.consent === false ? false : null,
  };
}

/**
 * This student's friction knobs and consent, from get_my_conditions (0035):
 * the resolved knobs only, never which arm they are in. Nothing renders the
 * trading screens until they arrive, so a student never glimpses the wrong
 * condition. `setConsent` records the consent screen's answer.
 */
export function useMyConditions(
  supabase: SupabaseClient,
  sessionId: string,
): {
  conditions: MyConditions | null;
  failed: boolean;
  retry: () => void;
  setConsent: (yes: boolean) => Promise<string | null>;
} {
  const [conditions, setConditions] = useState<MyConditions | null>(null);
  const [failed, setFailed] = useState(false);
  const [attempt, setAttempt] = useState(0);

  useEffect(() => {
    let active = true;
    setFailed(false);
    void supabase.rpc("get_my_conditions", { p_session_id: sessionId }).then(({ data, error }) => {
      if (!active) return;
      const parsed = error ? null : parseConditions(data);
      if (parsed) setConditions(parsed);
      else setFailed(true);
    });
    return () => {
      active = false;
    };
  }, [supabase, sessionId, attempt]);

  const retry = useCallback(() => setAttempt((n) => n + 1), []);

  const setConsent = useCallback(
    async (yes: boolean) => {
      const { error } = await supabase.rpc("record_consent", {
        p_session_id: sessionId,
        p_consented: yes,
        p_version: CONSENT_VERSION,
      });
      if (error) return error.message;
      setConditions((c) => (c ? { ...c, consent: yes } : c));
      return null;
    },
    [supabase, sessionId],
  );

  return { conditions, failed, retry, setConsent };
}

export interface SessionConditions {
  assignment: "session" | "per_player";
  profile: FrictionProfile;
  arms: FrictionProfile[];
  overrides: Partial<FrictionKnobs>;
  researchMode: boolean;
  /** active students per arm */
  armCounts: { arm: FrictionProfile; players: number }[];
  /** each active student's arm (host only, never on the projector) */
  players: { player_id: string; arm: FrictionProfile }[];
  consent: { agreed: number; declined: number; undecided: number };
}

/**
 * The host's view of the experiment (get_session_conditions): students per
 * arm and consent counts, refetched whenever `refreshKey` changes (the roster).
 */
export function useSessionConditions(
  supabase: SupabaseClient,
  sessionId: string,
  refreshKey: string | number,
): SessionConditions | null {
  const [state, setState] = useState<SessionConditions | null>(null);
  useEffect(() => {
    let active = true;
    void supabase.rpc("get_session_conditions", { p_session_id: sessionId }).then(({ data, error }) => {
      if (!active || error || !data) return;
      const d = data as {
        assignment: SessionConditions["assignment"];
        profile: FrictionProfile;
        arms: FrictionProfile[];
        overrides: Partial<FrictionKnobs>;
        research_mode: boolean;
        arm_counts: SessionConditions["armCounts"];
        players: SessionConditions["players"];
        consent: SessionConditions["consent"];
      };
      setState({
        assignment: d.assignment,
        profile: d.profile,
        arms: d.arms ?? [],
        overrides: d.overrides ?? {},
        researchMode: d.research_mode === true,
        armCounts: d.arm_counts ?? [],
        players: d.players ?? [],
        consent: d.consent ?? { agreed: 0, declined: 0, undecided: 0 },
      });
    });
    return () => {
      active = false;
    };
  }, [supabase, sessionId, refreshKey]);
  return state;
}
