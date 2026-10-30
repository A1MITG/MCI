// 00 Read the question: work out the company, perspective, geography and period from the question alone,
// so the user can start a study by typing one question. Anything the user typed wins over the model.
import { callModel, json } from './common.js';
import { PERSPECTIVES } from '../core/inputs.js';

const SHAPE = `{"subject": "", "me": "", "perspective": "competitor | own_company | market", "geography": "", "period": "", "title": ""}`;
export const LATEST_PERIOD = 'Latest available fiscal year';

export const understand = {
  name: 'understand',
  async execute(study, deps) {
    const given = study.inputs;
    const missing = ['subject', 'perspective', 'geography', 'period'].filter((k) => (k === 'subject' ? !given.subject?.name : !given[k]));
    if (!missing.length) return { study, outcome: 'pass' };

    const out = await callModel(study, deps, 'understand', {
      user: `Question: ${json(given.question)}\nAlready given by the user (keep these): ${json({ subject: given.subject?.name || null, me: given.me?.name || null, perspective: given.perspective, geography: given.geography || null, period: given.period || null })}\n\nReply with JSON shaped like:\n${SHAPE}`,
    });

    const text = (v) => String(v ?? '').trim();
    const inferred = [];
    const set = (key, value) => {
      if (value) inferred.push(key);
      return value;
    };
    const inputs = { ...given };
    if (!given.subject?.name) inputs.subject = { name: set('subject', text(out.subject)) };
    if (!given.me?.name && text(out.me)) inputs.me = { name: set('me', text(out.me)) };
    if (!given.perspective) inputs.perspective = set('perspective', PERSPECTIVES.includes(out.perspective) ? out.perspective : inputs.me?.name ? 'competitor' : 'market');
    if (!given.geography) inputs.geography = set('geography', text(out.geography) || 'Global');
    if (!given.period) inputs.period = set('period', text(out.period) || LATEST_PERIOD);
    if (!given.title && text(out.title)) inputs.title = text(out.title).slice(0, 120);
    inputs.inferred = inferred;
    study.inputs = inputs;

    const reasons = inputs.subject.name ? [] : ['Could not tell which company to study from the question. Name it in the question or under More options.'];
    return { study, outcome: reasons.length ? 'fail' : 'pass', exit: { pass: !reasons.length, reasons } };
  },
};
