import 'package:dio/dio.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../../core/api_client.dart';
import '../../shared/models/models.dart';

class ManagerRepository {
  final Dio _dio;
  ManagerRepository(this._dio);

  Future<List<String>> assignedScreens() async {
    final r = await _dio.get('/auth/me');
    return ((r.data['assignedScreenIds'] as List?) ?? const []).map((e) => '$e').toList();
  }

  Future<Map<String, dynamic>> screenInfo(String id) async {
    final r = await _dio.get('/theatres/screens/$id');
    return r.data as Map<String, dynamic>;
  }

  Future<List<Show>> showsForScreen(String screenId) async {
    final r = await _dio.get('/shows', queryParameters: {'screenId': screenId});
    return (r.data as List).map((s) => Show.fromJson(s as Map<String, dynamic>)).toList();
  }

  Future<void> createShow({required String movieId, required String screenId, required DateTime startTime, required int basePrice}) {
    return _dio.post('/shows', data: {
      'movieId': movieId,
      'screenId': screenId,
      'startTime': startTime.toUtc().toIso8601String(),
      'basePrice': basePrice,
    });
  }

  Future<void> deleteShow(String id) => _dio.delete('/shows/$id');
}

final managerRepoProvider = Provider((ref) => ManagerRepository(ref.read(apiProvider)));

final assignedScreensProvider = FutureProvider<List<String>>((ref) => ref.read(managerRepoProvider).assignedScreens());

final screenInfoProvider = FutureProvider.family<Map<String, dynamic>, String>(
  (ref, id) => ref.read(managerRepoProvider).screenInfo(id),
);

final managerShowsProvider = FutureProvider.family<List<Show>, String>(
  (ref, screenId) => ref.read(managerRepoProvider).showsForScreen(screenId),
);
