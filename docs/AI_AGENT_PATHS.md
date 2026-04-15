# נתיבי סוכני AI — איפה מה נמצא

מסמך עזר: **ההנחיות המחייבות תמיד בשורש המאגר** (`AGENTS.md`, `CLAUDE.md`, `ENGINEERING_QA_PROTOCOL.md`). השאר הוא הפניות ומטמון IDE בלבד.

## במאגר `broadcast-buddy`

| קובץ / תיקייה | מטרה |
|---------------|--------|
| `CLAUDE.md` | מקור אמת ל-Claude Code + MCP |
| `AGENTS.md` | כללי Cursor + Codex |
| `ENGINEERING_QA_PROTOCOL.md` | QA ובטיחות פיננסית |
| `CODEX.md` | מצביע ל-Codex |
| `ANTIGRAVITY.md` | מצביע ל-Antigravity |
| `.codex/README.md` | הסבר ל-Codex תחת תיקיית `.codex/` |
| `.cursor/rules/engineering-qa-protocol.mdc` | כלל Cursor (alwaysApply) |
| `.cursorrules` | כללי Cursor נוספים |

## מחוץ למאגר (Windows, משתמש נוכחי לדוגמה)

| כלי | נתיב טיפוסי | הערה |
|-----|-------------|------|
| **Codex (גלובלי)** | `C:\Users\<user>\.codex\config.toml` | פלאגינים, sandbox; לא להחליף את מסמכי השורש |
| **Antigravity** | `C:\Users\<user>\AppData\Roaming\Antigravity\` | מטמון, הגדרות UI — **לא** מחליף הנחיות פרויקט |

עדכון נתיבי משתמש: להחליף `<user>` או להשתמש ב־`%APPDATA%`.
