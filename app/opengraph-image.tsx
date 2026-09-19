import { ImageResponse } from "next/og";
import { COLOR } from "@/lib/design/colors";

/**
 * The card shown when a link to the site is pasted into Slack, email, Teams or
 * a course page. Drawn in code from the design tokens rather than a screenshot,
 * so it never goes stale when the UI changes.
 */
// Edge, not Node: Next 14's Node build of @vercel/og resolves its bundled font
// with fileURLToPath and throws "Invalid URL" on Windows, failing `next build`.
export const runtime = "edge";
export const alt = "The Risk Game — a classroom simulation of investment risk";
export const size = { width: 1200, height: 630 };
export const contentType = "image/png";

/**
 * Archivo, the site's display face, fetched as TrueType (what the renderer
 * reads — not the woff2 next/font serves). Google returns TTF to a client that
 * sends no browser user agent. On any failure the card still renders, in the
 * renderer's default sans.
 */
async function archivo(weight: number): Promise<ArrayBuffer | null> {
  try {
    const css = await (
      await fetch(`https://fonts.googleapis.com/css2?family=Archivo:wght@${weight}`)
    ).text();
    const src = css.match(/src: url\((.+?)\) format\('(?:opentype|truetype)'\)/)?.[1];
    if (!src) return null;
    return await (await fetch(src)).arrayBuffer();
  } catch {
    return null;
  }
}

export default async function OpengraphImage() {
  const [black, bold] = await Promise.all([archivo(900), archivo(700)]);
  const fonts = [
    ...(black ? [{ name: "Archivo", data: black, weight: 900 as const, style: "normal" as const }] : []),
    ...(bold ? [{ name: "Archivo", data: bold, weight: 700 as const, style: "normal" as const }] : []),
  ];

  const chip = (label: string, bg: string, fg: string) => (
    <div
      style={{
        display: "flex",
        padding: "12px 24px",
        borderRadius: 999,
        border: `4px solid ${COLOR.ink}`,
        background: bg,
        color: fg,
        fontSize: 30,
        fontWeight: 700,
      }}
    >
      {label}
    </div>
  );

  return new ImageResponse(
    (
      <div
        style={{
          width: "100%",
          height: "100%",
          display: "flex",
          padding: 56,
          background: COLOR.paper,
          fontFamily: fonts.length ? "Archivo" : undefined,
        }}
      >
        <div
          style={{
            flex: 1,
            display: "flex",
            flexDirection: "column",
            justifyContent: "space-between",
            padding: 56,
            borderRadius: 40,
            border: `6px solid ${COLOR.ink}`,
            background: COLOR.surface,
            boxShadow: `14px 14px 0 ${COLOR.ink}`,
          }}
        >
          <div style={{ display: "flex", alignItems: "center", gap: 20 }}>
            <div
              style={{
                width: 64,
                height: 64,
                borderRadius: 999,
                background: COLOR.ink,
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
              }}
            >
              <div style={{ width: 26, height: 26, borderRadius: 999, background: COLOR.brand }} />
            </div>
            <div style={{ display: "flex", fontSize: 40, fontWeight: 900, color: COLOR.ink, letterSpacing: -1 }}>
              THE RISK GAME
              <span style={{ color: COLOR.brand }}>.</span>
            </div>
          </div>

          <div style={{ display: "flex", flexDirection: "column" }}>
            <div style={{ fontSize: 76, fontWeight: 900, lineHeight: 1.02, color: COLOR.ink, letterSpacing: -2 }}>
              A classroom simulation
            </div>
            <div style={{ fontSize: 76, fontWeight: 900, lineHeight: 1.02, color: COLOR.ink, letterSpacing: -2 }}>
              of investment risk.
            </div>
          </div>

          <div style={{ display: "flex", gap: 18 }}>
            {chip("Phones in hand", COLOR.brand, COLOR.ink)}
            {chip("Market up", COLOR.gain, "#FFFFFF")}
            {chip("Market down", COLOR.loss, "#FFFFFF")}
          </div>
        </div>
      </div>
    ),
    { ...size, fonts: fonts.length ? fonts : undefined },
  );
}
