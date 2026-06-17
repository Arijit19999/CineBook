import 'dart:convert';

import 'package:dio/dio.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../../core/api_client.dart';

class ChatEvent {
  final String type; // session | tool | tool_result | delegate | delegate_done | state | message | done | error
  final Map<String, dynamic> data;
  ChatEvent(this.type, this.data);
}

class ChatRepository {
  final Dio _dio;
  ChatRepository(this._dio);

  /// Streams Server-Sent Events from the agent as it works.
  Stream<ChatEvent> sendMessage(String message, String? sessionId) async* {
    final resp = await _dio.post(
      '/chat',
      data: {'message': message, if (sessionId != null) 'sessionId': sessionId},
      // A full agentic booking can run many LLM calls + payment delay + provider
      // backoff. Give the stream generous time between events (default is 60s).
      options: Options(
        responseType: ResponseType.stream,
        headers: {'Accept': 'text/event-stream'},
        receiveTimeout: const Duration(minutes: 5),
      ),
    );
    final stream = (resp.data as ResponseBody).stream;
    var buffer = '';
    await for (final chunk in stream) {
      buffer += utf8.decode(chunk, allowMalformed: true);
      int idx;
      while ((idx = buffer.indexOf('\n\n')) != -1) {
        final raw = buffer.substring(0, idx);
        buffer = buffer.substring(idx + 2);
        String? ev;
        String? data;
        for (final line in raw.split('\n')) {
          if (line.startsWith('event:')) {
            ev = line.substring(6).trim();
          } else if (line.startsWith('data:')) {
            data = line.substring(5).trim();
          }
        }
        if (data != null && data.isNotEmpty) {
          yield ChatEvent(ev ?? 'message', jsonDecode(data) as Map<String, dynamic>);
        }
      }
    }
  }
}

final chatRepoProvider = Provider((ref) => ChatRepository(ref.read(apiProvider)));
