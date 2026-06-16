import type { LlmTool } from './provider.js';
import type { Session } from './contextManager.js';

export interface ToolContext {
  userId: string;
  session: Session;
  log?: (msg: string) => void;
}

export interface AgentTool {
  schema: LlmTool;
  handler: (args: Record<string, unknown>, ctx: ToolContext) => Promise<unknown>;
}
