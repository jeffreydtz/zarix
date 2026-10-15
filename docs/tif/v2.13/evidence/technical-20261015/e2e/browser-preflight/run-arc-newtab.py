#!/usr/bin/env python3
"""Explicitly gated Arc new-window preflight; no browser call while preparing this file."""
import datetime
import hashlib
import json
import os
from pathlib import Path
import subprocess
import sys

HERE = Path(__file__).resolve().parent
SCRIPT = HERE / "run-arc-newtab.applescript"
REQUIRED = {
    "ZARIX_ARC_UI_AUTHORIZATION": "human-approved-codex-to-arc",
    "ZARIX_ARC_APP_READY": "isolated-scratch-58321-port3002",
}

def main():
    missing = [key for key, value in REQUIRED.items() if os.environ.get(key) != value]
    if missing:
        print(json.dumps({"status": "NOT_EXECUTED", "reason": "Explicit human permission and isolated app readiness gates required", "missingGateNames": missing}))
        return 2
    # No user-supplied AppleScript/URL interpolation. Fixed local target and exact source.
    started = datetime.datetime.now(datetime.timezone.utc).isoformat()
    try:
        completed = subprocess.run(["/usr/bin/osascript", str(SCRIPT)], text=True, capture_output=True, timeout=45, check=False)
        if completed.returncode == 0:
            try:
                result = json.loads(completed.stdout)
            except (json.JSONDecodeError, TypeError):
                result = {"status": "UNEXPECTED_SCRIPT_OUTPUT", "ownWindowCloseConfirmed": False}
        else:
            # Never publish raw stdout/stderr: they may contain app/system state.
            result = {"status": "SCRIPT_PROCESS_FAILED", "returnCode": completed.returncode, "ownWindowCloseConfirmed": False}
    except subprocess.TimeoutExpired:
        result = {"status": "SCRIPT_TIMEOUT", "ownWindowCloseConfirmed": False, "cleanupStatus": "UNCONFIRMED_DO_NOT_CLOSE_OTHER_WINDOWS"}
    report = {
        "startedAt": started,
        "finishedAt": datetime.datetime.now(datetime.timezone.utc).isoformat(),
        "scope": "Only a newly created Arc incognito window/local login tab and scalar DOM metadata; no login or financial action",
        "scriptSha256": hashlib.sha256(SCRIPT.read_bytes()).hexdigest(),
        "targetOrigin": "http://127.0.0.1:3002",
        "result": result,
    }
    destination = HERE / "arc-newtab-execution.json"
    destination.write_text(json.dumps(report, ensure_ascii=False, indent=2) + "\n")
    print(json.dumps({"report": str(destination), "result": result}, ensure_ascii=False))
    dom = result.get("result", {}).get("dom", {})
    passed = result.get("ownWindowCloseConfirmed") is True and dom.get("status") == "LOCAL_DOM_READ" and dom.get("origin") == "http://127.0.0.1:3002"
    return 0 if passed else 1

if __name__ == "__main__":
    sys.exit(main())
