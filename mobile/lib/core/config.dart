import 'package:flutter/foundation.dart';

/// Base URL of the CineBook API.
/// - Android (device OR emulator): localhost:3000 reached via `adb reverse tcp:3000 tcp:3000`.
///   This is the single reliable path for a physical phone on mobile data.
/// - Override anytime with `--dart-define=API_BASE=http://HOST:3000` (e.g. a LAN IP).
String get apiBaseUrl {
  const override = String.fromEnvironment('API_BASE');
  if (override.isNotEmpty) return override;
  return 'http://localhost:3000';
}

/// Resolve an image URL: absolute URLs pass through; relative `/uploads/...`
/// paths (uploaded posters) get the API base prepended.
String? resolveImageUrl(String? url) {
  if (url == null || url.isEmpty) return null;
  if (url.startsWith('http')) return url;
  return '$apiBaseUrl$url';
}
