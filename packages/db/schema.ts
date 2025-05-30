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

export interface UserFile {
  id: string;
  user_id: string;
  original_file_name: string;
  converted_file_name: string;
  original_format: string;
  converted_format: string;
  file_path: string; // S3 path
  download_url: string; // Signed URL (will be regenerated)
  file_size: number;
  quality: string;
  status: "ready" | "expired" | "downloaded";
  expires_at: string;
  created_at: string;
  last_downloaded_at?: string;
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
      user_files: {
        Row: UserFile;
        Insert: Omit<UserFile, "id" | "created_at">;
        Update: Partial<Omit<UserFile, "id" | "created_at">>;
      };
    };
    Views: {};
    Functions: {};
    Enums: {};
  };
}
