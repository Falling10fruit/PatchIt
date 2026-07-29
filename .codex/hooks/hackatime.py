#!/usr/bin/env python3

import json
import re
import subprocess
import sys
from pathlib import Path


PROJECT_ROOT = Path("/home/yapheth/Documents/PatchIt").resolve()
HEARTBEAT = PROJECT_ROOT / ".hackatime" / "heartbeat"
PROJECT_MARKER = PROJECT_ROOT / ".wakatime-project"


def patched_entity(event: dict) -> Path:
    if event.get("tool_name") != "apply_patch":
        return PROJECT_MARKER

    command = event.get("tool_input", {}).get("command", "")
    match = re.search(r"^\*\*\* (?:Add|Update) File: (.+)$", command, re.MULTILINE)
    if not match:
        return PROJECT_MARKER

    candidate = Path(match.group(1).strip())
    if not candidate.is_absolute():
        candidate = Path(event.get("cwd", PROJECT_ROOT)) / candidate

    try:
        resolved = candidate.resolve()
        resolved.relative_to(PROJECT_ROOT)
    except (OSError, ValueError):
        return PROJECT_MARKER

    return resolved if resolved.exists() else PROJECT_MARKER


def main() -> int:
    try:
        event = json.load(sys.stdin)
        entity = patched_entity(event)
        command = [str(HEARTBEAT), str(entity)]
        if event.get("hook_event_name") == "PostToolUse":
            command.append("--write")
        subprocess.run(
            command,
            check=False,
            stdout=subprocess.DEVNULL,
            stderr=subprocess.DEVNULL,
            timeout=4,
        )
    except (json.JSONDecodeError, OSError, subprocess.SubprocessError):
        # Time tracking must never interrupt coding work.
        pass

    return 0


if __name__ == "__main__":
    raise SystemExit(main())
