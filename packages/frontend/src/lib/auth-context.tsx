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

  // Extract Google user data from session
  const extractGoogleUserData = (session: Session | null) => {
    if (session?.user?.user_metadata) {
      const metadata = session.user.user_metadata;
      console.log("Google user metadata:", metadata); // Debug log
      return {
        avatar_url: metadata.avatar_url || metadata.picture,
        full_name: metadata.full_name || metadata.name,
      };
    }
    return null;
  };

  const signInWithGoogle = useCallback(async () => {
    try {
      console.log("=== Google Sign In Debug ===");
      console.log("Window origin:", window.location.origin);

      const { data, error } = await supabase.auth.signInWithOAuth({
        provider: "google",
        options: {
          queryParams: {
            access_type: "offline",
            prompt: "consent",
          },
        },
      });

      console.log("signInWithOAuth response:", { data, error });

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
      console.log("Auth state changed:", event);

      if (!isMounted) return;

      setSession(session);

      // Extract Google user data
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
          if (isMounted) {
            setUser(null);
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
