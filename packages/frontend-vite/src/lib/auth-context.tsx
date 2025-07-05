import React, { createContext, useContext, useEffect, useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import type { Session } from "@supabase/supabase-js";
import { supabase } from "./auth-client";
import { useCurrentUser, useClearUserQueries, queryKeys } from "./api-hooks";
import {
  extractGoogleUserData,
  cleanOAuthParamsFromUrl,
  type GoogleUser,
} from "./auth-helpers";
import type { AuthContextType } from "./auth-types";

const AuthContext = createContext<AuthContextType | undefined>(undefined);

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [session, setSession] = useState<Session | null>(null);
  const [googleUser, setGoogleUser] = useState<GoogleUser | null>(null);
  const [isInitialized, setIsInitialized] = useState(false);
  const queryClient = useQueryClient();
  const clearUserQueries = useClearUserQueries();

  // Query for user data using our new hook
  const {
    data: user,
    isLoading: isUserLoading,
    error: userError,
  } = useCurrentUser();

  // Initialize auth state
  useEffect(() => {
    let isMounted = true;

    const initializeAuth = async () => {
      try {
        console.log("🔐 Initializing auth...");
        const {
          data: { session: initialSession },
        } = await supabase.auth.getSession();

        if (isMounted) {
          setSession(initialSession);
          setGoogleUser(extractGoogleUserData(initialSession));
          setIsInitialized(true);
          console.log("✅ Auth initialized:", { hasSession: !!initialSession });
        }
      } catch (error) {
        console.error("❌ Auth initialization error:", error);
        if (isMounted) {
          setIsInitialized(true);
        }
      }
    };

    initializeAuth();

    // Listen for auth changes
    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange(async (event, newSession) => {
      if (!isMounted) return;

      console.log("🔄 Auth state changed:", event, {
        hasSession: !!newSession,
      });

      setSession(newSession);
      setGoogleUser(extractGoogleUserData(newSession));

      // Clean OAuth params from URL after successful auth
      if (
        newSession &&
        (event === "SIGNED_IN" || event === "TOKEN_REFRESHED")
      ) {
        setTimeout(() => {
          cleanOAuthParamsFromUrl();
        }, 100);
      }

      // Invalidate user query when session changes
      if (event === "SIGNED_IN" || event === "TOKEN_REFRESHED") {
        queryClient.invalidateQueries({ queryKey: queryKeys.user });
      } else if (event === "SIGNED_OUT") {
        clearUserQueries();
      }
    });

    return () => {
      isMounted = false;
      subscription.unsubscribe();
    };
  }, [queryClient]);

  // Handle user query errors
  useEffect(() => {
    if (userError && session) {
      console.error("❌ User query error:", userError);

      // If it's a token error, sign out
      if (
        userError instanceof Error &&
        (userError.message.includes("Invalid token") ||
          userError.message.includes("JWT"))
      ) {
        console.log("🚪 Invalid token detected, signing out...");
        signOut();
      }
    }
  }, [userError, session]);

  const signInWithGoogle = async () => {
    try {
      console.log("🔐 Starting Google sign in...");
      const { error } = await supabase.auth.signInWithOAuth({
        provider: "google",
        options: {
          redirectTo: window.location.origin,
        },
      });
      if (error) throw error;
    } catch (error) {
      console.error("❌ Google sign in error:", error);
      throw error;
    }
  };

  const signOut = async () => {
    try {
      console.log("🚪 Signing out...");
      const { error } = await supabase.auth.signOut();
      if (error) throw error;

      // Clear all user-related queries
      clearUserQueries();

      console.log("✅ Signed out successfully");
    } catch (error) {
      console.error("❌ Sign out error:", error);
      throw error;
    }
  };

  const isLoading =
    !isInitialized || (isInitialized && !!session && isUserLoading);

  return (
    <AuthContext.Provider
      value={{
        session,
        user: user || null,
        googleUser,
        isLoading,
        signInWithGoogle,
        signOut,
      }}
    >
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const context = useContext(AuthContext);
  if (context === undefined) {
    throw new Error("useAuth must be used within an AuthProvider");
  }
  return context;
}
