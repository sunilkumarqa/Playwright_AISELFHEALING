import type { Page } from '@playwright/test';
import { sanitizeText } from './sanitize';
import type { DomCandidate, HealingAction } from './types';

type RawCandidate = Omit<DomCandidate, 'id'>;

/** CSS selectors for elements that can plausibly receive each action. */
const ACTION_SELECTORS: Record<HealingAction, string> = {
  fill: 'input:not([type]), input[type=text], input[type=email], input[type=password], input[type=search], input[type=tel], input[type=url], input[type=number], textarea, [contenteditable=""], [contenteditable=true], [role=textbox]',
  check: 'input[type=checkbox], input[type=radio], [role=checkbox], [role=radio], [role=switch]',
  uncheck: 'input[type=checkbox], [role=checkbox], [role=switch]',
  selectOption: 'select',
  click: 'button, a[href], input[type=submit], input[type=button], input[type=reset], input[type=checkbox], input[type=radio], [role=button], [role=link], [role=tab], [role=menuitem], [role=checkbox], summary',
  dblclick: 'button, a[href], input[type=submit], input[type=button], [role=button], [role=link], td, li',
  hover: 'button, a[href], [role=button], [role=link], [role=menuitem], [title]',
  press: 'input, textarea, button, a[href], [role=textbox], [role=button], [contenteditable=""], [contenteditable=true]',
};

/**
 * Collect a bounded, sanitized list of visible elements relevant to the failed action.
 * Uses read-only page.evaluate; never reads input values or innerHTML.
 */
export async function collectCandidates(page: Page, action: HealingAction, max: number): Promise<DomCandidate[]> {
  const raw = await page.evaluate(
    ({ selector, limit }) => {
      const textOf = (el: Element | null | undefined) => (el?.textContent ?? '').replace(/\s+/g, ' ').trim() || null;

      const implicitRole = (el: Element): string | null => {
        const explicit = el.getAttribute('role');
        if (explicit) return explicit;
        const tag = el.tagName.toLowerCase();
        const type = (el.getAttribute('type') ?? 'text').toLowerCase();
        if (tag === 'button' || tag === 'summary') return 'button';
        if (tag === 'a') return 'link';
        if (tag === 'textarea') return 'textbox';
        if (tag === 'select') return (el as HTMLSelectElement).multiple ? 'listbox' : 'combobox';
        if (tag === 'input') {
          if (['submit', 'button', 'reset'].includes(type)) return 'button';
          if (type === 'checkbox') return 'checkbox';
          if (type === 'radio') return 'radio';
          if (type === 'search') return 'searchbox';
          if (type === 'number') return 'spinbutton';
          if (['text', 'email', 'tel', 'url'].includes(type)) return 'textbox';
        }
        return null;
      };

      const labelOf = (el: Element): string | null => {
        const id = el.getAttribute('id');
        if (id) {
          const forLabel = document.querySelector(`label[for="${CSS.escape(id)}"]`);
          if (forLabel) return textOf(forLabel);
        }
        return textOf(el.closest('label'));
      };

      const accessibleNameOf = (el: Element, label: string | null): string | null => {
        const aria = el.getAttribute('aria-label');
        if (aria) return aria;
        const labelledBy = el.getAttribute('aria-labelledby');
        if (labelledBy) {
          const joined = labelledBy
            .split(/\s+/)
            .map((id) => textOf(document.getElementById(id)))
            .filter(Boolean)
            .join(' ');
          if (joined) return joined;
        }
        if (label) return label;
        const tag = el.tagName.toLowerCase();
        const type = (el.getAttribute('type') ?? '').toLowerCase();
        // Button captions are UI text, not user data.
        if (tag === 'input' && ['submit', 'button', 'reset'].includes(type)) return el.getAttribute('value');
        if (tag !== 'input' && tag !== 'textarea' && tag !== 'select') return textOf(el);
        return el.getAttribute('title');
      };

      const isVisible = (el: Element) => {
        const rect = el.getBoundingClientRect();
        const style = getComputedStyle(el);
        return rect.width > 0 && rect.height > 0 && style.visibility !== 'hidden' && style.display !== 'none';
      };

      const results: Array<Record<string, unknown>> = [];
      for (const el of Array.from(document.querySelectorAll(selector))) {
        if (results.length >= limit) break;
        if (!isVisible(el)) continue;
        const tag = el.tagName.toLowerCase();
        const label = labelOf(el);
        const isField = tag === 'input' || tag === 'textarea' || tag === 'select';
        results.push({
          tag,
          role: implicitRole(el),
          accessibleName: accessibleNameOf(el, label),
          label,
          placeholder: el.getAttribute('placeholder'),
          type: el.getAttribute('type'),
          // Never read text inside editable fields; it is user data.
          text: isField || el.hasAttribute('contenteditable') ? null : textOf(el),
          testId: el.getAttribute('data-testid'),
          dataTest: el.getAttribute('data-test'),
          elementId: el.getAttribute('id'),
          name: el.getAttribute('name'),
          enabled: !(el as HTMLButtonElement).disabled && el.getAttribute('aria-disabled') !== 'true',
        });
      }
      return results;
    },
    { selector: ACTION_SELECTORS[action], limit: max },
  );

  return (raw as unknown as RawCandidate[]).map((c, index) => ({
    id: `c${index + 1}`,
    tag: c.tag,
    role: c.role,
    accessibleName: sanitizeText(c.accessibleName),
    label: sanitizeText(c.label),
    placeholder: sanitizeText(c.placeholder),
    type: sanitizeText(c.type, 20),
    text: sanitizeText(c.text),
    testId: sanitizeText(c.testId),
    dataTest: sanitizeText(c.dataTest),
    elementId: sanitizeText(c.elementId),
    name: sanitizeText(c.name),
    enabled: Boolean(c.enabled),
  }));
}
