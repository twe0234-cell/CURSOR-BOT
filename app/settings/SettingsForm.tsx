"use client";

import { useState } from "react";
import { saveUserSettings } from "./actions";

type Props = {
  defaultGreenApiId: string;
  defaultGreenApiToken: string;
};

export default function SettingsForm({
  defaultGreenApiId,
  defaultGreenApiToken,
}: Props) {
  const [greenApiId, setGreenApiId] = useState(defaultGreenApiId);
  const [greenApiToken, setGreenApiToken] = useState(defaultGreenApiToken);
  const [message, setMessage] = useState<{ type: "success" | "error"; text: string } | null>(null);
  const [loading, setLoading] = useState(false);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setMessage(null);
    setLoading(true);

    const result = await saveUserSettings(greenApiId, greenApiToken);

    if (result.success) {
      setMessage({ type: "success", text: "ההגדרות נשמרו בהצלחה" });
    } else {
      setMessage({ type: "error", text: result.error });
    }
    setLoading(false);
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-4">
      <div>
        <label
          htmlFor="green_api_id"
          className="mb-2 block text-sm font-medium text-slate-700"
        >
          Green API ID
        </label>
        <input
          id="green_api_id"
          type="text"
          value={greenApiId}
          onChange={(e) => setGreenApiId(e.target.value)}
          className="w-full rounded-lg border border-slate-300 px-4 py-2 focus:border-teal-500 focus:outline-none focus:ring-1 focus:ring-teal-500"
          placeholder="הזן את ה-Instance ID"
        />
      </div>

      <div>
        <label
          htmlFor="green_api_token"
          className="mb-2 block text-sm font-medium text-slate-700"
        >
          Green API Token
        </label>
        <input
          id="green_api_token"
          type="password"
          value={greenApiToken}
          onChange={(e) => setGreenApiToken(e.target.value)}
          className="w-full rounded-lg border border-slate-300 px-4 py-2 focus:border-teal-500 focus:outline-none focus:ring-1 focus:ring-teal-500"
          placeholder="הזן את ה-API Token"
        />
      </div>

      {message && (
        <div
          className={`rounded-lg p-3 text-sm ${
            message.type === "success"
              ? "bg-green-50 text-green-700"
              : "bg-red-50 text-red-600"
          }`}
        >
          {message.text}
        </div>
      )}

      <button
        type="submit"
        disabled={loading}
        className="w-full rounded-lg bg-teal-600 px-4 py-2 font-medium text-white transition-colors hover:bg-teal-700 disabled:opacity-50"
      >
        {loading ? "שומר..." : "שמור הגדרות"}
      </button>
    </form>
  );
}
