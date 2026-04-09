import { Hono } from "hono";
import { cors } from "hono/cors";
import sender from "./routes/sender";
import type { Env } from "./types";

const app = new Hono<{ Bindings: Env }>();

app.use("*", cors());

app.get("/health", (c) => {
  return c.json({ status: "ok" });
});

app.route("/send", sender);

export default app;
