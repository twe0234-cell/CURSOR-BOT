/**
 * Gmail API helpers - OAuth token refresh and send
 */

const TOKEN_URL = "https://oauth2.googleapis.com/token";
const GMAIL_SEND_URL = "https://gmail.googleapis.com/gmail/v1/users/me/messages/send";

export class GmailAuthRevokedError extends Error {
  code = "GMAIL_AUTH_REVOKED" as const;
  constructor(public readonly googleError: string) {
    super("חיבור Gmail פג או נשלל. יש לחבר מחדש בהגדרות.");
  }
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export async function clearRevokedGmailRefreshToken(client: any, userId: string): Promise<void> {
  try {
    await client
      .from("user_settings")
      .update({ gmail_refresh_token: null })
      .eq("user_id", userId);
  } catch {
    // Best-effort cleanup — surface the original auth error, not the cleanup failure.
  }
}

export async function getAccessToken(refreshToken: string): Promise<string> {
  const clientId = process.env.GOOGLE_CLIENT_ID;
  const clientSecret = process.env.GOOGLE_CLIENT_SECRET;
  if (!clientId || !clientSecret) {
    throw new Error("GOOGLE_CLIENT_ID / GOOGLE_CLIENT_SECRET לא מוגדרים");
  }

  const body = new URLSearchParams({
    refresh_token: refreshToken,
    client_id: clientId,
    client_secret: clientSecret,
    grant_type: "refresh_token",
  });

  const res = await fetch(TOKEN_URL, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: body.toString(),
  });

  if (!res.ok) {
    const err = await res.text();
    if (res.status === 400 && err.includes("invalid_grant")) {
      throw new GmailAuthRevokedError(err.slice(0, 200));
    }
    throw new Error(`רענון token נכשל: ${err.slice(0, 200)}`);
  }

  const data = (await res.json()) as { access_token?: string };
  if (!data.access_token) throw new Error("לא התקבל access_token");
  return data.access_token;
}

/**
 * Build RFC 2822 MIME and send via Gmail API
 */
export async function sendEmail(
  accessToken: string,
  to: string,
  subject: string,
  htmlBody: string,
  fromEmail: string,
  fromName?: string
): Promise<void> {
  const fromHeader = fromName
    ? `"${fromName}" <${fromEmail}>`
    : fromEmail;
  const lines: string[] = [
    `From: ${fromHeader}`,
    `To: ${to}`,
    `Subject: =?UTF-8?B?${Buffer.from(subject, "utf8").toString("base64")}?=`,
    "MIME-Version: 1.0",
    "Content-Type: text/html; charset=UTF-8",
    "Content-Transfer-Encoding: base64",
    "",
    Buffer.from(htmlBody, "utf8").toString("base64"),
  ];

  const raw = Buffer.from(lines.join("\r\n"), "utf8")
    .toString("base64")
    .replace(/\+/g, "-")
    .replace(/\//g, "_")
    .replace(/=+$/, "");

  const res = await fetch(GMAIL_SEND_URL, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${accessToken}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ raw }),
  });

  if (!res.ok) {
    const err = await res.text();
    throw new Error(`שליחת אימייל נכשלה: ${err.slice(0, 300)}`);
  }
}
