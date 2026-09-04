import type { NextConfig } from "next";

const nextConfig: NextConfig = {
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
