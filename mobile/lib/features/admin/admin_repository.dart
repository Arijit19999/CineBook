import 'package:dio/dio.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../../core/api_client.dart';

class AdminRepository {
  final Dio _dio;
  AdminRepository(this._dio);

  Future<List<Map<String, dynamic>>> users() async {
    final r = await _dio.get('/admin/users');
    return (r.data as List).cast<Map<String, dynamic>>();
  }

  Future<void> updateRole(String id, String role) => _dio.patch('/admin/users/$id', data: {'role': role});

  Future<Map<String, dynamic>> reports() async {
    final r = await _dio.get('/admin/reports');
    return r.data as Map<String, dynamic>;
  }

  Future<List<Map<String, dynamic>>> activity({int limit = 50}) async {
    final r = await _dio.get('/admin/activity', queryParameters: {'limit': limit});
    return (r.data as List).cast<Map<String, dynamic>>();
  }

  Future<void> createMovie(Map<String, dynamic> data) => _dio.post('/admin/movies', data: data);

  /// Uploads poster image bytes; returns the relative URL (e.g. /uploads/x.jpg).
  Future<String> uploadPoster(List<int> bytes, String filename) async {
    final form = FormData.fromMap({'file': MultipartFile.fromBytes(bytes, filename: filename)});
    final r = await _dio.post('/admin/upload', data: form);
    return (r.data as Map<String, dynamic>)['url'] as String;
  }
}

final adminRepoProvider = Provider((ref) => AdminRepository(ref.read(apiProvider)));
final adminUsersProvider = FutureProvider((ref) => ref.read(adminRepoProvider).users());
final adminReportsProvider = FutureProvider((ref) => ref.read(adminRepoProvider).reports());
final adminActivityProvider = FutureProvider((ref) => ref.read(adminRepoProvider).activity());
