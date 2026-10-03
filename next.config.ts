import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Development streaming can accumulate drain listeners in Next's gzip layer.
  // Local responses do not need compression; production keeps it enabled.
  compress: process.env.NODE_ENV !== "development",
  // Keep client assets and Server Actions tied to the same deployment during
  // rolling updates. NEXT_DEPLOYMENT_ID is also supported for self-hosting.
  deploymentId:
    process.env.NEXT_DEPLOYMENT_ID ||
    process.env.VERCEL_DEPLOYMENT_ID ||
    undefined,
  experimental: {
    serverActions: {
      bodySizeLimit: "25mb",
    },
  },
};

export default nextConfig;
