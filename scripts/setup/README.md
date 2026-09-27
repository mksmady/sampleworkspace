# Setup scripts

Idempotent Node.js (v22+, no dependencies) scripts that build the Maddybaba data model on a local Liferay instance, following `docs/data-model.md`.

Environment:

- `LIFERAY_USER`, `LIFERAY_PASSWORD` (required)
- `LIFERAY_URL` (optional, default `http://localhost:8080`)
- `LIFERAY_BEARER_TOKEN` (optional): an OAuth2 access token to use instead of basic auth, e.g. to run the `--verify-only` checks on another instance as a client extension's app

| Script | Phase | What it does |
|---|---|---|
| `picklists.js` | 1 | Creates/updates the picklists in `data/picklists.json`, then verifies each one with a GET by ERC. `--verify-only` skips the writes. |
| `objects.js` | 2 | Creates the object definitions and plain fields in `data/objects.json` as drafts, verifies them with a GET, and with `--publish` publishes those that match the spec. Fields are only changed while a definition is a draft. `--verify-only` skips the writes. |
| `relationships.js` | 3, 5 | Creates the one-to-many relationships in `data/relationships.json` on the parent object, then verifies each one and the `r_<name>_…Id` field it adds to the child. Only the label and deletion type are ever updated. `--verify-only` skips the writes. |
| `objects.js` | 4, 5 | Rerun to add the Aggregation, Formula, AutoIncrement and stored computed fields (new fields are added to published objects too) and to enable account restriction. |
| `validations.js` | 4, 5, 7a | Creates the expression validation rules in `data/validations.json` by ERC (`MB_<Object>_<name>`) and verifies each one. Rules with a `field` show their error on it, the others on the form. Rules the engine can't enforce stay inactive (see their `note`). `--verify-only` skips the writes. |
| `roles.js` | 5 | Creates the MB roles (Traveler, Ops Admin, Host and Super Host account roles) and sets their object permissions from `data/roles.json`, plus Guest's MB permissions. Other permissions are left as they are. `--verify-only` skips the writes. |
| `workflows.js` | 5 | Deploys "MB Ops Approval" (`data/mb-ops-approval.xml`) only when it differs from the live version, links it to Host and Listing, and verifies both. |
| `test-users.js` | 5 | **Local instance only.** Creates the test traveler, two hosts (each in their own account, with the Host account role) and ops admin. Sets fresh random passwords on every run and prints them to the terminal only. |
| `seed.js` | 6 | **Local instance only.** Loads the seed data in `data/seed/` (destinations, partner, hosts, listings, slots, a traveler with a confirmed booking, public holidays), approves seeded Hosts and Listings as the ops test user, and verifies values, aggregations and what each test user can see. Needs `test-users.js` first. Resets the test users' passwords (rerun `test-users.js` to see new ones). `--verify-only` skips the writes. |
| `actions.js` | 7a | Registers the object actions in `data/actions.json` (ERC `MB_<Object>_<trigger>`, executor `function#mb-actions-service-…`). Deploy `client-extensions/mb-actions-service` first. `--verify-only` skips the writes. |
| `export-objects-batch.js` | 9 | Regenerates `client-extensions/mb-objects-batch/batch/` (picklists and object definitions) from the configured instance. Run after changing the data model, and review the diff. |
| `site.js` | 10a | Creates/updates the home page's marketing copy (`data/site/web-content/`) as Basic Web Content articles by ERC, then verifies that each page in `data/site/site.json` shows its widgets in order and renders them for a guest. Pages are built in the UI (below). Deploy `client-extensions/mb-web-elements` and run `mb-search-service` first. `--verify-only` skips the writes. |

Run them in the order above. Scripts never delete picklists, objects, fields, relationships, roles or data on the instance; things found on the instance but missing from the spec are kept and reported. The one exception is permissions: `roles.js` revokes actions on MB object resources that `data/roles.json` no longer grants.

## Website pages (phase 10a)

This Liferay version rejects page creation through the headless APIs, so the pages are built by hand once; `site.js --verify-only` then checks them. On the Maddybaba site (`/web/maddybaba`):

1. **Site Builder → Pages:** content pages `home` (Home), `search` (Explore), `listing` (Trip) and `host` (Host), all top-level. In each page's configuration, tick **Hidden from navigation** for `listing` and `host`.
2. Edit each page and drop these widgets in this order (Fragments and Widgets → **Widgets**). The MB elements are under **Client Extensions**; each **Web Content Display** is set to show the named article (Select → Web Content → the article title).

   | Page | Widgets, top to bottom |
   |---|---|
   | `home` | MB Site Header, MB Hero Search, MB Categories, Web Content Display ×5 ("Home: How it works", "Home: AI recommendations", "Home: Why Maddybaba (comparison)", "Home: Become a host", "Home: Custom tour packages"), MB App Waitlist, MB Site Footer |
   | `search` | MB Site Header, MB Search Results, MB Site Footer |
   | `listing` | MB Site Header, MB Listing Detail, MB Site Footer |
   | `host` | MB Site Header, MB Host Profile, MB Site Footer |

   For each Web Content Display, turn off its title and decoration (Configuration → Look and Feel / Decoration: Barebone) so only the article renders.
3. **Publish** each page, then run `node scripts/setup/site.js --verify-only`.

The elements call `mb-search-service` at `http://localhost:58082` (its `mb.search.cors-origins` must include the site's origin). Another environment sets `window.MBConfig = {searchURL: '…'}` before the elements load.
