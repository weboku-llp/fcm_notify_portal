# CricRumble (React Native) — FCM integration

**Audience:** CricRumble React Native developers  
**Architecture (split):**

| Responsibility | System |
| --- | --- |
| Get FCM token + save it + `subscribeToTopic` | **CricRumble API** — `A:\weboku\cricrumble-main\apps\api` |
| Compose / trigger Firebase push (Admin SDK) | **Notification portal** — `A:\fcm notification project` |

Shared Firebase project: **`mythic-byway-478420-m8`**  
Shared broadcast topic: **`cricrumble_all`** (must match everywhere)

```
RN app
  ├─ FirebaseMessaging.getToken()
  ├─ subscribeToTopic('cricrumble_all')     ← device ↔ Firebase (required for portal “all users”)
  ├─ POST /api/device/fcm/token             ← CricRumble API (anonymous, install)
  └─ POST /api/user/fcm/token               ← CricRumble API (after login)

Ops (web)
  └─ Notification portal → worker → Firebase Admin send({ topic: 'cricrumble_all' })
```

RN does **not** call the notification portal API for registration.  
The portal does **not** need your tokens for **topic** broadcasts — only that devices subscribed to `cricrumble_all`.

---

## 1. RN app — on launch (every install / update)

Dependencies: `@react-native-firebase/app`, `@react-native-firebase/messaging`  
Same Firebase Android/iOS apps as today (`google-services.json` / `GoogleService-Info.plist`).

```js
import messaging from '@react-native-firebase/messaging';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { Platform } from 'react-native';

const CRICRUMBLE_API = 'https://YOUR-CRICRUMBLE-API'; // no trailing slash
const BROADCAST_TOPIC = 'cricrumble_all';
const INSTALL_ID_KEY = 'fcm_install_id';

async function getInstallId() {
  let id = await AsyncStorage.getItem(INSTALL_ID_KEY);
  if (!id) {
    id = `${Platform.OS}-${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;
    await AsyncStorage.setItem(INSTALL_ID_KEY, id);
  }
  return id;
}

export async function setupFcmForCricRumble() {
  await messaging().requestPermission();

  // Critical for portal “Project-wide topic” / all-users broadcast
  await messaging().subscribeToTopic(BROADCAST_TOPIC);

  const token = await messaging().getToken();
  if (!token) return;

  const installId = await getInstallId();

  await fetch(`${CRICRUMBLE_API}/api/device/fcm/token`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      token,
      installId, // min 8 chars
      platform: Platform.OS === 'ios' ? 'ios' : 'android',
    }),
  });
}

// Call once after Firebase app init (e.g. App.tsx useEffect)
```

### Token refresh

```js
messaging().onTokenRefresh(async (token) => {
  await messaging().subscribeToTopic(BROADCAST_TOPIC);
  const installId = await getInstallId();
  await fetch(`${CRICRUMBLE_API}/api/device/fcm/token`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      token,
      installId,
      platform: Platform.OS === 'ios' ? 'ios' : 'android',
    }),
  });
  // If logged in, also call linkFcmTokenToUser(token) below
});
```

### After login

```js
export async function linkFcmTokenToUser(accessToken) {
  const token = await messaging().getToken();
  if (!token) return;

  await fetch(`${CRICRUMBLE_API}/api/user/fcm/token`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${accessToken}`,
    },
    body: JSON.stringify({
      token,
      platform: Platform.OS === 'ios' ? 'ios' : 'android',
    }),
  });
}
```

### On logout (optional)

```js
await fetch(`${CRICRUMBLE_API}/api/user/fcm/token`, {
  method: 'DELETE',
  headers: {
    'Content-Type': 'application/json',
    Authorization: `Bearer ${accessToken}`,
  },
  body: JSON.stringify({ token: await messaging().getToken() }),
});
```

---

## 2. CricRumble API endpoints (token store only)

Base: your deployed CricRumble API (same host the app already uses).

| When | Method | Path | Auth |
| --- | --- | --- | --- |
| Install / open | `POST` | `/api/device/fcm/token` | None |
| After login | `POST` | `/api/user/fcm/token` | Bearer JWT |
| Logout | `DELETE` | `/api/user/fcm/token` | Bearer JWT |

**Anonymous body**

```json
{
  "token": "<FCM_REGISTRATION_TOKEN>",
  "installId": "android-stable-uuid-min-8-chars",
  "platform": "android"
}
```

**Logged-in body**

```json
{
  "token": "<FCM_REGISTRATION_TOKEN>",
  "platform": "android"
}
```

Server must have `FCM_SERVICE_ACCOUNT_JSON` set (already on API) so registration is accepted.  
Env alignment (API `.env`):

```env
FCM_BROADCAST_TOPIC=cricrumble_all
FCM_ANDROID_CHANNEL_ID=cricrumble_alerts
```

Restart CricRumble API after changing env.

---

## 3. Notification portal — how ops send

Use **`A:\fcm notification project`** (web + api + worker):

1. Project **CricRumble** selected (Firebase `mythic-byway-478420-m8`).
2. `FCM_DRIVER=firebase` on portal API **and** worker.
3. New campaign → target **Project-wide topic** → topic **`cricrumble_all`**.
4. Worker sends via Firebase Admin `send({ topic: 'cricrumble_all', ... })`.

**Do not use “All registered devices” on the portal** for production all-user blasts — those tokens live in **CricRumble DB**, not the portal DB. Topic send is the correct path for this split.

Portal does **not** call CricRumble API to send. Both sides only share the same Firebase project + topic name.

---

## 4. What each team owns

| You (portal / web) | RN developer | CricRumble API |
| --- | --- | --- |
| Portal credentials, campaigns, `FCM_DRIVER=firebase` | `subscribeToTopic` + register tokens to CricRumble API | Keep `FCM_*` env + token routes healthy |
| Send only via topic `cricrumble_all` for “everyone” | Same Firebase app as Console | Topic env = `cricrumble_all` |

---

## 5. Acceptance checklist

- [ ] RN: permission granted, `subscribeToTopic('cricrumble_all')` succeeds.
- [ ] RN: `POST /api/device/fcm/token` returns success on install.
- [ ] RN: after login, `POST /api/user/fcm/token` returns success.
- [ ] CricRumble API: `FCM_BROADCAST_TOPIC=cricrumble_all`.
- [ ] Portal: topic campaign to `cricrumble_all` → Firebase message id (not `mock-msg-*`).
- [ ] Test device on new app build receives the portal topic push.
- [ ] Old installs without update: still use Firebase Console until they update.

---

## 6. Security

- Never put Firebase **service account** JSON in the RN app.
- RN only talks to **CricRumble API** for tokens (JWT for user link).
- Portal keeps service account encrypted / server-side only.

---

## Contact values to hand to RN

| Key | Value |
| --- | --- |
| CricRumble API base URL | (your prod/staging API URL) |
| Topic | `cricrumble_all` |
| Firebase project | `mythic-byway-478420-m8` |
| Anonymous register | `POST /api/device/fcm/token` |
| User register | `POST /api/user/fcm/token` |
