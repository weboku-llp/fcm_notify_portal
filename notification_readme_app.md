# CricRumble (React Native) — FCM integration

**Audience:** CricRumble React Native developers  

## Architecture (multi-project portal)

| Responsibility | System |
| --- | --- |
| Get FCM token + save it + `subscribeToTopic` | **CricRumble API** |
| Export tokens to portal | **CricRumble API** `GET /api/internal/notif-portal/tokens` |
| Sync tokens + compose + send via Firebase Admin | **Notification portal** |

Shared Firebase project: **`mythic-byway-478420-m8`**  
Shared broadcast topic: **`cricrumble_all`**

```
RN app
  ├─ getToken()
  ├─ subscribeToTopic('cricrumble_all')
  ├─ POST /api/device/fcm/token          (CricRumble API)
  └─ POST /api/user/fcm/token            (after login)

Notification portal
  ├─ GET CricRumble /api/internal/notif-portal/tokens  (periodic + before send)
  └─ Firebase Admin: topic OR multicast tokens
```

See also: [docs/PROJECT_TOKEN_API.md](docs/PROJECT_TOKEN_API.md)

---

## 1. RN app — on launch

```js
import messaging from '@react-native-firebase/messaging';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { Platform } from 'react-native';

const CRICRUMBLE_API = 'https://YOUR-CRICRUMBLE-API';
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
  await messaging().subscribeToTopic(BROADCAST_TOPIC);

  const token = await messaging().getToken();
  if (!token) return;

  await fetch(`${CRICRUMBLE_API}/api/device/fcm/token`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      token,
      installId: await getInstallId(),
      platform: Platform.OS === 'ios' ? 'ios' : 'android',
    }),
  });
}
```

### After login

```js
await fetch(`${CRICRUMBLE_API}/api/user/fcm/token`, {
  method: 'POST',
  headers: {
    'Content-Type': 'application/json',
    Authorization: `Bearer ${accessToken}`,
  },
  body: JSON.stringify({
    token: await messaging().getToken(),
    platform: Platform.OS === 'ios' ? 'ios' : 'android',
  }),
});
```

---

## 2. Portal ops (you)

1. CricRumble API: set `NOTIF_PORTAL_TOKEN_EXPORT_KEY` (restart API).
2. Portal → CricRumble project → Settings → **Project token API**:
   - Enable sync
   - Base URL = CricRumble API origin
   - API key = same as `NOTIF_PORTAL_TOKEN_EXPORT_KEY`
   - Test → Sync now
3. Send campaigns:
   - **Topic** `cricrumble_all` for broadcast
   - **All devices / Selected users** with optional **live refresh** before send

---

## 3. Acceptance

- [ ] RN registers token + subscribes to `cricrumble_all`
- [ ] Portal Test connection succeeds
- [ ] Portal Sync now imports tokens
- [ ] Topic campaign reaches a test device
- [ ] All-devices / selected-users campaign works with live refresh
