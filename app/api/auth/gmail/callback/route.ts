import { NextResponse } from "next/server";
import { createClient } from "@/src/lib/supabase/server";

const TOKEN_URL = "https://oauth2.googleapis.com/token";

export async function GET(req: Request) {
  const { searchParams } = new URL(req.url);
  const code = searchParams.get("code");
  const state = searchParams.get("state");
  const error = searchParams.get("error");
  const appUrl = (
    process.env.NEXT_PUBLIC_APP_URL ?? "http://localhost:3000"
  ).replace(/\s/g, "").replace(/\/+$/, "");
  const settingsUrl = new URL("/settings", appUrl);

  if (error) {
    settingsUrl.searchParams.set("gmail_error", error);
    return NextResponse.redirect(settingsUrl);
  }

  if (!code || !state) {
    settingsUrl.searchParams.set("gmail_error", "missing_params");
    return NextResponse.redirect(settingsUrl);
  }

  let userId: string;
  try {
    const decoded = JSON.parse(
      Buffer.from(state, "base64url").toString("utf8")
    );
    userId = decoded?.userId;
  } catch {
    settingsUrl.searchParams.set("gmail_error", "invalid_state");
    return NextResponse.redirect(settingsUrl);
  }

  const clientId = process.env.GOOGLE_CLIENT_ID?.replace(/\s/g, "");
  const clientSecret = process.env.GOOGLE_CLIENT_SECRET?.replace(/\s/g, "");

  if (!clientId || !clientSecret) {
    settingsUrl.searchParams.set("gmail_error", "config");
    return NextResponse.redirect(settingsUrl);
  }

  const redirectUri = `${appUrl}/api/auth/gmail/callback`;

  const body = new URLSearchParams({
    code,
    client_id: clientId,
    client_secret: clientSecret,
    redirect_uri: redirectUri,
    grant_type: "authorization_code",
  });

  const tokenRes = await fetch(TOKEN_URL, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: body.toString(),
  });

  if (!tokenRes.ok) {
    settingsUrl.searchParams.set("gmail_error", "token_exchange");
    return NextResponse.redirect(settingsUrl);
  }

  const tokens = (await tokenRes.json()) as {
    refresh_token?: string;
    access_token?: string;
  };

  const refreshToken = tokens.refresh_token;
  if (!refreshToken) {
    settingsUrl.searchParams.set("gmail_error", "no_refresh");
    return NextResponse.redirect(settingsUrl);
  }

  // Get user email from Google
  const userInfoRes = await fetch(
    "https://www.googleapis.com/oauth2/v2/userinfo",
    {
      headers: { Authorization: `Bearer ${tokens.access_token}` },
    }
  );
  let gmailEmail: string | null = null;
  if (userInfoRes.ok) {
    const userInfo = (await userInfoRes.json()) as { email?: string };
    gmailEmail = userInfo.email ?? null;
  }

  const supabase = await createClient();
  await supabase.from("user_settings").upsert(
    {
      user_id: userId,
      gmail_refresh_token: refreshToken,
      gmail_email: gmailEmail,
      updated_at: new Date().toISOString(),
    },
    { onConflict: "user_id" }
  );

  settingsUrl.searchParams.set("gmail", "connected");
  return NextResponse.redirect(settingsUrl);
}
