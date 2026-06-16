import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';

import '../../core/api_client.dart';
import '../../shared/models/models.dart';
import 'catalog_repository.dart';

class SeatMapScreen extends ConsumerStatefulWidget {
  final String showId;
  const SeatMapScreen({super.key, required this.showId});
  @override
  ConsumerState<SeatMapScreen> createState() => _SeatMapScreenState();
}

class _SeatMapScreenState extends ConsumerState<SeatMapScreen> {
  final Set<String> _selected = {};
  bool _busy = false;

  Color _color(SeatInfo s) {
    if (s.status == 'booked') return Colors.grey.shade800;
    if (s.status == 'held') return Colors.orange.shade900;
    if (_selected.contains(s.id)) return const Color(0xFFE50914);
    return const Color(0xFF2A2A35);
  }

  Future<void> _proceed(SeatMap map) async {
    setState(() => _busy = true);
    try {
      final ids = _selected.toList();
      await ref.read(catalogRepoProvider).holdSeats(widget.showId, ids);
      final booking = await ref.read(catalogRepoProvider).createBooking(widget.showId, ids);
      if (mounted) context.push('/payment/${booking.id}', extra: booking.totalCost);
    } catch (e) {
      if (mounted) {
        ScaffoldMessenger.of(context).showSnackBar(SnackBar(content: Text(apiErrorMessage(e))));
        ref.invalidate(seatMapProvider(widget.showId));
        setState(() => _selected.clear());
      }
    } finally {
      if (mounted) setState(() => _busy = false);
    }
  }

  @override
  Widget build(BuildContext context) {
    final mapFut = ref.watch(seatMapProvider(widget.showId));
    return Scaffold(
      appBar: AppBar(title: const Text('Select seats')),
      body: mapFut.when(
        loading: () => const Center(child: CircularProgressIndicator()),
        error: (e, _) => Center(child: Text(apiErrorMessage(e))),
        data: (map) {
          final rows = <String, List<SeatInfo>>{};
          for (final s in map.seats) {
            rows.putIfAbsent(s.row, () => []).add(s);
          }
          final total = map.seats.where((s) => _selected.contains(s.id)).fold<int>(0, (a, s) => a + s.price);
          return Column(
            children: [
              const SizedBox(height: 12),
              Container(
                margin: const EdgeInsets.symmetric(horizontal: 40),
                padding: const EdgeInsets.all(6),
                decoration: BoxDecoration(color: Colors.white12, borderRadius: BorderRadius.circular(6)),
                child: const Text('SCREEN', textAlign: TextAlign.center, style: TextStyle(letterSpacing: 4, fontSize: 12)),
              ),
              Expanded(
                child: SingleChildScrollView(
                  padding: const EdgeInsets.all(12),
                  child: Column(
                    children: rows.entries.map((e) {
                      return Padding(
                        padding: const EdgeInsets.symmetric(vertical: 3),
                        child: Row(
                          mainAxisAlignment: MainAxisAlignment.center,
                          children: [
                            SizedBox(width: 18, child: Text(e.key, style: const TextStyle(color: Colors.white54))),
                            ...e.value.map((s) => GestureDetector(
                                  onTap: s.status == 'booked' || s.status == 'held'
                                      ? null
                                      : () => setState(() => _selected.contains(s.id) ? _selected.remove(s.id) : _selected.add(s.id)),
                                  child: Container(
                                    width: 26,
                                    height: 26,
                                    margin: const EdgeInsets.all(2),
                                    decoration: BoxDecoration(color: _color(s), borderRadius: BorderRadius.circular(5)),
                                    child: Center(child: Text('${s.number}', style: const TextStyle(fontSize: 10))),
                                  ),
                                )),
                          ],
                        ),
                      );
                    }).toList(),
                  ),
                ),
              ),
              _legend(),
              SafeArea(
                child: Padding(
                  padding: const EdgeInsets.all(16),
                  child: FilledButton(
                    onPressed: _selected.isEmpty || _busy ? null : () => _proceed(map),
                    child: _busy
                        ? const SizedBox(height: 22, width: 22, child: CircularProgressIndicator(strokeWidth: 2))
                        : Text('Hold ${_selected.length} seat(s) · ₹$total'),
                  ),
                ),
              ),
            ],
          );
        },
      ),
    );
  }

  Widget _legend() => Padding(
        padding: const EdgeInsets.symmetric(horizontal: 16),
        child: Wrap(
          spacing: 16,
          children: const [
            _Legend(color: Color(0xFF2A2A35), label: 'Available'),
            _Legend(color: Color(0xFFE50914), label: 'Selected'),
            _Legend(color: Colors.orange, label: 'Held'),
            _Legend(color: Colors.grey, label: 'Booked'),
          ],
        ),
      );
}

class _Legend extends StatelessWidget {
  final Color color;
  final String label;
  const _Legend({required this.color, required this.label});
  @override
  Widget build(BuildContext context) => Row(
        mainAxisSize: MainAxisSize.min,
        children: [
          Container(width: 14, height: 14, decoration: BoxDecoration(color: color, borderRadius: BorderRadius.circular(3))),
          const SizedBox(width: 4),
          Text(label, style: const TextStyle(fontSize: 12)),
        ],
      );
}
