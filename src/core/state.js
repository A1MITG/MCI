// Study lifecycle. Every state change goes through transition(), which rejects illegal moves.

export const STATES = {
  created: 'created',
  running: 'running', // a stage is executing; study.stage names it
  needs_input: 'needs_input', // scope confirmation, budget raise, or a blocked gate needing a human
  stage_failed: 'stage_failed', // retries exhausted; resumable
  gate_blocked: 'gate_blocked',
  published: 'published',
  published_with_gaps: 'published_with_gaps',
  confirmed: 'confirmed', // prior study re-checked, no material change
  cancelled: 'cancelled',
};

const RESUMABLE = ['created', 'needs_input', 'stage_failed', 'gate_blocked', 'cancelled'];

const ALLOWED = {
  created: ['running', 'cancelled'],
  running: ['running', 'needs_input', 'stage_failed', 'gate_blocked', 'published', 'published_with_gaps', 'confirmed', 'cancelled'],
  needs_input: ['running', 'cancelled'],
  stage_failed: ['running', 'cancelled'],
  gate_blocked: ['running', 'cancelled'],
  published: ['running'], // re-run creates a new version
  published_with_gaps: ['running'],
  confirmed: ['running'],
  cancelled: ['running'],
};

export const DONE = new Set(['published', 'published_with_gaps', 'confirmed']);

export class TransitionError extends Error {}

export function canTransition(from, to) {
  return (ALLOWED[from] || []).includes(to);
}

export function assertTransition(from, to) {
  if (!canTransition(from, to)) throw new TransitionError(`Illegal transition ${from} -> ${to}`);
}

export function isResumable(state) {
  return RESUMABLE.includes(state);
}

/** UI stage states, derived from the study. Kept identical to the Vantage Point stepper: pending/running/passed/attention/failed. */
export function stageStates(study, uiStages) {
  return Object.fromEntries(
    uiStages.map((s) => {
      const st = study.stages?.[s]?.status || 'pending';
      return [s, st];
    }),
  );
}
