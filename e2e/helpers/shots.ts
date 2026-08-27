// レビュー用スクリーンショットの共通部品。
// 「実アプリを seed 済みデータで動かして撮る」ための足回りだけを持つ。
// 何を撮るかは review-shots/*.spec.ts 側に書く。
import { mkdirSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import type { Page } from "@playwright/test";
import { createEmulatorUser, registerReceiver, signInOnPage, type TestUser } from "./auth";
import { seedOnePhotoFor } from "./seed-photo";

const HERE = path.dirname(fileURLToPath(import.meta.url));
const REPO = path.resolve(HERE, "../..");

/** 実写真として上げる JPEG。サムネにも同じものを使うのでギャラリーが実画像で埋まる */
export const SAMPLE_JPEG = path.join(REPO, "scripts/placeholder.jpg");

/** 出力先。`SHOTS_OUT=/tmp/x pnpm shots:review` で差し替えられる */
export const OUT_DIR = process.env.SHOTS_OUT ?? path.join(HERE, "../review-shots/out");

export const VIEWPORTS = {
  desktop: { width: 1280, height: 900 },
  mobile: { width: 390, height: 780 },
} as const;

const SENDER_NAMES = ["@kuukemo", "@mochi_film", "@poko_lens", "@koharu_shot"];

const counters = new Map<string, number>();

/**
 * 連番付きで保存する。`group` ごとに番号を振るので、spec を分けても順番が混ざらない。
 * ファイル名は `<group>-<NN>-<name>.png`。
 */
export async function shot(
  page: Page,
  group: string,
  name: string,
  opts: { fullPage?: boolean } = {},
): Promise<string> {
  mkdirSync(OUT_DIR, { recursive: true });
  const n = (counters.get(group) ?? 0) + 1;
  counters.set(group, n);
  const file = path.join(OUT_DIR, `${group}-${String(n).padStart(2, "0")}-${name}.png`);
  await page.screenshot({ path: file, fullPage: opts.fullPage ?? false });
  return file;
}

/**
 * ロケールを切り替える。**アプリのオリジンに来たあとで呼ぶこと** (localStorage を触るため)。
 * リロードを伴うので、撮り終えた画面の後で呼ぶ。
 *
 * 既定は ja。playwright.config.ts が `locale: "ja-JP"` を指定しており、アプリの言語判定が
 * `?lang=` → localStorage → navigator.languages の順なので、何もしなければ日本語になる。
 *
 * `?lang=en` は使わない。値が localStorage に残ってクエリを外した以降のページも英語のままに
 * なり、日本語のセレクタが全滅する。`addInitScript` も使わない (毎ナビゲーションで再適用され、
 * あとからの切り替えを打ち消してしまう)。
 */
export async function setLocale(page: Page, locale: "ja" | "en"): Promise<void> {
  await page.evaluate(([key, value]) => window.localStorage.setItem(key, value), [
    "furdrop.locale",
    locale,
  ] as const);
  await page.reload();
}

/**
 * R17 の DL 設定 (`furdrop.downloadOptions`)。
 * `null` にすると未設定に戻るので、初回 DL の確認ダイアログを撮れる。
 */
export async function setDownloadOptions(
  page: Page,
  mode: "none" | "artist" | "artist_model" | null,
): Promise<void> {
  await page.evaluate(
    ([key, value]) => {
      if (value === null) window.localStorage.removeItem(key);
      else window.localStorage.setItem(key, value);
    },
    ["furdrop.downloadOptions", mode === null ? null : JSON.stringify({ exifCredit: mode })] as [
      string,
      string | null,
    ],
  );
}

type ReceiverOptions = {
  photos?: number;
  displayName?: string;
  watermarkMode?: "disabled" | "optional" | "required";
  requireSenderName?: boolean;
};

/**
 * 受信者を作って写真を seed し、ログインまで済ませる。
 * 写真は実 JPEG なのでギャラリーも詳細も実画像で写る。
 */
export async function prepareReceiver(
  page: Page,
  options: ReceiverOptions = {},
): Promise<{ user: TestUser; handle: string; sendKey: string }> {
  const user = await createEmulatorUser();
  const handle = `shots_${Date.now()}`;
  const { sendKey } = await registerReceiver(user, handle, options.displayName ?? "Sora Studio", {
    watermark_mode: options.watermarkMode ?? "optional",
    require_sender_name: options.requireSenderName ?? false,
  });

  for (let i = 0; i < (options.photos ?? 3); i += 1) {
    await seedOnePhotoFor(handle, sendKey, {
      senderName: SENDER_NAMES[i % SENDER_NAMES.length],
      imagePath: SAMPLE_JPEG,
    });
  }

  await page.goto("/login");
  await signInOnPage(page, user);
  return { user, handle, sendKey };
}
