# Maddybaba – Liferay project

## What this is

Maddybaba is a travel marketplace. Travelers book stays, flights, camping, treks, paragliding and local guides, or build a custom tour package. Hosts earn commission without owning property: they partner with hotels, guide travelers or list activities, and share a personal booking link.

The website and a mobile app both run on this Liferay instance. The app uses the headless APIs.

## Specs (read before working)

* `docs/Maddybaba\_App\_Design.pdf` — website and app screens
* `docs/data-model.md` — picklists, objects, fields, relationships, validations, permissions, actions. **Source of truth.**
* `docs/search.md` — search design, relevance and synonyms (in mb-search-service), `/search/trips` API

Follow the specs exactly. If something in a spec is wrong, unsupported on this Liferay version, or ambiguous, stop and ask. Don't improvise. When a spec changes, update the doc in the same commit.

## Environment

* Liferay Workspace: repository root
* Local Liferay: http://localhost:8080
* Liferay version: **2026.Q2.12** (`liferay.workspace.product=dxp-2026.q2.12`)
* API explorer: http://localhost:8080/o/api. Check endpoint paths and schemas there before using them; don't rely on memory.
* Auth: basic auth from env vars `$LIFERAY\_USER` and `$LIFERAY\_PASSWORD`. Never write credentials into files, commits or logs.
* Key APIs:

  * Picklists: `/o/headless-admin-list-type/v1.0/list-type-definitions`
  * Objects: `/o/object-admin/v1.0/object-definitions` (fields, relationships, actions, validations)
  * Object data: `/o/c/<pluralized object name>`, e.g. `/o/c/appwaitlists` (confirm the path in /o/api after publishing)

## Repository layout

```
docs/                     specs (above)
scripts/setup/            idempotent setup scripts for the local instance (Node.js), incl. seed data (seed.js, data/seed/) and local test users
client-extensions/
  mb-objects-batch/       batch client extension: picklists + object definitions (deployable)
  mb-actions-service/     microservice: object action handlers (denormalization, commissions, payouts)
  mb-search-service/      microservice: /search/trips, /search/suggest
  mb-web-\*/               custom elements / fragments for the website
```

## Conventions

* Every picklist, object, field and relationship gets an **external reference code** prefixed `MB\_` (see data-model.md section 0).
* Setup scripts are **idempotent**: look up by ERC and create or update (PUT by ERC where the API supports it). Rerunning must never duplicate anything.
* Follow the build order in data-model.md section 1: picklists → objects with plain fields → publish → relationships → aggregation/formula/auto-increment fields → validations → permissions → actions → seed data.
* Money is INR, PrecisionDecimal.
* Microservices: Spring Boot, the Liferay client extension samples' structure, OAuth2 via the client extension's `oAuthApplicationUserAgent` / `oAuthApplicationHeadlessServer`.
* Keep scripts small and readable. One file per concern (picklists, objects, relationships…).

## How to work

1. For every phase, start with a short plan and wait for my approval before changing files or calling APIs.
2. After each change on the instance, **verify with a GET** and report what you checked. "The request returned 200" is not verification; confirm the field, relationship or value actually exists.
3. For validations, test with an invalid POST and confirm it's rejected.
4. For permissions, test with a non-admin user (create test users if needed and tell me their credentials via the terminal, not files).
5. One phase per branch: `feature/phase-<n>-<name>`. Commit in small steps with clear messages. When a phase is done, push and open a PR with `gh pr create` summarising what changed and how it was verified.

## Safety rules

* **Never delete** object definitions, fields, relationships, picklists or data on the instance without asking me first, even to "start fresh".
* Never change a field's type in place. Propose a migration instead.
* Don't publish an object definition until its plain fields match the spec.
* Seed data goes only into the local instance, never into the deployable objects batch.
* Don't use Groovy scripts in object actions unless I confirm this instance allows them; prefer microservice client extensions.

## Phases

1. Picklists
2. Objects + plain fields, published
3. Relationships
4. Aggregation, formula and auto-increment fields; validations
5. Accounts, roles, permissions
6. Seed data
7. Object actions (mb-actions-service), including search denormalization
8. Search: mb-search-service (relevance, synonyms, availability; Blueprints need LES)
9. Package objects as the mb-objects-batch client extension and test on a clean instance
10. Website pages, fragments and display pages; then mobile app integration

Current phase: **1**

