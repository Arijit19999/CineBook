import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../../core/api_client.dart';
import 'catalog_repository.dart';
import 'chat_repository.dart';

enum ItemKind { user, assistant, activity }

class ChatItem {
  final ItemKind kind;
  String text;
  ChatItem(this.kind, this.text);
}

class ChatScreen extends ConsumerStatefulWidget {
  const ChatScreen({super.key});
  @override
  ConsumerState<ChatScreen> createState() => _ChatScreenState();
}

class _ChatScreenState extends ConsumerState<ChatScreen> {
  final _input = TextEditingController();
  final _scroll = ScrollController();
  final List<ChatItem> _items = [];
  String? _sessionId;
  bool _streaming = false;

  @override
  void dispose() {
    _input.dispose();
    _scroll.dispose();
    super.dispose();
  }

  // Clean stray markup so assistant text renders nicely in a plain-text bubble.
  String _clean(String s) => s
      .replaceAll(RegExp(r'<br\s*/?>', caseSensitive: false), '\n')
      .replaceAll('**', '')
      .replaceAll('__', '')
      .trim();

  void _scrollDown() {
    WidgetsBinding.instance.addPostFrameCallback((_) {
      if (_scroll.hasClients) _scroll.animateTo(_scroll.position.maxScrollExtent, duration: const Duration(milliseconds: 200), curve: Curves.easeOut);
    });
  }

  Future<void> _send() async {
    final text = _input.text.trim();
    if (text.isEmpty || _streaming) return;
    _input.clear();
    setState(() {
      _items.add(ChatItem(ItemKind.user, text));
      _streaming = true;
    });
    _scrollDown();

    try {
      await for (final ev in ref.read(chatRepoProvider).sendMessage(text, _sessionId)) {
        setState(() {
          switch (ev.type) {
            case 'session':
              _sessionId = ev.data['sessionId'] as String?;
              break;
            case 'tool':
              final agent = ev.data['agent'] == 'booking' ? '↳ ' : '';
              _items.add(ChatItem(ItemKind.activity, '$agent🔧 ${ev.data['name']}'));
              break;
            case 'delegate':
              _items.add(ChatItem(ItemKind.activity, '⇒ delegating to booking assistant…'));
              break;
            case 'message':
              _items.add(ChatItem(ItemKind.assistant, _clean('${ev.data['text']}')));
              break;
            case 'error':
              _items.add(ChatItem(ItemKind.assistant, '⚠️ ${ev.data['error']}'));
              break;
          }
        });
        _scrollDown();
      }
    } catch (e) {
      setState(() => _items.add(ChatItem(ItemKind.assistant, '⚠️ ${apiErrorMessage(e)}')));
    } finally {
      if (mounted) setState(() => _streaming = false);
      // The agent may have booked/held/cancelled — refresh those views so the
      // Bookings tab and any seat maps reflect chat actions.
      ref.invalidate(myBookingsProvider);
      ref.invalidate(seatMapProvider);
      _scrollDown();
    }
  }

  @override
  Widget build(BuildContext context) {
    return Column(
      children: [
        Expanded(
          child: _items.isEmpty
              ? const _EmptyChat()
              : ListView.builder(
                  controller: _scroll,
                  padding: const EdgeInsets.all(12),
                  itemCount: _items.length,
                  itemBuilder: (_, i) => _bubble(_items[i]),
                ),
        ),
        if (_streaming) const LinearProgressIndicator(minHeight: 2),
        SafeArea(
          top: false,
          child: Padding(
            padding: const EdgeInsets.all(8),
            child: Row(
              children: [
                Expanded(
                  child: TextField(
                    controller: _input,
                    onSubmitted: (_) => _send(),
                    decoration: const InputDecoration(hintText: 'Ask CineBook to find or book a movie…'),
                  ),
                ),
                const SizedBox(width: 8),
                IconButton.filled(onPressed: _streaming ? null : _send, icon: const Icon(Icons.send)),
              ],
            ),
          ),
        ),
      ],
    );
  }

  Widget _bubble(ChatItem item) {
    if (item.kind == ItemKind.activity) {
      return Padding(
        padding: const EdgeInsets.symmetric(vertical: 2, horizontal: 8),
        child: Text(item.text, style: const TextStyle(color: Colors.white38, fontSize: 12, fontFamily: 'monospace')),
      );
    }
    final isUser = item.kind == ItemKind.user;
    return Align(
      alignment: isUser ? Alignment.centerRight : Alignment.centerLeft,
      child: Container(
        margin: const EdgeInsets.symmetric(vertical: 4),
        padding: const EdgeInsets.symmetric(horizontal: 14, vertical: 10),
        constraints: BoxConstraints(maxWidth: MediaQuery.of(context).size.width * 0.78),
        decoration: BoxDecoration(
          color: isUser ? const Color(0xFFE50914) : const Color(0xFF1A1A22),
          borderRadius: BorderRadius.circular(14),
        ),
        child: Text(item.text),
      ),
    );
  }
}

class _EmptyChat extends StatelessWidget {
  const _EmptyChat();
  @override
  Widget build(BuildContext context) {
    return Center(
      child: Padding(
        padding: const EdgeInsets.all(24),
        child: Column(
          mainAxisSize: MainAxisSize.min,
          children: [
            const Icon(Icons.smart_toy_outlined, size: 64, color: Colors.white24),
            const SizedBox(height: 12),
            Text('Your AI booking assistant', style: Theme.of(context).textTheme.titleMedium),
            const SizedBox(height: 8),
            const Text(
              'Try: "Find a sci-fi movie with an evening show near Koramangala, hold 2 recliner seats, apply WELCOME10, and book it."',
              textAlign: TextAlign.center,
              style: TextStyle(color: Colors.white54),
            ),
          ],
        ),
      ),
    );
  }
}
