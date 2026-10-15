#!/usr/bin/env python3
"""Prepared only. Existing unknown-window cleanup must be confirmed before new make."""
import ast
import datetime
import hashlib
import json
import os
import re
from pathlib import Path
import subprocess
import sys
import uuid

HERE = Path(__file__).resolve().parent
SCRIPT = HERE / "run-arc-little-tab.applescript"
GATES = {
    "ZARIX_ARC_UI_AUTHORIZATION": "human-approved-codex-to-arc",
    "ZARIX_ARC_APP_READY": "isolated-scratch-58321-port3002",
    "ZARIX_ARC_PREVIOUS_WINDOW_CLEANUP": "confirmed-by-human-parent",
    "ZARIX_ARC_LITTLE_TAB_WINDOW": "explicit-parent-release",
}

def main():
    absent = [name for name, value in GATES.items() if os.environ.get(name) != value]
    if absent:
        print(json.dumps({"status": "NOT_EXECUTED", "missingGateNames": absent}))
        return 2
    work = Path("/tmp/zarix-runtime-20261015") / ("arc-little-tab-" + str(uuid.uuid4()))
    work.mkdir(mode=0o700)
    checkpoint = work / "checkpoint.json"
    checkpoint.write_text('{"status":"PREPARED_BEFORE_MAKE"}\n')
    checkpoint.chmod(0o600)
    started = datetime.datetime.now(datetime.timezone.utc).isoformat()
    raw_descriptor = work / "returned-descriptor.stderr.private"
    raw_descriptor.touch(mode=0o600)
    try:
        with raw_descriptor.open("w") as raw:
            p = subprocess.run(["/usr/bin/osascript", "-ss", str(SCRIPT), str(checkpoint)], stdout=subprocess.PIPE, stderr=raw, text=True, timeout=45, check=False)
        result = json.loads(checkpoint.read_text())
        process_status = p.returncode
    except subprocess.TimeoutExpired:
        result = json.loads(checkpoint.read_text())
        process_status = "TIMEOUT_CLEANUP_UNCONFIRMED"
    except (json.JSONDecodeError, OSError):
        result = {"status": "CHECKPOINT_UNAVAILABLE_CLEANUP_UNCONFIRMED"}
        process_status = "UNKNOWN"
    # This is only the return descriptor of our make command, never an enumerated tab/window.
    # Keep the raw source-form text private; publish only literal typed UUIDs after its marker.
    raw_text = raw_descriptor.read_text(errors="replace")
    tail = raw_text.split("ZARIX_OWN_RETURNED_DESCRIPTOR", 1)[-1] if "ZARIX_OWN_RETURNED_DESCRIPTOR" in raw_text else ""
    uuid_pattern = r"[0-9A-Fa-f]{8}-[0-9A-Fa-f]{4}-[0-9A-Fa-f]{4}-[0-9A-Fa-f]{4}-[0-9A-Fa-f]{12}"
    returned_ids = [{"kind": kind, "id": value} for kind, value in re.findall(r'\b(tab|window)\s+id\s+"(' + uuid_pattern + r')"', tail)]
    report = {"returnedDescriptorIds": returned_ids, "rawDescriptorPersistedPrivately": True, "startedAt": started, "finishedAt": datetime.datetime.now(datetime.timezone.utc).isoformat(), "scope": "Only new application-level Little Arc tab at fixed local login; own UUID checkpoint, scalar DOM and own close. No login/financial action or personal-tab read", "scriptSha256": hashlib.sha256(SCRIPT.read_bytes()).hexdigest(), "processStatus": process_status, "result": result, "physicalWindowAbsenceClaimed": False}
    (HERE / "arc-little-tab-execution.json").write_text(json.dumps(report, ensure_ascii=False, indent=2) + "\n")
    print(json.dumps({"status": process_status, "result": result}, ensure_ascii=False))
    dom = result.get("result", {}).get("dom", {})
    return 0 if process_status == 0 and result.get("ownTabCloseAcknowledged") is True and result.get("ownTabNoLongerResolvableAfterClose") is True and dom.get("status") == "LOCAL_DOM_READ" else 1

if __name__ == "__main__":
    sys.exit(main())
