export type HealingAction =
  | 'click'
  | 'dblclick'
  | 'fill'
  | 'check'
  | 'uncheck'
  | 'selectOption'
  | 'hover'
  | 'press';

export interface HealingConfig {
  /** Master switch. Defaults to false; nothing is ever sent to an AI provider unless this is true. */
  enabled: boolean;
  /** AI responses below this confidence are rejected. */
  minConfidence: number;
  /** Model identifier passed to the provider. */
  model?: string;
  /** Upper bound for the single AI call per failed action. */
  aiTimeoutMs: number;
  /** Timeout for the original action (and the single retry) while healing is enabled. */
  actionTimeoutMs: number;
  /** Maximum number of DOM candidates sent to the provider. */
  maxCandidates: number;
  /** Capture masked before/after screenshots for healing attempts. */
  screenshots: boolean;
  /** Directory where proposed locator changes are written for human review. */
  reportDir: string;
}

/** Sanitized description of one element on the page. Never contains input values. */
export interface DomCandidate {
  id: string;
  tag: string;
  role: string | null;
  accessibleName: string | null;
  label: string | null;
  placeholder: string | null;
  type: string | null;
  text: string | null;
  testId: string | null;
  dataTest: string | null;
  elementId: string | null;
  name: string | null;
  enabled: boolean;
}

export interface HealingRequest {
  action: HealingAction;
  intendedElement: string;
  originalLocator: string;
  failureReason: string;
  candidates: DomCandidate[];
}

export type HealingStatus =
  | 'healed'
  | 'rejected'
  | 'provider-unavailable'
  | 'provider-error'
  | 'invalid-response'
  | 'retry-failed'
  | 'not-eligible';

export interface ValidationResult {
  passed: boolean;
  checks: Record<string, boolean>;
  message: string;
}

export interface HealingEvent {
  testName: string;
  timestamp: string;
  pageUrl: string;
  action: HealingAction;
  intendedElement: string;
  originalLocator: string;
  originalError: string;
  replacementLocator: string | null;
  recommendedLocatorDescription: string | null;
  reason: string;
  confidence: number | null;
  validation: ValidationResult | null;
  status: HealingStatus;
  provider: string | null;
}
