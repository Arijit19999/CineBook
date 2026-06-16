import { generate, userContent } from './provider.js';

// OpenAI-style message shape (Groq).
export type Content = {
  role: string;
  content?: string | null;
  tool_calls?: Array<{ id: string; function?: { name?: string; arguments?: string } }>;
  tool_call_id?: string;
};

// Typed, structured memory of the conversation. Tools mutate it; it is injected
// into the system prompt every turn as ground truth, so early preferences survive
// even after many actions (Part 2.C — context management).
export interface SessionState {
  selectedMovieId?: string;
  selectedMovieTitle?: string;
  preferredTime?: string;
  seatPreference?: string;
  partySize?: number;
  selectedShowId?: string;
  heldSeats?: string[];
  appliedPromo?: { code: string; discount: number };
  lastBookingId?: string;
  lastBookingStatus?: string;
}

export interface Session {
  id: string;
  userId: string;
  state: SessionState;
  history: Content[];
  createdAt: number;
}

const sessions = new Map<string, Session>();
let counter = 0;

export function getOrCreateSession(userId: string, sessionId?: string): Session {
  if (sessionId && sessions.has(sessionId)) {
    const s = sessions.get(sessionId)!;
    if (s.userId === userId) return s;
  }
  const id = sessionId || `sess_${userId.slice(-6)}_${++counter}`;
  const session: Session = { id, userId, state: {}, history: [], createdAt: Date.now() };
  sessions.set(id, session);
  return session;
}

// --- Transcript compaction ---
const COMPACT_AT = 30; // contents
const KEEP_RECENT = 12;

function isUserTextTurn(c: Content): boolean {
  return c?.role === 'user' && typeof c.content === 'string' && c.content.length > 0;
}

function serialize(contents: Content[]): string {
  return contents
    .map((c) => {
      if (c.role === 'tool') return `tool_result: ${typeof c.content === 'string' ? c.content : ''}`;
      if (c.tool_calls?.length) {
        const calls = c.tool_calls.map((tc) => `CALL ${tc.function?.name}(${tc.function?.arguments ?? '{}'})`).join(' ');
        return `assistant: ${c.content ?? ''} ${calls}`.trim();
      }
      return `${c.role}: ${typeof c.content === 'string' ? c.content : ''}`;
    })
    .join('\n');
}

// When history grows past the threshold, summarize older turns into a recap and
// keep recent turns verbatim. Cuts only at a user-text boundary so we never orphan
// a functionResponse from its functionCall.
export async function maybeCompact(session: Session): Promise<boolean> {
  if (session.history.length <= COMPACT_AT) return false;

  const target = session.history.length - KEEP_RECENT;
  let cut = -1;
  for (let i = target; i >= 1; i--) {
    if (isUserTextTurn(session.history[i])) {
      cut = i;
      break;
    }
  }
  if (cut <= 1) return false;

  const older = session.history.slice(0, cut);
  const recent = session.history.slice(cut);
  const { text } = await generate({
    system:
      'You compact a movie-booking conversation. Summarize the turns below into a short factual recap: ' +
      'what the user wants, movies/shows/seats chosen, promos, bookings made, and anything still pending. No fluff.',
    contents: [userContent(serialize(older))],
  });

  session.history = [{ role: 'user', content: `[Earlier conversation recap]\n${text}` }, ...recent];
  return true;
}
