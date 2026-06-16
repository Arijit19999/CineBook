import 'package:dio/dio.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import 'auth/auth.dart';
import 'config.dart';

/// A configured Dio client. An interceptor attaches the current JWT to every
/// request, so feature code never deals with auth headers.
final apiProvider = Provider<Dio>((ref) {
  final dio = Dio(
    BaseOptions(
      baseUrl: apiBaseUrl,
      connectTimeout: const Duration(seconds: 10),
      receiveTimeout: const Duration(seconds: 60),
      headers: {'Content-Type': 'application/json'},
    ),
  );

  dio.interceptors.add(
    InterceptorsWrapper(
      onRequest: (options, handler) {
        final token = ref.read(authProvider).token;
        if (token != null) options.headers['Authorization'] = 'Bearer $token';
        handler.next(options);
      },
    ),
  );

  return dio;
});

/// Pulls a clean error message out of a Dio error for display.
String apiErrorMessage(Object e) {
  if (e is DioException) {
    final data = e.response?.data;
    if (data is Map && data['error'] != null) return data['error'].toString();
    if (data is Map && data['message'] != null) return data['message'].toString();
    return e.message ?? 'Network error';
  }
  return e.toString();
}
