import 'package:flutter/foundation.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:flutter_secure_storage/flutter_secure_storage.dart';
import 'package:jwt_decoder/jwt_decoder.dart';

/// Authenticated user state, derived from the JWT.
@immutable
class AuthState {
  final String? token;
  final String? userId;
  final String? role; // customer | hall_manager | admin
  final String? name;
  final String? phone;

  const AuthState({this.token, this.userId, this.role, this.name, this.phone});

  bool get isLoggedIn => token != null;

  const AuthState.empty()
      : token = null,
        userId = null,
        role = null,
        name = null,
        phone = null;
}

const _storage = FlutterSecureStorage();
const _tokenKey = 'cinebook_jwt';

class AuthNotifier extends Notifier<AuthState> {
  @override
  AuthState build() => const AuthState.empty();

  /// Load a persisted token on startup (call once from main).
  Future<void> restore() async {
    final token = await _storage.read(key: _tokenKey);
    if (token != null && !JwtDecoder.isExpired(token)) {
      state = _fromToken(token);
    }
  }

  Future<void> setToken(String token) async {
    await _storage.write(key: _tokenKey, value: token);
    state = _fromToken(token);
  }

  Future<void> logout() async {
    await _storage.delete(key: _tokenKey);
    state = const AuthState.empty();
  }

  AuthState _fromToken(String token) {
    final claims = JwtDecoder.decode(token);
    return AuthState(
      token: token,
      userId: claims['sub'] as String?,
      role: claims['role'] as String?,
      name: claims['name'] as String?,
      phone: claims['phone'] as String?,
    );
  }
}

final authProvider = NotifierProvider<AuthNotifier, AuthState>(AuthNotifier.new);
