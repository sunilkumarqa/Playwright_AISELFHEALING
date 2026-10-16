import type { Locator, Page } from '@playwright/test';
import type { DomCandidate, HealingAction, ValidationResult } from './types';

export interface BuiltLocator {
  locator: Locator;
  /** Human readable, copy-pasteable Playwright expression for the review report. */
  expression: string;
}

const cssString = (value: string) => `"${value.replace(/\\/g, '\\\\').replace(/"/g, '\\"')}"`;
const jsString = (value: string) => JSON.stringify(value);

/**
 * Build Playwright locators locally from a candidate's attributes, most stable first.
 * The AI only ever returns a candidate id; it never supplies a selector.
 */
function strategies(page: Page, c: DomCandidate): BuiltLocator[] {
  const list: BuiltLocator[] = [];
  if (c.testId) {
    list.push({ locator: page.locator(`[data-testid=${cssString(c.testId)}]`), expression: `page.getByTestId(${jsString(c.testId)})` });
  }
  if (c.dataTest) {
    list.push({ locator: page.locator(`[data-test=${cssString(c.dataTest)}]`), expression: `page.locator('[data-test=${cssString(c.dataTest)}]')` });
  }
  if (c.elementId) {
    list.push({ locator: page.locator(`[id=${cssString(c.elementId)}]`), expression: `page.locator('[id=${cssString(c.elementId)}]')` });
  }
  if (c.name) {
    list.push({ locator: page.locator(`${c.tag}[name=${cssString(c.name)}]`), expression: `page.locator('${c.tag}[name=${cssString(c.name)}]')` });
  }
  if (c.role && c.accessibleName) {
    list.push({
      locator: page.getByRole(c.role as Parameters<Page['getByRole']>[0], { name: c.accessibleName, exact: true }),
      expression: `page.getByRole(${jsString(c.role)}, { name: ${jsString(c.accessibleName)}, exact: true })`,
    });
  }
  if (c.label) {
    list.push({ locator: page.getByLabel(c.label, { exact: true }), expression: `page.getByLabel(${jsString(c.label)}, { exact: true })` });
  }
  if (c.placeholder) {
    list.push({ locator: page.getByPlaceholder(c.placeholder, { exact: true }), expression: `page.getByPlaceholder(${jsString(c.placeholder)}, { exact: true })` });
  }
  return list;
}

const EDITABLE_INPUT_TYPES = ['text', 'email', 'password', 'search', 'tel', 'url', 'number'];

interface ElementInfo {
  tag: string;
  type: string;
  role: string | null;
  editable: boolean;
  contentEditable: boolean;
}

function suitsAction(action: HealingAction, info: ElementInfo): boolean {
  switch (action) {
    case 'fill':
      return (
        info.editable &&
        (info.tag === 'textarea' ||
          info.contentEditable ||
          info.role === 'textbox' ||
          (info.tag === 'input' && EDITABLE_INPUT_TYPES.includes(info.type)))
      );
    case 'check':
    case 'uncheck':
      return (info.tag === 'input' && ['checkbox', 'radio'].includes(info.type)) || ['checkbox', 'radio', 'switch'].includes(info.role ?? '');
    case 'selectOption':
      return info.tag === 'select';
    default:
      return true;
  }
}

/**
 * Pick the first strategy that resolves to exactly one element, then verify it is
 * visible, enabled (when the action needs it) and of a type suitable for the action.
 */
export async function buildAndValidate(
  page: Page,
  candidate: DomCandidate,
  action: HealingAction,
): Promise<{ built: BuiltLocator | null; validation: ValidationResult }> {
  const checks: Record<string, boolean> = { unique: false, visible: false, enabled: false, typeMatchesAction: false };

  let built: BuiltLocator | null = null;
  for (const strategy of strategies(page, candidate)) {
    if ((await strategy.locator.count()) === 1) {
      built = strategy;
      break;
    }
  }
  if (!built) {
    return { built: null, validation: { passed: false, checks, message: 'Candidate is not uniquely identifiable by any stable attribute, role or label' } };
  }
  checks.unique = true;
  checks.visible = await built.locator.isVisible();
  const needsEnabled = action !== 'hover';
  checks.enabled = needsEnabled ? await built.locator.isEnabled() : true;

  const info: ElementInfo = await built.locator.evaluate((el) => ({
    tag: el.tagName.toLowerCase(),
    type: (el.getAttribute('type') ?? 'text').toLowerCase(),
    role: el.getAttribute('role'),
    editable: !(el as HTMLInputElement).readOnly && !(el as HTMLInputElement).disabled,
    contentEditable: (el as HTMLElement).isContentEditable,
  }));
  checks.typeMatchesAction = suitsAction(action, info);

  const failed = Object.entries(checks).filter(([, ok]) => !ok).map(([name]) => name);
  return {
    built,
    validation: {
      passed: failed.length === 0,
      checks,
      message: failed.length === 0 ? 'All validation checks passed' : `Validation failed: ${failed.join(', ')}`,
    },
  };
}
