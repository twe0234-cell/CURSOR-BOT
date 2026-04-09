"use client";

import { useState } from "react";
import { createClient } from "@/src/lib/supabase/client";
import { useRouter } from "next/navigation";
import type { AuthError } from "@supabase/supabase-js";

const ERROR_MESSAGES_HE: Record<string, string> = {
  // Sign up
  email_exists: "משתמש עם אימייל זה כבר קיים במערכת",
  user_already_exists: "משתמש עם אימייל זה כבר קיים במערכת",
  weak_password: "הסיסמה חלשה מדי. אנא השתמש בסיסמה ארוכה יותר עם אותיות, מספרים וסימנים",
  signup_disabled: "הרשמה חדשה אינה זמינה כרגע",
  validation_failed: "נתונים לא תקינים. אנא בדוק את האימייל והסיסמה",
  over_email_send_rate_limit: "נשלחו יותר מדי הודעות. אנא נסה שוב מאוחר יותר",
  over_request_rate_limit: "יותר מדי בקשות. אנא נסה שוב מאוחר יותר",
  over_sms_send_rate_limit: "נשלחו יותר מדי הודעות SMS. אנא נסה שוב מאוחר יותר",
  email_address_invalid: "כתובת האימייל אינה תקינה",
  // Login
  invalid_credentials: "אימייל או סיסמה שגויים",
  email_not_confirmed: "יש לאשר את האימייל לפני ההתחברות",
  user_not_found: "משתמש לא נמצא",
  session_expired: "ההתחברות פגה. אנא התחברות מחדש",
  // General
  unexpected_failure: "אירעה שגיאה בלתי צפויה. אנא נסה שוב",
};

function getErrorMessage(error: AuthError): string {
  const code = error.code as string | undefined;
  if (code && ERROR_MESSAGES_HE[code]) {
    return ERROR_MESSAGES_HE[code];
  }
  const msg = error.message.toLowerCase();
  if (msg.includes("already registered") || msg.includes("already exists")) {
    return ERROR_MESSAGES_HE.email_exists;
  }
  if (msg.includes("weak") || msg.includes("password")) {
    return ERROR_MESSAGES_HE.weak_password;
  }
  if (msg.includes("invalid") && msg.includes("credentials")) {
    return ERROR_MESSAGES_HE.invalid_credentials;
  }
  return error.message || "אירעה שגיאה. אנא נסה שוב";
}

export default function LoginPage() {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [isSignUp, setIsSignUp] = useState(false);
  const router = useRouter();

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setLoading(true);

    try {
      const supabase = createClient();

      if (isSignUp) {
        const { error } = await supabase.auth.signUp({ email, password });
        if (error) {
          setError(getErrorMessage(error));
          setLoading(false);
          return;
        }
      } else {
        const { error } = await supabase.auth.signInWithPassword({ email, password });
        if (error) {
          setError(getErrorMessage(error));
          setLoading(false);
          return;
        }
      }

      router.push("/");
      router.refresh();
    } catch {
      setError(isSignUp ? "אירעה שגיאה בהרשמה" : "אירעה שגיאה בהתחברות");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div
      dir="rtl"
      className="flex min-h-screen items-center justify-center bg-background px-4"
      style={{
        backgroundImage:
          "radial-gradient(ellipse 80% 60% at 50% -10%, oklch(0.73 0.13 80 / 8%), transparent)",
      }}
    >
      <div className="w-full max-w-md animate-fade-in-up">
        {/* Logo / Brand */}
        <div className="mb-8 text-center">
          <div
            className="mx-auto mb-4 flex h-16 w-16 items-center justify-center rounded-2xl shadow-lg"
            style={{ background: "var(--navy)" }}
          >
            <span className="text-2xl font-bold" style={{ color: "var(--gold)" }}>
              ה
            </span>
          </div>
          <h1 className="text-2xl font-bold" style={{ color: "var(--navy)" }}>
            הידור הסת״ם
          </h1>
          <p className="mt-1 text-sm" style={{ color: "var(--muted-foreground)" }}>
            {isSignUp ? "הרשמה למערכת" : "ברוך הבא — התחבר להמשיך"}
          </p>
        </div>

        {/* Card */}
        <div
          className="rounded-2xl border bg-card p-8 shadow-lg"
          style={{ borderColor: "var(--glass-border)" }}
        >
          <form onSubmit={handleSubmit} className="space-y-5">
            <div>
              <label
                htmlFor="email"
                className="mb-1.5 block text-sm font-medium"
                style={{ color: "var(--foreground)" }}
              >
                אימייל
              </label>
              <input
                id="email"
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                required
                autoComplete="email"
                dir="ltr"
                className="w-full rounded-xl border bg-background px-4 py-2.5 text-sm transition-shadow focus:outline-none"
                style={{
                  borderColor: "var(--border)",
                  color: "var(--foreground)",
                }}
                onFocus={(e) => {
                  e.currentTarget.style.borderColor = "var(--gold)";
                  e.currentTarget.style.boxShadow = "0 0 0 3px oklch(0.73 0.13 80 / 15%)";
                }}
                onBlur={(e) => {
                  e.currentTarget.style.borderColor = "var(--border)";
                  e.currentTarget.style.boxShadow = "none";
                }}
                placeholder="you@example.com"
              />
            </div>

            <div>
              <label
                htmlFor="password"
                className="mb-1.5 block text-sm font-medium"
                style={{ color: "var(--foreground)" }}
              >
                סיסמה
              </label>
              <input
                id="password"
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                required
                autoComplete={isSignUp ? "new-password" : "current-password"}
                dir="ltr"
                className="w-full rounded-xl border bg-background px-4 py-2.5 text-sm transition-shadow focus:outline-none"
                style={{
                  borderColor: "var(--border)",
                  color: "var(--foreground)",
                }}
                onFocus={(e) => {
                  e.currentTarget.style.borderColor = "var(--gold)";
                  e.currentTarget.style.boxShadow = "0 0 0 3px oklch(0.73 0.13 80 / 15%)";
                }}
                onBlur={(e) => {
                  e.currentTarget.style.borderColor = "var(--border)";
                  e.currentTarget.style.boxShadow = "none";
                }}
              />
            </div>

            {error && (
              <div className="rounded-xl bg-destructive/8 p-3 text-sm text-destructive">
                {error}
              </div>
            )}

            <button
              type="submit"
              disabled={loading}
              className="w-full rounded-xl px-4 py-2.5 text-sm font-semibold transition-all disabled:opacity-50"
              style={{
                background: "var(--navy)",
                color: "var(--primary-foreground)",
              }}
              onMouseEnter={(e) => {
                if (!loading) e.currentTarget.style.background = "var(--navy-light)";
              }}
              onMouseLeave={(e) => {
                e.currentTarget.style.background = "var(--navy)";
              }}
            >
              {loading
                ? isSignUp
                  ? "נרשם..."
                  : "מתחבר..."
                : isSignUp
                  ? "הרשמה"
                  : "התחבר"}
            </button>

            <button
              type="button"
              onClick={() => {
                setIsSignUp(!isSignUp);
                setError(null);
              }}
              className="w-full rounded-xl border px-4 py-2.5 text-sm font-medium transition-colors"
              style={{
                borderColor: "var(--border)",
                color: "var(--muted-foreground)",
              }}
              onMouseEnter={(e) => {
                e.currentTarget.style.background = "var(--muted)";
              }}
              onMouseLeave={(e) => {
                e.currentTarget.style.background = "transparent";
              }}
            >
              {isSignUp ? "כבר יש לך חשבון? התחבר" : "אין לך חשבון? הרשם"}
            </button>
          </form>
        </div>

        {/* Footer */}
        <p className="mt-6 text-center text-xs" style={{ color: "var(--muted-foreground)" }}>
          מערכת ERP/CRM לסת״ם — גרסה מאובטחת
        </p>
      </div>
    </div>
  );
}
