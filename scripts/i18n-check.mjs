#!/usr/bin/env node
/**
 * CI 用の i18n ガード。
 *
 * 1. カタログ乖離 — `lingui extract` して差分が出たら落とす
 *    (`lingui extract` に --check 相当が無いので git diff で見る)
 * 2. 直書き日本語のラチェット — scripts/i18n-lint.mjs
 * 3. 未翻訳の件数 — 翻訳完了までは報告のみ。完了後に compile --strict へ切り替える
 */
import { execFileSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const CATALOGS = "frontend/src/locales";

function run(cmd, args, opts = {}) {
  return execFileSync(cmd, args, { cwd: ROOT, encoding: "utf8", stdio: "pipe", ...opts });
}

let failed = false;

// --- 1. カタログが最新か ---
run("pnpm", ["--filter", "frontend", "i18n:extract"]);
// POT-Creation-Date は抽出のたびに変わるので差分から除く
const diff = run("git", ["diff", "HEAD", "--unified=0", "--", CATALOGS])
  .split("\n")
  .filter((l) => /^[+-][^+-]/.test(l) && !l.includes("POT-Creation-Date"))
  .join("\n")
  .trim();
if (diff) {
  console.error("✘ i18n カタログが古いです。`pnpm i18n:extract` を実行してコミットしてください:\n");
  console.error(diff);
  failed = true;
} else {
  console.log("✔ カタログは最新");
}

// --- 2. 直書き日本語のラチェット ---
try {
  console.log(run("node", ["scripts/i18n-lint.mjs"]).trim());
} catch (err) {
  console.error(err.stdout ?? "");
  console.error(err.stderr ?? "");
  failed = true;
}

// --- 3. 未翻訳の件数 (報告のみ) ---
const po = readFileSync(join(ROOT, CATALOGS, "en/messages.po"), "utf8");
const total = (po.match(/^msgid "(?!")/gm) ?? []).length;
const missing = (po.match(/^msgstr ""$/gm) ?? []).length - 1; // ヘッダ分を引く
console.log(`ℹ en の未翻訳: ${Math.max(0, missing)} / ${total}`);

process.exit(failed ? 1 : 0);
