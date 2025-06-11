import { supabaseAdmin } from "./supabase";
import { generateConversionLimitMessages } from "./conversion-messages";

export async function checkConversionLimit(
  userId: string,
  fileCount: number = 1
) {
  const { data: userData, error } = await supabaseAdmin
    .from("users")
    .select("*")
    .eq("id", userId)
    .single();

  if (error || !userData) throw new Error("User not found");

  const now = new Date();
  const lastReset = new Date(userData.last_reset || Date.now());

  // Check if it's a new day (daily reset)
  const nowDate = now.toDateString();
  const lastResetDate = lastReset.toDateString();

  if (nowDate !== lastResetDate) {
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

  const dailyLimit = userData.plan === "free" ? 10 : 100;
  const remainingConversions = dailyLimit - userData.conversion_count;

  if (userData.conversion_count >= dailyLimit) {
    throw new Error(
      generateConversionLimitMessages.dailyLimitReached(userData.plan)
    );
  }

  if (fileCount > remainingConversions) {
    throw new Error(
      generateConversionLimitMessages.insufficientConversions(
        remainingConversions,
        fileCount
      )
    );
  }

  return userData;
}

export async function checkBatchConversionLimit(
  userId: string,
  fileCount: number
) {
  return checkConversionLimit(userId, fileCount);
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
