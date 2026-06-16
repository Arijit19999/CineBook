// Lightweight data models with fromJson parsing for the CineBook API.

int _toInt(dynamic v) => v is int ? v : int.tryParse('$v') ?? 0;

class Movie {
  final String id;
  final String title;
  final String description;
  final int runtimeMin;
  final String language;
  final String ageRating;
  final String format; // "2D"/"3D" or raw enum
  final List<String> genres;
  final List<String> cast;
  final String? posterUrl;

  Movie({
    required this.id,
    required this.title,
    required this.description,
    required this.runtimeMin,
    required this.language,
    required this.ageRating,
    required this.format,
    required this.genres,
    required this.cast,
    this.posterUrl,
  });

  factory Movie.fromJson(Map<String, dynamic> j) {
    final genres = (j['genres'] as List?) ?? const [];
    return Movie(
      id: j['id'] as String,
      title: j['title'] as String? ?? 'Untitled',
      description: j['description'] as String? ?? '',
      runtimeMin: _toInt(j['runtimeMin']),
      language: j['language'] as String? ?? '',
      ageRating: j['ageRating'] as String? ?? '',
      format: _normalizeFormat(j['format'] as String?),
      genres: genres.map((g) => g is String ? g : (g['name'] as String? ?? '')).toList(),
      cast: ((j['cast'] as List?) ?? const []).map((c) => '$c').toList(),
      posterUrl: j['posterUrl'] as String?,
    );
  }

  static String _normalizeFormat(String? f) {
    if (f == 'TWO_D') return '2D';
    if (f == 'THREE_D') return '3D';
    return f ?? '2D';
  }
}

class Show {
  final String id;
  final DateTime startTime;
  final DateTime? endTime;
  final int basePrice;
  final String screenType;
  final String theatreName;
  final String? movieTitle;

  Show({
    required this.id,
    required this.startTime,
    this.endTime,
    required this.basePrice,
    required this.screenType,
    required this.theatreName,
    this.movieTitle,
  });

  factory Show.fromJson(Map<String, dynamic> j) {
    final screen = j['screen'] as Map<String, dynamic>?;
    final theatre = screen?['theatre'] as Map<String, dynamic>?;
    return Show(
      id: j['id'] as String,
      startTime: DateTime.parse(j['startTime'] as String).toLocal(),
      endTime: j['endTime'] != null ? DateTime.parse(j['endTime'] as String).toLocal() : null,
      basePrice: _toInt(j['basePrice']),
      screenType: screen?['screenType'] as String? ?? '',
      theatreName: theatre != null ? '${theatre['chain']}, ${theatre['location']}' : '',
      movieTitle: (j['movie'] as Map<String, dynamic>?)?['title'] as String?,
    );
  }
}

class SeatInfo {
  final String id;
  final String row;
  final int number;
  final String category;
  final int price;
  final String status; // available | held | held_by_you | booked

  SeatInfo({
    required this.id,
    required this.row,
    required this.number,
    required this.category,
    required this.price,
    required this.status,
  });

  String get label => '$row$number';
  bool get isFree => status == 'available' || status == 'held_by_you';

  factory SeatInfo.fromJson(Map<String, dynamic> j) => SeatInfo(
        id: j['id'] as String,
        row: j['row'] as String,
        number: _toInt(j['number']),
        category: j['category'] as String? ?? 'Standard',
        price: _toInt(j['price']),
        status: j['status'] as String? ?? 'available',
      );
}

class SeatMap {
  final String showId;
  final String screenType;
  final int capacity;
  final List<SeatInfo> seats;

  SeatMap({required this.showId, required this.screenType, required this.capacity, required this.seats});

  factory SeatMap.fromJson(Map<String, dynamic> j) => SeatMap(
        showId: j['showId'] as String,
        screenType: (j['screen'] as Map<String, dynamic>?)?['type'] as String? ?? '',
        capacity: _toInt((j['screen'] as Map<String, dynamic>?)?['capacity']),
        seats: ((j['seats'] as List?) ?? const []).map((s) => SeatInfo.fromJson(s as Map<String, dynamic>)).toList(),
      );
}

class Booking {
  final String id;
  final String status;
  final int totalCost;
  final String? movieTitle;
  final DateTime? startTime;
  final List<String> seats;
  final String? paymentStatus;

  Booking({
    required this.id,
    required this.status,
    required this.totalCost,
    this.movieTitle,
    this.startTime,
    required this.seats,
    this.paymentStatus,
  });

  factory Booking.fromJson(Map<String, dynamic> j) {
    final show = j['show'] as Map<String, dynamic>?;
    final movie = show?['movie'] as Map<String, dynamic>?;
    final seats = (j['seats'] as List?) ?? const [];
    return Booking(
      id: j['id'] as String,
      status: j['status'] as String? ?? 'pending',
      totalCost: _toInt(j['totalCost']),
      movieTitle: movie?['title'] as String?,
      startTime: show?['startTime'] != null ? DateTime.parse(show!['startTime'] as String).toLocal() : null,
      seats: seats.map((s) {
        if (s is Map && s['seat'] is Map) return '${s['seat']['row']}${s['seat']['number']}';
        return '$s';
      }).toList(),
      paymentStatus: (j['payment'] as Map<String, dynamic>?)?['status'] as String?,
    );
  }
}
