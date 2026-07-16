# Shared contract catalogue

These contracts are the public integration boundary for Sprint 4 and future transport modes. Contract versions are independent of visible module versions. Breaking compatibility requires a major version, migration guidance, contract tests and approval.

| Contract | Version | File |
|---|---:|---|
| Shared mapping | 1.0.0 | `mapping.contract.json` |
| Shared export | 1.0.0 | `export.contract.json` |
| Diagnostics | 1.0.0 | `diagnostics.contract.json` |
| Project context / Project Data Model | 1.0.0 | `project-context.schema.json` |
| Module output | 1.0.0 | `module-output.schema.json` |
| Knowledge Library record | 1.0.0 | `knowledge-record.schema.json` |

JSON files are normative. Examples and browser interfaces must be validated against the same rules in automated tests.
