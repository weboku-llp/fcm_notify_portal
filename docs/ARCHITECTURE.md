# Architecture — multi-project FCM portal + CricRumble migration

```
CricRumble RN app
  getToken + subscribeToTopic(cricrumble_all)
        |
        |  POST /api/device/fcm/token  (+ /api/user/fcm/token after login)
        v
  CricRumble API (A:\weboku\cricrumble-main\apps\api)  — token store only

Ops / send path (this repo):
   apps/web (portal) → apps/api → BullMQ → apps/worker
        → firebase-admin send({ topic: cricrumble_all })
   Portal does not need CricRumble token DB for topic broadcasts.
```

See root `notification_readme_app.md` for RN integration (split: tokens on CricRumble API, send from this portal).

## Isolation rules

1. Each portal `Project` has its own encrypted Firebase service account.
2. Device tokens are keyed by `projectKey` + `token` and store `firebaseProjectId`.
3. Registration rejects mismatches between client `firebaseProjectId` and the project's configured id.
4. The worker initializes a **named** `firebase-admin` app per portal project id.

## Target types

| Portal UI | Campaign mode | Delivery |
| --- | --- | --- |
| Test device token | (test endpoint) | `sendToToken` |
| Individual device token | `SPECIFIC_TOKENS` | multicast |
| Selected users | `SELECTED_USERS` | active tokens for userIds |
| All registered devices | `ALL_REGISTERED` | all active tokens |
| Project-wide topic | `BROADCAST_TOPIC` | `defaultBroadcastTopic` |
| Custom topic | `BROADCAST_TOPIC` | custom topic name |
| Filtered segment | `SEGMENT` | active tokens matching rules |

For CricRumble “All users”: topic `cricrumble_all` (not a claim of 100% legacy coverage).

## Invalid token cleanup

On `messaging/registration-token-not-registered`, `messaging/invalid-registration-token`, or `messaging/mismatched-credential`:

- set `isActive=false`
- set `invalidatedAt` + `invalidationReason`
- do not permanently retry those tokens
