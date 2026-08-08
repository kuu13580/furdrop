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
// POT-Creation-Date は抽出のたびに変わるので差分から除く
function catalogDiff() {
  return run("git", ["diff", "HEAD", "--unified=0", "--", CATALOGS])
    .split("\n")
    .filter((l) => /^[+-][^+-]/.test(l) && !l.includes("POT-Creation-Date"))
    .join("\n")
    .trim();
}

// 抽出の前後で比べ、抽出によって増えた差分だけを見る。
// 全体を見ると、翻訳を書きかけの未コミット変更があるだけで落ちてしまう
const before = catalogDiff();
run("pnpm", ["--filter", "frontend", "i18n:extract"]);
const after = catalogDiff();
if (after !== before) {
  console.error("✘ i18n カタログが古いです。`pnpm i18n:extract` を実行してコミットしてください:\n");
  console.error(after);
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
// msgid / msgstr は改行を含むと継続行に折り返される。行単位で見ると
// 折り返し分を数え落とすので、継続行を畳んでからエントリ単位で判定する
function parsePo(source) {
  const entries = [];
  let key = null;
  let buf = { msgid: "", msgstr: "" };
  for (const line of source.split("\n")) {
    const head = /^(msgid|msgstr) "((?:[^"\\]|\\.)*)"$/.exec(line);
    if (head) {
      key = head[1];
      buf[key] = head[2];
      if (key === "msgid") buf.msgstr = "";
      continue;
    }
    const cont = /^"((?:[^"\\]|\\.)*)"$/.exec(line);
    if (cont && key) {
      buf[key] += cont[1];
      continue;
    }
    if (line.trim() === "" && buf.msgid) {
      entries.push({ ...buf });
      buf = { msgid: "", msgstr: "" };
      key = null;
    }
  }
  if (buf.msgid) entries.push({ ...buf });
  return entries.filter((e) => e.msgid !== "");
}

const entries = parsePo(readFileSync(join(ROOT, CATALOGS, "en/messages.po"), "utf8"));
const missing = entries.filter((e) => e.msgstr === "").length;
console.log(`ℹ en の未翻訳: ${missing} / ${entries.length}`);
if (missing > 0) {
  for (const e of entries.filter((x) => x.msgstr === "")) console.log(`   - ${e.msgid}`);
}

process.exit(failed ? 1 : 0);
