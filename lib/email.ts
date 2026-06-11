import nodemailer from "nodemailer";

const transporter = nodemailer.createTransport({
  host: "smtp.gmail.com",
  port: 587,
  secure: false,
  auth: {
    user: process.env.GMAIL_USER,
    pass: process.env.GMAIL_APP_PASSWORD,
  },
  tls: {
    rejectUnauthorized: false,
  },
});

const FROM = "TALLY <tallyshop.contact@gmail.com>";
const BASE_URL = "https://tallyagc.com";

// ── Shared HTML primitives ────────────────────────────────────────────────────

function emailShell(content: string): string {
  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1" />
</head>
<body style="margin:0;padding:0;background-color:#0a0a0a;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Helvetica,Arial,sans-serif;">
  <table width="100%" cellpadding="0" cellspacing="0" border="0" style="background-color:#0a0a0a;padding:48px 20px 40px;">
    <tr>
      <td align="center">
        <table width="100%" cellpadding="0" cellspacing="0" border="0" style="max-width:520px;">
          <tr>
            <td style="padding-bottom:40px;">
              <span style="color:#ffffff;font-size:13px;font-weight:700;letter-spacing:0.25em;text-transform:uppercase;">TALLY</span>
            </td>
          </tr>
          ${content}
          <tr>
            <td style="padding-top:48px;border-top:1px solid #1a1a1a;">
              <p style="margin:0;font-size:12px;color:#475569;line-height:1.6;">
                <a href="${BASE_URL}" style="color:#475569;text-decoration:none;">${BASE_URL.replace("https://", "")}</a>
                &nbsp;·&nbsp;
                <a href="${BASE_URL}/settings" style="color:#475569;text-decoration:none;">Unsubscribe</a>
              </p>
            </td>
          </tr>
        </table>
      </td>
    </tr>
  </table>
</body>
</html>`;
}

function ctaButton(href: string, label: string): string {
  return `<tr>
    <td style="padding-bottom:32px;">
      <a href="${href}" style="display:inline-block;background-color:#ffffff;color:#000000;font-size:13px;font-weight:600;text-decoration:none;padding:12px 28px;">
        ${label}
      </a>
    </td>
  </tr>`;
}

async function send(to: string, subject: string, html: string, tag: string): Promise<void> {
  console.log(
    `[email:${tag}] sending to ${to} | GMAIL_USER=${process.env.GMAIL_USER ?? "MISSING"} | GMAIL_APP_PASSWORD set: ${!!process.env.GMAIL_APP_PASSWORD}`
  );

  try {
    await transporter.verify();
    console.log(`[email:${tag}] transporter verified successfully`);
  } catch (verifyErr: unknown) {
    console.error(`[email:${tag}] transporter verify FAILED:`, JSON.stringify(verifyErr, Object.getOwnPropertyNames(verifyErr)));
    throw verifyErr;
  }

  try {
    const info = await transporter.sendMail({ from: FROM, to, subject, html });
    console.log(`[email:${tag}] sent to ${to} id=${info.messageId} accepted=${JSON.stringify(info.accepted)}`);
  } catch (err: unknown) {
    const e = err as { code?: string; message?: string; response?: string };
    console.error(`[email:${tag}] nodemailer error code:`, e.code);
    console.error(`[email:${tag}] nodemailer error message:`, e.message);
    console.error(`[email:${tag}] nodemailer error response:`, e.response);
    throw err;
  }
}

// ── sendEmailConfirmation ─────────────────────────────────────────────────────

export async function sendEmailConfirmation(
  producerEmail: string,
  confirmationLink: string
): Promise<void> {
  const html = emailShell(`
    <tr>
      <td style="padding-bottom:12px;">
        <h1 style="margin:0;color:#ffffff;font-size:32px;font-weight:700;letter-spacing:-0.02em;line-height:1.1;">One step away.</h1>
      </td>
    </tr>
    <tr>
      <td style="padding-bottom:32px;">
        <p style="margin:0;color:#94a3b8;font-size:15px;line-height:1.7;">
          Click below to confirm your email address and activate your account.
        </p>
      </td>
    </tr>
    ${ctaButton(confirmationLink, "Confirm my account →")}
    <tr>
      <td style="padding-bottom:32px;">
        <p style="margin:0;font-size:12px;color:#475569;line-height:1.6;">
          This link expires in 24 hours. If you didn't create a TALLY account, you can ignore this email.
        </p>
      </td>
    </tr>
  `);

  await send(producerEmail, "Confirm your TALLY account", html, "confirm");
}

// ── sendWelcomeEmail ──────────────────────────────────────────────────────────

export async function sendWelcomeEmail(
  producerName: string,
  producerEmail: string
): Promise<void> {
  const name = producerName || "Producer";

  const tools = [
    { name: "Upload Kit Generator", desc: "Optimized title, description, tags, and thumbnail direction for every upload" },
    { name: "Title Tester", desc: "Score any title 1–100 and get better rewrites instantly" },
    { name: "Keyword Heat Map", desc: "Top 20 trending tags in your niche, updated monthly" },
    { name: "Monthly Channel Report", desc: "Full channel analysis based on your real YouTube data" },
    { name: "Action Plan", desc: "7 specific priorities for your channel each month" },
    { name: "Competitor Tracker", desc: "Track up to 5 channels and compare TALLY scores" },
    { name: "TALLY Score", desc: "Your monthly growth health score with history graph" },
  ];

  const toolRows = tools
    .map(
      (t) =>
        `<tr>
          <td style="padding:8px 0;border-bottom:1px solid #111;">
            <p style="margin:0 0 2px;color:#ffffff;font-size:13px;font-weight:600;">${t.name}</p>
            <p style="margin:0;color:#94a3b8;font-size:12px;line-height:1.5;">${t.desc}</p>
          </td>
        </tr>`
    )
    .join("");

  const html = emailShell(`
    <tr>
      <td style="padding-bottom:12px;">
        <h1 style="margin:0;color:#ffffff;font-size:36px;font-weight:700;letter-spacing:-0.02em;line-height:1.1;">You're in.</h1>
      </td>
    </tr>
    <tr>
      <td style="padding-bottom:32px;">
        <p style="margin:0;color:#94a3b8;font-size:15px;line-height:1.7;">
          Welcome, ${name}. Your channel is connected. Here's what you have access to:
        </p>
      </td>
    </tr>
    <tr>
      <td style="padding-bottom:32px;">
        <table width="100%" cellpadding="0" cellspacing="0" border="0">
          ${toolRows}
        </table>
      </td>
    </tr>
    ${ctaButton(`${BASE_URL}/dashboard`, "Go to your dashboard →")}
    <tr>
      <td style="padding-bottom:32px;">
        <p style="margin:0;font-size:13px;color:#475569;line-height:1.6;">
          Your first report will be ready within 24 hours.
        </p>
      </td>
    </tr>
  `);

  await send(producerEmail, `Welcome to TALLY, ${name}`, html, "welcome");
}

// ── sendReportReadyEmail ──────────────────────────────────────────────────────

export async function sendReportReadyEmail(
  producerName: string,
  producerEmail: string,
  tallyScore: number,
  month: string,
  actionItems: string[] = []
): Promise<void> {
  const name = producerName || "Producer";
  const scoreColor = tallyScore >= 70 ? "#4ade80" : tallyScore >= 40 ? "#fbbf24" : "#f87171";

  const tipsHtml =
    actionItems.length > 0
      ? `<tr>
          <td style="padding-bottom:32px;">
            <p style="margin:0 0 12px;font-size:11px;color:#475569;letter-spacing:0.15em;text-transform:uppercase;">This month's top priorities</p>
            <table width="100%" cellpadding="0" cellspacing="0" border="0">
              ${actionItems
                .slice(0, 3)
                .map(
                  (tip) =>
                    `<tr><td style="padding:6px 0;color:#94a3b8;font-size:14px;line-height:1.5;border-bottom:1px solid #111;">
                      <span style="color:#475569;margin-right:10px;">→</span>${tip}
                    </td></tr>`
                )
                .join("")}
            </table>
          </td>
        </tr>`
      : "";

  const html = emailShell(`
    <tr>
      <td style="padding-bottom:12px;">
        <h1 style="margin:0;color:#ffffff;font-size:30px;font-weight:700;letter-spacing:-0.02em;line-height:1.2;">Your ${month} report is ready</h1>
      </td>
    </tr>
    <tr>
      <td style="padding-bottom:32px;">
        <p style="margin:0;color:#94a3b8;font-size:15px;line-height:1.7;">
          Hey ${name} — your monthly TALLY report has been generated.
        </p>
      </td>
    </tr>
    <tr>
      <td style="padding-bottom:32px;">
        <table cellpadding="0" cellspacing="0" border="0" style="background-color:#111111;border:1px solid #1e1e1e;padding:24px 32px;">
          <tr>
            <td>
              <p style="margin:0 0 4px;font-size:11px;color:#475569;letter-spacing:0.15em;text-transform:uppercase;">TALLY Score</p>
              <p style="margin:0;font-size:52px;font-weight:700;color:${scoreColor};line-height:1;">${tallyScore}</p>
              <p style="margin:4px 0 0;font-size:12px;color:#475569;">out of 100</p>
            </td>
          </tr>
        </table>
      </td>
    </tr>
    ${tipsHtml}
    ${ctaButton(`${BASE_URL}/dashboard/report`, "View your full report →")}
  `);

  await send(producerEmail, `Your ${month} TALLY report is ready`, html, "report-ready");
}

// ── sendTrialEndingEmail ──────────────────────────────────────────────────────

export async function sendTrialEndingEmail(
  producerName: string,
  producerEmail: string,
  daysLeft: number,
  trialEndDate?: string
): Promise<void> {
  const name = producerName || "Producer";

  const endDateStr = trialEndDate
    ? new Date(trialEndDate).toLocaleDateString("en-US", { month: "long", day: "numeric", year: "numeric" })
    : `in ${daysLeft} day${daysLeft === 1 ? "" : "s"}`;

  const loseItems = [
    "Monthly channel report & action plan",
    "Upload Kit Generator — unlimited",
    "Title Tester — unlimited",
    "Keyword Heat Map",
    "Competitor Tracker",
    "TALLY Score history",
  ];

  const loseRows = loseItems
    .map(
      (item) =>
        `<tr><td style="padding:6px 0;color:#94a3b8;font-size:14px;border-bottom:1px solid #111;">
          <span style="color:#f87171;margin-right:10px;">×</span>${item}
        </td></tr>`
    )
    .join("");

  const html = emailShell(`
    <tr>
      <td style="padding-bottom:12px;">
        <h1 style="margin:0;color:#ffffff;font-size:28px;font-weight:700;letter-spacing:-0.02em;line-height:1.2;">Your free trial ends ${endDateStr}</h1>
      </td>
    </tr>
    <tr>
      <td style="padding-bottom:32px;">
        <p style="margin:0;color:#94a3b8;font-size:15px;line-height:1.7;">
          Hey ${name} — you'll lose access to everything below when your trial ends:
        </p>
      </td>
    </tr>
    <tr>
      <td style="padding-bottom:32px;">
        <table width="100%" cellpadding="0" cellspacing="0" border="0">
          ${loseRows}
        </table>
      </td>
    </tr>
    <tr>
      <td style="padding-bottom:32px;">
        <table cellpadding="0" cellspacing="0" border="0" style="background-color:#111111;border:1px solid #1e1e1e;padding:20px 24px;">
          <tr>
            <td>
              <p style="margin:0 0 4px;font-size:11px;color:#475569;letter-spacing:0.15em;text-transform:uppercase;">Keep your access</p>
              <p style="margin:0;font-size:28px;font-weight:700;color:#ffffff;line-height:1;">$19.99<span style="font-size:14px;font-weight:400;color:#94a3b8;">/month</span></p>
              <p style="margin:6px 0 0;font-size:12px;color:#475569;">Cancel anytime. No contracts.</p>
            </td>
          </tr>
        </table>
      </td>
    </tr>
    ${ctaButton(`${BASE_URL}/settings`, "Continue for $19.99/month →")}
    <tr>
      <td style="padding-bottom:32px;">
        <p style="margin:0;font-size:12px;color:#475569;line-height:1.6;">
          No action needed if you've already added a payment method.
        </p>
      </td>
    </tr>
  `);

  await send(
    producerEmail,
    `Your TALLY trial ends in ${daysLeft} day${daysLeft === 1 ? "" : "s"}`,
    html,
    "trial-ending"
  );
}

// ── sendCancellationEmail ─────────────────────────────────────────────────────

export async function sendCancellationEmail(
  producerName: string,
  producerEmail: string,
  accessEndDate?: string
): Promise<void> {
  const name = producerName || "Producer";

  const endStr = accessEndDate
    ? new Date(accessEndDate).toLocaleDateString("en-US", { month: "long", day: "numeric", year: "numeric" })
    : null;

  const html = emailShell(`
    <tr>
      <td style="padding-bottom:12px;">
        <h1 style="margin:0;color:#ffffff;font-size:28px;font-weight:700;letter-spacing:-0.02em;line-height:1.2;">Sorry to see you go, ${name}.</h1>
      </td>
    </tr>
    <tr>
      <td style="padding-bottom:32px;">
        <p style="margin:0;color:#94a3b8;font-size:15px;line-height:1.7;">
          Your TALLY subscription has been cancelled.
          ${endStr ? `Your access continues until <strong style="color:#ffffff;">${endStr}</strong>.` : ""}
        </p>
      </td>
    </tr>
    ${ctaButton(`${BASE_URL}/pricing`, "Changed your mind? →")}
    <tr>
      <td style="padding-bottom:32px;">
        <p style="margin:0;font-size:13px;color:#475569;line-height:1.6;">
          If you have feedback we'd love to hear it:&nbsp;
          <a href="mailto:tallyshop.contact@gmail.com" style="color:#94a3b8;text-decoration:none;">tallyshop.contact@gmail.com</a>
        </p>
      </td>
    </tr>
  `);

  await send(producerEmail, "Your TALLY subscription has been cancelled", html, "cancellation");
}
