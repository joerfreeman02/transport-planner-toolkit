# BUS-1 Alpha.6 engineering candidate

Status: **Core engineering checkpoint; Product Owner acceptance pending**

Version: `2.0.0-alpha.6`  
Build: `ATLAS-2.0.0-alpha.6-20260904`

Alpha.6 adds a deterministic TransXChange 2.5 parser, supplementary TNDS source fingerprinting, nearest-served stop-group selection, and consecutive day-range presentation. BODS remains primary; TNDS is supplementary and never duplicates an equivalent BODS pattern.

The maintenance updater prompts for credentials at runtime and does not persist passwords. Raw regional archives remain local and ignored; promotion/rollback must occur only after staged validation. England scope is EA, EM, NE, NW, SE, SW, WM and Y; London remains TfL-primary.

The Alpha.6 core checkpoint has passed deterministic and prepared-data integrity tests. Real supplied TNDS-SE route 231 parsing has been verified. Product Owner manual review, wider live controls, and browser QA remain pending.
