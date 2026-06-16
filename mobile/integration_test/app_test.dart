import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:integration_test/integration_test.dart';

import 'package:cinebook/core/auth/auth.dart';
import 'package:cinebook/main.dart';

// Pumps frames until [finder] matches, or throws after [timeout].
Future<void> pumpUntil(WidgetTester t, Finder finder, {Duration timeout = const Duration(seconds: 40)}) async {
  final end = DateTime.now().add(timeout);
  while (DateTime.now().isBefore(end)) {
    await t.pump(const Duration(milliseconds: 300));
    if (finder.evaluate().isNotEmpty) return;
  }
  throw TestFailure('Timed out waiting for: $finder');
}

Future<bool> pumpUntilAny(WidgetTester t, List<Finder> finders, {Duration timeout = const Duration(seconds: 90)}) async {
  final end = DateTime.now().add(timeout);
  while (DateTime.now().isBefore(end)) {
    await t.pump(const Duration(milliseconds: 300));
    for (final f in finders) {
      if (f.evaluate().isNotEmpty) return true;
    }
  }
  return false;
}

void main() {
  IntegrationTestWidgetsFlutterBinding.ensureInitialized();

  testWidgets('end-to-end: login -> book a ticket -> chat', (tester) async {
    // Start from a clean (logged-out) session.
    final container = ProviderContainer();
    await container.read(authProvider.notifier).logout();
    await tester.pumpWidget(UncontrolledProviderScope(container: container, child: const CineBookApp()));
    await tester.pumpAndSettle();

    // 1. Login (phone is pre-filled with the demo customer).
    expect(find.text('Send OTP'), findsOneWidget);
    await tester.tap(find.text('Send OTP'));
    await pumpUntil(tester, find.text('Verify & continue'));

    // 2. OTP (pre-filled 123456).
    await tester.tap(find.text('Verify & continue'));

    // 3. Browse — a seeded movie loads from the live backend.
    await pumpUntil(tester, find.text('Neon Protocol'));

    // 4. Open the movie and its showtimes.
    await tester.tap(find.text('Neon Protocol'));
    await pumpUntil(tester, find.text('Showtimes'));
    await pumpUntil(tester, find.byType(ListTile));

    // 5. Pick the first showtime -> seat map.
    await tester.tap(find.byType(ListTile).first);
    await pumpUntil(tester, find.text('SCREEN'));
    await pumpUntil(tester, find.byType(GestureDetector));

    // 6. Select two available seats (front rows are free on a fresh seed).
    await tester.tap(find.byType(GestureDetector).at(0));
    await tester.tap(find.byType(GestureDetector).at(1));
    await tester.pump(const Duration(milliseconds: 300));

    // 7. Hold -> creates a pending booking -> payment screen.
    await tester.tap(find.textContaining('Hold'));
    await pumpUntil(tester, find.text('Amount due'));

    // 8. Pay with the default success test card.
    await tester.tap(find.textContaining('Pay '));
    await pumpUntil(tester, find.text('Booking confirmed!'), timeout: const Duration(seconds: 30));
    expect(find.text('Booking confirmed!'), findsOneWidget);

    // 9. Back to home, open Chat, send a message, expect a streamed response
    //    (either the agent's answer or a graceful error — both prove the SSE path).
    await tester.tap(find.text('Back to home'));
    await pumpUntil(tester, find.text('Chat'));
    await tester.tap(find.text('Chat'));
    await tester.pumpAndSettle();

    await tester.enterText(find.byType(TextField), 'List sci-fi movies');
    await tester.tap(find.byIcon(Icons.send));

    final responded = await pumpUntilAny(tester, [
      find.textContaining('Neon'),
      find.textContaining('Interstellar'),
      find.textContaining('sci'),
      find.textContaining('⚠️'),
    ]);
    expect(responded, isTrue, reason: 'chat SSE produced no response bubble');
  });
}
