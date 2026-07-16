/// Configuration for registering FCM tokens with the Notif Portal backend.
///
/// Never put Firebase service-account JSON here. Only the app registration
/// key (shared secret) belongs in client build config / secure storage.
class NotificationRegistrationConfig {
  const NotificationRegistrationConfig({
    required this.apiBaseUrl,
    required this.projectKey,
    required this.firebaseProjectId,
    required this.firebaseAppId,
    required this.registrationKey,
    this.broadcastTopic = 'cricrumble_all',
    this.reRegisterInterval = const Duration(hours: 24),
  });

  /// e.g. https://notif.example.com  (no trailing slash)
  final String apiBaseUrl;

  /// Portal project key / slug — for CricRumble this is `cricrumble`.
  final String projectKey;

  /// Firebase console project id (must match the portal project's fcmProjectId).
  final String firebaseProjectId;

  /// Firebase Android/iOS app id (e.g. 1:123:android:abc).
  final String firebaseAppId;

  /// Sent as `X-App-Registration-Key`. Not a Firebase credential.
  final String registrationKey;

  /// Topic the device should subscribe to after getting a token.
  final String broadcastTopic;

  /// Re-register at least this often when the app opens.
  final Duration reRegisterInterval;
}
