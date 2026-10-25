// The runner walks the workflow graph for one study at a time per study ID.
// It owns: legal state transitions, retries, loop and stage-run limits, the scope pause,
// budget approvals, cancellation, persistence after every stage, and the event log.
import { GRAPH, nextNode } from './graph.js';
import { assertTransition, isResumable, DONE } from './state.js';
import { withRetry } from './retry.js';
import { RunError, runError } from './errors.js';
import { createBudget } from './budget.js';
import { STAGES } from '../stages/index.js';
import { renderReport } from '../report/render-html.js';

export class Runner {
  /** deps: {config, store, llm, search, fetcher, findNewer?} */
  constructor(deps) {
    this.deps = deps;
    this.budget = createBudget(deps.config);
    this.active = new Map(); // study_id -> AbortController (the per-study lease)
  }

  isRunning(id) {
    return this.active.has(id);
  }

  /** Start or resume a study. `from` re-runs from a named stage (creates a new version on finish). */
  async run(id, { from } = {}) {
    if (this.active.has(id)) throw runError('locked', `Study ${id} is already running`);
    const { store, config } = this.deps;
    let study = await store.get(id);
    if (study.locked) throw runError('locked', `Study ${id} is locked. Unlock it to run.`);
    if (study.pending_input && !study.pending_input.answered) throw runError('config_error', `Study ${id} is waiting for input: ${study.pending_input.type}`);
    if (!isResumable(study.state) && !DONE.has(study.state)) throw runError('config_error', `Study ${id} cannot run from state ${study.state}`);
    if (from && !GRAPH.nodes[from]) throw runError('config_error', `Unknown stage ${from}`);

    const controller = new AbortController();
    this.active.set(id, controller);
    const emit = (type, data = {}) => store.appendEvent(id, type, data);
    const deps = { ...this.deps, budget: this.budget, signal: controller.signal, emit };
    try {
      if (from || DONE.has(study.state) || !study.cursor) {
        study.cursor = from || GRAPH.start;
        study.loop_counts = {};
        study.stage_runs = 0;
      }
      study = await this.#transition(study, 'running');
      study.pending_input = null;

      while (study.cursor && !study.cursor.startsWith('@')) {
        if (controller.signal.aborted) throw runError('cancelled', 'Cancelled');
        if (study.stage_runs >= config.harness.loops.maxStageRunsPerStudy) throw runError('budget_exceeded', 'Stage-run limit for the study reached', { cause: { key: 'maxStageRunsPerStudy' } });
        const node = study.cursor;
        const stage = STAGES[node];
        study.stage = node;
        study.stage_runs += 1;
        study.stages = { ...(study.stages || {}), [node]: { ...(study.stages?.[node] || {}), status: 'running', started_at: new Date().toISOString(), runs: (study.stages?.[node]?.runs || 0) + 1 } };
        study = await this.#persist(study);
        await emit('stage_started', { stage: node });

        const base = study;
        const result = await withRetry((attempt) => stage.execute(structuredClone(base), { ...deps, attempt }), config.harness.retry, {
          signal: controller.signal,
          onRetry: (err, attempt, delay) => emit('stage_retry', { stage: node, attempt, delay_ms: Math.round(delay), error: err.toJSON?.() || String(err) }),
        });
        if (controller.signal.aborted) throw runError('cancelled', 'Cancelled');
        study = result.study;
        const exit = result.exit || { pass: true, reasons: [] };
        study.stages[node] = { ...study.stages[node], status: result.outcome === 'fail' ? 'failed' : exit.pass ? 'passed' : 'attention', exit, outcome: result.outcome, finished_at: new Date().toISOString() };
        await emit('stage_finished', { stage: node, outcome: result.outcome, exit });

        if (result.outcome === 'fail') {
          study.error = { code: 'exit_check_failed', stage: node, message: exit.reasons.join('; ') };
          study = await this.#transition(study, 'stage_failed');
          return study;
        }

        const next = nextNode(node, result.outcome, study.loop_counts, config.harness.loops.maxLoopBacksPerStage);
        if (next.loopKey) study.loop_counts[next.loopKey] = (study.loop_counts[next.loopKey] || 0) + 1;
        if (next.loopExhausted) study.loop_limits_hit = [...new Set([...(study.loop_limits_hit || []), next.loopExhausted])];
        study.cursor = next.to;

        const pause = GRAPH.nodes[node].pauseAfter;
        if (pause && !next.to.startsWith('@')) {
          study.pending_input = { type: pause, question: study.scope?.confirmation?.question, options: study.scope?.confirmation?.options, answered: false };
          study = await this.#transition(study, 'needs_input');
          await emit('needs_input', { input: pause });
          return study;
        }
      }

      const final = study.cursor.slice(1);
      study.cursor = null;
      study.stage = null;
      study.error = null;
      study = await this.#transition(study, final);
      await this.#writeReport(study);
      await store.snapshotVersion(id, `Run finished: ${final}`);
      await emit('run_finished', { state: final });
      return store.get(id);
    } catch (err) {
      return this.#fail(id, study, err, emit);
    } finally {
      this.active.delete(id);
    }
  }

  /** Answer a pending question: scope confirmation or a budget raise. The caller then calls run(). */
  async answer(id, answer) {
    return this.deps.store.update(id, (study) => {
      const p = study.pending_input;
      if (study.state !== 'needs_input' || !p || p.answered) throw runError('config_error', `Study ${id} has no pending question`);
      if (p.type === 'scope_confirmation') {
        if (!p.options?.includes(answer.choice)) throw runError('config_error', `Choose one of: ${p.options.join(' | ')}`);
        study.scope.confirmed_by_user = { choice: answer.choice, notes: answer.notes || null, at: new Date().toISOString() };
      } else if (p.type === 'budget_raise') {
        if (!answer.approve) throw runError('config_error', 'Budget raise not approved; the study stays paused');
        study.budget_overrides = { ...(study.budget_overrides || {}), [p.key]: Number(answer.new_limit) || Math.ceil((p.max || 0) * 1.5) };
      }
      study.pending_input = { ...p, answered: true, answer };
      return study;
    });
  }

  cancel(id) {
    const c = this.active.get(id);
    if (!c) return false;
    c.abort();
    return true;
  }

  async #fail(id, study, err, emit) {
    const { store } = this.deps;
    const e = err instanceof RunError ? err : runError('provider_error', err?.message || String(err), { cause: err });
    const current = await store.get(id).catch(() => study);
    if (current.locked) return current; // locked mid-run: leave the record as the user locked it
    let next = { ...study, error: { code: e.code, stage: study.stage, message: e.message } };
    if (study.stage && next.stages?.[study.stage]) next.stages[study.stage].status = 'failed';
    let state = 'stage_failed';
    if (e.code === 'cancelled') state = 'cancelled';
    if (e.code === 'budget_exceeded') {
      state = 'needs_input';
      next.pending_input = { type: 'budget_raise', ...(e.cause || {}), message: e.message, answered: false };
    }
    if (next.state !== state) next = await this.#transition(next, state);
    else next = await this.#persist(next);
    await emit('run_stopped', { state, error: next.error });
    return next;
  }

  async #transition(study, to) {
    assertTransition(study.state, to);
    await this.deps.store.appendEvent(study.study_id, 'state_changed', { from: study.state, to });
    return this.#persist({ ...study, state: to });
  }

  /** Persist the runner's copy, keeping the user-owned lifecycle fields from disk. */
  #persist(study) {
    return this.deps.store.update(study.study_id, (cur) => ({
      ...study,
      version: cur.version,
      change_log: cur.change_log,
      saved: cur.saved,
      saved_at: cur.saved_at,
      locked: cur.locked,
    }));
  }

  async #writeReport(study) {
    const events = await this.deps.store.events(study.study_id);
    await this.deps.store.writeOutput(study.study_id, 'report.html', renderReport(study, { config: this.deps.config, events }));
  }
}
