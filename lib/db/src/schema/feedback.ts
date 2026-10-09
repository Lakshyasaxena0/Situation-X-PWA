import { pgTable, text, serial, integer, boolean, timestamp, index, real, jsonb } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";

export const feedbackTable = pgTable("feedback", {
  id: serial("id").primaryKey(),
  // Clerk user id of the owner (see analyses.userId).
  userId: text("user_id"),
  analysisId: integer("analysis_id").notNull(),
  situationSnippet: text("situation_snippet"),
  rating: integer("rating").notNull(),
  accuracy: integer("accuracy"),
  comment: text("comment"),
  helpful: boolean("helpful"),
  // Follow-up result: did things turn out the way the reading suggested?
  // matched | partly | different. Null for ordinary feedback. Drives calibration.
  outcome: text("outcome"),
  // Follow-up question 2: what the person did. followed | other | nothing.
  actionTaken: text("action_taken"),
  // Follow-up question 3: how it actually turned out. better | same | worse.
  result: text("result"),
  // Follow-up question 4: what was right or missed (a fixed list of tags).
  reasonTags: text("reason_tags").array(),
  createdAt: timestamp("created_at").defaultNow().notNull(),
}, (table) => [index("feedback_user_id_idx").on(table.userId)]);

/**
 * How much the astrology reading is weighted, as decided by the AI from aggregated follow-ups.
 * One row per change; the newest row is the active one. Never holds personal data.
 */
export const astroTuningTable = pgTable("astro_tuning", {
  id: serial("id").primaryKey(),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  multipliers: jsonb("multipliers").notNull(),
  astroShare: real("astro_share").notNull(),
  rationale: text("rationale").notNull(),
  sampleSize: integer("sample_size").notNull(),
  basedOnMaxFeedbackId: integer("based_on_max_feedback_id").notNull(),
});

export const insertFeedbackSchema = createInsertSchema(feedbackTable).omit({ id: true, createdAt: true });
export type InsertFeedback = z.infer<typeof insertFeedbackSchema>;
export type Feedback = typeof feedbackTable.$inferSelect;
