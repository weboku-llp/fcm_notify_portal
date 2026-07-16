# End-to-end test flow (CricRumble migration)

## Automated (repo)

```bash
pnpm --filter @notif/domain exec node --import tsx --test src/__tests__/**/*.test.ts
```

Covers template variable validation/rendering and FCM error classification used for invalid-token cleanup.

## Manual / device flow

1. **Install or update** the CricRumble app that includes `packages/mobile-sdk/flutter`.
2. **Open** the app (no reinstall required for existing users).
3. **Allow** notification permission when prompted.
4. Verify **device registration** in the portal **Device tokens** page (or DB `DeviceToken` for `projectKey=cricrumble`).
5. Verify **topic** `cricrumble_all` — `topics` / `topicSubscriptionStatus=SUBSCRIBED` on the registration row.
6. **Test token send** from New Campaign → Test device token.
7. **Topic send** — Project-wide topic (`cricrumble_all`).
8. **Foreground** — keep app open; confirm `onMessage` handler receives the push.
9. **Background** — app in background; notification appears in tray; tap opens app.
10. **Terminated** — force-stop app; send again; tap cold-starts via `getInitialMessage`.
11. **Deep link** — payload `data.deepLink` / template deep link navigates to the match screen.
12. **Token refresh** — clear app data / wait for refresh; confirm `previousToken` inactivated and new token active.
13. **Login / logout** — `onLogin` / `onLogout` updates `userId` on the registration.
14. **Duplicate registration** — open app twice; upsert keeps a single `(projectKey, token)` row and bumps `lastSeenAt`.
15. **Invalid-token cleanup** — send to a `stale-*` mock token (or real unregistered token); row becomes `isActive=false` with reason set; not retried.
16. **Credential exposure** — inspect portal network responses and `NEXT_PUBLIC_*` env: no service-account JSON, no `DEVICE_REGISTRATION_SECRET`, only masked fingerprints.

## API smoke (local mock driver)

```bash
# Register (uses DEVICE_REGISTRATION_SECRET or project secret from seed)
curl -s -X POST http://localhost:4000/api/device-registrations \
  -H 'Content-Type: application/json' \
  -H 'X-App-Registration-Key: cricrumble-dev-registration-secret' \
  -d '{
    "projectKey":"cricrumble",
    "firebaseProjectId":"cricrumble-fcm",
    "firebaseAppId":"1:000000000000:android:cricrumbledemo",
    "token":"tok-manual-test-1",
    "platform":"android",
    "notificationPermission":"granted",
    "appVersion":"2.0.0",
    "appBuildNumber":"200"
  }'

# Topic campaign
curl -s -X POST http://localhost:4000/projects/<CRICRUMBLE_PROJECT_ID>/campaigns \
  -H 'Content-Type: application/json' \
  -d '{
    "action":"send_now",
    "mode":"BROADCAST_TOPIC",
    "targetTopic":"cricrumble_all",
    "title":"Hello CricRumble",
    "body":"Portal topic test"
  }'
```
