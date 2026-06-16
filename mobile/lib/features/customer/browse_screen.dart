import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';

import '../../shared/models/models.dart';
import 'catalog_repository.dart';

class BrowseScreen extends ConsumerWidget {
  const BrowseScreen({super.key});

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final movies = ref.watch(moviesProvider);
    final genres = ref.watch(genresProvider);
    final filter = ref.watch(movieFilterProvider);

    return Column(
      children: [
        Padding(
          padding: const EdgeInsets.fromLTRB(16, 12, 16, 8),
          child: TextField(
            decoration: const InputDecoration(hintText: 'Search movies', prefixIcon: Icon(Icons.search)),
            onChanged: (v) => ref.read(movieFilterProvider.notifier).setQuery(v),
          ),
        ),
        SizedBox(
          height: 44,
          child: genres.maybeWhen(
            data: (list) => ListView(
              scrollDirection: Axis.horizontal,
              padding: const EdgeInsets.symmetric(horizontal: 12),
              children: [
                _genreChip(ref, 'All', filter.genre == null, () => ref.read(movieFilterProvider.notifier).setGenre(null)),
                for (final g in list)
                  _genreChip(ref, g, filter.genre == g, () => ref.read(movieFilterProvider.notifier).setGenre(g)),
              ],
            ),
            orElse: () => const SizedBox.shrink(),
          ),
        ),
        Expanded(
          child: movies.when(
            data: (list) => list.isEmpty
                ? const Center(child: Text('No movies match your filters'))
                : RefreshIndicator(
                    onRefresh: () async => ref.refresh(moviesProvider.future),
                    child: ListView.separated(
                      padding: const EdgeInsets.all(16),
                      itemCount: list.length,
                      separatorBuilder: (_, __) => const SizedBox(height: 12),
                      itemBuilder: (_, i) => _MovieCard(movie: list[i]),
                    ),
                  ),
            loading: () => const Center(child: CircularProgressIndicator()),
            error: (e, _) => Center(child: Text('Error: $e')),
          ),
        ),
      ],
    );
  }

  Widget _genreChip(WidgetRef ref, String label, bool selected, VoidCallback onTap) => Padding(
        padding: const EdgeInsets.symmetric(horizontal: 4),
        child: ChoiceChip(label: Text(label), selected: selected, onSelected: (_) => onTap()),
      );
}

class _MovieCard extends StatelessWidget {
  final Movie movie;
  const _MovieCard({required this.movie});

  @override
  Widget build(BuildContext context) {
    return Card(
      child: InkWell(
        borderRadius: BorderRadius.circular(12),
        onTap: () => context.push('/movie/${movie.id}'),
        child: Padding(
          padding: const EdgeInsets.all(12),
          child: Row(
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              ClipRRect(
                borderRadius: BorderRadius.circular(8),
                child: Container(
                  width: 64,
                  height: 92,
                  color: Colors.black26,
                  child: movie.posterUrl != null
                      ? Image.network(movie.posterUrl!, fit: BoxFit.cover, errorBuilder: (_, __, ___) => const Icon(Icons.movie))
                      : const Icon(Icons.movie),
                ),
              ),
              const SizedBox(width: 12),
              Expanded(
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    Text(movie.title, style: Theme.of(context).textTheme.titleMedium),
                    const SizedBox(height: 4),
                    Text('${movie.language} · ${movie.format} · ${movie.ageRating} · ${movie.runtimeMin}m',
                        style: Theme.of(context).textTheme.bodySmall),
                    const SizedBox(height: 6),
                    Wrap(
                      spacing: 6,
                      runSpacing: 4,
                      children: movie.genres
                          .take(3)
                          .map((g) => Chip(
                                label: Text(g, style: const TextStyle(fontSize: 11)),
                                visualDensity: VisualDensity.compact,
                                materialTapTargetSize: MaterialTapTargetSize.shrinkWrap,
                              ))
                          .toList(),
                    ),
                  ],
                ),
              ),
            ],
          ),
        ),
      ),
    );
  }
}
