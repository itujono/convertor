import type { Context } from "hono";

export function healthHandler(c: Context) {
  return c.json({ status: "ok", timestamp: new Date().toISOString() });
}
