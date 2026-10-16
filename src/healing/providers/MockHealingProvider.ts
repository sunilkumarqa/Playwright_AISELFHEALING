import type { HealingRequest } from '../types';
import type { HealingProvider } from './HealingProvider';

export type MockResponder = (request: HealingRequest) => unknown | Promise<unknown>;

/** Deterministic provider for tests. Records every request it receives. */
export class MockHealingProvider implements HealingProvider {
  readonly name = 'mock';
  readonly requests: HealingRequest[] = [];

  constructor(private readonly responder: MockResponder) {}

  get callCount(): number {
    return this.requests.length;
  }

  async selectCandidate(request: HealingRequest): Promise<unknown> {
    this.requests.push(structuredClone(request));
    return this.responder(request);
  }
}
