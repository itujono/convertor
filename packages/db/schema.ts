import { createClient } from "@supabase/supabase-js";

export const createSupabaseClient = () => {
  const supabaseUrl = process.env.SUPABASE_URL!;
  const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY!;

  return createClient(supabaseUrl, supabaseKey);
};

export interface User {
  id: string;
  plan: "free" | "premium";
  conversion_count: number;
  last_reset: string;
  created_at?: string;
  updated_at?: string;
}

export interface Conversion {
  id: number;
  user_id: string;
  file_name: string;
  status: "pending" | "completed" | "failed";
  created_at?: string;
}

export interface Database {
  public: {
    Tables: {
      users: {
        Row: User;
        Insert: Omit<User, "created_at" | "updated_at">;
        Update: Partial<Omit<User, "id" | "created_at" | "updated_at">>;
      };
      conversions: {
        Row: Conversion;
        Insert: Omit<Conversion, "id" | "created_at">;
        Update: Partial<Omit<Conversion, "id" | "created_at">>;
      };
    };
    Views: {};
    Functions: {};
    Enums: {};
  };
}
