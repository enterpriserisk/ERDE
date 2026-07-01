import { db } from "@workspace/db";
import { analysesTable } from "@workspace/db";
import { eq } from "drizzle-orm";
import { ai } from "@workspace/integrations-gemini-ai";
import { ReplitConnectors } from "@replit/connectors-sdk";
import { logger } from "../lib/logger";

const connectors = new ReplitConnectors();

const STAGES = [
  { stage: "Preparing request...", progress: 5 },
  { stage: "Building prompt...", progress: 12 },
  { stage: "Contacting Gemini...", progress: 20 },
  { stage: "Generating report...", progress: 30 },
  { stage: "Formatting response...", progress: 80 },
  { stage: "Saving report...", progress: 90 },
  { stage: "Sending email...", progress: 95 },
  { stage: "Complete", progress: 100 },
];

async function updateJob(
  id: number,
  fields: Partial<typeof analysesTable.$inferInsert> & { completedAt?: Date | null },
) {
  await db.update(analysesTable).set(fields as any).where(eq(analysesTable.id, id));
}

function buildPrompt(topic: string): string {
  const today = new Date().toLocaleDateString("en-US", {
    year: "numeric",
    month: "long",
    day: "numeric",
  });

  return `You are a senior Risk Intelligence Analyst responsible for monitoring emerging risks affecting higher education institutions, with particular emphasis on the University of Michigan (all campuses).

Your objective is to identify and summarize the seven (7) most significant and emerging risks related to the topic:

TOPIC: ${topic}

Today's date: ${today}

Examples of risk topics include:
AI, Data Privacy, Research, Federal Funding, Mental Health, Title IX, Athletics/NIL, Cybersecurity, ESG, Residential Life, Compliance, Third Parties, Cryptocurrency, etc.

---

SCOPE

Search for information published within the last 30 days whenever possible. If insufficient information exists, expand to the previous 90 days while prioritizing the newest developments.

Use authoritative, credible sources including:
- Federal agencies (Department of Education, NIH, NSF, HHS, FBI, CISA, NIST, OCR)
- NCAA, AAU, APLU, EDUCAUSE, NACUBO
- Chronicle of Higher Education, Inside Higher Ed, Higher Ed Dive
- Reuters, AP, Bloomberg
- University of Michigan News, Michigan Medicine, Michigan Daily (for campus-specific developments)

Avoid opinion pieces unless they provide unique information.

---

SELECTION CRITERIA

Rank risks according to:
- Severity and Likelihood
- Potential impact on higher education
- Relevance to research universities and the University of Michigan specifically
- Novelty or rapidly changing developments
- Frequency of reporting across multiple reputable sources

Prioritize risks that may require executive awareness.

---

REQUIRED FORMAT

Begin with a ranking table:

| Rank | Risk | Trend | Risk Level | U-M Relevance |

Then for each of the Top 7 Risks, provide:

**[Rank]. [Risk Title]**

**Executive Summary** (2-3 sentences)
What happened, why it matters, why leadership should care.

**Why This Matters to the University of Michigan**
Interpretation specific to Michigan: possible impacts on research, finances, compliance, operations, reputation, healthcare, students, faculty, athletics, cybersecurity, government funding, international programs.

**Potential Impacts**
- [3-6 bullet points of realistic consequences if the issue escalates]

**Trend:** [Emerging | Escalating | Stable | Declining | Ongoing]
**Risk Level:** [Critical | High | Moderate | Low]
**Confidence:** [High | Medium | Low]

**Key Sources**
- [Organization — Article Title — Date — URL]
(2-5 sources)

---

WRITING STYLE

Write for: University President, Regents, Provost, Executive Officers, Chief Risk Officer, Board members.

The report should be: concise, executive-level, interpretive, actionable, non-technical.

Do NOT merely summarize articles. Explain "What does this mean?" and "Why should leadership care?"

---

EMAIL FORMAT

Produce the final output as a professional intelligence briefing email:

Subject: Weekly Risk Intelligence Brief — ${topic} — ${today}

Good morning,

Below is this week's executive risk intelligence summary regarding ${topic}. These developments represent the most significant emerging issues with potential implications for higher education institutions and the University of Michigan.

**Executive Summary**
[2-4 paragraph overview of the overall risk landscape]

**Top Risks**
[List the seven risks with full detail as specified above]

**Executive Takeaways**

Key Takeaways:
- Largest emerging concern: [...]
- Most immediate operational risk: [...]
- Most significant regulatory concern: [...]
- Most significant reputational concern: [...]
- Recommended areas leadership should continue monitoring: [...]`;
}

export async function runAnalysis(jobId: number): Promise<void> {
  try {
    await updateJob(jobId, { status: "running", stage: STAGES[0].stage, progress: STAGES[0].progress });

    await sleep(800);
    await updateJob(jobId, { stage: STAGES[1].stage, progress: STAGES[1].progress });

    const [job] = await db.select().from(analysesTable).where(eq(analysesTable.id, jobId));
    if (!job) throw new Error("Job not found");

    const prompt = buildPrompt(job.topic);

    await sleep(600);
    await updateJob(jobId, { stage: STAGES[2].stage, progress: STAGES[2].progress });

    await sleep(400);
    await updateJob(jobId, { stage: STAGES[3].stage, progress: STAGES[3].progress });

    const response = await ai.models.generateContent({
      model: "gemini-3.1-pro-preview",
      contents: [{ role: "user", parts: [{ text: prompt }] }],
      config: { maxOutputTokens: 8192 },
    });

    const reportContent = response.candidates?.[0]?.content?.parts?.[0]?.text ?? "";

    await updateJob(jobId, { stage: STAGES[4].stage, progress: STAGES[4].progress });
    await sleep(500);

    await updateJob(jobId, {
      stage: STAGES[5].stage,
      progress: STAGES[5].progress,
      reportContent,
    });
    await sleep(300);

    await updateJob(jobId, { stage: STAGES[6].stage, progress: STAGES[6].progress });

    let emailSent = false;
    let emailError: string | null = null;

    try {
      await sendReport(jobId, job.topic, job.recipientEmail, reportContent);
      emailSent = true;
    } catch (err) {
      emailError = err instanceof Error ? err.message : "Unknown email error";
      logger.error({ err, jobId }, "Email delivery failed");
    }

    await updateJob(jobId, {
      status: "complete",
      stage: STAGES[7].stage,
      progress: STAGES[7].progress,
      emailSent,
      emailError,
      completedAt: new Date(),
    });
  } catch (err) {
    logger.error({ err, jobId }, "Analysis failed");
    await updateJob(jobId, {
      status: "failed",
      stage: "Analysis failed",
      emailSent: false,
      emailError: err instanceof Error ? err.message : "Unknown error",
      completedAt: new Date(),
    });
  }
}

export async function sendReport(
  jobId: number,
  topic: string,
  recipientEmail: string,
  reportContent: string,
): Promise<void> {
  const today = new Date().toLocaleDateString("en-US", {
    year: "numeric",
    month: "long",
    day: "numeric",
  });

  const subject = `Weekly Risk Intelligence Brief — ${topic} — ${today}`;

  const htmlBody = `
<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <style>
    body { font-family: Arial, sans-serif; max-width: 800px; margin: 0 auto; padding: 20px; color: #333; }
    h1 { color: #00274C; border-bottom: 3px solid #FFCB05; padding-bottom: 10px; }
    h2 { color: #00274C; }
    pre { white-space: pre-wrap; font-family: Arial, sans-serif; line-height: 1.6; }
    .footer { margin-top: 40px; padding-top: 20px; border-top: 1px solid #ddd; color: #666; font-size: 0.9em; }
  </style>
</head>
<body>
  <h1>Risk Intelligence Brief — ${topic}</h1>
  <p><strong>Date:</strong> ${today}</p>
  <p><strong>Generated by:</strong> Emerging Risk Deep Evaluation (DRDE)</p>
  <hr>
  <pre>${reportContent.replace(/</g, "&lt;").replace(/>/g, "&gt;")}</pre>
  <div class="footer">
    <p>This report was generated by the University of Michigan DRDE system. Job ID: ${jobId}</p>
  </div>
</body>
</html>`;

  const response = await connectors.proxy("resend", "/emails", {
    method: "POST",
    body: JSON.stringify({
      from: "DRDE Risk Intelligence <onboarding@resend.dev>",
      to: [recipientEmail],
      subject,
      html: htmlBody,
    }),
  });

  if (!response.ok) {
    const text = await response.text();
    throw new Error(`Resend API error ${response.status}: ${text}`);
  }

  logger.info({ jobId, recipientEmail }, "Email sent successfully");
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}
