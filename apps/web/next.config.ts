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
  experimental: {
    // The Opportunity Generator uploads RFP PDFs/DOCX to a server action; Next's
    // default 1 MB server-action body cap rejected real files (surfacing as a
    // generic "analysing" error). Match the app's 15 MB extract cap + headroom.
    serverActions: { bodySizeLimit: "16mb" },
  },
};

export default nextConfig;
