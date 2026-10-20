"""Validate the S2C-3 exact preflight or frozen Run #53 compose selector."""

from __future__ import annotations

import os
from pathlib import Path


BRANCH = "refs/heads/codex/atlas-bus-beta-s2c-3-oversized-service-closeout"
PRIMARY = {
    "PRIMARY_RUN": "39217550518",
    "PRIMARY_ID": "12169814614",
    "PRIMARY_DIGEST": "sha256:2d6e925559a90f261d3c4f02490be271356c6fd57c6730a90aa2a1424b194ceb",
}
TNDS = {
    "TNDS_RUN": "39217550518",
    "TNDS_ID": "12171771295",
    "TNDS_DIGEST": "sha256:cd4e3b83a969eab66529ca59cbacb8a3f02ec9fd8e558b8edd7da2044e9ef7a1",
}
OPTIONAL_INPUTS = (
    "RESUME_RUN_ID", "EXPECTED_SNAPSHOT_ID", "SOURCE_RUN_ID", "EXPECTED_SOURCE_COUNT",
    "EXPECTED_TOTAL_BYTES", "CANDIDATE_RUN", "CANDIDATE_ID", "CANDIDATE_DIGEST",
)


def resolve(values: dict[str, str]) -> tuple[str, str]:
    if values.get("EVENT_NAME") != "workflow_dispatch" or values.get("GITHUB_REF") != BRANCH:
        raise ValueError("S2C-3 accepts workflow_dispatch on its exact feature branch only.")
    offline = (
        values.get("CANDIDATE_MODE") == "disabled"
        and values.get("PREPARED_SCHEMA") == "v2"
        and values.get("MEASURE_ONLY") == "true"
        and values.get("FORCE_REFRESH") == "true"
        and values.get("EXPECTED_SNAPSHOT_ID") == "TNDS-TRUST-PREFLIGHT-C1B"
        and all(not values.get(key, "") for key in OPTIONAL_INPUTS if key != "EXPECTED_SNAPSHOT_ID")
        and all(not values.get(key, "") for key in (*PRIMARY, *TNDS))
    )
    if offline:
        return "offline_preflight", ""
    compose = (
        values.get("CANDIDATE_MODE") == "compose"
        and values.get("PREPARED_SCHEMA") == "v1"
        and values.get("MEASURE_ONLY") == "false"
        and values.get("FORCE_REFRESH") == "false"
        and all(not values.get(key, "") for key in OPTIONAL_INPUTS)
        and all(values.get(key) == expected for key, expected in PRIMARY.items())
        and all(values.get(key) == expected for key, expected in TNDS.items())
    )
    if compose:
        return "review_candidate", "compose"
    raise ValueError("S2C-3 accepts only the exact zero-download offline preflight or the pinned Run #53 compose; fresh acquisition and restore_candidate are disabled.")


def main() -> int:
    keys = (
        "EVENT_NAME", "GITHUB_REF", "PREPARED_SCHEMA", "MEASURE_ONLY", "FORCE_REFRESH",
        "CANDIDATE_MODE", *OPTIONAL_INPUTS, *PRIMARY, *TNDS,
    )
    values = {key: os.environ.get(key, "") for key in keys}
    try:
        trust_mode, candidate_mode = resolve(values)
    except ValueError as error:
        print(f"::error::{error}")
        return 1
    with Path(os.environ["GITHUB_OUTPUT"]).open("a", encoding="utf-8") as output:
        output.write(f"trust_mode={trust_mode}\n")
        output.write("prior_producer_run_id=\n")
        output.write(f"review_candidate_mode={candidate_mode}\n")
    print(f"S2C-3 selector accepted: {trust_mode} {candidate_mode}".strip())
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
