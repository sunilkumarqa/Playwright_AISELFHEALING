import OpenAI from 'openai';
import { healingDecisionJsonSchema } from '../schema';
import type { HealingConfig, HealingRequest } from '../types';
import { buildUserPayload, SYSTEM_PROMPT, type HealingProvider } from './HealingProvider';

export class OpenAIHealingProvider implements HealingProvider {
  readonly name = 'openai';
  private readonly client: OpenAI;

  constructor(
    apiKey: string,
    private readonly model: string,
    timeoutMs: number,
  ) {
    // maxRetries: 0 guarantees at most one AI call per failed action.
    this.client = new OpenAI({ apiKey, timeout: timeoutMs, maxRetries: 0 });
  }

  async selectCandidate(request: HealingRequest, signal: AbortSignal): Promise<unknown> {
    const completion = await this.client.chat.completions.create(
      {
        model: this.model,
        messages: [
          { role: 'system', content: SYSTEM_PROMPT },
          { role: 'user', content: buildUserPayload(request) },
        ],
        response_format: {
          type: 'json_schema',
          json_schema: { name: 'locator_healing_decision', strict: true, schema: healingDecisionJsonSchema },
        },
      },
      { signal },
    );
    const content = completion.choices[0]?.message?.content;
    if (!content) throw new Error('OpenAI returned an empty response');
    return JSON.parse(content);
  }
}

/** Returns null when credentials or model are missing, so callers fail safely without AI. */
export function createHealingProviderFromEnv(
  config: HealingConfig,
  env: NodeJS.ProcessEnv = process.env,
): HealingProvider | null {
  const apiKey = env.OPENAI_API_KEY?.trim();
  if (!apiKey || !config.model) return null;
  return new OpenAIHealingProvider(apiKey, config.model, config.aiTimeoutMs);
}
