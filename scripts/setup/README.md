# Setup scripts

Idempotent Node.js (v22+, no dependencies) scripts that build the Maddybaba data model on a local Liferay instance, following `docs/data-model.md`.

Environment:

- `LIFERAY_USER`, `LIFERAY_PASSWORD` (required)
- `LIFERAY_URL` (optional, default `http://localhost:8080`)
- `LIFERAY_BEARER_TOKEN` (optional): an OAuth2 access token to use instead of basic auth, e.g. to run the `--verify-only` checks on another instance as a client extension's app

| Script | Phase | What it does |
|---|---|---|
| `picklists.js` | 1 | Creates/updates the picklists in `data/picklists.json`, then verifies each one with a GET by ERC. `--verify-only` skips the writes. |
| `objects.js --plain` | 2 | Creates the object definitions and plain fields in `data/objects.json` as drafts (`--plain` leaves out the Aggregation, Formula and AutoIncrement fields and account restriction, which need relationships), verifies them with a GET, and with `--publish` publishes those that match the spec. Fields are only changed while a definition is a draft. `--verify-only` skips the writes. |
| `relationships.js` | 3, 5 | Creates the one-to-many relationships in `data/relationships.json` on the parent object, then verifies each one and the `r_<name>_…Id` field it adds to the child. Only the label and deletion type are ever updated. `--verify-only` skips the writes. |
| `objects.js` | 4, 5 | Rerun to add the Aggregation, Formula, AutoIncrement and stored computed fields (new fields are added to published objects too) and to enable account restriction. |
| `validations.js` | 4, 5, 7a | Creates the expression validation rules in `data/validations.json` by ERC (`MB_<Object>_<name>`) and verifies each one. Rules with a `field` show their error on it, the others on the form. Rules the engine can't enforce stay inactive (see their `note`). `--verify-only` skips the writes. |
| `test-validations.js` | 4 | POSTs an invalid entry for each expression rule and expects it to be rejected with that rule's message. Creates nothing; reports the id of anything wrongly accepted. |
| `roles.js` | 5 | Creates the MB roles (Traveler, Ops Admin, Host account role) and sets their object permissions from `data/roles.json`, plus the permissions listed for the built-in Guest (`L_GUEST`) and User (`L_USER`, every signed-in user) roles. Other permissions are left as they are. `--verify-only` skips the writes. |
| `workflows.js` | 5 | Deploys "MB Ops Approval" (`data/mb-ops-approval.xml`) only when it differs from the live version (`--redeploy`: always; needed after its roles are deleted and recreated, because role IDs are resolved at deploy time), links it to Host and Listing, and verifies both. |
| `test-users.js` | 5 | **Local instance only.** Creates the test traveler, four hosts (each in their own account, with the Host account role and the Traveler role), ops admin, and `mb.test.newhost` (no MB role yet, to try host sign-up). Sets fresh random passwords on every run and prints them to the terminal only. |
| `seed.js` | 6 | **Local instance only; mb-actions-service must be running.** Loads the seed data in `data/seed/` (the home page design's destinations, hosts, listings, slots, reviews, a traveler's booking) through the real flows: Ops approves hosts and listings, a payment confirms the booking and the service creates the commission and every derived field. Verifies values, derived fields and what each test user and a guest can see. Needs `test-users.js` first. Resets the test users' passwords (rerun `test-users.js` to see new ones). `--verify-only` skips the writes (slots for days that came into the 14-day window since the last load show as missing). |
| `actions.js` | 7a | Registers the object actions in `data/actions.json` (ERC `MB_<Object>_<trigger>`, executor `function#mb-actions-service-…`). Deploy `client-extensions/mb-actions-service` first. `--verify-only` skips the writes. |
| `test-search.js` | 8 | Checks mb-search-service against docs/search.md section 11 on the seed data: host and trip relevance, typos and keywords, filters, dates and guests, card prices, profiles, privacy of host fields, suggestions and bad parameters. Needs `mb-search-service` running. |
| `e2e.js` | 10 | **Local instance only.** End-to-end checks through the APIs the website uses: a traveler books (service pricing, slot capacity, the booking locked for its owner), forged object action events sent straight to mb-actions-service change nothing (trust rule, docs/data-model.md 7.1), a real payment confirms the booking and creates the commission, the payout-balance and add-on rules, cross-account permissions, and the website-signed-up host in search. Creates `MB_E2E_…` entries on every run (never deletes). Needs the seed and both services running. |
| `export-objects-batch.js` | 9 | Regenerates `client-extensions/mb-objects-batch/batch/` (picklists and object definitions) from the configured instance. Run after changing the data model, and review the diff. |
| `site.js` | 10 | Builds the website's pages from `data/site/site.json` (docs/website.md 2): widget pages holding the mb-web-elements custom elements in order, created by ERC through the layout service, with their view permissions; then checks each page as a guest (public pages render their elements in order, restricted ones are hidden). Deploy `client-extensions/mb-web-elements` first. `--verify-only` skips the writes. |

Run them in the order above. Scripts never delete picklists, objects, fields, relationships, roles or data on the instance; things found on the instance but missing from the spec are kept and reported. The one exception is permissions: `roles.js` revokes actions on MB object resources that `data/roles.json` no longer grants.

