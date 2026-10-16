# playwright_auto

Playwright automation for [Sauce Demo](https://www.saucedemo.com/) with:

- **Playwright Test** specs (`tests/`, `e2e/`) across chromium, firefox and webkit, HTML reporter
- **Cucumber BDD** suite (`features/`) driven by JSON locators, test data and assertions (`src/data/`)
- **AI self-healing locators** (`src/healing/`): opt-in, off by default

## Install

```bash
npm install
npx playwright install        # browsers, first time only
cp .env.example .env          # then edit; .env is git-ignored
```

## Run

| Command | What it does |
|---|---|
| `npm test` | All Playwright Test specs, all browser projects |
| `npm run test:healing` | Deterministic self-healing tests (mocked AI, no network, chromium) |
| `npm run test:healing:real` | Real OpenAI integration test (needs `OPENAI_API_KEY` + `AI_HEALING_MODEL`) |
| `npm run test:bdd` | Cucumber suite (`test:bdd:headed`, `test:bdd:smoke` also available) |
| `npm run typecheck` | TypeScript check of `src/` and `tests/` |
| `npm run report` | Open the Playwright HTML report |

## AI self-healing locators

### What it does

When a Page Object action (`click`, `fill`, `check`, `uncheck`, `selectOption`, `hover`, `press`, `dblclick`)
fails **because its locator matches nothing**, the `SelfHealingAgent`:

1. Runs the original Playwright action normally (auto-waiting, bounded by `AI_HEALING_ACTION_TIMEOUT_MS`).
2. On failure, checks eligibility. It heals only if the error is a Playwright `TimeoutError` **and**
   the original locator now matches 0 elements. If the element exists but is disabled or hidden
   (application state), or if the error is anything else, it rethrows the original error untouched.
   Assertions (`expect`) never go through the agent, so they are never healed.
3. Collects at most `AI_HEALING_MAX_CANDIDATES` **visible** elements suitable for the action, using
   read-only `page.evaluate`. Each entry has tag, role, accessible name, label, placeholder, type,
   `data-testid`/`data-test`/`id`/`name` and enabled state. It never includes input values,
   raw HTML, cookies or storage. Text is truncated, and emails, long numbers and token-like strings are redacted.
4. Makes **one** AI call (`maxRetries: 0`, `AI_HEALING_TIMEOUT_MS` timeout). The prompt marks
   all DOM text as untrusted data. The response must match a strict Zod schema:
   `selectedCandidateId`, `confidence`, `reasoning`, `recommendedLocatorDescription`, `shouldHeal`.
5. Rejects the result if `shouldHeal` is false, confidence is below `AI_HEALING_MIN_CONFIDENCE`, or the id is unknown.
6. Builds the replacement locator **locally** from the candidate's attributes
   (test id, then `data-test`, `id`, `name`, role and name, label, placeholder). The AI never supplies a selector or code.
   The replacement must match **exactly one** element, which must be visible, enabled and the right kind of element for the action.
7. Retries the action **once** with the replacement.
8. Records a report event either way. On failure it throws `SelfHealingFailedError`, which keeps the original
   Playwright message and stack, with `originalError` and `cause` set to it, and appends why healing did not help.

Nothing is ever written back to Page Objects. Successful heals become **proposals** in
`healing-reports/*.json` (git-ignored) and in the `self-healing-report.json` attachment of the HTML report,
for a person to review. See [docs/example-healing-report.json](docs/example-healing-report.json).

### Environment

| Variable | Default | Purpose |
|---|---|---|
| `AI_HEALING_ENABLED` | `false` | Master switch |
| `AI_HEALING_MIN_CONFIDENCE` | `0.90` | Confidence threshold |
| `OPENAI_API_KEY` | – | OpenAI key. Missing means healing fails safely |
| `AI_HEALING_MODEL` | – | OpenAI model with structured-output support. Missing means healing fails safely |
| `AI_HEALING_TIMEOUT_MS` | `15000` | AI call timeout |
| `AI_HEALING_ACTION_TIMEOUT_MS` | `5000` | Original action and retry timeout while healing is enabled |
| `AI_HEALING_MAX_CANDIDATES` | `40` | Candidate cap |
| `AI_HEALING_SCREENSHOTS` | `false` | Before/after screenshots with all inputs masked |
| `AI_HEALING_REPORT_DIR` | `healing-reports` | Proposal output folder |

With `AI_HEALING_ENABLED=false` the agent is a transparent pass-through to Playwright with default timeouts.

### Using it in a Page Object

```ts
import { BasePage } from './BasePage';

export class LoginPage extends BasePage {
  async login(user: string, pass: string) {
    await this.healer.fill('#username', user, { description: 'Username input on the login form' });
    await this.healer.fill('#password', pass, { description: 'Password input on the login form' }); // value never logged or sent
    await this.healer.click('#login-button', { description: 'Sign in submit button' });
  }
}
```

```ts
import { test, expect } from './fixtures/healing.fixture';

test('login', async ({ page, healingAgent }) => {
  const login = new LoginPage(page, healingAgent);
  // ...
});
```

Examples: [src/pages/DemoLoginPage.ts](src/pages/DemoLoginPage.ts), [src/pages/SauceLoginPage.ts](src/pages/SauceLoginPage.ts).

### Swapping the AI provider

Implement `HealingProvider` from `src/healing/providers/HealingProvider.ts` (for example, Claude through `@anthropic-ai/sdk`),
reusing `SYSTEM_PROMPT`, `buildUserPayload` and `healingDecisionJsonSchema`, then pass it with
`createHealingAgent({ provider })` or wire it into the fixture. The agent validates the output with Zod whatever provider returned it.

### Tests

`tests/self-healing/self-healing.spec.ts` uses a local demo page (`tests/fixtures/demoApp.ts`, served
with `page.route`, no network) and a deterministic `MockHealingProvider`:

- unchanged locator: no AI call
- `#username` changed to `data-testid="login-user"`: healed. The test also checks that no username, password or HTML was sent
- two identical "Sign in" buttons: rejected as ambiguous
- confidence 0.55: rejected
- schema-invalid AI output: rejected
- provider throws, or no API key: fails safely with the original error
- failing `expect` assertion: not healed, no AI call
- disabled submit button (application failure): raw error, no AI call
- healing disabled: plain Playwright behaviour

### Enable and debug

```bash
# real healing in your own runs
AI_HEALING_ENABLED=true OPENAI_API_KEY=sk-... AI_HEALING_MODEL=<model> npx playwright test

# real AI integration test
OPENAI_API_KEY=sk-... AI_HEALING_MODEL=<model> npm run test:healing:real

# debugging
npx playwright test tests/self-healing --project=chromium --debug
AI_HEALING_SCREENSHOTS=true npm run test:healing && npm run report
```

The console prints a `[self-healing] <status>: <original> -> <replacement> (<reason>)` line per event.
