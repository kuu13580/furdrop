import { spawnSync } from "node:child_process";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");

// wrangler.toml に含まれず、wrangler secret で本番投入するキー一覧
// (workers/.dev.template.vars と同期)
const SECRET_KEYS = ["R2_ACCESS_KEY_ID", "R2_SECRET_ACCESS_KEY", "R2_ENDPOINT"];

const secrets = {};
for (const key of SECRET_KEYS) {
  const value = process.env[key];
  if (!value) {
    console.error(`Error: environment variable ${key} is not set`);
    process.exit(1);
  }
  secrets[key] = value;
}

const result = spawnSync("pnpm", ["--filter", "workers", "exec", "wrangler", "secret", "bulk"], {
  cwd: root,
  input: JSON.stringify(secrets),
  stdio: ["pipe", "inherit", "inherit"],
});

process.exit(result.status ?? 1);
