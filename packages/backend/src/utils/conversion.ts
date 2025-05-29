import { supabaseAdmin } from "./supabase";

export async function checkConversionLimit(userId: string) {
  const { data: userData, error } = await supabaseAdmin
    .from("users")
    .select("*")
    .eq("id", userId)
    .single();

  if (error || !userData) throw new Error("User not found");

  const now = new Date();
  const lastReset = new Date(userData.last_reset || Date.now());

  if (now.getMonth() !== lastReset.getMonth()) {
    const { error: updateError } = await supabaseAdmin
      .from("users")
      .update({
        conversion_count: 0,
        last_reset: now.toISOString(),
      })
      .eq("id", userId);

    if (updateError) throw updateError;
    userData.conversion_count = 0;
  }

  if (userData.plan === "free" && userData.conversion_count >= 5) {
    throw new Error(
      "Monthly conversion limit reached. Upgrade to premium for unlimited conversions."
    );
  }

  return userData;
}

export async function incrementConversionCount(userId: string) {
  const { data: userData, error: fetchError } = await supabaseAdmin
    .from("users")
    .select("conversion_count")
    .eq("id", userId)
    .single();

  if (fetchError || !userData) throw new Error("Failed to fetch user data");

  const { error } = await supabaseAdmin
    .from("users")
    .update({
      conversion_count: userData.conversion_count + 1,
    })
    .eq("id", userId);

  if (error) throw error;
}
