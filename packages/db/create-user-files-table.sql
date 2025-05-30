-- Create user_files table for persistent download queue
CREATE TABLE IF NOT EXISTS user_files (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  original_file_name TEXT NOT NULL,
  converted_file_name TEXT NOT NULL,
  original_format TEXT NOT NULL,
  converted_format TEXT NOT NULL,
  file_path TEXT NOT NULL, -- S3 path
  download_url TEXT NOT NULL, -- Signed URL (will be regenerated)
  file_size INTEGER NOT NULL,
  quality TEXT NOT NULL DEFAULT 'medium',
  status TEXT NOT NULL DEFAULT 'ready' CHECK (status IN ('ready', 'expired', 'downloaded')),
  expires_at TIMESTAMP WITH TIME ZONE NOT NULL,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW() NOT NULL,
  last_downloaded_at TIMESTAMP WITH TIME ZONE
);

-- Create index for efficient user queries
CREATE INDEX IF NOT EXISTS idx_user_files_user_id ON user_files(user_id);
CREATE INDEX IF NOT EXISTS idx_user_files_status ON user_files(status);
CREATE INDEX IF NOT EXISTS idx_user_files_expires_at ON user_files(expires_at);

-- Enable RLS
ALTER TABLE user_files ENABLE ROW LEVEL SECURITY;

-- RLS policies
CREATE POLICY "Users can view their own files" ON user_files
  FOR SELECT USING (auth.uid() = user_id);

CREATE POLICY "Users can insert their own files" ON user_files
  FOR INSERT WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update their own files" ON user_files
  FOR UPDATE USING (auth.uid() = user_id);

CREATE POLICY "Users can delete their own files" ON user_files
  FOR DELETE USING (auth.uid() = user_id); 