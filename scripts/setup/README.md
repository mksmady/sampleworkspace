# Setup scripts

Idempotent Node.js (v22+, no dependencies) scripts that build the Maddybaba data model on a local Liferay instance, following `docs/data-model.md`.

Environment:

- `LIFERAY_USER`, `LIFERAY_PASSWORD` (required)
- `LIFERAY_URL` (optional, default `http://localhost:8080`)

| Script | Phase | What it does |
|---|---|---|
| `picklists.js` | 1 | Creates/updates the picklists in `data/picklists.json`, then verifies each one with a GET by ERC. `--verify-only` skips the writes. |
| `objects.js` | 2 | Creates the object definitions and plain fields in `data/objects.json` as drafts, verifies them with a GET, and with `--publish` publishes those that match the spec. Fields are only changed while a definition is a draft. `--verify-only` skips the writes. |
| `relationships.js` | 3 | Creates the one-to-many relationships in `data/relationships.json` on the parent object, then verifies each one and the `r_<name>_…Id` field it adds to the child. Only the label and deletion type are ever updated. `--verify-only` skips the writes. |
| `objects.js` | 4 | Rerun after phase 3 to add the Aggregation, Formula, AutoIncrement and stored computed fields (new fields are added to published objects too). |
| `validations.js` | 4 | Creates the expression validation rules in `data/validations.json` by ERC (`MB_<Object>_<name>`) and verifies each one. Each rule shows its error on the field it checks. Rules the engine can't enforce stay inactive (see their `note`). `--verify-only` skips the writes. |

Scripts never delete anything on the instance. Entries found on the instance but missing from the spec are kept and reported.
