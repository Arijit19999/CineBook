import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import 'core/auth/auth.dart';
import 'core/router.dart';
import 'core/theme.dart';

Future<void> main() async {
  WidgetsFlutterBinding.ensureInitialized();
  final container = ProviderContainer();
  // Restore a persisted session before the first frame — but never let a slow or
  // failing secure-storage read block app startup.
  try {
    await container.read(authProvider.notifier).restore().timeout(const Duration(seconds: 3));
  } catch (_) {}
  runApp(UncontrolledProviderScope(container: container, child: const CineBookApp()));
}

class CineBookApp extends ConsumerWidget {
  const CineBookApp({super.key});

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final router = ref.watch(routerProvider);
    return MaterialApp.router(
      title: 'CineBook',
      debugShowCheckedModeBanner: false,
      theme: cineTheme,
      routerConfig: router,
    );
  }
}
