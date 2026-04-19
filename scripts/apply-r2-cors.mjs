import { spawnSync } from "node:child_process";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const corsFile = resolve(root, "workers/r2-cors.json");

const BUCKETS = ["furdrop-originals", "furdrop-thumbs"];

for (const bucket of BUCKETS) {
  const result = spawnSync(
    "pnpm",
    [
      "--filter",
      "workers",
      "exec",
      "wrangler",
      "r2",
      "bucket",
      "cors",
      "set",
      bucket,
      "--file",
      corsFile,
      "-y",
    ],
    { cwd: root, stdio: "inherit" },
  );
  if (result.status !== 0) {
    console.error(`Failed to set CORS for ${bucket}`);
    process.exit(result.status ?? 1);
  }
}
