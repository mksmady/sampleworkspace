# Setup scripts

Idempotent Node.js (v22+, no dependencies) scripts that build the Maddybaba data model on a local Liferay instance, following `docs/data-model.md`.

Environment:

- `LIFERAY_USER`, `LIFERAY_PASSWORD` (required)
- `LIFERAY_URL` (optional, default `http://localhost:8080`)

| Script | Phase | What it does |
|---|---|---|
| `picklists.js` | 1 | Creates/updates the picklists in `data/picklists.json`, then verifies each one with a GET by ERC. `--verify-only` skips the writes. |
| `objects.js` | 2 | Creates the object definitions and plain fields in `data/objects.json` as drafts, verifies them with a GET, and with `--publish` publishes those that match the spec. Fields are only changed while a definition is a draft. `--verify-only` skips the writes. |
| `relationships.js` | 3, 5 | Creates the one-to-many relationships in `data/relationships.json` on the parent object, then verifies each one and the `r_<name>_…Id` field it adds to the child. Only the label and deletion type are ever updated. `--verify-only` skips the writes. |
| `objects.js` | 4, 5 | Rerun to add the Aggregation, Formula, AutoIncrement and stored computed fields (new fields are added to published objects too) and to enable account restriction. |
| `validations.js` | 4, 5 | Creates the expression validation rules in `data/validations.json` by ERC (`MB_<Object>_<name>`) and verifies each one. Rules with a `field` show their error on it, the others on the form. Rules the engine can't enforce stay inactive (see their `note`). `--verify-only` skips the writes. |
| `roles.js` | 5 | Creates the MB roles (Traveler, Ops Admin, Host and Super Host account roles) and sets their object permissions from `data/roles.json`, plus Guest's MB permissions. Other permissions are left as they are. `--verify-only` skips the writes. |
| `workflows.js` | 5 | Deploys "MB Ops Approval" (`data/mb-ops-approval.xml`) only when it differs from the live version, links it to Host and Listing, and verifies both. |
| `test-users.js` | 5 | **Local instance only.** Creates the test traveler, two hosts (each in their own account, with the Host account role) and ops admin. Sets fresh random passwords on every run and prints them to the terminal only. |
| `seed.js` | 6 | **Local instance only.** Loads the seed data in `data/seed/` (destinations, partner, hosts, listings, slots, a traveler with a confirmed booking, public holidays), approves seeded Hosts and Listings as the ops test user, and verifies values, aggregations and what each test user can see. Needs `test-users.js` first. Resets the test users' passwords (rerun `test-users.js` to see new ones). `--verify-only` skips the writes. |

Run them in the order above. Scripts never delete picklists, objects, fields, relationships, roles or data on the instance; things found on the instance but missing from the spec are kept and reported. The one exception is permissions: `roles.js` revokes actions on MB object resources that `data/roles.json` no longer grants.
