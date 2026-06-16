import { generate, toolResultsContent, userContent } from './provider.js';
import { schemasFor, dispatch, BOOKING_AGENT_TOOLS } from './toolRegistry.js';
import { buildBookingAgentSystem } from './prompts.js';
import type { Content } from './contextManager.js';
import type { ToolContext } from './types.js';

export type Emit = (event: string, data: unknown) => void;

const MAX_STEPS = 8;

// A separate agent loop with its own focused prompt and a restricted, booking-only
// toolset. Shares the session (so held seats / booking IDs flow back), runs to
// completion, and returns a structured summary string to the orchestrator.
export async function runBookingAgent(goal: string, ctx: ToolContext, emit?: Emit): Promise<string> {
  const tools = schemasFor(BOOKING_AGENT_TOOLS);
  const contents: Content[] = [userContent(`Goal: ${goal}`)];

  for (let step = 0; step < MAX_STEPS; step++) {
    const system = buildBookingAgentSystem(goal, ctx.session.state);
    const { text, toolCalls, modelContent } = await generate({ system, contents, tools });

    if (!toolCalls.length) return text || 'Booking sub-agent finished.';

    contents.push(modelContent as Content);
    const results: { id: string; name: string; response: unknown }[] = [];
    for (const call of toolCalls) {
      emit?.('tool', { agent: 'booking', name: call.name, args: call.args });
      const response = await dispatch(call.name, call.args, ctx);
      emit?.('tool_result', { agent: 'booking', name: call.name, ok: !(response && typeof response === 'object' && 'error' in response) });
      results.push({ id: call.id, name: call.name, response });
    }
    contents.push(...(toolResultsContent(results) as Content[]));
  }

  return 'Booking sub-agent hit its step limit before finishing. Current state is preserved.';
}
