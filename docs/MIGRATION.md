# CricRumble FCM migration guide

## Why the portal cannot reach every existing install today

- Notifications were previously sent from **Firebase Console** using Firebase project targeting.
- Device FCM registration tokens were **never stored** in our database.
- Devices were **not subscribed** to a custom topic such as `cricrumble_all`.
- Firebase does **not** provide an API to export or list all existing device tokens.
- SHA-1 fingerprints and authorized domains are app-identity / Console configuration — they are **not** notification targets for a custom portal.

Therefore the custom portal can only message devices that have **updated**, **opened the app**, and **registered** with the new system (token stored + topic subscribed).

## Transition period (keep both channels)

| Audience | How they receive pushes |
| --- | --- |
| Old app versions | Firebase Console (unchanged). Portal cannot discover them. |
| Updated app versions | Portal (token registry + `cricrumble_all` topic) and/or Console |

Do **not** remove or break the current Firebase Console notification setup during migration.

## What the next app update does

1. Requests notification permission where required.
2. Reads the current FCM token (`getToken` / refresh).
3. `POST /api/device-registrations` to the portal backend.
4. Subscribes the device to `cricrumble_all`.
5. Re-registers on login, logout, token refresh, and periodically on open.

- Users only need to **update and open** the application.
- **Reinstallation is not required.**
- Portal coverage increases as users update.

## CricRumble defaults

- `projectKey` / slug: `cricrumble`
- `defaultBroadcastTopic`: `cricrumble_all`
- Portal “All CricRumble Users” uses topic `cricrumble_all`

Coverage disclaimer shown in the portal:

> Portal notifications reach devices that have updated and registered with the new notification system. Use Firebase Console during the migration period to reach older app versions.

## Manual Firebase configuration still required

1. Keep the existing Firebase Android/iOS apps (SHA-1, bundle IDs, APNs keys) as today.
2. Generate a **service account** JSON and paste it into the portal (encrypted at rest).
3. Configure a **mobile registration secret** on the CricRumble project (or `DEVICE_REGISTRATION_SECRET` for local/dev).
4. Ship the Flutter helper (`packages/mobile-sdk/flutter`) in the next CricRumble release with:
   - `NOTIF_API_URL`
   - `FIREBASE_PROJECT_ID`
   - `FIREBASE_APP_ID`
   - `NOTIF_REGISTRATION_KEY`
5. Set worker/API `FCM_DRIVER=firebase` in production.

Never put service-account JSON in the mobile app, portal `NEXT_PUBLIC_*` vars, git, or public API responses.
