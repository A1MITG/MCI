// The study workflow as data. The runner walks this graph; nothing else hard-codes stage order.
//
//   lookup ─▶ scope ─▶ [user confirms] ─▶ collect ─▶ validate ─▶ analyse ─▶ challenge ─▶ publish
//     │                                     ▲           │                     │
//     └─▶ recheck (prior study found)       └── loop ───┘ (RQ lacks source)   └── loop (needs counter-evidence)
//            ├─ no material change ─▶ confirmed (reuse prior, new version)
//            └─ material change   ─▶ scope (full redo, seeded with prior sources)

export const GRAPH = {
  version: '1.0.0',
  start: 'lookup',
  nodes: {
    lookup: { label: '00 Library check', ui: false },
    recheck: { label: '00 Recheck prior study', ui: false },
    scope: { label: '01 Scope', ui: true, pauseAfter: 'scope_confirmation' },
    collect: { label: '02 Collect', ui: true },
    validate: { label: '03 Validate', ui: true },
    analyse: { label: '04 Analyse', ui: true },
    challenge: { label: '05 Challenge', ui: true, independent: true },
    publish: { label: '06 Publish', ui: true, terminal: true },
  },
  // Each edge: from -> to when `on` outcome is returned by the stage's exit check.
  edges: [
    { from: 'lookup', on: 'no_prior', to: 'scope' },
    { from: 'lookup', on: 'prior_found', to: 'recheck' },
    { from: 'recheck', on: 'material_change', to: 'scope' },
    { from: 'recheck', on: 'no_material_change', to: '@confirmed' },
    { from: 'scope', on: 'pass', to: 'collect' },
    { from: 'collect', on: 'pass', to: 'validate' },
    { from: 'validate', on: 'pass', to: 'analyse' },
    { from: 'validate', on: 'needs_sources', to: 'collect', loop: true },
    { from: 'analyse', on: 'pass', to: 'challenge' },
    { from: 'challenge', on: 'pass', to: 'publish' },
    { from: 'challenge', on: 'needs_counter_evidence', to: 'collect', loop: true },
    { from: 'publish', on: 'pass', to: '@published' },
    { from: 'publish', on: 'pass_with_gaps', to: '@published_with_gaps' },
    { from: 'publish', on: 'gate_blocked', to: '@gate_blocked' },
  ],
};

export const UI_STAGES = Object.entries(GRAPH.nodes).filter(([, n]) => n.ui).map(([k]) => k);

/** Resolve the next node for a stage outcome. A loop edge past its limit falls through to the stage's 'pass' edge. */
export function nextNode(from, outcome, loopCounts, maxLoopBacks) {
  const edge = GRAPH.edges.find((e) => e.from === from && e.on === outcome);
  if (!edge) throw new Error(`No edge from "${from}" on "${outcome}"`);
  if (edge.loop) {
    const key = `${from}->${edge.to}`;
    if ((loopCounts[key] || 0) >= maxLoopBacks) {
      return { ...nextNode(from, 'pass', loopCounts, maxLoopBacks), loopExhausted: key };
    }
    return { to: edge.to, loopKey: key };
  }
  return { to: edge.to };
}
