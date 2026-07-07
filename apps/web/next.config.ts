import type { NextConfig } from "next";
import { join } from "node:path";

const nextConfig: NextConfig = {
  // Self-hosted (DigitalOcean container) build: emit a minimal standalone server
  // (.next/standalone) so the Docker image doesn't need the full node_modules.
  output: "standalone",
  // Monorepo: trace files from the repo root (apps/web is two levels down) so the
  // standalone bundle includes workspace deps.
  outputFileTracingRoot: join(import.meta.dirname, "../.."),
  allowedDevOrigins: ["127.0.0.1", "192.168.88.51", "100.126.116.7"],
};

export default nextConfig;
