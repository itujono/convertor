import { Context } from "hono";
import { supabaseAdmin } from "../utils/supabase";
import type { Variables } from "../utils/types";

export async function getUserHandler(c: Context<{ Variables: Variables }>) {
  try {
    const authHeader = c.req.header("authorization");
    if (!authHeader?.startsWith("Bearer ")) {
      return c.json({ error: "Missing or invalid authorization header" }, 401);
    }

    const token = authHeader.replace("Bearer ", "");
    const {
      data: { user },
      error,
    } = await supabaseAdmin.auth.getUser(token);

    if (error || !user) {
      return c.json({ error: "Invalid token" }, 401);
    }

    // Get user data from middleware (which handles user creation if needed)
    const userData = c.get("user");

    return c.json({
      id: user.id,
      email: user.email!,
      name: user.user_metadata?.full_name || user.email!,
      plan: userData.plan,
      conversionCount: userData.conversionCount,
      lastReset: userData.lastReset.toISOString(),
    });
  } catch (error) {
    console.error("Error in /api/user endpoint:", error);
    return c.json({ error: "Internal server error" }, 500);
  }
}
