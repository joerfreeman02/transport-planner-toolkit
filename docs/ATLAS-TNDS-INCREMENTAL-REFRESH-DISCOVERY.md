# ATLAS TNDS Incremental Refresh Discovery

This record is discovery only. BUS-DATA-V2-2A performs a metadata-only TNDS FTP
capability probe and does not transfer, prepare, publish or activate TNDS data.

The future contract must establish, per region, whether directory listing,
size, modification time, checksums or an equivalent immutable version identity
is available. A region is incrementally eligible only when its metadata is
reliable, its prior published source identity is known, and the resulting
candidate can be independently validated. Any ambiguous or unavailable
metadata requires a bounded full-region acquisition decision; it must not be
treated as unchanged by inference.

The probe records capability and per-region metadata only. It never performs an
archive transfer and its output cannot make a candidate production-eligible.
Run #26 remains the retained fresh TNDS evidence for eight regions. It is not
rerun by this diagnostic and Run #24 is not converted into a v2 checkpoint.
