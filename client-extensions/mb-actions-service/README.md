# mb-actions-service

Spring Boot 3.5 / Java 21 microservice client extension with Maddybaba's object action handlers and validation rules (docs/data-model.md sections 5 and 7.1).

## Run locally

From the workspace root (Blade: `blade gw …` runs the same tasks):

```
gradlew :client-extensions:mb-actions-service:deploy    # registers the OAuth2 apps, actions and rules with Liferay
gradlew :client-extensions:mb-actions-service:bootRun   # serves them on http://localhost:58081 (heap capped at 256 MB)
```

Then register the object actions and rules on the objects:

```
node scripts/setup/actions.js
node scripts/setup/validations.js
```

The service reads its OAuth2 client credentials from the route files Liferay writes on deploy (`<liferay home>/routes/default/mb-actions-service/`); they are never stored in the repo. While the service is down, object actions fail quietly (entries still save, derived values don't update).

## Configuration

`src/main/resources/application-default.properties`:

- `mb.pricing.platform-fee-percent` (5) and `mb.pricing.gst-on-fee-percent` (18): booking fee and GST on the fee.
- `mb.commission.referral-percent` (5): the referral host's share of the booking subtotal.
- `mb.commission.available-after-days` (7): days after the trip ends before a commission becomes available.

Notifications, refunds and gateway calls are only logged (lines starting `NOTIFY`, `REFUND`, `PAYOUT GATEWAY`) until phase 7c.
