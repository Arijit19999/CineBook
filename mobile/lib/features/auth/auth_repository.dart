import 'package:dio/dio.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../../core/api_client.dart';

class AuthRepository {
  final Dio _dio;
  AuthRepository(this._dio);

  Future<void> requestOtp(String phone) => _dio.post('/auth/request-otp', data: {'phone': phone});

  Future<String> verifyOtp(String phone, String code) async {
    final r = await _dio.post('/auth/verify-otp', data: {'phone': phone, 'code': code});
    return r.data['token'] as String;
  }
}

final authRepoProvider = Provider((ref) => AuthRepository(ref.read(apiProvider)));
