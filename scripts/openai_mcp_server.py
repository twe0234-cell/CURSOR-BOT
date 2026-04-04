#!/usr/bin/env python3
"""
openai_mcp_server.py — MCP server שמחבר Claude Code ל-OpenAI GPT-4o-mini + Codex CLI
תפקידים:
  GPT-4o-mini: קוד boilerplate, SQL, תרגום, שאלות מהירות
  Codex CLI:   ביצוע קוד אוטונומי בתיקיית הפרויקט
  Git:         בדיקת שינויים לאחר הרצת Codex

הגדרה ב-~/.claude/settings.json:
{
  "mcpServers": {
    "openai": {
      "command": "python3",
      "args": ["/home/user/CURSOR-BOT/scripts/openai_mcp_server.py"],
      "env": { "OPENAI_API_KEY": "sk-..." }
    }
  }
}

כלים זמינים:
  ask_gpt        — שאל GPT-4o-mini שאלה כלשהי
  gpt_code       — בקש קוד ספציפי (מחזיר רק קוד, ללא הסברים)
  gpt_sql        — בקש שאילתת SQL
  gpt_translate  — תרגם טקסט (לעברית/אנגלית)
  codex_execute  — הרץ Codex CLI על משימת קוד (ביצוע אוטונומי בקבצים)
  git_diff       — הצג git diff נוכחי (לאחר codex_execute)
  git_status     — הצג קבצים שהשתנו
"""

import json
import os
import subprocess
import sys
import urllib.request
import urllib.error

CODEX_BIN = "/opt/node22/bin/codex"
DEFAULT_WORKDIR = "/home/user/CURSOR-BOT"

OPENAI_API_KEY = os.environ.get("OPENAI_API_KEY", "")
MODEL = "gpt-4o-mini"
API_URL = "https://api.openai.com/v1/chat/completions"


def call_openai(system: str, user: str, max_tokens: int = 2048) -> str:
    if not OPENAI_API_KEY:
        return "ERROR: OPENAI_API_KEY לא מוגדר. הוסף ב-~/.claude/settings.json תחת env."
    payload = json.dumps({
        "model": MODEL,
        "messages": [
            {"role": "system", "content": system},
            {"role": "user", "content": user},
        ],
        "max_tokens": max_tokens,
        "temperature": 0.2,
    }).encode()
    req = urllib.request.Request(
        API_URL,
        data=payload,
        headers={
            "Content-Type": "application/json",
            "Authorization": f"Bearer {OPENAI_API_KEY}",
        },
    )
    try:
        with urllib.request.urlopen(req, timeout=30) as resp:
            data = json.loads(resp.read())
            return data["choices"][0]["message"]["content"]
    except urllib.error.HTTPError as e:
        body = e.read().decode()
        return f"OpenAI API error {e.code}: {body[:200]}"
    except Exception as e:
        return f"שגיאה: {e}"


# ─── MCP Protocol (stdio JSON-RPC) ───────────────────────────────────────────

TOOLS = [
    {
        "name": "ask_gpt",
        "description": "שאל את GPT-4o-mini שאלה חופשית. מתאים לניתוח, הסברים, רעיונות.",
        "inputSchema": {
            "type": "object",
            "properties": {
                "question": {"type": "string", "description": "השאלה"},
            },
            "required": ["question"],
        },
    },
    {
        "name": "gpt_code",
        "description": "בקש קוד מ-GPT-4o-mini. מחזיר קוד בלבד ללא הסברים.",
        "inputSchema": {
            "type": "object",
            "properties": {
                "task": {"type": "string", "description": "מה לכתוב"},
                "language": {"type": "string", "description": "שפת תכנות (Python/TypeScript/SQL...)"},
            },
            "required": ["task"],
        },
    },
    {
        "name": "gpt_sql",
        "description": "בקש שאילתת SQL. תאר את הצורך ו-GPT יכתוב את ה-query.",
        "inputSchema": {
            "type": "object",
            "properties": {
                "description": {"type": "string", "description": "מה ה-query צריך לעשות"},
                "schema_hint": {"type": "string", "description": "שמות טבלאות רלוונטיות (אופציונלי)"},
            },
            "required": ["description"],
        },
    },
    {
        "name": "gpt_translate",
        "description": "תרגם טקסט בעברית/אנגלית",
        "inputSchema": {
            "type": "object",
            "properties": {
                "text": {"type": "string", "description": "הטקסט לתרגום"},
                "to": {"type": "string", "description": "שפת יעד: he / en", "default": "en"},
            },
            "required": ["text"],
        },
    },
    {
        "name": "codex_execute",
        "description": (
            "הרץ את OpenAI Codex CLI על משימת קוד. "
            "Codex יבצע שינויים בקבצים אוטונומית ללא אישור ידני. "
            "לאחר הרצה — השתמש ב-git_diff כדי לבדוק מה השתנה."
        ),
        "inputSchema": {
            "type": "object",
            "properties": {
                "task": {
                    "type": "string",
                    "description": "תיאור מפורט של המשימה — מה Codex צריך לבנות/לתקן",
                },
                "workdir": {
                    "type": "string",
                    "description": f"תיקיית העבודה (ברירת מחדל: {DEFAULT_WORKDIR})",
                },
            },
            "required": ["task"],
        },
    },
    {
        "name": "git_diff",
        "description": "הצג את git diff הנוכחי — לבדיקת מה Codex שינה. מחזיר את כל השינויים שטרם עלו ל-commit.",
        "inputSchema": {
            "type": "object",
            "properties": {
                "workdir": {
                    "type": "string",
                    "description": f"תיקיית הפרויקט (ברירת מחדל: {DEFAULT_WORKDIR})",
                },
            },
        },
    },
    {
        "name": "git_status",
        "description": "הצג קבצים שהשתנו (git status --short) — תצוגה מהירה של מה Codex גע.",
        "inputSchema": {
            "type": "object",
            "properties": {
                "workdir": {
                    "type": "string",
                    "description": f"תיקיית הפרויקט (ברירת מחדל: {DEFAULT_WORKDIR})",
                },
            },
        },
    },
]


def handle_tool(name: str, args: dict) -> str:
    if name == "ask_gpt":
        return call_openai(
            "You are a helpful assistant. Answer concisely.",
            args.get("question", ""),
        )
    elif name == "gpt_code":
        lang = args.get("language", "")
        lang_hint = f" in {lang}" if lang else ""
        return call_openai(
            f"You are an expert programmer. Output ONLY code{lang_hint}, no explanations, no markdown fences.",
            args.get("task", ""),
        )
    elif name == "gpt_sql":
        schema = args.get("schema_hint", "")
        ctx = f"\nRelevant tables: {schema}" if schema else ""
        return call_openai(
            f"You are a PostgreSQL expert. Output ONLY the SQL query, no explanations.{ctx}",
            args.get("description", ""),
        )
    elif name == "gpt_translate":
        target = args.get("to", "en")
        lang_name = "Hebrew" if target == "he" else "English"
        return call_openai(
            f"Translate the following text to {lang_name}. Output ONLY the translation.",
            args.get("text", ""),
        )

    elif name == "codex_execute":
        task = args.get("task", "")
        workdir = args.get("workdir", DEFAULT_WORKDIR)
        if not task:
            return "ERROR: task שדה חובה."
        if not os.path.isfile(CODEX_BIN):
            return f"ERROR: Codex CLI לא נמצא ב-{CODEX_BIN}. הרץ: npm install -g @openai/codex"
        env = dict(os.environ)
        if OPENAI_API_KEY:
            env["OPENAI_API_KEY"] = OPENAI_API_KEY
        try:
            result = subprocess.run(
                [CODEX_BIN, "--approval-mode", "full-auto", "--quiet", task],
                cwd=workdir,
                capture_output=True,
                text=True,
                timeout=300,
                env=env,
            )
            output = result.stdout.strip()
            err = result.stderr.strip()
            parts = []
            if output:
                parts.append(f"=== Codex output ===\n{output}")
            if err:
                parts.append(f"=== stderr ===\n{err[:500]}")
            if result.returncode != 0:
                parts.append(f"exit code: {result.returncode}")
            return "\n\n".join(parts) if parts else "Codex סיים ללא פלט. השתמש ב-git_diff לבדיקת שינויים."
        except subprocess.TimeoutExpired:
            return "ERROR: Codex timeout (300 שניות). המשימה אולי גדולה מדי — פצל אותה."
        except Exception as e:
            return f"ERROR: {e}"

    elif name == "git_diff":
        workdir = args.get("workdir", DEFAULT_WORKDIR)
        try:
            result = subprocess.run(
                ["git", "diff", "HEAD"],
                cwd=workdir,
                capture_output=True,
                text=True,
                timeout=30,
            )
            diff = result.stdout.strip()
            return diff if diff else "אין שינויים לא-committed."
        except Exception as e:
            return f"ERROR: {e}"

    elif name == "git_status":
        workdir = args.get("workdir", DEFAULT_WORKDIR)
        try:
            result = subprocess.run(
                ["git", "status", "--short"],
                cwd=workdir,
                capture_output=True,
                text=True,
                timeout=15,
            )
            status = result.stdout.strip()
            return status if status else "Working tree clean — אין שינויים."
        except Exception as e:
            return f"ERROR: {e}"

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
                "serverInfo": {"name": "openai-gpt", "version": "1.0.0"},
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
            pass  # no response needed
        else:
            respond(msg_id, error={"code": -32601, "message": f"Method not found: {method}"})


if __name__ == "__main__":
    main()
