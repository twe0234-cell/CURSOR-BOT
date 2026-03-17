/**
 * Observability logger - async, non-blocking inserts into sys_logs.
 * Logging never crashes the app (wrapped in try/catch).
 */

import { createAdminClient } from "@/src/lib/supabase/admin";

type LogLevel = "INFO" | "WARN" | "ERROR";

async function log(level: LogLevel, module: string, message: string, metadata?: Record<string, unknown>): Promise<void> {
  try {
    const supabase = createAdminClient();
    if (!supabase) return;

    await supabase.from("sys_logs").insert({
      level,
      module,
      message,
      metadata: metadata ?? {},
    });
  } catch {
    // Logging must never crash the application
  }
}

/** Fire-and-forget: do not await, does not block main execution */
export function logInfo(module: string, message: string, metadata?: Record<string, unknown>): void {
  void log("INFO", module, message, metadata);
}

export function logWarn(module: string, message: string, metadata?: Record<string, unknown>): void {
  void log("WARN", module, message, metadata);
}

export function logError(module: string, message: string, metadata?: Record<string, unknown>): void {
  void log("ERROR", module, message, metadata);
}
