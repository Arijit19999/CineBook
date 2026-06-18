import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:image_picker/image_picker.dart';
import 'package:intl/intl.dart';

import '../../core/api_client.dart';
import '../../core/config.dart';
import '../customer/catalog_repository.dart';
import 'admin_repository.dart';

class AdminScreen extends ConsumerWidget {
  const AdminScreen({super.key});

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    return DefaultTabController(
      length: 4,
      child: Column(
        children: const [
          TabBar(
            isScrollable: true,
            tabs: [
              Tab(text: 'Reports'),
              Tab(text: 'Users'),
              Tab(text: 'Catalog'),
              Tab(text: 'Activity'),
            ],
          ),
          Expanded(
            child: TabBarView(
              children: [
                _ReportsTab(),
                _UsersTab(),
                _CatalogTab(),
                _ActivityTab(),
              ],
            ),
          ),
        ],
      ),
    );
  }
}

class _ReportsTab extends ConsumerWidget {
  const _ReportsTab();
  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final r = ref.watch(adminReportsProvider);
    return r.when(
      loading: () => const Center(child: CircularProgressIndicator()),
      error: (e, _) => Center(child: Text(apiErrorMessage(e))),
      data: (d) {
        final b = d['bookings'] as Map<String, dynamic>;
        final top = (d['topMovies'] as List).cast<Map<String, dynamic>>();
        return RefreshIndicator(
          onRefresh: () async => ref.refresh(adminReportsProvider.future),
          child: ListView(
            padding: const EdgeInsets.all(16),
            children: [
              Row(
                children: [
                  _stat('Net revenue', '₹${d['netRevenue']}'),
                  _stat('Occupancy', '${d['occupancyRate']}%'),
                ],
              ),
              const SizedBox(height: 12),
              Row(
                children: [
                  _stat('Confirmed', '${b['confirmed']}'),
                  _stat('Cancelled', '${b['cancelled']}'),
                  _stat('Pending', '${b['pending']}'),
                ],
              ),
              const SizedBox(height: 20),
              Text(
                'Top movies by revenue',
                style: Theme.of(context).textTheme.titleMedium,
              ),
              const SizedBox(height: 8),
              if (top.isEmpty) const Text('No confirmed bookings yet'),
              ...top.map(
                (m) => ListTile(
                  contentPadding: EdgeInsets.zero,
                  title: Text('${m['title']}'),
                  subtitle: Text('${m['bookings']} bookings'),
                  trailing: Text('₹${m['revenue']}'),
                ),
              ),
            ],
          ),
        );
      },
    );
  }

  Widget _stat(String label, String value) => Expanded(
    child: Card(
      child: Padding(
        padding: const EdgeInsets.all(14),
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            Text(
              label,
              style: const TextStyle(color: Colors.white60, fontSize: 12),
            ),
            const SizedBox(height: 4),
            Text(
              value,
              style: const TextStyle(fontSize: 20, fontWeight: FontWeight.bold),
            ),
          ],
        ),
      ),
    ),
  );
}

class _UsersTab extends ConsumerWidget {
  const _UsersTab();
  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final users = ref.watch(adminUsersProvider);
    return users.when(
      loading: () => const Center(child: CircularProgressIndicator()),
      error: (e, _) => Center(child: Text(apiErrorMessage(e))),
      data: (list) => ListView(
        padding: const EdgeInsets.all(8),
        children: list.map((u) {
          return Card(
            margin: const EdgeInsets.symmetric(vertical: 4, horizontal: 8),
            child: ListTile(
              title: Text('${u['name']}'),
              subtitle: Text('${u['phone']}'),
              trailing: DropdownButton<String>(
                value: u['role'] as String,
                items: const [
                  DropdownMenuItem(value: 'customer', child: Text('customer')),
                  DropdownMenuItem(
                    value: 'hall_manager',
                    child: Text('hall_manager'),
                  ),
                  DropdownMenuItem(value: 'admin', child: Text('admin')),
                ],
                onChanged: (role) async {
                  if (role == null) return;
                  try {
                    await ref
                        .read(adminRepoProvider)
                        .updateRole(u['id'] as String, role);
                    ref.invalidate(adminUsersProvider);
                  } catch (e) {
                    if (context.mounted)
                      ScaffoldMessenger.of(context).showSnackBar(
                        SnackBar(content: Text(apiErrorMessage(e))),
                      );
                  }
                },
              ),
            ),
          );
        }).toList(),
      ),
    );
  }
}

class _CatalogTab extends ConsumerStatefulWidget {
  const _CatalogTab();
  @override
  ConsumerState<_CatalogTab> createState() => _CatalogTabState();
}

class _CatalogTabState extends ConsumerState<_CatalogTab> {
  int _seg = 0; // 0 = Movies, 1 = Cinemas, 2 = Showtimes

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      floatingActionButton: _seg == 0
          ? FloatingActionButton.extended(
              onPressed: () => _addMovieDialog(context, ref),
              icon: const Icon(Icons.add),
              label: const Text('Movie'),
            )
          : null,
      body: Column(
        children: [
          Padding(
            padding: const EdgeInsets.all(8),
            child: SegmentedButton<int>(
              segments: const [
                ButtonSegment(value: 0, label: Text('Movies')),
                ButtonSegment(value: 1, label: Text('Cinemas')),
                ButtonSegment(value: 2, label: Text('Showtimes')),
              ],
              selected: {_seg},
              onSelectionChanged: (s) => setState(() => _seg = s.first),
            ),
          ),
          Expanded(child: _body()),
        ],
      ),
    );
  }

  Widget _body() {
    if (_seg == 1) return _cinemas();
    if (_seg == 2) return _showtimes();
    return _movies();
  }

  Widget _movies() {
    final movies = ref.watch(moviesProvider);
    return movies.when(
      loading: () => const Center(child: CircularProgressIndicator()),
      error: (e, _) => Center(child: Text(apiErrorMessage(e))),
      data: (list) => RefreshIndicator(
        onRefresh: () async => ref.refresh(moviesProvider.future),
        child: ListView(
          padding: const EdgeInsets.all(8),
          children: list
              .map((m) => ListTile(
                    title: Text(m.title),
                    subtitle: Text('${m.language} · ${m.format} · ${m.ageRating} · ${m.genres.join(", ")}'),
                  ))
              .toList(),
        ),
      ),
    );
  }

  Widget _cinemas() {
    final t = ref.watch(adminTheatresProvider);
    return t.when(
      loading: () => const Center(child: CircularProgressIndicator()),
      error: (e, _) => Center(child: Text(apiErrorMessage(e))),
      data: (list) => RefreshIndicator(
        onRefresh: () async => ref.refresh(adminTheatresProvider.future),
        child: ListView(
          padding: const EdgeInsets.all(8),
          children: list.map((th) {
            final screens = (th['screens'] as List?) ?? const [];
            final types = screens.map((s) => '${(s as Map)['screenType']}').join(', ');
            return Card(
              child: ListTile(
                leading: const Icon(Icons.location_city),
                title: Text('${th['chain']} · ${th['location']}'),
                subtitle: Text('${th['address']}\n${screens.length} screen(s): $types'),
                isThreeLine: true,
              ),
            );
          }).toList(),
        ),
      ),
    );
  }

  Widget _showtimes() {
    final sh = ref.watch(adminShowsProvider);
    return sh.when(
      loading: () => const Center(child: CircularProgressIndicator()),
      error: (e, _) => Center(child: Text(apiErrorMessage(e))),
      data: (list) => list.isEmpty
          ? const Center(child: Text('No showtimes scheduled yet'))
          : RefreshIndicator(
              onRefresh: () async => ref.refresh(adminShowsProvider.future),
              child: ListView(
                padding: const EdgeInsets.all(8),
                children: list.map((s) {
                  final movie = (s['movie'] as Map?)?['title'] ?? 'Movie';
                  final screen = s['screen'] as Map?;
                  final theatre = screen?['theatre'] as Map?;
                  final when = s['startTime'] != null
                      ? DateFormat('EEE d MMM, h:mm a').format(DateTime.parse(s['startTime'] as String).toLocal())
                      : '';
                  return ListTile(
                    leading: const Icon(Icons.schedule),
                    title: Text('$movie'),
                    subtitle: Text(
                      '${theatre?['chain'] ?? ''}, ${theatre?['location'] ?? ''} · ${screen?['screenType'] ?? ''}\n$when · ₹${s['basePrice']}',
                    ),
                    isThreeLine: true,
                  );
                }).toList(),
              ),
            ),
    );
  }

  Future<void> _addMovieDialog(BuildContext context, WidgetRef ref) async {
    final title = TextEditingController();
    final desc = TextEditingController();
    final runtime = TextEditingController(text: '120');
    final language = TextEditingController(text: 'English');
    final genres = TextEditingController(text: 'Drama');
    String age = 'UA';
    String format = 'TWO_D';
    String? posterUrl;
    bool uploading = false;

    await showDialog<void>(
      context: context,
      builder: (ctx) => StatefulBuilder(
        builder: (ctx, setState) {
          Future<void> pickAndUpload() async {
            final picked = await ImagePicker().pickImage(
              source: ImageSource.gallery,
              maxWidth: 800,
              imageQuality: 80,
            );
            if (picked == null) return;
            setState(() => uploading = true);
            try {
              final bytes = await picked.readAsBytes();
              final url = await ref
                  .read(adminRepoProvider)
                  .uploadPoster(bytes, picked.name);
              setState(() {
                posterUrl = url;
                uploading = false;
              });
            } catch (e) {
              setState(() => uploading = false);
              if (ctx.mounted)
                ScaffoldMessenger.of(
                  context,
                ).showSnackBar(SnackBar(content: Text(apiErrorMessage(e))));
            }
          }

          return AlertDialog(
            title: const Text('Add movie'),
            content: SingleChildScrollView(
              child: Column(
                mainAxisSize: MainAxisSize.min,
                children: [
                  GestureDetector(
                    onTap: uploading ? null : pickAndUpload,
                    child: Container(
                      height: 140,
                      width: double.infinity,
                      margin: const EdgeInsets.only(bottom: 8),
                      decoration: BoxDecoration(
                        color: Colors.white10,
                        borderRadius: BorderRadius.circular(8),
                      ),
                      child: uploading
                          ? const Center(child: CircularProgressIndicator())
                          : posterUrl != null
                          ? ClipRRect(
                              borderRadius: BorderRadius.circular(8),
                              child: Image.network(
                                resolveImageUrl(posterUrl)!,
                                fit: BoxFit.cover,
                                errorBuilder: (_, __, ___) =>
                                    const Icon(Icons.broken_image),
                              ),
                            )
                          : const Column(
                              mainAxisAlignment: MainAxisAlignment.center,
                              children: [
                                Icon(Icons.add_photo_alternate, size: 36),
                                SizedBox(height: 4),
                                Text('Tap to add cover image'),
                              ],
                            ),
                    ),
                  ),
                  TextField(
                    controller: title,
                    decoration: const InputDecoration(labelText: 'Title'),
                  ),
                  TextField(
                    controller: desc,
                    decoration: const InputDecoration(labelText: 'Description'),
                  ),
                  TextField(
                    controller: runtime,
                    keyboardType: TextInputType.number,
                    decoration: const InputDecoration(
                      labelText: 'Runtime (min)',
                    ),
                  ),
                  TextField(
                    controller: language,
                    decoration: const InputDecoration(labelText: 'Language'),
                  ),
                  TextField(
                    controller: genres,
                    decoration: const InputDecoration(
                      labelText: 'Genres (comma-separated)',
                    ),
                  ),
                  Row(
                    children: [
                      Expanded(
                        child: DropdownButtonFormField<String>(
                          initialValue: age,
                          decoration: const InputDecoration(
                            labelText: 'Rating',
                          ),
                          items: const [
                            DropdownMenuItem(value: 'U', child: Text('U')),
                            DropdownMenuItem(value: 'UA', child: Text('UA')),
                            DropdownMenuItem(value: 'A', child: Text('A')),
                          ],
                          onChanged: (v) => setState(() => age = v!),
                        ),
                      ),
                      const SizedBox(width: 12),
                      Expanded(
                        child: DropdownButtonFormField<String>(
                          initialValue: format,
                          decoration: const InputDecoration(
                            labelText: 'Format',
                          ),
                          items: const [
                            DropdownMenuItem(value: 'TWO_D', child: Text('2D')),
                            DropdownMenuItem(
                              value: 'THREE_D',
                              child: Text('3D'),
                            ),
                          ],
                          onChanged: (v) => setState(() => format = v!),
                        ),
                      ),
                    ],
                  ),
                ],
              ),
            ),
            actions: [
              TextButton(
                onPressed: () => Navigator.pop(ctx),
                child: const Text('Cancel'),
              ),
              FilledButton(
                onPressed: () async {
                  try {
                    await ref.read(adminRepoProvider).createMovie({
                      'title': title.text.trim(),
                      'description': desc.text.trim(),
                      'runtimeMin': int.tryParse(runtime.text) ?? 120,
                      'language': language.text.trim(),
                      'ageRating': age,
                      'format': format,
                      'genres': genres.text
                          .split(',')
                          .map((g) => g.trim())
                          .where((g) => g.isNotEmpty)
                          .toList(),
                      if (posterUrl != null) 'posterUrl': posterUrl,
                    });
                    ref.invalidate(moviesProvider);
                    if (ctx.mounted) Navigator.pop(ctx);
                  } catch (e) {
                    if (ctx.mounted)
                      ScaffoldMessenger.of(context).showSnackBar(
                        SnackBar(content: Text(apiErrorMessage(e))),
                      );
                  }
                },
                child: const Text('Create'),
              ),
            ],
          );
        },
      ),
    );
  }
}

class _ActivityTab extends ConsumerWidget {
  const _ActivityTab();
  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final activity = ref.watch(adminActivityProvider);
    return activity.when(
      loading: () => const Center(child: CircularProgressIndicator()),
      error: (e, _) => Center(child: Text(apiErrorMessage(e))),
      data: (list) => RefreshIndicator(
        onRefresh: () async => ref.refresh(adminActivityProvider.future),
        child: ListView.separated(
          padding: const EdgeInsets.all(8),
          itemCount: list.length,
          separatorBuilder: (_, _) => const Divider(height: 1),
          itemBuilder: (_, i) {
            final a = list[i];
            final ok = a['success'] == true;
            final ts = a['createdAt'] != null
                ? DateFormat(
                    'd MMM h:mm:ss a',
                  ).format(DateTime.parse(a['createdAt'] as String).toLocal())
                : '';
            return ListTile(
              dense: true,
              leading: Icon(
                ok ? Icons.check_circle : Icons.error,
                color: ok ? Colors.green : Colors.redAccent,
                size: 18,
              ),
              title: Text('${a['action']}'),
              subtitle: Text(
                '${a['source']} · ${a['durationMs'] ?? '-'}ms · $ts',
              ),
            );
          },
        ),
      ),
    );
  }
}
