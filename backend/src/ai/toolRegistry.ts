import type { AgentTool, ToolContext } from './types.js';
import type { LlmTool } from './provider.js';
import { movieTools } from './tools/movieTools.js';
import { bookingTools } from './tools/bookingTools.js';
import { profileTools } from './tools/profileTools.js';
import { prisma } from '../config/prisma.js';

// The entire registry — JSON schema + handler per tool. No framework; just a map.
export const ALL_TOOLS: Record<string, AgentTool> = { ...movieTools, ...bookingTools, ...profileTools };

// Transactional booking tools — the restricted subset the sub-agent may use.
export const BOOKING_AGENT_TOOLS = [
  'search_movies',
  'get_showtimes',
  'find_theatres',
  'get_screen_info',
  'check_seat_availability',
  'hold_seats',
  'release_seats',
  'apply_promo_code',
  'create_booking',
  'start_payment',
  'confirm_payment',
];

// What the orchestrator exposes: all discovery/profile tools + read-only booking
// tools. The actual booking transaction is delegated to the sub-agent.
export const ORCHESTRATOR_TOOLS = [
  ...Object.keys(movieTools),
  ...Object.keys(profileTools),
  'find_theatres',
  'get_screen_info',
  'check_seat_availability',
  'check_booking_status',
  'view_booking_history',
  'cancel_booking',
];

export function schemasFor(names: string[]): LlmTool[] {
  return names.map((n) => ALL_TOOLS[n]?.schema).filter((x): x is LlmTool => Boolean(x));
}

// Run a tool, never throwing into the loop (errors come back as data the model can
// reason about), and log every call to the activity log (captures chatbot actions).
export async function dispatch(name: string, args: Record<string, unknown>, ctx: ToolContext): Promise<unknown> {
  const tool = ALL_TOOLS[name];
  if (!tool) return { error: `Unknown tool: ${name}` };

  const started = Date.now();
  let success = true;
  let result: unknown;
  try {
    result = await tool.handler(args || {}, ctx);
    if (result && typeof result === 'object' && 'error' in result) success = false;
    return result;
  } catch (err) {
    success = false;
    result = { error: err instanceof Error ? err.message : 'Tool failed' };
    return result;
  } finally {
    prisma.adminActivityLog
      .create({
        data: {
          actorId: ctx.userId,
          action: `tool:${name}`,
          targetType: 'ai_tool',
          metadata: { args } as object,
          durationMs: Date.now() - started,
          success,
          source: 'chatbot',
        },
      })
      .catch(() => {});
  }
}
