import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:intl/intl.dart';

import '../../core/api_client.dart';
import '../../shared/models/models.dart';
import '../customer/catalog_repository.dart';
import 'manager_repository.dart';

class ManagerScreen extends ConsumerWidget {
  const ManagerScreen({super.key});

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final screens = ref.watch(assignedScreensProvider);
    return screens.when(
      loading: () => const Center(child: CircularProgressIndicator()),
      error: (e, _) => Center(child: Text(apiErrorMessage(e))),
      data: (ids) => ids.isEmpty
          ? const Center(child: Text('No screens assigned to you'))
          : ListView(
              padding: const EdgeInsets.all(12),
              children: ids.map((id) => _ScreenSection(screenId: id)).toList(),
            ),
    );
  }
}

class _ScreenSection extends ConsumerWidget {
  final String screenId;
  const _ScreenSection({required this.screenId});

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final info = ref.watch(screenInfoProvider(screenId));
    final shows = ref.watch(managerShowsProvider(screenId));
    final title = info.maybeWhen(
      data: (d) {
        final t = d['theatre'] as Map<String, dynamic>?;
        return '${d['type']} · ${t?['chain']} ${t?['location']}';
      },
      orElse: () => 'Screen',
    );

    return Card(
      margin: const EdgeInsets.only(bottom: 12),
      child: Padding(
        padding: const EdgeInsets.all(12),
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            Row(
              children: [
                Expanded(child: Text(title, style: Theme.of(context).textTheme.titleMedium)),
                FilledButton.icon(
                  style: FilledButton.styleFrom(minimumSize: const Size(0, 36)),
                  onPressed: () => _addShowDialog(context, ref, screenId),
                  icon: const Icon(Icons.add, size: 18),
                  label: const Text('Add show'),
                ),
              ],
            ),
            const Divider(),
            shows.when(
              loading: () => const Padding(padding: EdgeInsets.all(8), child: LinearProgressIndicator()),
              error: (e, _) => Text(apiErrorMessage(e)),
              data: (list) => list.isEmpty
                  ? const Padding(padding: EdgeInsets.all(8), child: Text('No shows scheduled'))
                  : Column(
                      children: list.map((s) {
                        return ListTile(
                          dense: true,
                          contentPadding: EdgeInsets.zero,
                          title: Text(s.movieTitle ?? 'Show'),
                          subtitle: Text('${DateFormat('EEE d MMM, h:mm a').format(s.startTime)} · ₹${s.basePrice}'),
                          trailing: IconButton(
                            icon: const Icon(Icons.delete_outline, color: Colors.redAccent),
                            onPressed: () => _delete(context, ref, s.id),
                          ),
                        );
                      }).toList(),
                    ),
            ),
          ],
        ),
      ),
    );
  }

  Future<void> _delete(BuildContext context, WidgetRef ref, String id) async {
    try {
      await ref.read(managerRepoProvider).deleteShow(id);
      ref.invalidate(managerShowsProvider(screenId));
    } catch (e) {
      if (context.mounted) ScaffoldMessenger.of(context).showSnackBar(SnackBar(content: Text(apiErrorMessage(e))));
    }
  }

  Future<void> _addShowDialog(BuildContext context, WidgetRef ref, String screenId) async {
    final movies = await ref.read(catalogRepoProvider).listMovies();
    if (!context.mounted) return;
    Movie? selected = movies.isNotEmpty ? movies.first : null;
    DateTime when = DateTime.now().add(const Duration(days: 1, hours: 1));
    final priceCtrl = TextEditingController(text: '250');

    await showDialog<void>(
      context: context,
      builder: (ctx) => StatefulBuilder(
        builder: (ctx, setState) => AlertDialog(
          title: const Text('Schedule a show'),
          content: SingleChildScrollView(
            child: Column(
              mainAxisSize: MainAxisSize.min,
              children: [
                DropdownButtonFormField<Movie>(
                  initialValue: selected,
                  isExpanded: true,
                  decoration: const InputDecoration(labelText: 'Movie'),
                  items: movies.map((m) => DropdownMenuItem(value: m, child: Text(m.title, overflow: TextOverflow.ellipsis))).toList(),
                  onChanged: (m) => setState(() => selected = m),
                ),
                const SizedBox(height: 12),
                ListTile(
                  contentPadding: EdgeInsets.zero,
                  title: const Text('Start time'),
                  subtitle: Text(DateFormat('EEE d MMM, h:mm a').format(when)),
                  trailing: const Icon(Icons.edit_calendar),
                  onTap: () async {
                    final d = await showDatePicker(
                      context: ctx,
                      initialDate: when,
                      firstDate: DateTime.now(),
                      lastDate: DateTime.now().add(const Duration(days: 30)),
                    );
                    if (d == null || !ctx.mounted) return;
                    final t = await showTimePicker(context: ctx, initialTime: TimeOfDay.fromDateTime(when));
                    if (t == null) return;
                    setState(() => when = DateTime(d.year, d.month, d.day, t.hour, t.minute));
                  },
                ),
                TextField(
                  controller: priceCtrl,
                  keyboardType: TextInputType.number,
                  decoration: const InputDecoration(labelText: 'Base price (₹)'),
                ),
              ],
            ),
          ),
          actions: [
            TextButton(onPressed: () => Navigator.pop(ctx), child: const Text('Cancel')),
            FilledButton(
              onPressed: () async {
                if (selected == null) return;
                try {
                  await ref.read(managerRepoProvider).createShow(
                        movieId: selected!.id,
                        screenId: screenId,
                        startTime: when,
                        basePrice: int.tryParse(priceCtrl.text) ?? 250,
                      );
                  ref.invalidate(managerShowsProvider(screenId));
                  if (ctx.mounted) Navigator.pop(ctx);
                } catch (e) {
                  // Surface the server's specific scheduling error (overlap, 30-day, gap…)
                  if (ctx.mounted) {
                    ScaffoldMessenger.of(context).showSnackBar(SnackBar(content: Text(apiErrorMessage(e))));
                  }
                }
              },
              child: const Text('Create'),
            ),
          ],
        ),
      ),
    );
  }
}
