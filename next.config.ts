import type { NextConfig } from "next";
const config: NextConfig = {
  devIndicators: false,
  distDir: process.env.NEXT_DIST_DIR || ".next",
  serverExternalPackages: [
    "@electric-sql/pglite",
    "sharp",
    "firebase-admin",
    "pg",
  ],
  async redirects() {
    // Production aliases must use the same origin as the secure session/API.
    if (
      process.env.NODE_ENV !== "production" ||
      process.env.VERCEL_ENV === "preview"
    )
      return [];
    const origin = new URL(process.env.APP_ORIGIN || "https://zyvara.us");
    if (origin.protocol !== "https:") return [];
    const hosts = new Set([
      process.env.VERCEL_URL,
      process.env.VERCEL_BRANCH_URL,
      process.env.VERCEL_PROJECT_PRODUCTION_URL,
      "zyvara-five.vercel.app",
      "zyvara-henry-asantes-projects-8e465068.vercel.app",
      "zyvara-git-main-henry-asantes-projects-8e465068.vercel.app",
    ]);
    return [...hosts]
      .filter((host): host is string => !!host && host !== origin.hostname)
      .map((host) => ({
        source: "/:path*",
        has: [{ type: "host" as const, value: host.replace(/\./g, "\\.") }],
        destination: `${origin.origin}/:path*`,
        permanent: false,
      }));
  },
  async headers() {
    return [
      {
        source: "/:path*",
        headers: [
          { key: "X-Content-Type-Options", value: "nosniff" },
          { key: "Referrer-Policy", value: "same-origin" },
          { key: "X-Frame-Options", value: "DENY" },
        ],
      },
    ];
  },
};
export default config;
