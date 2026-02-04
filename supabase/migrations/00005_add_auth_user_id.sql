-- Add auth_user_id column to publishers table for Google OAuth linking
ALTER TABLE publishers ADD COLUMN IF NOT EXISTS auth_user_id UUID REFERENCES auth.users(id);

-- Add email column if not exists
ALTER TABLE publishers ADD COLUMN IF NOT EXISTS email TEXT;

-- Create unique index for auth_user_id
CREATE UNIQUE INDEX IF NOT EXISTS idx_publishers_auth_user ON publishers(auth_user_id) WHERE auth_user_id IS NOT NULL;

-- Create index for email lookups
CREATE INDEX IF NOT EXISTS idx_publishers_email ON publishers(email) WHERE email IS NOT NULL;

-- Update RLS policies to allow authenticated users to read their own publisher data
CREATE POLICY "Users can read their own publisher" ON publishers
  FOR SELECT
  USING (auth.uid() = auth_user_id);

-- Allow service role to manage all publishers (for API routes)
-- This should already exist from previous migrations, but ensure it's there
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE tablename = 'publishers' AND policyname = 'Service role can manage publishers'
  ) THEN
    CREATE POLICY "Service role can manage publishers" ON publishers
      FOR ALL
      USING (auth.role() = 'service_role')
      WITH CHECK (auth.role() = 'service_role');
  END IF;
END $$;
