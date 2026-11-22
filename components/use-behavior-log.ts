"use client";

import { useCallback, useEffect, useRef } from "react";
import type { SupabaseClient } from "@supabase/supabase-js";
import {
  enqueue,
  makeEvent,
  MAX_BATCH,
  takeBatch,
  type BehaviorEvent,
  type BehaviorEventType,
} from "@/lib/research/events";

export type LogFn = (type: BehaviorEventType, payload?: Record<string, unknown>) => void;

const FLUSH_MS = 10_000;

/**
 * The research behaviour log (section-level): `log(type, payload)` queues an
 * event; batches go to log_behavior_events every 10 s, when 50 are waiting,
 * when the tab is hidden and on pagehide. A failed send keeps its events for
 * the next attempt. With `enabled` false nothing is queued or sent (research
 * mode without consent, Phase 7).
 */
export function useBehaviorLog(supabase: SupabaseClient, sessionId: string, enabled: boolean): LogFn {
  const queue = useRef<BehaviorEvent[]>([]);
  const sending = useRef(false);
  const on = useRef(enabled);
  on.current = enabled;

  const flush = useCallback(async () => {
    if (sending.current || queue.current.length === 0) return;
    sending.current = true;
    try {
      while (queue.current.length > 0) {
        const [batch, rest] = takeBatch(queue.current);
        queue.current = rest;
        const { error } = await supabase.rpc("log_behavior_events", {
          p_session_id: sessionId,
          p_events: batch,
        });
        if (error) {
          // keep them for next time (offline, rate limit); newest stay last
          queue.current = [...batch, ...queue.current];
          break;
        }
      }
    } finally {
      sending.current = false;
    }
  }, [supabase, sessionId]);

  const log = useCallback<LogFn>(
    (type, payload) => {
      if (!on.current) return;
      queue.current = enqueue(queue.current, makeEvent(type, payload));
      if (queue.current.length >= MAX_BATCH) void flush();
    },
    [flush],
  );

  useEffect(() => {
    if (!enabled) {
      queue.current = [];
      return;
    }
    const id = setInterval(() => void flush(), FLUSH_MS);
    const onVisibility = () => {
      log("visibility", { state: document.visibilityState });
      if (document.visibilityState === "hidden") void flush();
    };
    const onPageHide = () => void flush();
    document.addEventListener("visibilitychange", onVisibility);
    window.addEventListener("pagehide", onPageHide);
    return () => {
      clearInterval(id);
      document.removeEventListener("visibilitychange", onVisibility);
      window.removeEventListener("pagehide", onPageHide);
      void flush();
    };
  }, [enabled, flush, log]);

  return log;
}
