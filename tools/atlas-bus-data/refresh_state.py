"""Truthful monotonic state transitions for diagnostic refreshes."""
from __future__ import annotations

import json
from datetime import datetime, timezone
from pathlib import Path

STATES = ("generated", "sanity_checked", "structurally_validated", "diagnostic_complete", "publication_eligible", "published")


def transition(site: Path, target: str, evidence: dict | None = None) -> dict:
    if target not in STATES:
        raise ValueError(f"unknown refresh state: {target}")
    path = site / "atlas" / "data" / "status" / "manifest.json"
    status = json.loads(path.read_text(encoding="utf-8"))
    current = status.get("status")
    if current in STATES and STATES.index(target) < STATES.index(current):
        raise ValueError(f"refresh state cannot move backwards from {current} to {target}")
    status["status"] = target
    status["stateHistory"] = [*status.get("stateHistory", []), {"state": target, "at": datetime.now(timezone.utc).replace(microsecond=0).isoformat().replace("+00:00", "Z")}]
    if evidence:
        status["stateEvidence"] = {**status.get("stateEvidence", {}), target: evidence}
    if target not in {"validated", "published", "publication_eligible"}:
        status.pop("successfulRefreshAt", None)
    path.write_text(json.dumps(status, indent=2) + "\n", encoding="utf-8")
    return status
