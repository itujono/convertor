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
  googleUser: {
    avatar_url?: string;
    full_name?: string;
  } | null;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

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
      // Use the current origin for redirect URL
      const redirectTo = typeof window !== "undefined" ? window.location.origin : undefined;

      const { error } = await supabase.auth.signInWithOAuth({
        provider: "google",
        options: {
          redirectTo: redirectTo,
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

    const handleAuthChange = async (event: string, session: Session | null) => {
      if (!isMounted) return;

      console.log(`Auth state change: ${event}`, {
        hasSession: !!session,
        sessionExpired: session?.expires_at ? session.expires_at * 1000 < Date.now() : false,
      });

      setSession(session);

      const googleUserData = extractGoogleUserData(session);
      setGoogleUser(googleUserData);

      if (session) {
        try {
          const userData = await apiClient.getCurrentUser();
          if (isMounted) {
            setUser(userData);
          }
        } catch (error) {
          console.error("Error fetching user data after auth change:", error);

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
      }
    };

    const initializeAuth = async () => {
      try {
        const {
          data: { session: initialSession },
        } = await supabase.auth.getSession();

        if (isMounted) {
          await handleAuthChange("INITIAL_SESSION", initialSession);
        }
      } catch (error) {
        console.error("Error getting initial session:", error);
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
