import type { NextConfig } from "next";

const staticExport = process.env.STATIC_EXPORT === "1";
const distDir = process.env.NEXT_DIST_DIR ?? ".next";

const nextConfig: NextConfig = {
  distDir,
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
