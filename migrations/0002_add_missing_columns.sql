-- Add missing columns to users table
ALTER TABLE users 
ADD COLUMN IF NOT EXISTS name VARCHAR(255),
ADD COLUMN IF NOT EXISTS is_active BOOLEAN DEFAULT true,
ADD COLUMN IF NOT EXISTS email_verified BOOLEAN DEFAULT false;

-- Add missing columns to conversations table
ALTER TABLE conversations
ADD COLUMN IF NOT EXISTS description TEXT,
ADD COLUMN IF NOT EXISTS is_archived BOOLEAN DEFAULT false,
ADD COLUMN IF NOT EXISTS message_count INTEGER DEFAULT 0,
ADD COLUMN IF NOT EXISTS memory_count INTEGER DEFAULT 0;

-- Add index on email for faster lookups
CREATE INDEX IF NOT EXISTS idx_users_email ON users(email);

-- Add index on firebase_uid for faster authentication
CREATE INDEX IF NOT EXISTS idx_users_firebase_uid ON users(firebase_uid);

-- Add index for active conversations
CREATE INDEX IF NOT EXISTS idx_conversations_archived ON conversations(user_id, is_archived);