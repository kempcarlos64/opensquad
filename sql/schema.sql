-- Compatibility view of the MVP schema.
-- Source of truth: src/server/db/schema.ts (Drizzle ORM).
-- Executable migration: migrations/0000_organic_video_lab.sql.
--
-- This file intentionally points to the ORM and migration instead of maintaining a
-- second, divergent PostgreSQL schema. The received package had no database/ORM;
-- SQLite was selected for the local MVP and keeps JSON as validated TEXT columns.

PRAGMA foreign_keys = ON;

-- Apply with: npm run db:migrate
