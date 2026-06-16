import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:intl/intl.dart';

import '../../core/api_client.dart';
import 'catalog_repository.dart';

class BookingsScreen extends ConsumerWidget {
  const BookingsScreen({super.key});

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final bookings = ref.watch(myBookingsProvider);
    return bookings.when(
      loading: () => const Center(child: CircularProgressIndicator()),
      error: (e, _) => Center(child: Text(apiErrorMessage(e))),
      data: (list) => list.isEmpty
          ? const Center(child: Text('No bookings yet'))
          : RefreshIndicator(
              onRefresh: () async => ref.refresh(myBookingsProvider.future),
              child: ListView.separated(
                padding: const EdgeInsets.all(16),
                itemCount: list.length,
                separatorBuilder: (_, __) => const SizedBox(height: 10),
                itemBuilder: (_, i) {
                  final b = list[i];
                  final cancellable = b.status == 'confirmed' || b.status == 'pending';
                  return Card(
                    child: ListTile(
                      title: Text(b.movieTitle ?? 'Booking'),
                      subtitle: Text([
                        if (b.startTime != null) DateFormat('EEE d MMM, h:mm a').format(b.startTime!),
                        'Seats: ${b.seats.join(', ')}',
                        '₹${b.totalCost} · ${b.status}',
                      ].join('\n')),
                      isThreeLine: true,
                      trailing: cancellable
                          ? TextButton(
                              onPressed: () async {
                                try {
                                  await ref.read(catalogRepoProvider).cancelBooking(b.id);
                                  ref.invalidate(myBookingsProvider);
                                } catch (e) {
                                  if (context.mounted) {
                                    ScaffoldMessenger.of(context).showSnackBar(SnackBar(content: Text(apiErrorMessage(e))));
                                  }
                                }
                              },
                              child: const Text('Cancel'),
                            )
                          : null,
                    ),
                  );
                },
              ),
            ),
    );
  }
}
