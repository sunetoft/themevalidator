/**
 * Brevo Email Client
 * ──────────────────
 * Sends transactional emails via the Brevo (Sendinblue) REST API.
 * API key from BREVO_API_KEY environment variable.
 *
 * Docs: https://developers.brevo.com/reference/sendtransacemail
 */

const BREVO_API_URL = 'https://api.brevo.com/v3/smtp/email';
const SENDER_EMAIL = 'noreply@themeinvestor.bunnystocks.com';
const SENDER_NAME = 'ThemeInvestor';

export interface SendEmailResult {
  success: boolean;
  messageId?: string;
  error?: string;
}

/**
 * Send a transactional email via Brevo API.
 * Falls back to console.log if no API key is configured.
 */
export async function sendEmail(
  to: string,
  subject: string,
  htmlBody: string,
  textBody?: string,
): Promise<SendEmailResult> {
  const apiKey = process.env.BREVO_API_KEY;

  // ── No API key → log to console (dev mode) ──
  if (!apiKey) {
    console.log(`[EMAIL:DEV] To: ${to} | Subject: ${subject}\n${textBody || htmlBody}`);
    return { success: true, messageId: 'dev-mode' };
  }

  try {
    const res = await fetch(BREVO_API_URL, {
      method: 'POST',
      headers: {
        'accept': 'application/json',
        'content-type': 'application/json',
        'api-key': apiKey,
      },
      body: JSON.stringify({
        sender: { name: SENDER_NAME, email: SENDER_EMAIL },
        to: [{ email: to }],
        subject,
        htmlContent: htmlBody,
        textContent: textBody || htmlBody.replace(/<[^>]+>/g, ''),
      }),
    });

    if (!res.ok) {
      const errText = await res.text();
      console.error('[BREVO] API error:', res.status, errText);
      return { success: false, error: `Brevo API ${res.status}: ${errText}` };
    }

    const data = await res.json();
    return { success: true, messageId: data.messageId };
  } catch (err) {
    console.error('[BREVO] Send error:', err);
    return { success: false, error: String(err) };
  }
}

/**
 * Wrapper that sends + logs (console.log since no notification table).
 */
export async function sendAndLog(
  to: string,
  subject: string,
  htmlBody: string,
  textBody?: string,
): Promise<SendEmailResult> {
  const result = await sendEmail(to, subject, htmlBody, textBody);
  console.log(`[EMAIL] Sent to ${to}: ${subject} — ${result.success ? 'OK' : 'FAILED'}${result.messageId ? ` (${result.messageId})` : ''}`);
  return result;
}

// ═══════════════════════════════════════════
// Email Templates
// ═══════════════════════════════════════════

function emailShell(title: string, content: string): string {
  return `<!DOCTYPE html>
<html>
<head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1.0"></head>
<body style="margin:0;padding:0;background:#0f172a;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif">
  <table width="100%" cellpadding="0" cellspacing="0" style="background:#0f172a;padding:40px 0">
    <tr><td align="center">
      <table width="560" cellpadding="0" cellspacing="0" style="background:#1e293b;border-radius:16px;overflow:hidden;box-shadow:0 4px 24px rgba(0,0,0,0.4)">
        <tr><td style="background:linear-gradient(135deg,#6366f1,#4f46e5);padding:32px 40px">
          <h1 style="margin:0;color:#ffffff;font-size:22px;font-weight:700">⚡ ThemeInvestor</h1>
          <p style="margin:4px 0 0;color:#c7d2fe;font-size:13px">${title}</p>
        </td></tr>
        <tr><td style="padding:32px 40px;color:#e2e8f0;font-size:15px;line-height:1.6">
          ${content}
        </td></tr>
        <tr><td style="padding:24px 40px 32px;border-top:1px solid #334155">
          <p style="margin:0;color:#64748b;font-size:12px;line-height:1.5">
            ThemeInvestor validates emerging investment themes with AI-powered analysis.<br>
            © ${new Date().getFullYear()} ThemeInvestor · themeinvestor.bunnystocks.com
          </p>
        </td></tr>
      </table>
    </td></tr>
  </table>
</body>
</html>`;
}

export function forgotPasswordEmail(
  name: string,
  resetUrl: string,
): { subject: string; html: string; text: string } {
  const subject = `[ThemeInvestor] Reset your password`;
  const html = emailShell('Password Reset', `
    <p>Hi ${name || 'there'},</p>
    <p>We received a request to reset your ThemeInvestor password.</p>
    <p style="margin-top:16px"><a href="${resetUrl}" style="display:inline-block;padding:10px 24px;background:#6366f1;color:#fff;border-radius:8px;text-decoration:none;font-weight:600">Reset Password</a></p>
    <p style="margin-top:16px;font-size:13px;color:#94a3b8">This link expires in 1 hour. If you didn't request this, you can safely ignore this email.</p>
  `);
  const text = `Reset your ThemeInvestor password: ${resetUrl}\n\nThis link expires in 1 hour.`;
  return { subject, html, text };
}
