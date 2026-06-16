import 'package:flutter/foundation.dart';

/// Base URL of the CineBook API.
/// - Android emulator reaches the host machine via 10.0.2.2
/// - Web / desktop use localhost
String get apiBaseUrl {
  if (kIsWeb) return 'http://localhost:3000';
  if (defaultTargetPlatform == TargetPlatform.android) return 'http://10.0.2.2:3000';
  return 'http://localhost:3000';
}
