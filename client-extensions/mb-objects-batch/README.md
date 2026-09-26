# mb-objects-batch

Batch client extension that installs Maddybaba's data model on any Liferay instance: the 22 `MB_` picklists and 25 `MB_` object definitions with their fields (including aggregation and auto-increment fields), relationships (including those from the User and Account system objects), account restriction, validation rules and object actions. It contains no entries: seed data stays local (`scripts/setup/seed.js`).

## Files (`batch/`, imported in name order)

| File | Items |
|---|---|
| `00-list-type-definitions.batch-engine-data.json` | the picklists |
| `01-object-definitions.batch-engine-data.json` | `L_USER` and `L_ACCOUNT` with only their relationships to `MB_` objects, then the `MB_` object definitions |
| `02-object-definitions-settings.batch-engine-data.json` | the `MB_` object definitions again |

All use the UPSERT strategy, so deploying again updates in place and never duplicates.

Don't edit them by hand: set up the data model on the local instance with the setup scripts, then regenerate with `node scripts/setup/export-objects-batch.js` and review the diff. The generator starts from Liferay's own object definition export and:

- removes instance-specific values (IDs, dates, class names) and references picklists by ERC;
- takes aggregation filters from the REST API, because the export serializes them as an internal object the import can't read;
- puts the system definitions first: the import creates placeholder definitions for relationship targets that don't exist yet, so the Account relationship fields exist before the objects restricted by them;
- adds the second pass, because Liferay ignores some settings (`enableCategorization`) when it creates a definition in one step.

## Installing on a new instance

1. Instance settings (docs/data-model.md 6.5): email verification at login off, default password policy without "Change Required".
2. Deploy `mb-actions-service`: the object actions and three validation rules reference its executors.
3. Deploy `mb-objects-batch`.
4. Run `scripts/setup/roles.js` and `scripts/setup/workflows.js` against the instance (roles, permissions and the approval workflow are not batch-importable), then `scripts/setup/actions.js --verify-only` and the other `--verify-only` checks.
5. Deploy `mb-search-service`.

To deploy to a virtual instance other than the default: `gradlew :client-extensions:mb-objects-batch:deploy -Pliferay.virtual.instance.id=<web ID>`.
