#!/usr/bin/env python3
"""
openai_mcp_server.py — MCP server שמחבר Claude Code ל-OpenAI GPT-4o-mini
כעובד זול למשימות boilerplate: קוד, טקסט, SQL.

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
"""

import json
import os
import sys
import urllib.request
import urllib.error

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
