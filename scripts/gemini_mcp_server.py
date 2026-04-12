#!/usr/bin/env python3
"""
gemini_mcp_server.py — MCP server שמחבר Claude Code ל-Google Gemini 1.5 Pro
תפקידים: סיעור מוחות במקביל, ביקורת קוד שנייה, קריאת הקשר גדול (1M tokens).

הגדרה ב-~/.claude/settings.json:
{
  "mcpServers": {
    "gemini": {
      "command": "python3",
      "args": ["/home/user/CURSOR-BOT/scripts/gemini_mcp_server.py"],
      "env": { "GEMINI_API_KEY": "AIza..." }
    }
  }
}

כלים זמינים:
  gemini_brainstorm  — שאל Gemini על פתרונות אפשריים לבעיה (2-3 גישות)
  gemini_review      — ביקורת קוד/diff: bugs, security, performance
  gemini_read_context — ניתוח קובץ ארוך / הקשר גדול (עד 1M טוקנים)
  gemini_ask         — שאלה חופשית
"""

import json
import os
import sys
import urllib.request
import urllib.error

GEMINI_API_KEY = os.environ.get("GEMINI_API_KEY", "")
MODEL = "gemini-1.5-pro"
API_URL = f"https://generativelanguage.googleapis.com/v1beta/models/{MODEL}:generateContent"


def call_gemini(system: str, user: str, max_tokens: int = 4096) -> str:
    if not GEMINI_API_KEY:
        return "ERROR: GEMINI_API_KEY לא מוגדר. הוסף ב-~/.claude/settings.json תחת env."
    payload = json.dumps({
        "system_instruction": {"parts": [{"text": system}]},
        "contents": [{"role": "user", "parts": [{"text": user}]}],
        "generationConfig": {
            "maxOutputTokens": max_tokens,
            "temperature": 0.3,
        },
    }).encode()
    url = f"{API_URL}?key={GEMINI_API_KEY}"
    req = urllib.request.Request(
        url,
        data=payload,
        headers={"Content-Type": "application/json"},
    )
    try:
        with urllib.request.urlopen(req, timeout=60) as resp:
            data = json.loads(resp.read())
            return data["candidates"][0]["content"]["parts"][0]["text"]
    except urllib.error.HTTPError as e:
        body = e.read().decode()
        return f"Gemini API error {e.code}: {body[:300]}"
    except Exception as e:
        return f"שגיאה: {e}"


# ─── MCP Protocol (stdio JSON-RPC) ───────────────────────────────────────────

TOOLS = [
    {
        "name": "gemini_brainstorm",
        "description": (
            "שאל את Gemini 1.5 Pro על גישות פתרון לבעיה. "
            "מחזיר 2-3 גישות שונות עם יתרונות וחסרונות — לסיעור מוחות לפני הטמעה."
        ),
        "inputSchema": {
            "type": "object",
            "properties": {
                "problem": {"type": "string", "description": "תיאור הבעיה או המשימה"},
                "context": {"type": "string", "description": "הקשר טכני (stack, מגבלות, קוד קיים) — אופציונלי"},
            },
            "required": ["problem"],
        },
    },
    {
        "name": "gemini_review",
        "description": (
            "ביקורת קוד או git diff על-ידי Gemini 1.5 Pro. "
            "מחפש: באגים, בעיות אבטחה, ביצועים, TypeScript strict violations."
        ),
        "inputSchema": {
            "type": "object",
            "properties": {
                "code_or_diff": {"type": "string", "description": "הקוד או ה-diff לסקירה"},
                "focus": {
                    "type": "string",
                    "description": "bugs | security | performance | all (ברירת מחדל: all)",
                    "default": "all",
                },
            },
            "required": ["code_or_diff"],
        },
    },
    {
        "name": "gemini_read_context",
        "description": (
            "שלח קובץ/קבצים ארוכים ל-Gemini 1.5 Pro לניתוח. "
            "מתאים כשהקובץ גדול מדי ל-Claude (עד 1M טוקנים). "
            "Gemini יסכם, יזהה דפוסים, ויענה על שאלות."
        ),
        "inputSchema": {
            "type": "object",
            "properties": {
                "content": {"type": "string", "description": "תוכן הקובץ/ים"},
                "question": {"type": "string", "description": "מה לנתח או מה לחפש בתוכן"},
            },
            "required": ["content", "question"],
        },
    },
    {
        "name": "gemini_ask",
        "description": "שאל את Gemini 1.5 Pro שאלה חופשית. מתאים לניתוח, הסברים, רעיונות.",
        "inputSchema": {
            "type": "object",
            "properties": {
                "question": {"type": "string", "description": "השאלה"},
            },
            "required": ["question"],
        },
    },
    {
        "name": "gemini_search",
        "description": (
            "חיפוש Google אמיתי דרך Gemini Grounding. "
            "שאל שאלה ו-Gemini יחפש ב-Google ויחזיר תשובה מבוססת מקורות עדכניים. "
            "מתאים ל: מחירי שוק, חדשות, ספריות חדשות, בדיקת נתונים."
        ),
        "inputSchema": {
            "type": "object",
            "properties": {
                "query": {"type": "string", "description": "מה לחפש"},
            },
            "required": ["query"],
        },
    },
    {
        "name": "gemini_design_review",
        "description": (
            "ניתוח עיצוב UI/UX דרך Gemini. "
            "תאר רכיב, עמוד, או בעיית עיצוב — Gemini יחזיר המלצות Tailwind, UX, accessibility, RTL. "
            "מתאים ל: בחירת צבעים, layout, hierarchy, shadcn components."
        ),
        "inputSchema": {
            "type": "object",
            "properties": {
                "description": {"type": "string", "description": "תיאור הרכיב/עמוד לעיצוב"},
                "constraints": {"type": "string", "description": "מגבלות: RTL, עברית, Tailwind v4, shadcn — אופציונלי"},
            },
            "required": ["description"],
        },
    },
]


def handle_tool(name: str, args: dict) -> str:
    if name == "gemini_brainstorm":
        problem = args.get("problem", "")
        context = args.get("context", "")
        ctx_section = f"\n\nהקשר טכני:\n{context}" if context else ""
        return call_gemini(
            (
                "You are a senior software architect. "
                "When given a problem, respond with exactly 2-3 distinct solution approaches. "
                "For each approach: name it, describe it in 2-3 sentences, then list pros and cons. "
                "Be concrete and technical. Respond in the same language as the question."
            ),
            f"הבעיה: {problem}{ctx_section}",
            max_tokens=2048,
        )

    elif name == "gemini_review":
        code = args.get("code_or_diff", "")
        focus = args.get("focus", "all")
        focus_map = {
            "bugs": "Focus ONLY on potential bugs and logic errors.",
            "security": "Focus ONLY on security vulnerabilities (injection, auth, exposure of secrets).",
            "performance": "Focus ONLY on performance issues (N+1, unnecessary re-renders, blocking calls).",
            "all": "Review for bugs, security issues, and performance problems.",
        }
        focus_instruction = focus_map.get(focus, focus_map["all"])
        return call_gemini(
            (
                f"You are an expert code reviewer for a Next.js 16 + TypeScript + Supabase project. "
                f"{focus_instruction} "
                "Be specific: cite line numbers or code snippets when possible. "
                "If nothing is wrong, say so clearly. "
                "Respond in Hebrew if the code has Hebrew comments, otherwise English."
            ),
            f"Review this code/diff:\n\n{code}",
            max_tokens=3000,
        )

    elif name == "gemini_read_context":
        content = args.get("content", "")
        question = args.get("question", "")
        return call_gemini(
            (
                "You are analyzing a large codebase file or set of files. "
                "Answer the user's question based on the provided content. "
                "Be thorough but concise. Respond in the same language as the question."
            ),
            f"תוכן:\n{content}\n\nשאלה: {question}",
            max_tokens=4096,
        )

    elif name == "gemini_ask":
        return call_gemini(
            "You are a helpful senior developer assistant. Answer concisely and technically. "
            "Respond in the same language as the question.",
            args.get("question", ""),
        )

    elif name == "gemini_search":
        query = args.get("query", "")
        # Gemini with Google Search grounding
        payload = json.dumps({
            "system_instruction": {"parts": [{"text": "You are a research assistant. Search and provide accurate, up-to-date information with sources. Respond in the same language as the query."}]},
            "contents": [{"role": "user", "parts": [{"text": query}]}],
            "tools": [{"google_search": {}}],
            "generationConfig": {"maxOutputTokens": 2048, "temperature": 0.1},
        }).encode()
        url = f"{API_URL}?key={GEMINI_API_KEY}"
        req = urllib.request.Request(url, data=payload, headers={"Content-Type": "application/json"})
        try:
            with urllib.request.urlopen(req, timeout=30) as resp:
                data = json.loads(resp.read())
                return data["candidates"][0]["content"]["parts"][0]["text"]
        except urllib.error.HTTPError as e:
            body = e.read().decode()
            # Fallback without grounding if not supported on this key tier
            if "400" in str(e.code) or "404" in str(e.code):
                return call_gemini(
                    "Answer based on your knowledge. Note any uncertainty about recency.",
                    query,
                )
            return f"Gemini Search error {e.code}: {body[:200]}"
        except Exception as e:
            return f"שגיאה: {e}"

    elif name == "gemini_design_review":
        description = args.get("description", "")
        constraints = args.get("constraints", "RTL Hebrew UI, Tailwind v4, shadcn/ui, Next.js App Router")
        return call_gemini(
            (
                "You are a senior UI/UX designer and frontend engineer. "
                "Given a UI component or page description, provide: "
                "1. Layout recommendation (Flexbox/Grid, RTL considerations) "
                "2. Color palette suggestion (Tailwind classes) "
                "3. Typography hierarchy "
                "4. Specific shadcn/ui components to use "
                "5. Accessibility notes (WCAG, Hebrew screen readers) "
                "Be specific with Tailwind class names. Respond in Hebrew."
            ),
            f"עיצוב: {description}\nמגבלות: {constraints}",
            max_tokens=2048,
        )

    return f"כלי לא מוכר: {name}"


def respond(msg_id, result=None, error=None):
    resp = {"jsonrpc": "2.0", "id": msg_id}
    if error:
        resp["error"] = error
    else:
        resp["result"] = result
    sys.stdout.write(json.dumps(resp) + "\n")
    sys.stdout.flush()


def main():
    for line in sys.stdin:
        line = line.strip()
        if not line:
            continue
        try:
            msg = json.loads(line)
        except json.JSONDecodeError:
            continue

        msg_id = msg.get("id")
        method = msg.get("method", "")
        params = msg.get("params", {})

        if method == "initialize":
            respond(msg_id, {
                "protocolVersion": "2024-11-05",
                "capabilities": {"tools": {}},
                "serverInfo": {"name": "gemini-pro", "version": "1.0.0"},
            })
        elif method == "tools/list":
            respond(msg_id, {"tools": TOOLS})
        elif method == "tools/call":
            tool_name = params.get("name", "")
            tool_args = params.get("arguments", {})
            result_text = handle_tool(tool_name, tool_args)
            respond(msg_id, {
                "content": [{"type": "text", "text": result_text}]
            })
        elif method == "notifications/initialized":
            pass
        else:
            respond(msg_id, error={"code": -32601, "message": f"Method not found: {method}"})


if __name__ == "__main__":
    main()
