import type { Session } from "@supabase/supabase-js";

export interface GoogleUser {
  id: string;
  email: string;
  name: string;
  avatar_url: string;
}

export function extractGoogleUserData(
  session: Session | null
): GoogleUser | null {
  if (!session?.user) return null;

  const { user } = session;
  return {
    id: user.id,
    email: user.email || "",
    name: user.user_metadata?.full_name || user.user_metadata?.name || "",
    avatar_url: user.user_metadata?.avatar_url || "",
  };
}

export function cleanOAuthParamsFromUrl() {
  if (typeof window === "undefined") return;

  const url = new URL(window.location.href);
  const params = [
    "code",
    "state",
    "session_state",
    "error",
    "error_description",
  ];

  let hasParams = false;
  params.forEach((param) => {
    if (url.searchParams.has(param)) {
      url.searchParams.delete(param);
      hasParams = true;
    }
  });

  if (hasParams) {
    window.history.replaceState({}, "", url.toString());
  }
}
