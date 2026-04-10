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
    const payload = await verifyFirebaseToken(token, c.env.FIREBASE_PROJECT_ID);
    c.set("uid", payload.sub);
    c.set("email", payload.email ?? "");
    c.set("name", payload.name);
    c.set("picture", payload.picture);
  } catch {
    return c.json({ error: { code: "UNAUTHORIZED", message: "Invalid or expired token" } }, 401);
  }

  await next();
});
