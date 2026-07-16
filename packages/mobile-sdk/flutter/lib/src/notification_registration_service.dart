import 'dart:convert';
import 'dart:io' show Platform;

import 'package:firebase_messaging/firebase_messaging.dart';
import 'package:flutter/foundation.dart';
import 'package:http/http.dart' as http;
import 'package:package_info_plus/package_info_plus.dart';
import 'package:shared_preferences/shared_preferences.dart';

import 'notification_registration_config.dart';

/// Handles permission → FCM token → backend registration → topic subscribe.
///
/// Call [initialize] once after `Firebase.initializeApp()`, typically from
/// `main()` or your root app widget. Existing installations register
/// automatically after users update and open the app — no reinstall required.
class NotificationRegistrationService {
  NotificationRegistrationService(this.config, {http.Client? httpClient})
      : _http = httpClient ?? http.Client();

  final NotificationRegistrationConfig config;
  final http.Client _http;

  static const _prefToken = 'notif_portal_fcm_token';
  static const _prefLastRegister = 'notif_portal_last_register_ms';
  static const _prefUserId = 'notif_portal_user_id';

  String? _currentUserId;
  bool _started = false;

  /// Wire permission, token fetch, refresh listener, and initial registration.
  Future<void> initialize({String? userId}) async {
    if (_started) {
      await setUserId(userId);
      return;
    }
    _started = true;
    _currentUserId = userId;

    final messaging = FirebaseMessaging.instance;

    final settings = await messaging.requestPermission(
      alert: true,
      badge: true,
      sound: true,
      provisional: false,
    );

    // iOS: ensure APNs token is available before getToken on physical devices.
    if (!kIsWeb && Platform.isIOS) {
      await messaging.getAPNSToken();
    }

    final token = await messaging.getToken();
    if (token != null) {
      await _registerToken(
        token: token,
        permission: _mapPermission(settings.authorizationStatus),
      );
      await _subscribeTopic();
    }

    messaging.onTokenRefresh.listen((newToken) async {
      final prefs = await SharedPreferences.getInstance();
      final previous = prefs.getString(_prefToken);
      await _registerToken(
        token: newToken,
        previousToken: previous != newToken ? previous : null,
        permission: _mapPermission(settings.authorizationStatus),
      );
      await _subscribeTopic();
    });
  }

  /// Call on login / logout / app open to keep the registry fresh.
  Future<void> reRegister({String? userId, bool force = false}) async {
    if (userId != null) {
      _currentUserId = userId;
      final prefs = await SharedPreferences.getInstance();
      await prefs.setString(_prefUserId, userId);
    }

    final prefs = await SharedPreferences.getInstance();
    final last = prefs.getInt(_prefLastRegister) ?? 0;
    final due = DateTime.now().millisecondsSinceEpoch - last >
        config.reRegisterInterval.inMilliseconds;
    if (!force && !due) return;

    final messaging = FirebaseMessaging.instance;
    final settings = await messaging.getNotificationSettings();
    final token = await messaging.getToken();
    if (token == null) return;

    await _registerToken(
      token: token,
      previousToken: prefs.getString(_prefToken) != token
          ? prefs.getString(_prefToken)
          : null,
      permission: _mapPermission(settings.authorizationStatus),
    );
    await _subscribeTopic();
  }

  Future<void> setUserId(String? userId) async {
    _currentUserId = userId;
    final prefs = await SharedPreferences.getInstance();
    if (userId == null) {
      await prefs.remove(_prefUserId);
    } else {
      await prefs.setString(_prefUserId, userId);
    }
    // Re-register immediately so userId is attached / cleared.
    await reRegister(force: true);
  }

  Future<void> onLogin(String userId) => setUserId(userId);

  Future<void> onLogout() => setUserId(null);

  Future<void> _subscribeTopic() async {
    try {
      await FirebaseMessaging.instance.subscribeToTopic(config.broadcastTopic);
    } catch (e, st) {
      debugPrint('notif_portal_fcm: subscribeToTopic failed: $e\n$st');
    }
  }

  Future<void> _registerToken({
    required String token,
    String? previousToken,
    required String permission,
  }) async {
    final prefs = await SharedPreferences.getInstance();
    final packageInfo = await PackageInfo.fromPlatform();
    final locale = PlatformDispatcher.instance.locale.toLanguageTag();
    final timezone = DateTime.now().timeZoneName;

    final body = <String, dynamic>{
      'projectKey': config.projectKey,
      'firebaseProjectId': config.firebaseProjectId,
      'firebaseAppId': config.firebaseAppId,
      'token': token,
      'platform': _platform(),
      'userId': _currentUserId ?? prefs.getString(_prefUserId),
      'appVersion': packageInfo.version,
      'appBuildNumber': packageInfo.buildNumber,
      'notificationPermission': permission,
      'deviceLocale': locale,
      'timezone': timezone,
      'topicSubscriptionStatus': 'SUBSCRIBED',
      if (previousToken != null) 'previousToken': previousToken,
    };

    final uri = Uri.parse('${config.apiBaseUrl}/api/device-registrations');
    final response = await _http.post(
      uri,
      headers: {
        'Content-Type': 'application/json',
        'X-App-Registration-Key': config.registrationKey,
      },
      body: jsonEncode(body),
    );

    if (response.statusCode >= 200 && response.statusCode < 300) {
      await prefs.setString(_prefToken, token);
      await prefs.setInt(
        _prefLastRegister,
        DateTime.now().millisecondsSinceEpoch,
      );
    } else {
      debugPrint(
        'notif_portal_fcm: registration failed '
        '${response.statusCode} ${response.body}',
      );
    }
  }

  String _platform() {
    if (kIsWeb) return 'web';
    if (Platform.isIOS) return 'ios';
    return 'android';
  }

  String _mapPermission(AuthorizationStatus status) {
    switch (status) {
      case AuthorizationStatus.authorized:
        return 'granted';
      case AuthorizationStatus.denied:
        return 'denied';
      case AuthorizationStatus.provisional:
        return 'provisional';
      case AuthorizationStatus.notDetermined:
        return 'unknown';
    }
  }
}

/// Optional background handler stub — wire in the host app:
/// `FirebaseMessaging.onBackgroundMessage(notifPortalBackgroundHandler);`
@pragma('vm:entry-point')
Future<void> notifPortalBackgroundHandler(RemoteMessage message) async {
  // Host app should initialize Firebase before using message data.
  debugPrint('notif_portal_fcm background: ${message.messageId}');
}
