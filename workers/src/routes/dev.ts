import { Hono } from "hono";
import type { Env } from "../types";

/**
 * 開発用画像プロキシ
 * ローカル R2 バインディングから画像を直接返す。
 * 本番ではマウントされないので到達不可能。
 */
const dev = new Hono<{ Bindings: Env }>();

dev.get("/images/thumbs/:key{.+}", async (c) => {
  const key = c.req.param("key");
  const object = await c.env.R2_THUMBS.get(key);
  if (!object) return c.notFound();
  c.header("Content-Type", "image/jpeg");
  c.header("Cache-Control", "no-cache");
  return c.body(object.body);
});

dev.get("/images/originals/:key{.+}", async (c) => {
  const key = c.req.param("key");
  const object = await c.env.R2_ORIGINALS.get(key);
  if (!object) return c.notFound();
  c.header("Content-Type", "image/jpeg");
  c.header("Content-Disposition", `attachment; filename="${key.split("/").pop()}"`);
  return c.body(object.body);
});

export default dev;
