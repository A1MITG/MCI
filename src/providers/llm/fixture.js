// Offline model for tests and evals. `responses` maps stage name -> object | (request) => object.
import { runError } from '../../core/errors.js';

export function fixtureLLM({ responses = {} } = {}) {
  const calls = [];
  return {
    name: 'fixture',
    calls,
    async json(req) {
      calls.push(req);
      const r = responses[req.stage];
      if (r === undefined) throw runError('provider_error', `No fixture response for stage "${req.stage}"`);
      const data = typeof r === 'function' ? r(req, calls.filter((c) => c.stage === req.stage).length) : structuredClone(r);
      return { data, usage: { input_tokens: 0, output_tokens: 0, cache_read_input_tokens: 0 } };
    },
  };
}
