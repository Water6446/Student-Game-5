import sys
sys.path.insert(0, ".scratch")
from edit import patch

patch("lib/game/manager.ts", [
(
'''/** Dollar amounts from percent-of-wealth inputs, rounded to cents. */''',
'''/**
 * Annualized (geometric) return of a net-of-fees yearly path — the definition
 * behind the 5-year and 10-year prospectus figures, mirroring the SQL in
 * _gen_track_record. All three headline figures are read off ONE path; drawing
 * them independently is the classic way to get a prospectus wrong.
 *
 * Each factor is floored just above zero: a sub -100% year is a ~6-sigma draw,
 * but a fractional power of a negative base is not a real number.
 */
export function annualizedReturn(yearly: number[]): number | null {
  if (yearly.length === 0) return null;
  let cum = 1;
  for (const r of yearly) cum *= Math.max(1 + r, 0.0001);
  return Math.pow(cum, 1 / yearly.length) - 1;
}

/** Dollar amounts from percent-of-wealth inputs, rounded to cents. */'''
),
])
