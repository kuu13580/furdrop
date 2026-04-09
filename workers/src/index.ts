import { Hono } from "hono";
import { cors } from "hono/cors";
import type { Env } from "./types";

const app = new Hono<{ Bindings: Env }>();

app.use("*", cors());

app.get("/health", (c) => {
  return c.json({ status: "ok" });
});

export default app;
