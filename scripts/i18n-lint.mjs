#!/usr/bin/env node
/**
 * 未国際化の日本語がコードに直書きされていないかを見張る。
 *
 * 完全な検出は諦めて「ファイルごとの残数がベースラインより増えたら落とす」
 * ラチェットにしている。翻訳の途中でも CI を緑に保ちつつ、新規混入だけは
 * 確実に止められる。全ファイルが 0 になったらベースラインごと削除して
 * 「1 件でも落とす」に切り替える。
 *
 *   node scripts/i18n-lint.mjs           # 検査
 *   node scripts/i18n-lint.mjs --update  # ベースライン更新
 */
import { readFileSync, writeFileSync } from "node:fs";
import { readdir } from "node:fs/promises";
import { dirname, join, relative, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const SRC = join(ROOT, "frontend/src");
const BASELINE = join(ROOT, "frontend/i18n-baseline.json");

/** 開発者しか見ない画面。lingui.config.ts の exclude と揃える */
const EXCLUDE = ["pages/DesignPreviewPage.tsx", "pages/__shots__/", "lib/debug-log.ts"];

const JAPANESE = /[぀-ヿ一-鿿]/;
/** この行の日本語はマクロが拾っているとみなす */
const MACRO = /<Trans[\s>]|\bt`|\bmsg`|\bplural\(|\bselect\(|\bselectOrdinal\(/;

/** `//` コメントと `/* *\/` ブロックを落とす (URL の `://` は残す) */
function stripComments(source) {
  return source
    .replace(/\/\*[\s\S]*?\*\//g, "")
    .split("\n")
    .map((line) => line.replace(/(^|[^:])\/\/.*$/, "$1"))
    .join("\n");
}

function countInFile(source) {
  return stripComments(source)
    .split("\n")
    .filter((line) => JAPANESE.test(line) && !MACRO.test(line)).length;
}

async function collect(dir, out = []) {
  for (const entry of await readdir(dir, { withFileTypes: true })) {
    const full = join(dir, entry.name);
    if (entry.isDirectory()) await collect(full, out);
    else if (/\.tsx?$/.test(entry.name)) out.push(full);
  }
  return out;
}

const files = await collect(SRC);
const counts = {};
for (const file of files) {
  const rel = relative(SRC, file).replaceAll("\\", "/");
  if (EXCLUDE.some((e) => rel.startsWith(e))) continue;
  const n = countInFile(readFileSync(file, "utf8"));
  if (n > 0) counts[rel] = n;
}

if (process.argv.includes("--update")) {
  writeFileSync(BASELINE, `${JSON.stringify(counts, null, 2)}\n`);
  const total = Object.values(counts).reduce((a, b) => a + b, 0);
  console.log(
    `i18n-baseline.json を更新しました (${Object.keys(counts).length} files / ${total} lines)`,
  );
  process.exit(0);
}

let baseline;
try {
  baseline = JSON.parse(readFileSync(BASELINE, "utf8"));
} catch {
  console.error(`ベースラインがありません: ${BASELINE}`);
  console.error("初回は `pnpm i18n:lint:update` を実行してコミットしてください。");
  process.exit(1);
}

const increased = [];
const decreased = [];
for (const [file, n] of Object.entries(counts)) {
  const before = baseline[file] ?? 0;
  if (n > before) increased.push({ file, before, now: n });
  else if (n < before) decreased.push({ file, before, now: n });
}
for (const file of Object.keys(baseline)) {
  if (!(file in counts)) decreased.push({ file, before: baseline[file], now: 0 });
}

if (increased.length > 0) {
  console.error("未国際化の日本語が増えています。`<Trans>` / `t` マクロで包んでください:\n");
  for (const { file, before, now } of increased) {
    console.error(`  frontend/src/${file}: ${before} → ${now}`);
  }
  console.error(
    "\n意図的に増やす場合は `pnpm i18n:lint:update` でベースラインを更新してください。",
  );
  process.exit(1);
}

if (decreased.length > 0) {
  console.error("翻訳が進みました。`pnpm i18n:lint:update` でベースラインを更新してください:\n");
  for (const { file, before, now } of decreased) {
    console.error(`  frontend/src/${file}: ${before} → ${now}`);
  }
  process.exit(1);
}

const total = Object.values(counts).reduce((a, b) => a + b, 0);
console.log(`i18n-lint OK (残り ${total} lines / ${Object.keys(counts).length} files)`);
