import { pgTable, serial, text, integer, boolean, timestamp } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";

export const analysesTable = pgTable("analyses", {
  id: serial("id").primaryKey(),
  topic: text("topic").notNull(),
  recipientEmail: text("recipient_email").notNull(),
  status: text("status").notNull().default("pending"),
  stage: text("stage").notNull().default("Preparing request..."),
  progress: integer("progress").notNull().default(0),
  reportContent: text("report_content"),
  emailSent: boolean("email_sent"),
  emailError: text("email_error"),
  createdAt: timestamp("created_at").notNull().defaultNow(),
  completedAt: timestamp("completed_at"),
});

export const insertAnalysisSchema = createInsertSchema(analysesTable).omit({
  id: true,
  createdAt: true,
  completedAt: true,
});

export type InsertAnalysis = z.infer<typeof insertAnalysisSchema>;
export type Analysis = typeof analysesTable.$inferSelect;
