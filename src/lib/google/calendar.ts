/**
 * Google Calendar helpers — Torah project milestones (draft / incremental sync).
 * Uses Gmail OAuth refresh tokens from `user_settings` (see runTorahCalendarSync).
 */

import type { SupabaseClient } from "@supabase/supabase-js";
import { logWarn } from "@/lib/logger";
import { getAccessTokenForUser } from "@/src/lib/gmail";

const CAL = "https://www.googleapis.com/calendar/v3";

export type TorahCalendarSyncPayload = {
  projectId: string;
  title: string;
  targetDate: string | null;
  qaWeeksBuffer: number;
};

function addCalendarDays(isoDate: string, days: number): string {
  const d = new Date(`${isoDate}T12:00:00Z`);
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
}

function subtractWeeks(isoDate: string, weeks: number): string {
  return addCalendarDays(isoDate, -7 * weeks);
}

async function calJson<T>(
  accessToken: string,
  path: string,
  init?: RequestInit
): Promise<{ ok: boolean; status: number; body: T | null; text: string }> {
  const res = await fetch(`${CAL}${path}`, {
    ...init,
    headers: {
      Authorization: `Bearer ${accessToken}`,
      Accept: "application/json",
      ...(init?.headers as Record<string, string>),
    },
  });
  const text = await res.text();
  let body: T | null = null;
  try {
    body = text ? (JSON.parse(text) as T) : null;
  } catch {
    body = null;
  }
  return { ok: res.ok, status: res.status, body, text };
}

async function deleteProjectMilestones(accessToken: string, projectId: string): Promise<void> {
  const q = new URLSearchParams({
    privateExtendedProperty: `broadcastBuddyTorah=${projectId}`,
    singleEvents: "true",
    maxResults: "20",
  });
  const list = await calJson<{ items?: { id: string }[] }>(
    accessToken,
    `/calendars/primary/events?${q.toString()}`
  );
  if (!list.ok) {
    logWarn("GoogleCalendar", "list events failed", { status: list.status, text: list.text.slice(0, 200) });
    return;
  }
  for (const ev of list.body?.items ?? []) {
    if (!ev.id) continue;
    const del = await calJson<unknown>(
      accessToken,
      `/calendars/primary/events/${encodeURIComponent(ev.id)}`,
      { method: "DELETE" }
    );
    if (!del.ok && del.status !== 404) {
      logWarn("GoogleCalendar", "delete event failed", { status: del.status, id: ev.id });
    }
  }
}

async function insertAllDayEvent(
  accessToken: string,
  summary: string,
  description: string,
  startDate: string,
  projectId: string
): Promise<boolean> {
  const endDate = addCalendarDays(startDate, 1);
  const insert = await calJson<{ id?: string }>(
    accessToken,
    "/calendars/primary/events",
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        summary,
        description,
        start: { date: startDate },
        end: { date: endDate },
        extendedProperties: {
          private: { broadcastBuddyTorah: projectId },
        },
      }),
    }
  );
  if (!insert.ok) {
    logWarn("GoogleCalendar", "insert event failed", { status: insert.status, text: insert.text.slice(0, 300) });
    return false;
  }
  return true;
}

/**
 * Creates / replaces two all-day milestones: QA start (target − weeks) and delivery target.
 * No-op safely when `targetDate` is null or `accessToken` is missing.
 */
export async function syncTorahProjectToCalendar(
  accessToken: string | null | undefined,
  input: TorahCalendarSyncPayload
): Promise<{ ok: boolean; skipped?: string }> {
  if (!accessToken?.trim()) {
    logWarn("GoogleCalendar", "syncTorahProjectToCalendar: no access token", {
      projectId: input.projectId,
    });
    return { ok: false, skipped: "no_access_token" };
  }
  if (!input.targetDate) {
    logWarn("GoogleCalendar", "syncTorahProjectToCalendar: no target date", { projectId: input.projectId });
    return { ok: false, skipped: "no_target_date" };
  }

  try {
    await deleteProjectMilestones(accessToken, input.projectId);

    const weeks = Math.max(0, Math.floor(input.qaWeeksBuffer));
    const qaStart = subtractWeeks(input.targetDate, weeks);
    const title = input.title.trim() || "פרויקט ספר תורה";

    const qaOk = await insertAllDayEvent(
      accessToken,
      `התחלת הגהה — ${title}`,
      `יום חישוב לפי ${weeks} שבועות לפני יעד המסירה. מזהה פרויקט: ${input.projectId}`,
      qaStart,
      input.projectId
    );
    const targetOk = await insertAllDayEvent(
      accessToken,
      `יעד מסירה — ${title}`,
      `יעד פרויקט ספר תורה. מזהה: ${input.projectId}`,
      input.targetDate,
      input.projectId
    );

    return { ok: qaOk && targetOk };
  } catch (e) {
    logWarn("GoogleCalendar", "syncTorahProjectToCalendar error", {
      projectId: input.projectId,
      error: String(e),
    });
    return { ok: false, skipped: "exception" };
  }
}

/**
 * Loads Gmail refresh token from `user_settings` and runs calendar sync. Never throws.
 */
export async function runTorahCalendarSync(
  supabase: SupabaseClient,
  userId: string,
  payload: TorahCalendarSyncPayload
): Promise<void> {
  const { data, error } = await supabase
    .from("user_settings")
    .select("gmail_refresh_token")
    .eq("user_id", userId)
    .maybeSingle();

  if (error || !data?.gmail_refresh_token) {
    logWarn("GoogleCalendar", "Torah calendar sync skipped — Gmail not linked", {
      userId,
      projectId: payload.projectId,
    });
    return;
  }

  let accessToken: string;
  try {
    accessToken = await getAccessTokenForUser(supabase, userId, data.gmail_refresh_token);
  } catch (e) {
    logWarn("GoogleCalendar", "Torah calendar sync skipped — token refresh failed", {
      userId,
      projectId: payload.projectId,
      error: String(e),
    });
    return;
  }

  await syncTorahProjectToCalendar(accessToken, payload);
}
