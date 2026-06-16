import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import 'core/auth/auth.dart';
import 'core/router.dart';
import 'core/theme.dart';

Future<void> main() async {
  WidgetsFlutterBinding.ensureInitialized();
  final container = ProviderContainer();
  // Restore a persisted session before the first frame.
  await container.read(authProvider.notifier).restore();
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
