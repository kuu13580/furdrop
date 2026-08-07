import { swaggerUI } from "@hono/swagger-ui";
import { OpenAPIHono } from "@hono/zod-openapi";
import { cors } from "hono/cors";
import { HTTPException } from "hono/http-exception";
import { runCleanup } from "./cron/cleanup";
import { logError } from "./lib/logger";
import { defaultHook } from "./lib/schema";
import auth from "./routes/auth";
import dev from "./routes/dev";
import receiver from "./routes/receiver";
import sender from "./routes/sender";
import type { Env } from "./types";

const app = new OpenAPIHono<{ Bindings: Env }>({ defaultHook });

// 未捕捉例外(D1/R2 例外・想定外の throw)を構造化エラーに統一しつつ Workers Logs に記録する。
// これが無いと 500 がプレーンテキストで返り、失敗の観測もスタックトレース頼みになる。
app.onError((err, c) => {
  if (err instanceof HTTPException) {
    // Hono が明示的に投げた例外はステータスを尊重。5xx のみ観測対象として記録する。
    if (err.status >= 500) {
      logError("http-exception", err, { method: c.req.method, path: c.req.path });
    }
    return err.getResponse();
  }
  logError("unhandled", err, { method: c.req.method, path: c.req.path });
  return c.json({ error: { code: "INTERNAL", message: "Internal server error" } }, 500);
});

app.use("*", cors());

// セキュリティヘッダ: API レスポンスにも防御を多層化
app.use("*", async (c, next) => {
  await next();
  c.res.headers.set("X-Frame-Options", "DENY");
  c.res.headers.set("Content-Security-Policy", "frame-ancestors 'none'");
  c.res.headers.set("Referrer-Policy", "strict-origin-when-cross-origin");
  c.res.headers.set("X-Content-Type-Options", "nosniff");
  c.res.headers.set("Strict-Transport-Security", "max-age=31536000; includeSubDomains");
});

app.get("/health", (c) => {
  return c.json({ status: "ok" });
});

app.route("/send", sender);
app.route("/auth", auth);
app.route("/receiver", receiver);

// 開発用画像プロキシ（本番ではマウントしない）
app.use("/dev/*", async (c, next) => {
  if (c.env.ENVIRONMENT === "production") return c.notFound();
  await next();
});
app.route("/dev", dev);

// API docs — 本番では404
app.use("/openapi.json", async (c, next) => {
  if (c.env.ENVIRONMENT === "production") return c.notFound();
  await next();
});
app.use("/docs", async (c, next) => {
  if (c.env.ENVIRONMENT === "production") return c.notFound();
  await next();
});
app.doc("/openapi.json", {
  openapi: "3.0.0",
  info: { title: "FurDrop API", version: "0.1.0" },
});
app.get("/docs", swaggerUI({ url: "/openapi.json" }));

export default {
  fetch: app.fetch,
  async scheduled(_event: ScheduledEvent, env: Env, _ctx: ExecutionContext) {
    try {
      await runCleanup(env);
    } catch (err) {
      // runCleanup は各ステップを個別に握って続行するので、ここに来るのは
      // 「1 つ以上のステップが失敗した」集約シグナル。再 throw で cron invocation を
      // 失敗として Workers Logs に残す。
      logError("cron", err);
      throw err;
    }
  },
};
