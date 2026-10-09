import { pool } from "@workspace/db";
import { logger } from "./logger.js";

/**
 * Adds the columns / table the feedback upgrade needs. Every statement is idempotent, so running it on
 * each start is harmless, and a database already set up with the latest supabase-setup.sql is untouched.
 * A failure is logged and never stops the server (the feedback features simply stay unavailable).
 */
export const SCHEMA_STATEMENTS = [
  "ALTER TABLE feedback ADD COLUMN IF NOT EXISTS action_taken text",
  "ALTER TABLE feedback ADD COLUMN IF NOT EXISTS result text",
  "ALTER TABLE feedback ADD COLUMN IF NOT EXISTS reason_tags text[]",
  `CREATE TABLE IF NOT EXISTS astro_tuning (
    id serial PRIMARY KEY,
    created_at timestamp NOT NULL DEFAULT now(),
    multipliers jsonb NOT NULL,
    astro_share real NOT NULL,
    rationale text NOT NULL,
    sample_size integer NOT NULL,
    based_on_max_feedback_id integer NOT NULL
  )`,
  "ALTER TABLE astro_tuning ENABLE ROW LEVEL SECURITY",
];

export async function ensureSchema(): Promise<void> {
  try {
    for (const sql of SCHEMA_STATEMENTS) await pool.query(sql);
    logger.info("Database schema checked");
  } catch (err) {
    logger.error({ err }, "Could not update the database schema; run lib/db/supabase-setup.sql in Supabase");
  }
}
