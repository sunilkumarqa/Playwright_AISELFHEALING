import { test, expect } from '../fixtures/healing.fixture';
import { DEMO_CREDENTIALS, serveDemo } from '../fixtures/demoApp';
import { DemoLoginPage } from '../../src/pages/DemoLoginPage';

/**
 * Calls the real OpenAI API. Opt-in only:
 *   AI_HEALING_REAL_TEST=true OPENAI_API_KEY=... AI_HEALING_MODEL=... npm run test:healing:real
 */
const enabled = process.env.AI_HEALING_REAL_TEST === 'true' && !!process.env.OPENAI_API_KEY && !!process.env.AI_HEALING_MODEL;

test.describe('Self-healing with a real AI provider', () => {
  test.skip(!enabled, 'Set AI_HEALING_REAL_TEST=true, OPENAI_API_KEY and AI_HEALING_MODEL to run');

  test('heals the changed username locator via OpenAI', async ({ page, createHealingAgent }) => {
    test.setTimeout(60_000);
    await serveDemo(page, 'changed-username');
    const agent = createHealingAgent({ config: { enabled: true, screenshots: true, actionTimeoutMs: 2_000 } });
    const login = new DemoLoginPage(page, agent);

    await login.goto();
    await login.login(DEMO_CREDENTIALS.username, DEMO_CREDENTIALS.password);

    await expect(login.welcome).toBeVisible();
    expect(agent.events[0]).toMatchObject({ status: 'healed', provider: 'openai', replacementLocator: 'page.getByTestId("login-user")' });
  });
});
