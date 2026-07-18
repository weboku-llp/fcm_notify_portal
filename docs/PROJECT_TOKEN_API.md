# Project token API contract

Each app backend (e.g. CricRumble) stores FCM tokens. The **notification portal** pulls those tokens, caches them, and sends via Firebase Admin using the portal’s per-project service account.

```
RN app → Project API (register token + subscribeToTopic)
                ↑
                │ GET /api/internal/notif-portal/tokens
                │ Header: X-Notif-Portal-Key
Notification portal ──► Firebase Admin send (topic or multicast)
```

## Endpoint (required on every project API)

`GET {tokenSourceApiBaseUrl}/api/internal/notif-portal/tokens`

### Headers

| Header | Value |
| --- | --- |
| `X-Notif-Portal-Key` | Shared secret (same as portal project setting) |
| `Accept` | `application/json` |

### Query

| Param | Description |
| --- | --- |
| `cursor` | Opaque id from previous `nextCursor` |
| `limit` | Page size (default 500, max 1000) |
| `userId` | Repeatable — filter tokens for selected users |

### Response `200`

```json
{
  "tokens": [
    {
      "token": "fcm-registration-token",
      "platform": "android",
      "userId": "user-id-or-null",
      "lastSeenAt": "2026-07-18T10:00:00.000Z",
      "appVersion": "1.2.3"
    }
  ],
  "nextCursor": "cuid-or-null"
}
```

`platform`: `android` | `ios` | `web`  
`nextCursor`: `null` when no more pages.

### Errors

| Status | Meaning |
| --- | --- |
| 401 | Bad / missing `X-Notif-Portal-Key` |
| 503 | Export not configured on project API |

## Portal configuration (per project)

In portal → Project → Settings → **Project token API**:

1. Enable token sync
2. Base URL = project API origin (no trailing slash)
3. Portal API key = same as project env `NOTIF_PORTAL_TOKEN_EXPORT_KEY`
4. **Test connection** → **Sync now**

Worker also syncs all enabled projects every **5 minutes**.

## Campaign targets

| Target | Behavior |
| --- | --- |
| Project-wide topic | Firebase `send({ topic })` — devices must `subscribeToTopic` |
| All devices (token cache) | Multicast portal cache (optionally live-refresh from project API first) |
| Selected users | Multicast by `userId` (optionally live-refresh filtered) |

## CricRumble reference

- Route: `apps/api/src/legacy-routes/internal/notif-portal/tokens/route.ts`
- Env: `NOTIF_PORTAL_TOKEN_EXPORT_KEY` (min 16 chars)
