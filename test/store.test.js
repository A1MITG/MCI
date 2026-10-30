import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { FileStudyStore, StudyLockedError, StudyNotFoundError, renameWithRetry } from '../src/store/study-store.js';

const fresh = async (clock) => new FileStudyStore(await mkdtemp(path.join(tmpdir(), 'vp-store-')), clock ? { clock } : {});

test('save, lock, unlock and delete', async () => {
  const store = await fresh();
  const s = await store.create({ inputs: { question: 'q' }, state: 'created' });
  assert.equal(s.saved, false);
  assert.equal((await store.save(s.study_id)).saved, true);

  await store.lock(s.study_id);
  await assert.rejects(store.update(s.study_id, (x) => ({ ...x, note: 'edit' })), StudyLockedError);
  await assert.rejects(store.delete(s.study_id), StudyLockedError);

  await store.unlock(s.study_id);
  assert.equal((await store.update(s.study_id, (x) => ({ ...x, note: 'edit' }))).note, 'edit');
  await store.delete(s.study_id);
  await assert.rejects(store.get(s.study_id), StudyNotFoundError);

  const types = (await store.events(s.study_id)).map((e) => e.type);
  assert.deepEqual(types, [], 'events go with the study when it is deleted');
});

test('versions and rollback keep history; locked studies cannot be rolled back', async () => {
  const store = await fresh();
  const s = await store.create({ inputs: { question: 'q' }, answer: 'first' });
  await store.snapshotVersion(s.study_id, 'first answer');
  await store.update(s.study_id, (x) => ({ ...x, answer: 'second' }));
  await store.lock(s.study_id);
  await assert.rejects(store.rollback(s.study_id, 1), StudyLockedError, 'a locked study is read-only');
  await store.unlock(s.study_id);
  const restored = await store.rollback(s.study_id, 1);
  assert.equal(restored.answer, 'first');
  assert.equal(restored.version, 3);
  assert.deepEqual(await store.versions(s.study_id), [1, 2]);
  assert.match(restored.change_log.at(-1).summary, /Rolled back to v1/);
});

test('purge removes only old, unsaved, unlocked studies', async () => {
  let now = new Date('2026-01-01T00:00:00Z');
  const store = await fresh(() => now);
  const keep = await store.create({ inputs: {} });
  const locked = await store.create({ inputs: {} });
  const drop = await store.create({ inputs: {} });
  await store.save(keep.study_id);
  await store.lock(locked.study_id);
  now = new Date('2026-03-01T00:00:00Z');
  assert.deepEqual(await store.purgeExpired(30), [drop.study_id]);
  assert.equal((await store.list()).length, 2);
});

test('snapshots are content-addressed and reused', async () => {
  const store = await fresh();
  const s = await store.create({ inputs: {} });
  const a = await store.putSnapshot(s.study_id, { url: 'https://x', text: 'hello world' });
  const b = await store.putSnapshot(s.study_id, { url: 'https://y', text: 'hello world' });
  assert.equal(a.sha256, b.sha256);
  assert.equal(b.reused, true);
  assert.equal(await store.getSnapshot(s.study_id, a.sha256), 'hello world');
  assert.equal(await store.getSnapshot(s.study_id, '../../etc/passwd'), null);
});

test('study IDs cannot escape the data folder', async () => {
  const store = await fresh();
  await assert.rejects(store.get('../secrets'), StudyNotFoundError);
});

test('atomic writes retry when Windows briefly locks the target file', async () => {
  let calls = 0;
  const flaky = async () => {
    calls += 1;
    if (calls < 3) throw Object.assign(new Error('locked'), { code: 'EPERM' });
  };
  await renameWithRetry('a', 'b', { renameImpl: flaky });
  assert.equal(calls, 3);
  const missing = async () => { throw Object.assign(new Error('gone'), { code: 'ENOENT' }); };
  await assert.rejects(renameWithRetry('a', 'b', { renameImpl: missing }), /gone/);
});
