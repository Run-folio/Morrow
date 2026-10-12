import type { NextConfig } from "next";

const staticExport = process.env.STATIC_EXPORT === "1";
const distDir = process.env.NEXT_DIST_DIR ?? ".next";
const buildCommit = process.env.COMMIT_REF ?? process.env.VERCEL_GIT_COMMIT_SHA ?? "";
const buildContext = process.env.CONTEXT ?? process.env.VERCEL_ENV ?? "";
// Opt in for one reviewed QA artifact. Only the derived flag reaches the client;
// the console sink also requires the exact HTTPS staging origin.
const qaPersistenceDiagnostics = process.env.MORROVIA_QA_PERSISTENCE_DIAGNOSTICS === "1"
  && /^[a-f0-9]{40}$/i.test(buildCommit)
  && process.env.MORROVIA_QA_EXPECTED_COMMIT === buildCommit;

const nextConfig: NextConfig = {
  distDir,
  outputFileTracingIncludes: {'/api/journey-geocode':['./data/place-reference/**/*'],'/api/journey-discover':['./data/place-reference/**/*'],'/api/journey-route-image':['./data/place-reference/**/*']},
  // Netlify exposes Git metadata while building, but not as read-only Function
  // runtime variables. Embed only these non-sensitive provenance values so a
  // deployed server route can identify the artifact actually serving traffic.
  env: {
    MORROVIA_BUILD_COMMIT: buildCommit,
    MORROVIA_BUILD_CONTEXT: buildContext,
    MORROVIA_QA_PERSISTENCE_DIAGNOSTICS: qaPersistenceDiagnostics ? "1" : "0",
  },
  ...(staticExport ? { output: "export" as const } : {}),
  async redirects() {
    return [
      {
        source: "/journey/home",
        destination: "/",
        permanent: true,
      },
    ];
  },
  images: {
    ...(staticExport ? { unoptimized: true } : {}),
    // Keep Next's defaults and add the missing DPR3 step for 430px Homepage heroes.
    deviceSizes: [640, 750, 828, 1080, 1200, 1440, 1920, 2048, 3840],
    remotePatterns: [
      {
        protocol: "https",
        hostname: "res.cloudinary.com",
        pathname: "/dbt3wkwa3/**",
      },
      {
        protocol: "https",
        hostname: "upload.wikimedia.org",
        pathname: "/wikipedia/commons/**",
      },
      {
        protocol: "https",
        hostname: "thumb.wikimedia.org",
        pathname: "/wikipedia/commons/**",
      },
      {
        protocol: "https",
        hostname: "commons.wikimedia.org",
        pathname: "/wiki/Special:FilePath/**",
      },
      {
        protocol: "https",
        hostname: "images.unsplash.com",
        pathname: "/**",
      },
    ],
  },
};

export default nextConfig;
