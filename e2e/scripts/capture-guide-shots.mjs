#!/usr/bin/env node
/**
 * 使い方ガイドの図版 (frontend/public/guide/*.png) を撮り直す。
 *
 *   pnpm shots            # 全ロケール・全カット
 *   pnpm shots -- --locale en --slug sender-step3
 *
 * 図版は dev 専用の `/__shots/:slug` (frontend/src/pages/__shots__/ShotsPage.tsx)
 * を撮るだけなので Workers も Auth Emulator も要らない。vite dev だけ立てる。
 * 4000 番が既に開いていればそれを使い、無ければこのスクリプトが起動して終了時に落とす。
 *
 * 撮り直したら必ず目視で確認すること。モックは実 UI の写しであって実 UI そのものでは
 * ないため、画面側の変更に自動では追従しない。
 */

import { spawn } from "node:child_process";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { chromium } from "@playwright/test";

const REPO = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");
const OUT_DIR = path.join(REPO, "frontend/public/guide");
const BASE = "http://localhost:4000";

const SLUGS = [
  "sender-step1",
  "sender-step2",
  "sender-step3",
  "sender-step4",
  "receiver-step1",
  "receiver-step2",
  "receiver-step3",
  "receiver-step4",
  "receiver-step5",
];

/** 原文ロケールは接尾辞なし。en は og-en.png と同じ `-en` に揃える */
const LOCALES = [
  { code: "ja", suffix: "" },
  { code: "en", suffix: "-en" },
];

function arg(name) {
  const i = process.argv.indexOf(`--${name}`);
  return i === -1 ? null : process.argv[i + 1];
}

async function isUp() {
  try {
    const res = await fetch(BASE, { signal: AbortSignal.timeout(1000) });
    return res.ok;
  } catch {
    return false;
  }
}

async function waitUntilUp(timeoutMs = 60_000) {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    if (await isUp()) return;
    await new Promise((r) => setTimeout(r, 500));
  }
  throw new Error(`vite dev (${BASE}) が起動しませんでした。pnpm generate は済んでいますか?`);
}

async function startDevServer() {
  if (await isUp()) {
    console.log(`既存の dev サーバー (${BASE}) を使います`);
    return null;
  }
  console.log("vite dev を起動します...");
  // detached: pnpm 経由だと vite は孫プロセスになるので、プロセスグループごと落とす
  const child = spawn("pnpm", ["--filter", "frontend", "dev"], {
    cwd: REPO,
    stdio: "ignore",
    detached: true,
  });
  try {
    await waitUntilUp();
  } catch (e) {
    // 起動に失敗した vite を孤児にすると 4000 番を掴んだまま残る
    if (child.pid) process.kill(-child.pid, "SIGTERM");
    throw e;
  }
  return child;
}

async function main() {
  const onlyLocale = arg("locale");
  const onlySlug = arg("slug");
  const locales = onlyLocale ? LOCALES.filter((l) => l.code === onlyLocale) : LOCALES;
  const slugs = onlySlug ? SLUGS.filter((s) => s === onlySlug) : SLUGS;
  if (!locales.length || !slugs.length) throw new Error("--locale / --slug の指定が不正です");

  const dev = await startDevServer();
  const browser = await chromium.launch();
  try {
    // deviceScaleFactor 2: 既存の図版と同じ 2x。幅は sm: 以上のレイアウトを撮るため広めに取る
    const context = await browser.newContext({
      deviceScaleFactor: 2,
      viewport: { width: 1280, height: 1200 },
    });
    const page = await context.newPage();

    for (const { code, suffix } of locales) {
      for (const slug of slugs) {
        await page.goto(`${BASE}/__shots/${slug}?lang=${code}`);
        const card = page.locator(`[data-shot="${slug}"]`);
        await card.waitFor({ state: "visible" });
        // Web フォント (Inter / Noto Sans JP) の適用前に撮ると字幅が変わる
        await page.evaluate(() => document.fonts.ready);
        // QR は useEffect の canvas 描画なので、1 フレーム待って確定させる
        await page.waitForTimeout(200);
        const file = path.join(OUT_DIR, `${slug}${suffix}.png`);
        await card.screenshot({ path: file });
        console.log(`  ${code}  ${path.relative(REPO, file)}`);
      }
    }
  } finally {
    await browser.close();
    if (dev?.pid) process.kill(-dev.pid, "SIGTERM");
  }
}

await main();
