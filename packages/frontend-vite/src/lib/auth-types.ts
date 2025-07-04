import type { Session } from "@supabase/supabase-js";
import type { GoogleUser } from "./auth-helpers";

export interface User {
  id: string;
  email: string;
  name: string;
  avatar_url: string;
  plan: "free" | "pro";
  usage: {
    conversions_count: number;
    storage_used: number;
  };
}

export interface AuthContextType {
  session: Session | null;
  user: User | null;
  googleUser: GoogleUser | null;
  isLoading: boolean;
  signInWithGoogle: () => Promise<void>;
  signOut: () => Promise<void>;
}
