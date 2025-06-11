import type { Context, Next } from "hono";
import { supabaseAdmin } from "../utils/supabase";
import type { Variables } from "../utils/types";

export async function authMiddleware(
  c: Context<{ Variables: Variables }>,
  next: Next
) {
  if (c.req.path === "/api/health") {
    return next();
  }

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
    // Try to create user, but handle potential race condition
    const { data: newUser, error: insertError } = await supabaseAdmin
      .from("users")
      .upsert(
        {
          id: user.id,
          plan: "free",
          conversion_count: 0,
          last_reset: new Date().toISOString(),
        },
        {
          onConflict: "id",
          ignoreDuplicates: false,
        }
      )
      .select()
      .single();

    if (insertError) {
      // If it's still a duplicate key error, try to fetch the existing user
      if (insertError.code === "23505") {
        console.log("User already exists, fetching existing user data");
        const { data: existingUser, error: fetchError } = await supabaseAdmin
          .from("users")
          .select("*")
          .eq("id", user.id)
          .single();

        if (fetchError) {
          console.error("Error fetching existing user:", fetchError);
          return c.json({ error: "Internal server error" }, 500);
        }
        userData = existingUser;
      } else {
        console.error("Error creating user:", insertError);
        return c.json({ error: "Internal server error" }, 500);
      }
    } else {
      userData = newUser;
    }
  } else if (userError) {
    console.error("Error fetching user:", userError);
    return c.json({ error: "Internal server error" }, 500);
  }

  c.set("user", {
    id: user.id,
    email: user.email!,
    plan: userData!.plan || "free",
    conversionCount: userData!.conversion_count || 0,
    lastReset: new Date(userData!.last_reset || Date.now()),
  });

  await next();
}
