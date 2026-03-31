#!/usr/bin/env python3
"""
dev.py — CURSOR-BOT development helper
Speeds up common workflows, saves tokens by automating repetitive tasks.

Usage:
  python dev.py check          # ESLint + TypeScript check
  python dev.py push "msg"     # lint → commit → push (feature branch)
  python dev.py tokens FILE    # count old color tokens in a file or dir
  python dev.py fix-colors DIR # report all hardcoded slate/sky colors
  python dev.py status         # Vercel deployment status (latest)
"""

import subprocess, sys, os, re, json
from pathlib import Path

ROOT = Path(__file__).parent
BRANCH = "claude/upgrade-to-alpha-1-QNL0O"

OLD_COLORS = re.compile(
    r'(bg|text|border|ring|from|to|via)-(slate|sky|zinc|gray|neutral|stone|red|amber|yellow|lime|green|teal|cyan|indigo|violet|purple|fuchsia|pink|rose)-\d{2,3}'
)
TOKEN_WHITELIST = {"text-red-600", "text-amber-700", "text-emerald-600", "text-red-500"}


def run(cmd: list[str], cwd=ROOT, check=True, capture=False) -> subprocess.CompletedProcess:
    kwargs = {"cwd": cwd, "text": True}
    if capture:
        kwargs["stdout"] = subprocess.PIPE
        kwargs["stderr"] = subprocess.PIPE
    return subprocess.run(cmd, **kwargs, check=check)


def cmd_check():
    """Run ESLint + tsc --noEmit"""
    print("▶ ESLint …")
    result = run(["npx", "next", "lint", "--max-warnings=0"], check=False)
    if result.returncode != 0:
        print("✗ ESLint errors found. Fix before committing.")
        sys.exit(1)
    print("▶ TypeScript …")
    result = run(["npx", "tsc", "--noEmit", "--pretty"], check=False)
    if result.returncode != 0:
        print("✗ TypeScript errors found.")
        sys.exit(1)
    print("✓ All checks passed")


def cmd_push(message: str):
    """lint → add → commit → push"""
    cmd_check()
    print("▶ Staging …")
    run(["git", "add", "-A"])
    print(f"▶ Committing: {message}")
    run(["git", "commit", "-m", message])
    print(f"▶ Pushing to {BRANCH} …")
    for attempt in range(4):
        result = run(["git", "push", "-u", "origin", BRANCH], check=False)
        if result.returncode == 0:
            print("✓ Pushed")
            return
        wait = 2 ** (attempt + 1)
        print(f"  push failed, retry in {wait}s …")
        import time; time.sleep(wait)
    print("✗ Push failed after 4 retries")
    sys.exit(1)


def cmd_tokens(target: str):
    """Find hardcoded Tailwind color tokens (old palette) in file or dir"""
    path = Path(target)
    files = list(path.rglob("*.tsx")) + list(path.rglob("*.ts")) if path.is_dir() else [path]
    total = 0
    for f in files:
        content = f.read_text(errors="replace")
        matches = OLD_COLORS.findall(content)
        # rebuild full token and exclude whitelist
        lines = content.splitlines()
        hits = []
        for i, line in enumerate(lines, 1):
            found = OLD_COLORS.findall(line)
            for prefix, color in found:
                token = f"{prefix}-{color}-"
                # get the full token with number
                m = re.search(rf'{prefix}-{color}-(\d+)', line)
                if m:
                    full = f"{prefix}-{color}-{m.group(1)}"
                    if full not in TOKEN_WHITELIST:
                        hits.append((i, full, line.strip()))
        if hits:
            print(f"\n{f.relative_to(ROOT)}")
            for lineno, token, line in hits[:20]:
                print(f"  {lineno:4d}: {token:30s} | {line[:80]}")
            total += len(hits)
    print(f"\n{'─'*60}")
    print(f"Total hits: {total}")


def cmd_fix_colors(directory: str):
    """Same as tokens but outputs a summary grouped by file"""
    cmd_tokens(directory)


def cmd_status():
    """Show git log of recent commits on this branch"""
    result = run(
        ["git", "log", "--oneline", "-10", f"origin/{BRANCH}"],
        check=False, capture=True
    )
    if result.returncode == 0:
        print(result.stdout)
    else:
        result2 = run(["git", "log", "--oneline", "-10"], capture=True)
        print(result2.stdout)


COMMANDS = {
    "check": (cmd_check, 0),
    "push": (cmd_push, 1),
    "tokens": (cmd_tokens, 1),
    "fix-colors": (cmd_fix_colors, 1),
    "status": (cmd_status, 0),
}

if __name__ == "__main__":
    args = sys.argv[1:]
    if not args or args[0] not in COMMANDS:
        print(__doc__)
        sys.exit(0)
    cmd_name = args[0]
    fn, nargs = COMMANDS[cmd_name]
    if len(args) - 1 < nargs:
        print(f"Usage: python dev.py {cmd_name} {'<arg>' * nargs}")
        sys.exit(1)
    fn(*args[1:1+nargs])
