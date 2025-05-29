import { Context } from "hono";
import { join } from "path";

export async function downloadHandler(c: Context) {
  try {
    const filename = c.req.param("filename");
    const filePath = join(process.cwd(), "uploads", filename);

    const file = Bun.file(filePath);
    if (!(await file.exists())) {
      return c.json({ error: "File not found" }, 404);
    }

    return new Response(file);
  } catch (error) {
    console.error("Download error:", error);
    return c.json({ error: "Download failed" }, 500);
  }
}
