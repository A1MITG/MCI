// HTTP API. Thin: every route delegates to the store or the runner. Runs are started in the
// background and observed through GET /api/studies/:id and /events.
import express from 'express';
import path from 'node:path';
import { StudyLockedError, StudyNotFoundError } from '../store/study-store.js';
import { RunError } from '../core/errors.js';
import { TransitionError } from '../core/state.js';

export function createServer(harness) {
  const { store, runner, config } = harness;
  const app = express();
  app.disable('x-powered-by');
  app.use(express.json({ limit: '200kb' }));
  app.use(express.static(path.join(config.root, 'public')));
  // The previous full form, kept as a backup page.
  app.get('/classic', (req, res) => res.sendFile(path.join(config.root, 'public', 'classic.html')));

  const route = (fn) => async (req, res) => {
    try {
      res.json(await fn(req, res));
    } catch (e) {
      const [status, code] = statusFor(e);
      res.status(status).json({ ok: false, error: { code, message: e.message } });
    }
  };
  const startInBackground = (id, opts) => {
    runner.run(id, opts).catch((e) => store.appendEvent(id, 'run_error', { message: e.message }).catch(() => {}));
  };
  const summary = (s) => ({ study_id: s.study_id, title: s.inputs.title || s.inputs.question, subject: s.inputs.subject?.name || null, state: s.state, stage: s.stage, version: s.version, saved: s.saved, locked: s.locked, updated_at: s.updated_at, error: s.error?.message || null, stage_started_at: s.stages?.[s.stage]?.started_at || null, sources: s.sources?.length || 0, loops: Object.values(s.loop_counts || {}).reduce((a, b) => a + b, 0), running: runner.isRunning(s.study_id) });

  app.get('/api/health', route(() => ({ ok: true, search: config.providers.search, llm: config.providers.llm })));
  app.get('/api/studies', route(async () => ({ ok: true, studies: (await store.list()).map(summary) })));
  app.post('/api/studies', route(async (req, res) => {
    const s = await harness.createStudy(req.body);
    if (req.body?.start !== false) startInBackground(s.study_id);
    res.status(201);
    return { ok: true, study: summary(s) };
  }));
  app.get('/api/studies/:id', route(async (req) => ({ ok: true, study: { ...(await store.get(req.params.id)), running: runner.isRunning(req.params.id) } })));
  app.get('/api/studies/:id/events', route(async (req) => ({ ok: true, events: await store.events(req.params.id) })));
  app.get('/api/studies/:id/versions', route(async (req) => ({ ok: true, versions: await store.versions(req.params.id) })));

  app.post('/api/studies/:id/answer', route(async (req) => {
    const s = await runner.answer(req.params.id, req.body || {});
    startInBackground(req.params.id);
    return { ok: true, study: summary(s) };
  }));
  app.post('/api/studies/:id/run', route(async (req) => {
    const s = await store.get(req.params.id);
    if (s.locked) throw new StudyLockedError(s.study_id);
    startInBackground(req.params.id, { from: req.body?.from });
    return { ok: true, started: true };
  }));
  app.post('/api/studies/:id/cancel', route(async (req) => ({ ok: true, cancelled: runner.cancel(req.params.id) })));

  app.post('/api/studies/:id/save', route(async (req) => ({ ok: true, study: summary(await store.save(req.params.id)) })));
  app.post('/api/studies/:id/lock', route(async (req) => {
    if (runner.isRunning(req.params.id)) throw new RunError('locked', 'Cancel the run or let it finish before locking');
    return { ok: true, study: summary(await store.lock(req.params.id)) };
  }));
  app.post('/api/studies/:id/unlock', route(async (req) => ({ ok: true, study: summary(await store.unlock(req.params.id)) })));
  app.delete('/api/studies/:id', route(async (req) => {
    if (runner.isRunning(req.params.id)) throw new RunError('locked', 'Cancel the run before deleting');
    return { ok: true, ...(await store.delete(req.params.id)) };
  }));
  app.post('/api/studies/:id/rollback', route(async (req) => {
    if (runner.isRunning(req.params.id)) throw new RunError('locked', 'Cancel the run before rolling back');
    return { ok: true, study: summary(await store.rollback(req.params.id, Number(req.body?.version))) };
  }));

  app.get('/api/studies/:id/report.html', async (req, res) => {
    try {
      const html = await store.readOutput(req.params.id, 'report.html');
      if (!html) return res.status(404).json({ ok: false, error: { code: 'not_found', message: 'No report yet' } });
      res.type('html').set('Content-Security-Policy', "default-src 'none'; style-src 'unsafe-inline'; script-src 'unsafe-inline'; img-src data:").send(html);
    } catch (e) {
      const [status, code] = statusFor(e);
      res.status(status).json({ ok: false, error: { code, message: e.message } });
    }
  });

  return app;
}

function statusFor(e) {
  if (e instanceof StudyNotFoundError) return [404, 'not_found'];
  if (e instanceof StudyLockedError) return [423, 'locked'];
  if (e instanceof TransitionError) return [409, 'illegal_transition'];
  if (e.code === 'invalid_input') return [400, 'invalid_input'];
  if (e instanceof RunError) return [e.code === 'locked' ? 409 : 400, e.code];
  return [500, 'internal_error'];
}
