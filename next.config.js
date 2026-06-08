/** @type {import('next').NextConfig} */

// Baseline security headers applied to every response. Intentionally NO
// Content-Security-Policy here yet — a CSP must explicitly allow the Supabase
// REST (https) and realtime (wss) origins or it silently breaks live updates,
// so that's a separate, carefully-tested change.
const securityHeaders = [
  // Clickjacking: this app is never meant to be embedded in an iframe.
  { key: "X-Frame-Options", value: "DENY" },
  // Don't let browsers MIME-sniff a response into a different content type.
  { key: "X-Content-Type-Options", value: "nosniff" },
  // Don't leak full URLs (which can contain join codes) to third parties.
  { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
  // Disable powerful browser APIs the app doesn't use.
  {
    key: "Permissions-Policy",
    value: "camera=(), microphone=(), geolocation=(), browsing-topics=()",
  },
  // Force HTTPS for two years (Vercel already serves over HTTPS).
  { key: "Strict-Transport-Security", value: "max-age=63072000; includeSubDomains; preload" },
];

const nextConfig = {
  reactStrictMode: true,
  async headers() {
    return [{ source: "/:path*", headers: securityHeaders }];
  },
};

module.exports = nextConfig;
