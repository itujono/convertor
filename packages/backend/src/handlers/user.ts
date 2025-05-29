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

    let { data: userData, error: userError } = await supabaseAdmin
      .from("users")
      .select("*")
      .eq("id", user.id)
      .single();

    if (userError && userError.code === "PGRST116") {
      const { data: newUser, error: insertError } = await supabaseAdmin
        .from("users")
        .insert({
          id: user.id,
          plan: "free",
          conversion_count: 0,
          last_reset: new Date().toISOString(),
        })
        .select()
        .single();

      if (insertError) {
        console.error("Error creating user:", insertError);
        return c.json({ error: "Internal server error" }, 500);
      }

      return c.json({
        id: user.id,
        email: user.email!,
        name: user.user_metadata?.full_name || user.email!,
        plan: "free",
        conversionCount: 0,
        lastReset: new Date().toISOString(),
      });
    } else if (userError) {
      console.error("Error fetching user:", userError);
      return c.json({ error: "Internal server error" }, 500);
    }

    return c.json({
      id: user.id,
      email: user.email!,
      name: user.user_metadata?.full_name || user.email!,
      plan: userData!.plan,
      conversionCount: userData!.conversion_count,
      lastReset: userData!.last_reset,
    });
  } catch (error) {
    console.error("Error in /api/user endpoint:", error);
    return c.json({ error: "Internal server error" }, 500);
  }
}
