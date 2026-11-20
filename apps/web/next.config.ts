import path from "node:path";
import { fileURLToPath } from "node:url";
import type { NextConfig } from "next";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const nextConfig: NextConfig = {
  reactStrictMode: true,
  transpilePackages: ["@sih/shared", "@sih/db"],
  outputFileTracingRoot: path.resolve(__dirname, "../../"),
};

export default nextConfig;
