import { swaggerUI } from "@hono/swagger-ui";
import { OpenAPIHono } from "@hono/zod-openapi";
import { cors } from "hono/cors";
import sender from "./routes/sender";
import type { Env } from "./types";

const app = new OpenAPIHono<{ Bindings: Env }>();

app.use("*", cors());

app.get("/health", (c) => {
  return c.json({ status: "ok" });
});

app.route("/send", sender);

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

export default app;
