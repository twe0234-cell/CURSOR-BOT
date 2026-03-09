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
  // Fallback for common English messages
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
    <div className="flex min-h-screen items-center justify-center bg-slate-50 px-4">
      <div className="w-full max-w-md rounded-xl border border-slate-200 bg-white p-8 shadow-sm">
        <h1 className="mb-6 text-center text-2xl font-bold text-slate-800">
          Broadcast Buddy
        </h1>
        <p className="mb-6 text-center text-slate-500">
          {isSignUp ? "הרשמה למערכת" : "התחברות למערכת"}
        </p>

        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <label
              htmlFor="email"
              className="mb-2 block text-sm font-medium text-slate-700"
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
              className="w-full rounded-lg border border-slate-300 px-4 py-2 focus:border-teal-500 focus:outline-none focus:ring-1 focus:ring-teal-500"
              placeholder="you@example.com"
            />
          </div>

          <div>
            <label
              htmlFor="password"
              className="mb-2 block text-sm font-medium text-slate-700"
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
              className="w-full rounded-lg border border-slate-300 px-4 py-2 focus:border-teal-500 focus:outline-none focus:ring-1 focus:ring-teal-500"
            />
          </div>

          {error && (
            <div className="rounded-lg bg-red-50 p-3 text-sm text-red-600">
              {error}
            </div>
          )}

          <button
            type="submit"
            disabled={loading}
            className="w-full rounded-lg bg-teal-600 px-4 py-2 font-medium text-white transition-colors hover:bg-teal-700 disabled:opacity-50"
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
            className="w-full rounded-lg border border-slate-300 px-4 py-2 text-sm font-medium text-slate-600 transition-colors hover:bg-slate-50"
          >
            {isSignUp ? "כבר יש לך חשבון? התחבר" : "אין לך חשבון? הרשם"}
          </button>
        </form>
      </div>
    </div>
  );
}
