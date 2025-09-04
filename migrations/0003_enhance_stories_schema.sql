-- Add enhanced metadata columns to stories table
ALTER TABLE stories
ADD COLUMN IF NOT EXISTS brief_summary VARCHAR(255),
ADD COLUMN IF NOT EXISTS narrative TEXT,
ADD COLUMN IF NOT EXISTS emotional_tags TEXT[],
ADD COLUMN IF NOT EXISTS tone VARCHAR(50),
ADD COLUMN IF NOT EXISTS significance_rating INTEGER DEFAULT 3 CHECK (significance_rating >= 1 AND significance_rating <= 5),
ADD COLUMN IF NOT EXISTS privacy_level VARCHAR(20) DEFAULT 'private' CHECK (privacy_level IN ('private', 'family', 'public')),
ADD COLUMN IF NOT EXISTS media_references JSONB DEFAULT '[]'::jsonb,
ADD COLUMN IF NOT EXISTS version INTEGER DEFAULT 1,
ADD COLUMN IF NOT EXISTS is_complete BOOLEAN DEFAULT false,
ADD COLUMN IF NOT EXISTS last_accessed_at TIMESTAMP WITH TIME ZONE,
ADD COLUMN IF NOT EXISTS access_count INTEGER DEFAULT 0;

-- Create story_versions table for tracking changes
CREATE TABLE IF NOT EXISTS story_versions (
    id SERIAL PRIMARY KEY,
    story_id INTEGER NOT NULL REFERENCES stories(id) ON DELETE CASCADE,
    version_number INTEGER NOT NULL,
    content TEXT,
    narrative TEXT,
    changed_by INTEGER REFERENCES users(id),
    change_type VARCHAR(50), -- 'append', 'edit', 'clarification'
    change_summary TEXT,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    UNIQUE(story_id, version_number)
);

-- Create story_contradictions table for tracking conflicts
CREATE TABLE IF NOT EXISTS story_contradictions (
    id SERIAL PRIMARY KEY,
    story_id INTEGER NOT NULL REFERENCES stories(id) ON DELETE CASCADE,
    memory_id INTEGER,
    contradiction_type VARCHAR(50), -- 'date', 'person', 'place', 'event', 'detail'
    original_value TEXT,
    conflicting_value TEXT,
    resolved BOOLEAN DEFAULT false,
    resolution TEXT,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Add indexes for better query performance
CREATE INDEX IF NOT EXISTS idx_stories_emotional_tags ON stories USING GIN(emotional_tags);
CREATE INDEX IF NOT EXISTS idx_stories_significance ON stories(user_id, significance_rating DESC);
CREATE INDEX IF NOT EXISTS idx_stories_privacy ON stories(user_id, privacy_level);
CREATE INDEX IF NOT EXISTS idx_stories_tone ON stories(user_id, tone);
CREATE INDEX IF NOT EXISTS idx_stories_last_accessed ON stories(user_id, last_accessed_at DESC NULLS LAST);
CREATE INDEX IF NOT EXISTS idx_story_versions_story ON story_versions(story_id, version_number DESC);