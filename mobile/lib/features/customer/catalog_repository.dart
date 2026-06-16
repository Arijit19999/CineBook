import 'package:dio/dio.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../../core/api_client.dart';
import '../../shared/models/models.dart';

class CatalogRepository {
  final Dio _dio;
  CatalogRepository(this._dio);

  Future<List<Movie>> listMovies({String? q, String? genre, String? language}) async {
    final r = await _dio.get('/movies', queryParameters: {
      if (q != null && q.isNotEmpty) 'q': q,
      if (genre != null && genre.isNotEmpty) 'genre': genre,
      if (language != null && language.isNotEmpty) 'language': language,
    });
    return (r.data as List).map((m) => Movie.fromJson(m as Map<String, dynamic>)).toList();
  }

  Future<Movie> getMovie(String id) async {
    final r = await _dio.get('/movies/$id');
    return Movie.fromJson(r.data as Map<String, dynamic>);
  }

  Future<List<String>> listGenres() async {
    final r = await _dio.get('/movies/genres');
    return (r.data as List).map((g) => (g as Map<String, dynamic>)['name'] as String).toList();
  }

  Future<List<Show>> getShowtimes(String movieId) async {
    final r = await _dio.get('/shows', queryParameters: {'movieId': movieId});
    return (r.data as List).map((s) => Show.fromJson(s as Map<String, dynamic>)).toList();
  }

  Future<SeatMap> getSeatMap(String showId) async {
    final r = await _dio.get('/bookings/seats', queryParameters: {'showId': showId});
    return SeatMap.fromJson(r.data as Map<String, dynamic>);
  }

  Future<void> holdSeats(String showId, List<String> seatIds) =>
      _dio.post('/bookings/hold', data: {'showId': showId, 'seatIds': seatIds});

  Future<Booking> createBooking(String showId, List<String> seatIds) async {
    final r = await _dio.post('/bookings', data: {'showId': showId, 'seatIds': seatIds});
    return Booking.fromJson(r.data as Map<String, dynamic>);
  }

  Future<void> startPayment(String bookingId) => _dio.post('/bookings/$bookingId/pay/start');

  Future<Map<String, dynamic>> confirmPayment(String bookingId, String card) async {
    final r = await _dio.post('/bookings/$bookingId/pay/confirm', data: {'cardNumber': card});
    return r.data as Map<String, dynamic>;
  }

  Future<List<Booking>> myBookings() async {
    final r = await _dio.get('/bookings');
    return (r.data as List).map((b) => Booking.fromJson(b as Map<String, dynamic>)).toList();
  }

  Future<void> cancelBooking(String id) => _dio.post('/bookings/$id/cancel');
}

final catalogRepoProvider = Provider((ref) => CatalogRepository(ref.read(apiProvider)));

// --- Browse filters + movie list ---

class MovieFilter {
  final String q;
  final String? genre;
  const MovieFilter({this.q = '', this.genre});
  MovieFilter copyWith({String? q, String? genre, bool clearGenre = false}) =>
      MovieFilter(q: q ?? this.q, genre: clearGenre ? null : (genre ?? this.genre));
}

class MovieFilterNotifier extends Notifier<MovieFilter> {
  @override
  MovieFilter build() => const MovieFilter();
  void setQuery(String q) => state = state.copyWith(q: q);
  void setGenre(String? g) => state = g == null ? state.copyWith(clearGenre: true) : state.copyWith(genre: g);
}

final movieFilterProvider = NotifierProvider<MovieFilterNotifier, MovieFilter>(MovieFilterNotifier.new);

final moviesProvider = FutureProvider<List<Movie>>((ref) {
  final f = ref.watch(movieFilterProvider);
  return ref.read(catalogRepoProvider).listMovies(q: f.q, genre: f.genre);
});

final genresProvider = FutureProvider<List<String>>((ref) => ref.read(catalogRepoProvider).listGenres());

final showtimesProvider = FutureProvider.family<List<Show>, String>(
  (ref, movieId) => ref.read(catalogRepoProvider).getShowtimes(movieId),
);

final seatMapProvider = FutureProvider.family<SeatMap, String>(
  (ref, showId) => ref.read(catalogRepoProvider).getSeatMap(showId),
);

final myBookingsProvider = FutureProvider<List<Booking>>((ref) => ref.read(catalogRepoProvider).myBookings());
