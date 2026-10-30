// File-based study store: one folder per study, atomic writes, append-only event log, versions for rollback.
//
// data/studies/<id>/
//   study.json            current record (atomic tmp + rename)
//   events.jsonl          append-only audit log
//   versions/v<N>.json    snapshot at each save, publish or rollback
//   snapshots/<sha>.txt   saved copy of every fetched source (+ <sha>.meta.json)
//
// Lifecycle controls: save, lock, unlock, delete, rollback. A locked study is read-only.
import { mkdir, readFile, writeFile, rename, rm, readdir, appendFile, stat } from 'node:fs/promises';
import { createHash, randomBytes } from 'node:crypto';
import path from 'node:path';

export class StudyLockedError extends Error {
  constructor(id) {
    super(`Study ${id} is locked. Unlock it first.`);
    this.code = 'locked';
  }
}
export class StudyNotFoundError extends Error {
  constructor(id) {
    super(`Study ${id} not found`);
    this.code = 'not_found';
  }
}

export function newStudyId(now = Date.now()) {
  return `st_${now.toString(36)}${randomBytes(5).toString('hex')}`;
}

export class FileStudyStore {
  constructor(root, { clock = () => new Date() } = {}) {
    this.root = root;
    this.clock = clock;
    this.queues = new Map(); // per-study write serialisation
  }

  dir(id) {
    if (!/^st_[a-z0-9]+$/.test(id)) throw new StudyNotFoundError(id);
    return path.join(this.root, id);
  }

  async create(record) {
    const id = record.study_id || newStudyId(this.clock().getTime());
    const now = this.clock().toISOString();
    const study = { ...record, study_id: id, version: 1, created_at: now, updated_at: now, saved: false, locked: false, change_log: [{ version: 1, at: now, by: 'system', summary: 'Created' }] };
    await mkdir(path.join(this.dir(id), 'versions'), { recursive: true });
    await mkdir(path.join(this.dir(id), 'snapshots'), { recursive: true });
    await this.#write(id, study);
    await this.appendEvent(id, 'study_created', { inputs: study.inputs });
    return study;
  }

  async get(id) {
    try {
      return JSON.parse(await readFile(path.join(this.dir(id), 'study.json'), 'utf8'));
    } catch (e) {
      if (e.code === 'ENOENT') throw new StudyNotFoundError(id);
      throw e;
    }
  }

  async list() {
    let names = [];
    try {
      names = await readdir(this.root);
    } catch (e) {
      if (e.code === 'ENOENT') return [];
      throw e;
    }
    const out = [];
    for (const n of names.filter((n) => n.startsWith('st_'))) {
      try {
        out.push(await this.get(n));
      } catch {
        /* skip half-written folders */
      }
    }
    return out.sort((a, b) => b.updated_at.localeCompare(a.updated_at));
  }

  /** Apply `mutate(study) -> study` atomically. Refuses locked studies unless opts.allowLocked. */
  update(id, mutate, { allowLocked = false } = {}) {
    return this.#serialise(id, async () => {
      const current = await this.get(id);
      if (current.locked && !allowLocked) throw new StudyLockedError(id);
      const next = await mutate(structuredClone(current));
      next.updated_at = this.clock().toISOString();
      await this.#write(id, next);
      return next;
    });
  }

  async appendEvent(id, type, data = {}) {
    const line = JSON.stringify({ ...data, at: this.clock().toISOString(), type });
    await appendFile(path.join(this.dir(id), 'events.jsonl'), `${line}\n`);
  }

  async events(id) {
    try {
      const raw = await readFile(path.join(this.dir(id), 'events.jsonl'), 'utf8');
      return raw.split('\n').filter(Boolean).map((l) => JSON.parse(l));
    } catch (e) {
      if (e.code === 'ENOENT') return [];
      throw e;
    }
  }

  // ---- lifecycle controls -------------------------------------------------

  async save(id, by = 'user') {
    await this.update(id, (st) => ({ ...st, saved: true, saved_at: this.clock().toISOString() }));
    await this.snapshotVersion(id, `Saved by ${by}`);
    await this.appendEvent(id, 'study_saved', { by });
    return this.get(id);
  }

  async lock(id, by = 'user') {
    const s = await this.update(id, (st) => ({ ...st, locked: true, locked_at: this.clock().toISOString(), locked_by: by }), { allowLocked: true });
    await this.appendEvent(id, 'study_locked', { by });
    return s;
  }

  async unlock(id, by = 'user') {
    const s = await this.update(id, (st) => ({ ...st, locked: false, locked_at: null, locked_by: null }), { allowLocked: true });
    await this.appendEvent(id, 'study_unlocked', { by });
    return s;
  }

  async delete(id) {
    const s = await this.get(id);
    if (s.locked) throw new StudyLockedError(id);
    await rm(this.dir(id), { recursive: true, force: true });
    return { deleted: id };
  }

  /** Write the current record to versions/v<N>.json and bump the version number. */
  async snapshotVersion(id, summary, { allowLocked = false } = {}) {
    return this.update(
      id,
      async (st) => {
        await writeFile(path.join(this.dir(id), 'versions', `v${st.version}.json`), JSON.stringify(st, null, 2));
        const version = st.version + 1;
        return { ...st, version, change_log: [...(st.change_log || []), { version, at: this.clock().toISOString(), by: 'system', summary }] };
      },
      { allowLocked },
    );
  }

  async versions(id) {
    const names = await readdir(path.join(this.dir(id), 'versions')).catch(() => []);
    return names.map((n) => Number(n.match(/^v(\d+)\.json$/)?.[1])).filter(Boolean).sort((a, b) => a - b);
  }

  /** Restore an earlier version as the new current version. History is kept, never rewritten. */
  async rollback(id, version, by = 'user') {
    const file = path.join(this.dir(id), 'versions', `v${version}.json`);
    const old = JSON.parse(await readFile(file, 'utf8').catch(() => { throw new Error(`Version ${version} of ${id} not found`); }));
    const restored = await this.update(id, async (st) => {
      await writeFile(path.join(this.dir(id), 'versions', `v${st.version}.json`), JSON.stringify(st, null, 2));
      const v = st.version + 1;
      return {
        ...old,
        version: v,
        saved: st.saved,
        locked: false,
        change_log: [...(st.change_log || []), { version: v, at: this.clock().toISOString(), by, summary: `Rolled back to v${version}` }],
      };
    });
    await this.appendEvent(id, 'study_rolled_back', { to: version, by });
    return restored;
  }

  /** Delete unsaved, unlocked studies older than `days`. Returns deleted ids. */
  async purgeExpired(days) {
    const cutoff = this.clock().getTime() - days * 86_400_000;
    const deleted = [];
    for (const s of await this.list()) {
      if (!s.saved && !s.locked && Date.parse(s.updated_at) < cutoff) {
        await this.delete(s.study_id);
        deleted.push(s.study_id);
      }
    }
    return deleted;
  }

  // ---- source snapshots ----------------------------------------------------

  async putSnapshot(id, { url, text, contentType = 'text/plain', status = 200, fetchedAt }) {
    const sha256 = createHash('sha256').update(text).digest('hex');
    const base = path.join(this.dir(id), 'snapshots', sha256);
    const exists = await stat(`${base}.txt`).then(() => true, () => false);
    if (!exists) {
      await writeFile(`${base}.txt`, text);
      await writeFile(`${base}.meta.json`, JSON.stringify({ url, contentType, status, fetchedAt: fetchedAt || this.clock().toISOString(), sha256 }, null, 2));
    }
    return { sha256, path: path.relative(this.root, `${base}.txt`), reused: exists };
  }

  async getSnapshot(id, sha256) {
    if (!/^[a-f0-9]{64}$/.test(sha256)) return null;
    return readFile(path.join(this.dir(id), 'snapshots', `${sha256}.txt`), 'utf8').catch(() => null);
  }

  // ---- rendered outputs (report.html) -----------------------------------------

  async writeOutput(id, name, content) {
    if (!/^[a-z0-9-]+\.(html|json|csv)$/.test(name)) throw new Error(`Bad output name ${name}`);
    const file = path.join(this.dir(id), name);
    await writeFile(`${file}.tmp`, content);
    await rename(`${file}.tmp`, file);
    return file;
  }

  async readOutput(id, name) {
    if (!/^[a-z0-9-]+\.(html|json|csv)$/.test(name)) return null;
    return readFile(path.join(this.dir(id), name), 'utf8').catch(() => null);
  }

  // ---- internals -------------------------------------------------------------

  async #write(id, study) {
    const file = path.join(this.dir(id), 'study.json');
    const tmp = `${file}.${process.pid}.${Date.now()}.tmp`;
    await writeFile(tmp, JSON.stringify(study, null, 2));
    await rename(tmp, file);
  }

  #serialise(id, fn) {
    const prev = this.queues.get(id) || Promise.resolve();
    const next = prev.then(fn, fn);
    this.queues.set(id, next.catch(() => {}));
    return next;
  }
}
