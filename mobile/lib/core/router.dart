import 'package:flutter/foundation.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';

import '../features/auth/login_screen.dart';
import '../features/auth/otp_screen.dart';
import '../features/customer/movie_details_screen.dart';
import '../features/customer/payment_screen.dart';
import '../features/customer/seat_map_screen.dart';
import '../features/shell/home_shell.dart';
import 'auth/auth.dart';

// Bridges the auth provider to a Listenable so GoRouter re-evaluates redirects
// whenever login state changes.
class _AuthRefresh extends ChangeNotifier {
  _AuthRefresh(Ref ref) {
    ref.listen(authProvider, (_, __) => notifyListeners());
  }
}

final routerProvider = Provider<GoRouter>((ref) {
  return GoRouter(
    initialLocation: '/',
    refreshListenable: _AuthRefresh(ref),
    redirect: (context, state) {
      final loggedIn = ref.read(authProvider).isLoggedIn;
      final loc = state.matchedLocation;
      final authFlow = loc == '/login' || loc == '/otp';
      if (!loggedIn) return authFlow ? null : '/login';
      if (loggedIn && loc == '/login') return '/';
      return null;
    },
    routes: [
      GoRoute(path: '/login', builder: (_, __) => const LoginScreen()),
      GoRoute(path: '/otp', builder: (_, s) => OtpScreen(phone: s.extra as String? ?? '')),
      GoRoute(path: '/', builder: (_, __) => const HomeShell()),
      GoRoute(path: '/movie/:id', builder: (_, s) => MovieDetailsScreen(movieId: s.pathParameters['id']!)),
      GoRoute(path: '/seats/:showId', builder: (_, s) => SeatMapScreen(showId: s.pathParameters['showId']!)),
      GoRoute(
        path: '/payment/:bookingId',
        builder: (_, s) => PaymentScreen(bookingId: s.pathParameters['bookingId']!, amount: s.extra as int? ?? 0),
      ),
      GoRoute(
        path: '/confirmed',
        builder: (_, s) {
          final m = (s.extra as Map?) ?? const {};
          return ConfirmedScreen(txn: m['txn'] as String?, amount: m['amount'] as int?);
        },
      ),
    ],
  );
});
