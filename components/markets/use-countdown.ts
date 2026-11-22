"use client";

import { useEffect, useState } from "react";
import { secondsLeft } from "@/lib/markets/clock";

/**
 * Whole seconds until `closesAt`, re-rendering four times a second until it
 * passes; null when there is no deadline. Display only: the device clock may
 * be a little off, and place_order is what enforces the deadline.
 */
export function useCountdown(closesAt: string | null | undefined): number | null {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    setNow(Date.now());
    if (!closesAt) return;
    const end = Date.parse(closesAt);
    const id = setInterval(() => {
      const t = Date.now();
      setNow(t);
      if (!(t < end)) clearInterval(id);
    }, 250);
    return () => clearInterval(id);
  }, [closesAt]);
  // The tick state only schedules renders; the clock is read fresh, so a new
  // deadline never counts from the time of an older render.
  return secondsLeft(closesAt, Math.max(now, Date.now()));
}
