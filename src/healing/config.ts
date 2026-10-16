import type { HealingConfig } from './types';

function bool(value: string | undefined, fallback: boolean): boolean {
  if (value === undefined || value.trim() === '') return fallback;
  return ['1', 'true', 'yes', 'on'].includes(value.trim().toLowerCase());
}

function num(value: string | undefined, fallback: number, min: number, max: number): number {
  const parsed = Number(value);
  if (value === undefined || value.trim() === '' || !Number.isFinite(parsed)) return fallback;
  return Math.min(max, Math.max(min, parsed));
}

export function loadHealingConfig(env: NodeJS.ProcessEnv = process.env): HealingConfig {
  return {
    enabled: bool(env.AI_HEALING_ENABLED, false),
    minConfidence: num(env.AI_HEALING_MIN_CONFIDENCE, 0.9, 0, 1),
    model: env.AI_HEALING_MODEL?.trim() || undefined,
    aiTimeoutMs: num(env.AI_HEALING_TIMEOUT_MS, 15_000, 1_000, 60_000),
    actionTimeoutMs: num(env.AI_HEALING_ACTION_TIMEOUT_MS, 5_000, 500, 60_000),
    maxCandidates: num(env.AI_HEALING_MAX_CANDIDATES, 40, 1, 100),
    screenshots: bool(env.AI_HEALING_SCREENSHOTS, false),
    reportDir: env.AI_HEALING_REPORT_DIR?.trim() || 'healing-reports',
  };
}
