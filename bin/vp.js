#!/usr/bin/env node
// Command line for study lifecycle controls. Works on the same data folder as the server.
//   vp list | show <id> | save <id> | lock <id> | unlock <id> | delete <id> | versions <id>
//   vp rollback <id> <version> | report <id> | purge
import path from 'node:path';
import { loadConfig, loadDotEnv } from '../src/config.js';
import { FileStudyStore } from '../src/store/study-store.js';

loadDotEnv();
const config = loadConfig();
const store = new FileStudyStore(config.dataDir);
const [cmd, id, arg] = process.argv.slice(2);

const commands = {
  async list() {
    for (const s of await store.list()) {
      console.log(`${s.study_id}  ${s.state.padEnd(20)} v${s.version}  ${s.saved ? 'saved ' : 'unsaved'} ${s.locked ? 'locked' : '      '}  ${s.inputs.title || s.inputs.question}`);
    }
  },
  show: async () => console.log(JSON.stringify(await store.get(id), null, 2)),
  save: async () => console.log(`Saved ${(await store.save(id)).study_id}`),
  lock: async () => console.log(`Locked ${(await store.lock(id)).study_id}`),
  unlock: async () => console.log(`Unlocked ${(await store.unlock(id)).study_id}`),
  delete: async () => console.log(`Deleted ${(await store.delete(id)).deleted}`),
  versions: async () => console.log((await store.versions(id)).map((v) => `v${v}`).join(' ')),
  rollback: async () => console.log(`Rolled back ${id} to v${arg}; now v${(await store.rollback(id, Number(arg), 'cli')).version}`),
  report: async () => {
    await store.get(id);
    console.log(path.join(config.dataDir, id, 'report.html'));
  },
  purge: async () => console.log(`Purged: ${(await store.purgeExpired(config.harness.retention.unsavedDays)).join(', ') || 'none'}`),
};

if (!commands[cmd]) {
  console.log('Usage: vp list | show|save|lock|unlock|delete|versions|report <id> | rollback <id> <version> | purge');
  process.exitCode = cmd ? 1 : 0;
} else {
  try {
    await commands[cmd]();
  } catch (e) {
    console.error(e.message);
    process.exitCode = 1;
  }
}
