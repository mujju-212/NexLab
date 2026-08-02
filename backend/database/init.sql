-- Virtual Lab Platform — PostgreSQL Initial Setup
-- Run automatically by Docker on first start
-- Tables are created by Flask-Migrate — this file handles extras

-- Groq usage tracker table (not managed by SQLAlchemy models)
CREATE TABLE IF NOT EXISTS groq_usage (
    institution_id VARCHAR(36) NOT NULL,
    usage_date     DATE NOT NULL,
    count          INTEGER DEFAULT 0,
    PRIMARY KEY (institution_id, usage_date)
);

-- Index for fast quota lookups
CREATE INDEX IF NOT EXISTS idx_groq_usage_date ON groq_usage(usage_date);

-- Seed default environment profiles (platform-wide defaults)
-- These are available to ALL institutions
-- Run AFTER Flask-Migrate creates environment_profiles table
-- INSERT INTO environment_profiles ... (done via seed script after migration)
