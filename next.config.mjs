import createNextIntlPlugin from "next-intl/plugin";

const withNextIntl = createNextIntlPlugin("./src/i18n/request.ts");

/** @type {import("next").NextConfig} */
const config = {
  poweredByHeader: false,
  outputFileTracingRoot: import.meta.dirname,
  // CSP etc. arrive with the hardening module; these are safe defaults for every page
  // The apartment-owner area used to live under /owner. Old bookmarks and notification links keep working.
  async redirects() {
    return [
      { source: "/:locale(en|bn)/owner/:path*", destination: "/:locale/home-owner/:path*", permanent: false },
      { source: "/owner/:path*", destination: "/home-owner/:path*", permanent: false },
    ];
  },
  async headers() {
    return [
      {
        source: "/:path*",
        headers: [
          { key: "X-Content-Type-Options", value: "nosniff" },
          { key: "X-Frame-Options", value: "DENY" },
          { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
        ],
      },
    ];
  },
};

export default withNextIntl(config);
