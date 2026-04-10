import { createMiddleware } from "hono/factory";
import { verifyFirebaseToken } from "../lib/firebase-auth";
import type { Env } from "../types";

type AuthEnv = {
  Bindings: Env;
  Variables: { uid: string; email: string; name?: string; picture?: string };
};

/** Firebase IDトークン検証ミドルウェア */
export const requireAuth = createMiddleware<AuthEnv>(async (c, next) => {
  const authHeader = c.req.header("Authorization");
  if (!authHeader?.startsWith("Bearer ")) {
    return c.json(
      { error: { code: "UNAUTHORIZED", message: "Missing or invalid authorization header" } },
      401,
    );
  }

  const token = authHeader.slice(7);

  try {
    const decoded = await verifyFirebaseToken(token, c.env);
    c.set("uid", decoded.sub);
    c.set("email", decoded.email ?? "");
    c.set("name", decoded.name);
    c.set("picture", decoded.picture);
  } catch {
    return c.json({ error: { code: "UNAUTHORIZED", message: "Invalid or expired token" } }, 401);
  }

  await next();
});
