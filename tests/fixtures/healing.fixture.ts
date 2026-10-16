import { test as base, expect } from '@playwright/test';
import { loadHealingConfig } from '../../src/healing/config';
import { createHealingProviderFromEnv } from '../../src/healing/providers/OpenAIHealingProvider';
import type { HealingProvider } from '../../src/healing/providers/HealingProvider';
import { SelfHealingAgent } from '../../src/healing/SelfHealingAgent';
import type { HealingConfig } from '../../src/healing/types';

export interface CreateAgentOptions {
  /** Provider override (e.g. a mock). `null` means "no provider". Omit to build from env. */
  provider?: HealingProvider | null;
  config?: Partial<HealingConfig>;
}

type HealingFixtures = {
  /** Agent configured from environment variables (AI_HEALING_ENABLED etc.). */
  healingAgent: SelfHealingAgent;
  /** Factory for agents with explicit provider/config, e.g. in deterministic tests. */
  createHealingAgent: (options?: CreateAgentOptions) => SelfHealingAgent;
};

export const test = base.extend<HealingFixtures>({
  createHealingAgent: async ({ page }, use, testInfo) => {
    const agents: SelfHealingAgent[] = [];
    await use((options = {}) => {
      const config = { ...loadHealingConfig(), ...options.config };
      const provider = options.provider === undefined ? createHealingProviderFromEnv(config) : options.provider;
      const agent = new SelfHealingAgent(page, config, provider, testInfo);
      agents.push(agent);
      return agent;
    });
    for (const agent of agents) await agent.finalize();
  },

  healingAgent: async ({ createHealingAgent }, use) => {
    await use(createHealingAgent());
  },
});

export { expect };
