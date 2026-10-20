import { Router } from "express";
import { db } from "@workspace/db";
import { analysesTable } from "@workspace/db";
import { eq } from "drizzle-orm";
import { waitUntil } from "@vercel/functions";
import {
  StartAnalysisBody,
  GetAnalysisStatusParams,
  GetAnalysisReportParams,
  RetryEmailParams,
} from "@workspace/api-zod";
import { logger } from "../lib/logger";
import {
  isAllowedRecipient,
  RECIPIENT_DOMAIN_ERROR,
  runAnalysis,
  sendReport,
} from "../services/analysisService";

const router = Router();

router.post("/analysis/start", async (req, res) => {
  const parsed = StartAnalysisBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: "Invalid input" });
    return;
  }

  const { topic, recipientEmail } = parsed.data;

  if (!isAllowedRecipient(recipientEmail)) {
    res.status(400).json({ error: RECIPIENT_DOMAIN_ERROR });
    return;
  }

  const [job] = await db
    .insert(analysesTable)
    .values({
      topic,
      recipientEmail,
      status: "pending",
      stage: "Preparing request...",
      progress: 0,
    })
    .returning();

  res.status(201).json(serializeJob(job));

  // The report is generated after responding. On Vercel, waitUntil keeps the
  // function alive until it finishes; elsewhere it is a no-op.
  waitUntil(
    runAnalysis(job.id).catch((err) => {
      logger.error({ err, jobId: job.id }, "Analysis run failed");
    }),
  );
});

router.get("/analysis/:id/status", async (req, res) => {
  const parsed = GetAnalysisStatusParams.safeParse({ id: Number(req.params.id) });
  if (!parsed.success) {
    res.status(400).json({ error: "Invalid id" });
    return;
  }

  const [job] = await db
    .select()
    .from(analysesTable)
    .where(eq(analysesTable.id, parsed.data.id));

  if (!job) {
    res.status(404).json({ error: "Not found" });
    return;
  }

  res.json(serializeJob(job));
});

router.get("/analysis/:id/report", async (req, res) => {
  const parsed = GetAnalysisReportParams.safeParse({ id: Number(req.params.id) });
  if (!parsed.success) {
    res.status(400).json({ error: "Invalid id" });
    return;
  }

  const [job] = await db
    .select()
    .from(analysesTable)
    .where(eq(analysesTable.id, parsed.data.id));

  if (!job) {
    res.status(404).json({ error: "Not found" });
    return;
  }

  res.json(serializeReport(job));
});

router.post("/analysis/:id/retry-email", async (req, res) => {
  const parsed = RetryEmailParams.safeParse({ id: Number(req.params.id) });
  if (!parsed.success) {
    res.status(400).json({ error: "Invalid id" });
    return;
  }

  const [job] = await db
    .select()
    .from(analysesTable)
    .where(eq(analysesTable.id, parsed.data.id));

  if (!job) {
    res.status(404).json({ error: "Not found" });
    return;
  }

  if (!job.reportContent) {
    res.status(400).json({ error: "No report to send" });
    return;
  }

  try {
    await sendReport(job.id, job.topic, job.recipientEmail, job.reportContent);
    res.json({ success: true, message: "Email sent successfully" });
  } catch (err) {
    logger.error({ err, jobId: job.id }, "Retry email failed");
    res.json({ success: false, message: "Failed to send email" });
  }
});

router.get("/analysis", async (_req, res) => {
  const jobs = await db
    .select()
    .from(analysesTable)
    .orderBy(analysesTable.createdAt);

  res.json(jobs.map(serializeJob));
});

function serializeJob(job: typeof analysesTable.$inferSelect) {
  return {
    id: job.id,
    topic: job.topic,
    recipientEmail: job.recipientEmail,
    status: job.status,
    stage: job.stage,
    progress: job.progress,
    emailSent: job.emailSent ?? null,
    emailError: job.emailError ?? null,
    createdAt: job.createdAt.toISOString(),
    completedAt: job.completedAt?.toISOString() ?? null,
  };
}

function serializeReport(job: typeof analysesTable.$inferSelect) {
  return {
    ...serializeJob(job),
    reportContent: job.reportContent ?? null,
  };
}

export default router;
