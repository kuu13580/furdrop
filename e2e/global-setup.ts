// Playwright global setup: テスト開始前に Firebase Auth Emulator の生死を確認するだけ。
// 個別のテストユーザー作成や受信者登録はテストごとに UUID 付きで行う (テスト間の独立性を保つ)。
import type { FullConfig } from "@playwright/test";

const EMULATOR_HOST = "127.0.0.1:9099";

export default async function globalSetup(_config: FullConfig) {
  const res = await fetch(`http://${EMULATOR_HOST}/`).catch(() => null);
  if (!res) {
    throw new Error(
      `Firebase Auth Emulator が ${EMULATOR_HOST} で起動していません。` +
        ` 'pnpm emulator' または 'pnpm emulator:exec "pnpm test:e2e"' で起動してください。`,
    );
  }
}
