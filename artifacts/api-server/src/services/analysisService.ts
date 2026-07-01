import { db } from "@workspace/db";
import { analysesTable } from "@workspace/db";
import { eq } from "drizzle-orm";
import { ai } from "@workspace/integrations-gemini-ai";
import nodemailer from "nodemailer";
import { marked } from "marked";
import { logger } from "../lib/logger";

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
- Recommended areas leadership should continue monitoring: [...]

CRITICAL FORMATTING RULE: Do NOT include any closing signature, sign-off, name, title, role, affiliation, or "Prepared by" line of any kind. End the report immediately after the Executive Takeaways. The output is from an automated AI system, not a person.`;
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
  const gmailUser = process.env.GMAIL_USER;
  const gmailPass = process.env.GMAIL_APP_PASSWORD;
  if (!gmailUser || !gmailPass) {
    throw new Error("GMAIL_USER and GMAIL_APP_PASSWORD must be set.");
  }

  const transporter = nodemailer.createTransport({
    service: "gmail",
    auth: { user: gmailUser, pass: gmailPass },
  });

  const now = new Date();
  const timestamp = now.toLocaleString("en-US", {
    weekday: "long",
    year: "numeric",
    month: "long",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
    timeZoneName: "short",
  });

  const subject = `Risk Intelligence Brief — ${topic} — ${now.toLocaleDateString("en-US", { year: "numeric", month: "long", day: "numeric" })}`;

  const renderedContent = await marked.parse(reportContent, { gfm: true, breaks: false });

  const htmlBody = `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <style>
    * { box-sizing: border-box; margin: 0; padding: 0; }
    body { font-family: Arial, Helvetica, sans-serif; background: #f0f0f0; color: #222; }
    .wrapper { max-width: 780px; margin: 0 auto; background: #ffffff; }

    /* Header */
    .header { background: #00274C; padding: 24px 36px; border-bottom: 4px solid #FFCB05; }
    .header-label { color: #FFCB05; font-size: 10px; letter-spacing: 0.2em; text-transform: uppercase; font-weight: 700; margin-bottom: 6px; }
    .header-title { color: #ffffff; font-size: 22px; font-weight: 700; }
    .header-sub { color: rgba(255,255,255,0.6); font-size: 12px; margin-top: 4px; }

    /* Meta strip */
    .meta { background: #f7f7f7; padding: 12px 36px; border-bottom: 1px solid #e0e0e0; }
    .meta table { width: 100%; border-collapse: collapse; }
    .meta td { font-size: 11px; padding: 2px 16px 2px 0; vertical-align: top; }
    .meta .lbl { color: #999; text-transform: uppercase; letter-spacing: 0.08em; font-weight: 700; display: block; }
    .meta .val { color: #333; font-weight: 500; }

    /* Body */
    .body { padding: 36px; }

    /* Typography */
    .body h1 { font-size: 20px; font-weight: 700; color: #00274C; margin: 32px 0 10px; padding-bottom: 6px; border-bottom: 2px solid #FFCB05; }
    .body h2 { font-size: 17px; font-weight: 700; color: #00274C; margin: 28px 0 8px; }
    .body h3 { font-size: 14px; font-weight: 700; color: #00274C; margin: 20px 0 6px; }
    .body p { font-size: 14px; line-height: 1.75; color: #333; margin: 0 0 12px; }
    .body ul, .body ol { margin: 8px 0 14px 20px; }
    .body li { font-size: 14px; line-height: 1.7; color: #333; margin-bottom: 4px; }
    .body strong { color: #00274C; font-weight: 700; }
    .body em { font-style: italic; color: #555; }
    .body blockquote { border-left: 3px solid #FFCB05; margin: 12px 0; padding: 8px 16px; background: #fffbea; color: #555; font-size: 13px; }
    .body hr { border: none; border-top: 1px solid #e5e5e5; margin: 24px 0; }

    /* Tables */
    .body table { width: 100%; border-collapse: collapse; margin: 16px 0 20px; font-size: 13px; }
    .body th { background: #00274C; color: #ffffff; text-align: left; padding: 9px 12px; font-size: 11px; text-transform: uppercase; letter-spacing: 0.06em; }
    .body td { padding: 9px 12px; border-bottom: 1px solid #e8e8e8; color: #333; vertical-align: top; }
    .body tr:nth-child(even) td { background: #f9f9f9; }

    /* Footer */
    .footer { border-top: 1px solid #e5e5e5; padding: 16px 36px; background: #f7f7f7; }
    .footer-text { font-size: 11px; color: #aaa; line-height: 1.5; }
  </style>
</head>
<body>
  <div class="wrapper">
    <div class="header">
      <div class="header-label">Enterprise Strategic Risk Management — University of Michigan</div>
      <div class="header-title">Risk Intelligence Brief: ${topic}</div>
      <div class="header-sub">Emerging Risk Deep Evaluation (ERDE)</div>
    </div>
    <div class="meta">
      <table><tr>
        <td><span class="lbl">Generated</span><span class="val">${timestamp}</span></td>
        <td><span class="lbl">Topic</span><span class="val">${topic}</span></td>
        <td><span class="lbl">Job ID</span><span class="val">ERDE-${jobId.toString().padStart(5, "0")}</span></td>
        <td><span class="lbl">Source</span><span class="val">AI-Generated — Gemini</span></td>
      </tr></table>
    </div>
    <div class="body">${renderedContent}</div>
    <div class="footer">
      <div class="footer-text">Automatically generated by the ERDE AI intelligence system. Does not represent the views of any individual. Contact your ESRM team with questions.</div>
    </div>
  </div>
</body>
</html>`;

  await transporter.sendMail({
    from: `"ERDE Risk Intelligence" <${gmailUser}>`,
    to: recipientEmail,
    subject,
    html: htmlBody,
  });

  logger.info({ jobId, recipientEmail }, "Email sent successfully");
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}
