# notif_portal_fcm (Flutter)

Drop-in FCM registration for **CricRumble** (and other portal projects).

## What it does on app start

1. Requests notification permission (where required)
2. Reads the current FCM registration token
3. `POST /api/device-registrations` to the portal backend
4. Subscribes to the project topic (`cricrumble_all`)
5. Listens for token refresh and re-registers immediately
6. Re-registers on login / logout / periodic app open

Users do **not** need to reinstall — updating and opening the app is enough.

## Integration (CricRumble)

```dart
import 'package:firebase_core/firebase_core.dart';
import 'package:firebase_messaging/firebase_messaging.dart';
import 'package:notif_portal_fcm/notif_portal_fcm.dart';

final registration = NotificationRegistrationService(
  const NotificationRegistrationConfig(
    apiBaseUrl: String.fromEnvironment('NOTIF_API_URL'),
    projectKey: 'cricrumble',
    firebaseProjectId: String.fromEnvironment('FIREBASE_PROJECT_ID'),
    firebaseAppId: String.fromEnvironment('FIREBASE_APP_ID'),
    registrationKey: String.fromEnvironment('NOTIF_REGISTRATION_KEY'),
    broadcastTopic: 'cricrumble_all',
  ),
);

Future<void> main() async {
  WidgetsFlutterBinding.ensureInitialized();
  await Firebase.initializeApp();
  FirebaseMessaging.onBackgroundMessage(notifPortalBackgroundHandler);
  await registration.initialize();
  runApp(const CricRumbleApp());
}

// After login:
await registration.onLogin(user.id);

// After logout:
await registration.onLogout();

// On app resume / version upgrade path:
await registration.reRegister(force: true);
```

## Security

- Send only the **registration key** from the app (`X-App-Registration-Key`).
- **Never** embed Firebase service-account JSON in the mobile app.
- SHA-1 / authorized domains are Firebase Console config — they are **not** notification targets.

## Foreground / background / terminated

Handle display and deep links in the host app:

- Foreground: `FirebaseMessaging.onMessage`
- Background (tapped): `FirebaseMessaging.onMessageOpenedApp`
- Terminated: `FirebaseMessaging.instance.getInitialMessage()`

Read `message.data['deepLink']` (or your template field) to navigate.
