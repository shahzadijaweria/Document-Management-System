import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Produces a self-contained build (.next/standalone) that's perfect for Docker.
  // The standalone output ships only the runtime files Next actually needs —
  // dramatically smaller image. Locally it has no effect on `next dev`.
  output: "standalone",
};

export default nextConfig;
