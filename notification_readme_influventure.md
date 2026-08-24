# Influventure ↔ Notification portal

Shared broadcast topic: **`influventure_all`**

```
RN / Flutter app
  ├─ get FCM token
  ├─ subscribeToTopic('influventure_all')
  ├─ POST /api/device/fcm/token   (install, optional X-Fcm-Registration-Key)
  └─ POST /api/user/fcm/token     (after login, auth cookie/Bearer)
                ↑
                │ GET /api/internal/notif-portal/tokens
                │ Header: X-Notif-Portal-Key
Notification portal ──► Firebase Admin send (topic or multicast)
```

## Influventure API env

```
NOTIF_PORTAL_TOKEN_EXPORT_KEY=<shared secret, min 16 chars>
FCM_BROADCAST_TOPIC=influventure_all
# optional:
# FCM_DEVICE_REGISTRATION_KEY=<same value mobile sends as X-Fcm-Registration-Key>
```

Run migration: `npm run migrate:dev -- 0075_fcm_device_tokens.sql` (or full `npm run migrate:dev`).

## Portal project settings

1. Create project (or re-seed): slug **`influventure`**, topic **`influventure_all`**
2. Paste Firebase service account for Influventure’s Firebase project
3. Settings → Project token API:
   - Base URL = Influventure API origin (e.g. `http://localhost:3001` or staging URL)
   - API key = same as `NOTIF_PORTAL_TOKEN_EXPORT_KEY`
   - **Test & turn on** → **Sync now**

## Checklist

- [ ] Migration `0075_fcm_device_tokens` applied
- [ ] `NOTIF_PORTAL_TOKEN_EXPORT_KEY` set on Influventure API
- [ ] Mobile registers token + subscribes to `influventure_all`
- [ ] Portal project `influventure` token source enabled and syncing
