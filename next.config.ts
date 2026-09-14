import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // bcrypt loads its native binding via a runtime-computed path
  // (node-gyp-build), which static bundlers can't reliably trace — leave
  // it external so Node resolves it normally and Vercel's own file
  // tracing picks up the correct prebuilt binary.
  serverExternalPackages: ["bcrypt"],
};

export default nextConfig;
