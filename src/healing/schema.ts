import { z } from 'zod';

/** Shape the AI provider must return. Anything else is treated as an invalid response. */
export const HealingDecisionSchema = z
  .object({
    selectedCandidateId: z.string().max(20).nullable(),
    confidence: z.number().min(0).max(1),
    reasoning: z.string().max(2000),
    recommendedLocatorDescription: z.string().max(500),
    shouldHeal: z.boolean(),
  })
  .strict();

export type HealingDecision = z.infer<typeof HealingDecisionSchema>;

/** JSON Schema equivalent, used for provider-side structured output enforcement. */
export const healingDecisionJsonSchema = {
  type: 'object',
  additionalProperties: false,
  required: ['selectedCandidateId', 'confidence', 'reasoning', 'recommendedLocatorDescription', 'shouldHeal'],
  properties: {
    selectedCandidateId: { type: ['string', 'null'], description: 'The id of the chosen candidate, e.g. "c3", or null.' },
    confidence: { type: 'number', description: 'Confidence between 0 and 1.' },
    reasoning: { type: 'string', description: 'Short explanation of the choice.' },
    recommendedLocatorDescription: { type: 'string', description: 'Human readable description of the element.' },
    shouldHeal: { type: 'boolean', description: 'False when no candidate clearly matches.' },
  },
} as const;
