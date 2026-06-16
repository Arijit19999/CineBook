import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';
import 'package:intl/intl.dart';

import '../../core/api_client.dart';
import '../../shared/models/models.dart';
import 'catalog_repository.dart';

class MovieDetailsScreen extends ConsumerWidget {
  final String movieId;
  const MovieDetailsScreen({super.key, required this.movieId});

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final movieFut = ref.watch(_movieProvider(movieId));
    final showsFut = ref.watch(showtimesProvider(movieId));

    return Scaffold(
      appBar: AppBar(title: const Text('Details')),
      body: movieFut.when(
        loading: () => const Center(child: CircularProgressIndicator()),
        error: (e, _) => Center(child: Text(apiErrorMessage(e))),
        data: (movie) => ListView(
          padding: const EdgeInsets.all(16),
          children: [
            Text(movie.title, style: Theme.of(context).textTheme.headlineSmall),
            const SizedBox(height: 6),
            Text('${movie.language} · ${movie.format} · ${movie.ageRating} · ${movie.runtimeMin}m',
                style: Theme.of(context).textTheme.bodyMedium),
            const SizedBox(height: 12),
            Wrap(spacing: 6, children: movie.genres.map((g) => Chip(label: Text(g))).toList()),
            const SizedBox(height: 12),
            Text(movie.description),
            if (movie.cast.isNotEmpty) ...[
              const SizedBox(height: 16),
              Text('Cast', style: Theme.of(context).textTheme.titleMedium),
              const SizedBox(height: 4),
              Text(movie.cast.join(', ')),
            ],
            const SizedBox(height: 24),
            Text('Showtimes', style: Theme.of(context).textTheme.titleMedium),
            const SizedBox(height: 8),
            showsFut.when(
              loading: () => const Center(child: Padding(padding: EdgeInsets.all(16), child: CircularProgressIndicator())),
              error: (e, _) => Text(apiErrorMessage(e)),
              data: (shows) => shows.isEmpty
                  ? const Text('No upcoming shows.')
                  : Column(children: shows.map((s) => _ShowTile(show: s)).toList()),
            ),
          ],
        ),
      ),
    );
  }
}

final _movieProvider = FutureProvider.family<Movie, String>((ref, id) => ref.read(catalogRepoProvider).getMovie(id));

class _ShowTile extends StatelessWidget {
  final Show show;
  const _ShowTile({required this.show});

  @override
  Widget build(BuildContext context) {
    final fmt = DateFormat('EEE d MMM, h:mm a');
    return Card(
      margin: const EdgeInsets.only(bottom: 8),
      child: ListTile(
        title: Text(fmt.format(show.startTime)),
        subtitle: Text('${show.theatreName} · ${show.screenType} · ₹${show.basePrice}+'),
        trailing: const Icon(Icons.chevron_right),
        onTap: () => context.push('/seats/${show.id}'),
      ),
    );
  }
}
