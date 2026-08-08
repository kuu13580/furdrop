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
/** 関数形式のマクロ。これがある行の日本語は拾えているとみなす */
const MACRO_CALL = /\bt`|\bmsg`|\bplural\(|\bselect\(|\bselectOrdinal\(/;
/** JSX 形式のマクロ。要素が占める行はまとめて除外する */
const MACRO_JSX = /<(Trans|Plural|Select|SelectOrdinal)\b/g;

/** `//` コメントと `/* *\/` ブロックを落とす (URL の `://` は残す) */
function stripComments(source) {
  return source
    .replace(/\/\*[\s\S]*?\*\//g, "")
    .split("\n")
    .map((line) => line.replace(/(^|[^:])\/\/.*$/, "$1"))
    .join("\n");
}

/**
 * `<Tag ...>` / `<Tag ... />` の開始タグを読み飛ばし、終端位置と自己閉じかを返す。
 * 属性内の文字列と `{...}` を飛ばすので、`onClick={() => x}` の `>` で誤検知しない。
 */
function scanOpenTag(src, from) {
  let i = from;
  let brace = 0;
  while (i < src.length) {
    const c = src[i];
    if (c === '"' || c === "'" || c === "`") {
      const end = src.indexOf(c, i + 1);
      i = end === -1 ? src.length : end + 1;
      continue;
    }
    if (c === "{") brace++;
    else if (c === "}") brace--;
    else if (c === ">" && brace === 0) {
      return { end: i + 1, selfClosing: src[i - 1] === "/" };
    }
    i++;
  }
  return { end: src.length, selfClosing: true };
}

/** マクロ JSX 要素が占める [開始, 終了] のオフセット範囲を列挙する */
function* macroJsxRanges(src) {
  MACRO_JSX.lastIndex = 0;
  let m = MACRO_JSX.exec(src);
  while (m) {
    const tag = m[1];
    const { end, selfClosing } = scanOpenTag(src, m.index);
    let stop = end;
    if (!selfClosing) {
      // 同名タグの入れ子を数えながら閉じタグを探す
      const open = new RegExp(`<${tag}\\b`, "g");
      const close = `</${tag}>`;
      let depth = 1;
      let cursor = end;
      while (depth > 0) {
        const iClose = src.indexOf(close, cursor);
        if (iClose === -1) break;
        open.lastIndex = cursor;
        const nested = open.exec(src);
        if (nested && nested.index < iClose) {
          depth++;
          cursor = nested.index + tag.length;
          continue;
        }
        depth--;
        cursor = iClose + close.length;
      }
      stop = cursor;
    }
    yield [m.index, stop];
    MACRO_JSX.lastIndex = stop;
    m = MACRO_JSX.exec(src);
  }
}

/** オフセット → 行番号 (0 始まり) */
function lineIndex(src) {
  const starts = [0];
  for (let i = 0; i < src.length; i++) if (src[i] === "\n") starts.push(i + 1);
  return (offset) => {
    let lo = 0;
    let hi = starts.length - 1;
    while (lo < hi) {
      const mid = (lo + hi + 1) >> 1;
      if (starts[mid] <= offset) lo = mid;
      else hi = mid - 1;
    }
    return lo;
  };
}

/**
 * マクロで包まれていない日本語の「行数」を数える。
 * 複数行の `<Trans>` / `<Plural>` は開始行にしかマクロが出ないので、
 * 要素が占める行をまとめて除外する。これが無いと、正しく国際化した長文で逆に検出が増える。
 */
function countInFile(source) {
  const src = stripComments(source);
  const toLine = lineIndex(src);
  const covered = new Set();
  for (const [start, stop] of macroJsxRanges(src)) {
    for (let l = toLine(start); l <= toLine(stop); l++) covered.add(l);
  }
  let count = 0;
  src.split("\n").forEach((line, i) => {
    if (covered.has(i) || MACRO_CALL.test(line)) return;
    if (JAPANESE.test(line)) count++;
  });
  return count;
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
