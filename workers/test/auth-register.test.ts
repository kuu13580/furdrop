// POST /auth/register (R01 受信者新規登録 + R16 送信URLアクセスキー初期発行)
import { env } from "cloudflare:test";
import { describe, expect, it } from "vitest";
import { authHeader, createEmulatorUser } from "./helpers/auth";
import { apiJson } from "./helpers/fetch";

describe("POST /auth/register", () => {
  it("新規ユーザー作成時に users と send_keys が同時発行され、receive_url に ?k= が乗る (R16 の初期発行)", async () => {
    const { idToken, uid } = await createEmulatorUser();
    const handle = `alice_${Date.now()}`;
    const { status, body } = await apiJson<{
      user: { id: string; handle: string; receive_url: string };
    }>("/auth/register", {
      method: "POST",
      headers: authHeader(idToken),
      body: { handle, display_name: "Alice" },
    });
    expect(status).toBe(201);
    expect(body.user.id).toBe(uid);
    expect(body.user.handle).toBe(handle);
    expect(body.user.receive_url).toMatch(new RegExp(`^/send/${handle}\\?k=.+`));

    // send_keys にちょうど 1 行入っていること
    const row = await env.DB.prepare("SELECT COUNT(*) as cnt FROM send_keys WHERE receiver_id = ?")
      .bind(uid)
      .first<{ cnt: number }>();
    expect(row?.cnt).toBe(1);
  });

  it("同じ handle で別 UID から register すると 409 HANDLE_TAKEN (handle の UNIQUE 制約検出)", async () => {
    const u1 = await createEmulatorUser();
    const u2 = await createEmulatorUser();
    const handle = `taken_${Date.now()}`;
    const first = await apiJson<unknown>("/auth/register", {
      method: "POST",
      headers: authHeader(u1.idToken),
      body: { handle, display_name: "First" },
    });
    expect(first.status).toBe(201);

    const second = await apiJson<{ error: { code: string } }>("/auth/register", {
      method: "POST",
      headers: authHeader(u2.idToken),
      body: { handle, display_name: "Second" },
    });
    expect(second.status).toBe(409);
    expect(second.body.error.code).toBe("HANDLE_TAKEN");
  });

  it("同じ UID で再 register すると 201 で既存ユーザーを返す (5.2.1 のリカバリ動線で叩かれてもべき等)", async () => {
    const { idToken } = await createEmulatorUser();
    const handle = `idempotent_${Date.now()}`;
    const first = await apiJson<{ user: { handle: string } }>("/auth/register", {
      method: "POST",
      headers: authHeader(idToken),
      body: { handle, display_name: "First Try" },
    });
    expect(first.status).toBe(201);

    // 別の handle / display_name で来ても、既存レコードを返す
    const second = await apiJson<{ user: { handle: string } }>("/auth/register", {
      method: "POST",
      headers: authHeader(idToken),
      body: { handle: `${handle}_other`, display_name: "Retry" },
    });
    expect(second.status).toBe(201);
    expect(second.body.user.handle).toBe(handle); // 最初の handle が維持される
  });

  it("認証ヘッダなしは 401 UNAUTHORIZED (バイパス防止)", async () => {
    const { status, body } = await apiJson<{ error: { code: string } }>("/auth/register", {
      method: "POST",
      body: { handle: "anyone", display_name: "X" },
    });
    expect(status).toBe(401);
    expect(body.error.code).toBe("UNAUTHORIZED");
  });
});
