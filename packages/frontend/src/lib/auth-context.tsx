"use client";

import { createContext, useContext, useEffect, useState, useCallback } from "react";
import { supabase } from "./auth-client";
import { apiClient, type User } from "./api-client";
import type { Session } from "@supabase/supabase-js";

interface AuthContextType {
  session: Session | null;
  user: User | null;
  isLoading: boolean;
  signInWithGoogle: () => Promise<void>;
  signOut: () => Promise<void>;
  refreshUser: () => Promise<void>;
  updateConversionCountOptimistic: (increment?: number) => void;
  googleUser: {
    avatar_url?: string;
    full_name?: string;
  } | null;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

// Helper function to clean OAuth parameters from URL
function cleanOAuthParamsFromUrl() {
  if (typeof window === "undefined") return;

  const url = new URL(window.location.href);
  const oauthParams = ["code", "state", "session_state", "access_token", "refresh_token", "token_type", "expires_in"];
  let hasOAuthParams = false;

  oauthParams.forEach((param) => {
    if (url.searchParams.has(param)) {
      url.searchParams.delete(param);
      hasOAuthParams = true;
    }
  });

  if (hasOAuthParams) {
    console.log("Cleaning OAuth parameters from URL");
    window.history.replaceState({}, document.title, url.toString());
  }
}

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [session, setSession] = useState<Session | null>(null);
  const [user, setUser] = useState<User | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [googleUser, setGoogleUser] = useState<{
    avatar_url?: string;
    full_name?: string;
  } | null>(null);

  const refreshUser = useCallback(async () => {
    if (session) {
      try {
        const userData = await apiClient.getCurrentUser();
        setUser(userData);
      } catch (error) {
        console.error("User refresh error:", error);
      }
    }
  }, [session]);

  const updateConversionCountOptimistic = useCallback((increment: number = 1) => {
    setUser((prevUser) => {
      if (!prevUser) return prevUser;
      return {
        ...prevUser,
        conversionCount: prevUser.conversionCount + increment,
      };
    });
  }, []);

  const extractGoogleUserData = (session: Session | null) => {
    if (session?.user?.user_metadata) {
      const metadata = session.user.user_metadata;

      const avatarUrl =
        metadata.avatar_url || metadata.picture || metadata.photo || metadata.image_url || metadata.profile_picture;

      const fullName =
        metadata.full_name ||
        metadata.name ||
        metadata.display_name ||
        `${metadata.given_name || ""} ${metadata.family_name || ""}`.trim();

      return {
        avatar_url: avatarUrl,
        full_name: fullName,
      };
    }
    return null;
  };

  const signInWithGoogle = useCallback(async () => {
    try {
      const { error } = await supabase.auth.signInWithOAuth({
        provider: "google",
        options: {
          redirectTo: process.env.NEXT_PUBLIC_SITE_URL,
          queryParams: {
            access_type: "offline",
            prompt: "consent",
          },
        },
      });

      if (error) {
        console.error("Google sign in error:", error);
      }
    } catch (error) {
      console.error("Sign in error:", error);
    }
  }, []);

  const signOut = useCallback(async () => {
    try {
      const { error } = await supabase.auth.signOut();
      if (error) {
        console.error("Sign out error:", error);
      } else {
        setSession(null);
        setUser(null);
        setGoogleUser(null);
      }
    } catch (error) {
      console.error("Sign out error:", error);
    }
  }, []);

  useEffect(() => {
    let isMounted = true;

    // Safety timeout to prevent infinite loading
    const safetyTimeout = setTimeout(() => {
      console.warn("⚠️ Auth initialization taking too long, forcing loading to false");
      if (isMounted) {
        setIsLoading(false);
      }
    }, 30000); // 30 seconds

    const handleAuthChange = async (event: string, session: Session | null) => {
      if (!isMounted) return;

      console.log(`🔐 Auth state change: ${event}`, {
        hasSession: !!session,
        sessionExpired: session?.expires_at ? session.expires_at * 1000 < Date.now() : false,
        supabaseUrl: !!process.env.NEXT_PUBLIC_SUPABASE_URL,
        supabaseKey: !!process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY,
        apiUrl: process.env.NEXT_PUBLIC_API_URL,
        siteUrl: process.env.NEXT_PUBLIC_SITE_URL,
      });

      setSession(session);

      const googleUserData = extractGoogleUserData(session);
      setGoogleUser(googleUserData);

      // Clean OAuth params from URL after successful auth state change
      if (session && (event === "SIGNED_IN" || event === "TOKEN_REFRESHED")) {
        // Small delay to ensure the session is fully established
        setTimeout(() => {
          cleanOAuthParamsFromUrl();
        }, 100);
      }

      if (session) {
        try {
          console.log("🔍 Fetching user data from API...");
          const userData = await apiClient.getCurrentUser();
          console.log("✅ User data fetched successfully:", { userId: userData?.id, plan: userData?.plan });
          if (isMounted) {
            setUser(userData);
          }
        } catch (error) {
          console.error("❌ Error fetching user data after auth change:", error);

          // If it's a token error and this is the initial session, the token might be expired
          if (
            error instanceof Error &&
            (error.message.includes("Invalid token") || error.message.includes("JWT")) &&
            event === "INITIAL_SESSION"
          ) {
            console.log("Initial session has expired token, clearing session to avoid stuck state");
            if (isMounted) {
              // Clear the expired session to avoid stuck loading
              setSession(null);
              setUser(null);
              setGoogleUser(null);
            }
          } else {
            if (isMounted) {
              setUser(null);
            }
          }
        }
      } else {
        if (isMounted) {
          setUser(null);
          setGoogleUser(null);
        }
      }

      if (isMounted) {
        setIsLoading(false);
        clearTimeout(safetyTimeout);
      }
    };

    const initializeAuth = async () => {
      try {
        console.log("🚀 Initializing auth...");
        // Check for OAuth params in URL on initial load
        const url = new URL(window.location.href);
        const hasOAuthCode = url.searchParams.has("code");

        if (hasOAuthCode) {
          console.log("🔗 OAuth code detected in URL, processing...");
          const oauthTimeout = setTimeout(() => {
            console.warn("⏱️ OAuth processing taking too long, cleaning URL and continuing...");
            cleanOAuthParamsFromUrl();
            setIsLoading(false);
          }, 15000); // 15 second timeout for OAuth processing

          const {
            data: { session: initialSession },
          } = await supabase.auth.getSession();

          clearTimeout(oauthTimeout);

          if (isMounted) {
            await handleAuthChange("INITIAL_SESSION", initialSession);
          }
        } else {
          console.log("🔍 Checking for existing session...");
          // Normal session check
          const {
            data: { session: initialSession },
          } = await supabase.auth.getSession();

          if (isMounted) {
            await handleAuthChange("INITIAL_SESSION", initialSession);
          }
        }
      } catch (error) {
        console.error("❌ Error getting initial session:", error);
        // Emergency cleanup if initialization fails
        cleanOAuthParamsFromUrl();
        if (isMounted) {
          setIsLoading(false);
        }
      }
    };

    initializeAuth();

    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange(handleAuthChange);

    return () => {
      isMounted = false;
      subscription.unsubscribe();
      clearTimeout(safetyTimeout);
    };
  }, []);

  const value: AuthContextType = {
    session,
    user,
    isLoading,
    signInWithGoogle,
    signOut,
    refreshUser,
    googleUser,
    updateConversionCountOptimistic,
  };

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth() {
  const context = useContext(AuthContext);
  if (context === undefined) {
    throw new Error("useAuth must be used within an AuthProvider");
  }
  return context;
}

export function ClientAuthProvider({ children }: { children: React.ReactNode }) {
  return <AuthProvider>{children}</AuthProvider>;
}
