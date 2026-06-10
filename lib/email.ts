import { Resend } from "resend";

const resend = new Resend(process.env.RESEND_API_KEY);
const FROM = "TALLY <hello@mail.tallyagc.com>";
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

// ── sendWelcomeEmail ──────────────────────────────────────────────────────────

export async function sendWelcomeEmail(
  producerName: string,
  producerEmail: string
): Promise<void> {
  const name = producerName || "Producer";

  const tools = [
    "Upload Kit Generator",
    "Title Tester",
    "Keyword Heat Map",
    "Monthly Channel Report",
    "Action Plan — 7 monthly priorities",
    "Competitor Tracker",
    "TALLY Score",
  ];

  const toolRows = tools
    .map(
      (t) =>
        `<tr><td style="padding:6px 0;color:#94a3b8;font-size:14px;">
          <span style="color:#475569;margin-right:10px;">→</span>${t}
        </td></tr>`
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
          Your channel is connected and your first report will be ready within 24 hours.
        </p>
      </td>
    </tr>
    <tr>
      <td style="padding-bottom:8px;">
        <p style="margin:0;font-size:11px;color:#475569;letter-spacing:0.15em;text-transform:uppercase;">You now have access to</p>
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
  `);

  console.log(`[email:welcome] sending to ${producerEmail} — RESEND_API_KEY set: ${!!process.env.RESEND_API_KEY}`);

  const { data, error } = await resend.emails.send({
    from: FROM,
    to: [producerEmail],
    subject: `Welcome to TALLY, ${name}`,
    html,
  });

  if (error) {
    console.error("[email:welcome] send failed:", JSON.stringify(error));
  } else {
    console.log(`[email:welcome] sent to ${producerEmail} id=${data?.id}`);
  }
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
            <p style="margin:0 0 12px;font-size:11px;color:#475569;letter-spacing:0.15em;text-transform:uppercase;">This month</p>
            <table width="100%" cellpadding="0" cellspacing="0" border="0">
              ${actionItems
                .slice(0, 3)
                .map(
                  (tip) =>
                    `<tr><td style="padding:5px 0;color:#94a3b8;font-size:14px;line-height:1.5;">
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
    ${ctaButton(`${BASE_URL}/dashboard/report`, "View your report →")}
  `);

  console.log(`[email:report-ready] sending to ${producerEmail} — RESEND_API_KEY set: ${!!process.env.RESEND_API_KEY}`);

  const { data, error } = await resend.emails.send({
    from: FROM,
    to: [producerEmail],
    subject: `Your ${month} TALLY report is ready`,
    html,
  });

  if (error) {
    console.error("[email:report-ready] send failed:", JSON.stringify(error));
  } else {
    console.log(`[email:report-ready] sent to ${producerEmail} id=${data?.id}`);
  }
}

// ── sendTrialEndingEmail ──────────────────────────────────────────────────────

export async function sendTrialEndingEmail(
  producerName: string,
  producerEmail: string,
  daysLeft: number
): Promise<void> {
  const name = producerName || "Producer";

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
        `<tr><td style="padding:5px 0;color:#94a3b8;font-size:14px;">
          <span style="color:#f87171;margin-right:10px;">×</span>${item}
        </td></tr>`
    )
    .join("");

  const html = emailShell(`
    <tr>
      <td style="padding-bottom:12px;">
        <h1 style="margin:0;color:#ffffff;font-size:28px;font-weight:700;letter-spacing:-0.02em;line-height:1.2;">Your trial ends in ${daysLeft} day${daysLeft === 1 ? "" : "s"}</h1>
      </td>
    </tr>
    <tr>
      <td style="padding-bottom:32px;">
        <p style="margin:0;color:#94a3b8;font-size:15px;line-height:1.7;">
          Hey ${name} — your TALLY trial is almost up. After it ends you'll lose access to:
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
    ${ctaButton(`${BASE_URL}/settings`, "Continue your subscription →")}
  `);

  console.log(`[email:trial-ending] sending to ${producerEmail} — RESEND_API_KEY set: ${!!process.env.RESEND_API_KEY}`);

  const { data, error } = await resend.emails.send({
    from: FROM,
    to: [producerEmail],
    subject: `Your TALLY trial ends in ${daysLeft} day${daysLeft === 1 ? "" : "s"}`,
    html,
  });

  if (error) {
    console.error("[email:trial-ending] send failed:", JSON.stringify(error));
  } else {
    console.log(`[email:trial-ending] sent to ${producerEmail} id=${data?.id}`);
  }
}
