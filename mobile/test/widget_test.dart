import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:flutter_test/flutter_test.dart';

import 'package:cinebook/main.dart';

void main() {
  testWidgets('App boots to the login screen when unauthenticated', (tester) async {
    await tester.pumpWidget(const ProviderScope(child: CineBookApp()));
    await tester.pump();
    expect(find.text('CineBook'), findsWidgets);
    expect(find.text('Send OTP'), findsOneWidget);
  });
}
