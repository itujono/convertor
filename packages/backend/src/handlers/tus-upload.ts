import type { Context } from "hono";

// For now, let's implement a simple chunked upload endpoint
// We can add TUS later when we have more time to properly integrate it

export async function handleTusUpload(c: Context) {
  return c.json(
    {
      message: "TUS upload endpoint - to be implemented",
      status: "pending",
    },
    501
  );
}
