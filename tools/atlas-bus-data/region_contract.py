"""Canonical primary/TNDS reconciliation region contract."""
from __future__ import annotations

PRIMARY_SOURCE_REGIONS = {
    "east_anglia": "EA",
    "east_midlands": "EM",
    "north_east": "NE",
    "north_west": "NW",
    "south_east": "SE",
    "south_west": "SW",
    "west_midlands": "WM",
    "yorkshire": "Y",
    "london": "LONDON",
}
CANONICAL_REGIONS = frozenset((*PRIMARY_SOURCE_REGIONS.values(),))


def normalize_primary_region(value: object) -> str:
    """Map exact BODS prepared-manifest labels, accepting canonical codes too."""
    raw = str(value or "").strip()
    key = raw.casefold()
    if key in PRIMARY_SOURCE_REGIONS:
        return PRIMARY_SOURCE_REGIONS[key]
    upper = raw.upper()
    if upper in CANONICAL_REGIONS:
        return upper
    raise ValueError(f"Unexpected primary prepared region {raw!r}; projection contract requires a known BODS region")


def normalize_tnds_region(value: object) -> str:
    raw = str(value or "").strip().upper()
    if raw in CANONICAL_REGIONS:
        return raw
    raise ValueError(f"Unexpected TNDS comparator region {raw!r}")
