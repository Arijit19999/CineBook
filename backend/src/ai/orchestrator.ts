import { generate, toolResultsContent, userContent, type LlmTool } from './provider.js';
import { schemasFor, dispatch, ORCHESTRATOR_TOOLS } from './toolRegistry.js';
import { buildOrchestratorSystem } from './prompts.js';
import { maybeCompact, type Content, type Session } from './contextManager.js';
import { runBookingAgent, type Emit } from './bookingAgent.js';
import type { ToolContext } from './types.js';

const MAX_STEPS = 10;

// The meta-tool that triggers sub-agent delegation (Part 2.B).
const DELEGATE = 'delegate_to_booking_assistant';
const delegateSchema: LlmTool = {
  name: DELEGATE,
  description:
    'Delegate a complete booking transaction (find a show if needed, hold seats, apply a promo, create the booking, and pay) to a focused booking sub-agent. Provide a goal that captures the user\'s full intent and any preferences.',
  parameters: { type: 'object', properties: { goal: { type: 'string' } }, required: ['goal'] },
};

// The custom agent loop. Hand-written: call model → if it wants tools, run them and
// feed results back → repeat until it produces a final answer (or hits the guard).
export async function runOrchestrator(session: Session, userMsg: string, ctx: ToolContext, emit?: Emit): Promise<string> {
  session.history.push(userContent(userMsg) as Content);
  await maybeCompact(session);

  const tools = [...schemasFor(ORCHESTRATOR_TOOLS), delegateSchema];

  for (let step = 0; step < MAX_STEPS; step++) {
    const system = buildOrchestratorSystem(session.state);
    const { text, toolCalls, modelContent } = await generate({ system, contents: session.history, tools });

    if (!toolCalls.length) {
      if (text) {
        session.history.push(modelContent as Content);
        emit?.('message', { text });
      }
      emit?.('state', session.state);
      return text;
    }

    session.history.push(modelContent as Content);
    const results: { id: string; name: string; response: unknown }[] = [];

    for (const call of toolCalls) {
      emit?.('tool', { name: call.name, args: call.args });
      let response: unknown;
      if (call.name === DELEGATE) {
        const goal = String(call.args.goal ?? userMsg);
        emit?.('delegate', { goal });
        const summary = await runBookingAgent(goal, ctx, emit);
        response = { summary };
        emit?.('delegate_done', { summary });
      } else {
        response = await dispatch(call.name, call.args, ctx);
      }
      emit?.('tool_result', { name: call.name, ok: !(response && typeof response === 'object' && 'error' in response) });
      results.push({ id: call.id, name: call.name, response });
    }

    session.history.push(...(toolResultsContent(results) as Content[]));
    emit?.('state', session.state);
  }

  const msg = "I couldn't finish that in the steps available — could you narrow it down a little?";
  emit?.('message', { text: msg });
  return msg;
}
