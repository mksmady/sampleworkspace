# Setup scripts

Idempotent Node.js (v22+, no dependencies) scripts that build the Maddybaba data model on a local Liferay instance, following `docs/data-model.md`.

Environment:

- `LIFERAY_USER`, `LIFERAY_PASSWORD` (required)
- `LIFERAY_URL` (optional, default `http://localhost:8080`)

| Script | Phase | What it does |
|---|---|---|
| `picklists.js` | 1 | Creates/updates the picklists in `data/picklists.json`, then verifies each one with a GET by ERC. `--verify-only` skips the writes. |

Scripts never delete anything on the instance. Entries found on the instance but missing from the spec are kept and reported.
