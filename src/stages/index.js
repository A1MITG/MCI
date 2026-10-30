// Node name in the workflow graph -> stage module. Every module exposes execute(study, deps) -> {study, outcome, exit}.
import { understand } from './understand.js';
import { lookup, recheck } from './lookup.js';
import { scope } from './scope.js';
import { collect } from './collect.js';
import { validate } from './validate.js';
import { analyse } from './analyse.js';
import { challenge } from './challenge.js';
import { publish } from './publish.js';

export const STAGES = { understand, lookup, recheck, scope, collect, validate, analyse, challenge, publish };
