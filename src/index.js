// Entry point: node src/index.js (npm start). Loads .env if present, purges expired unsaved studies, serves the API.
import { createHarness } from './app.js';
import { loadConfig, loadDotEnv } from './config.js';
import { createServer } from './server/app.js';

loadDotEnv();
const config = loadConfig();
const harness = createHarness({ config });
const purged = await harness.store.purgeExpired(config.harness.retention.unsavedDays);
if (purged.length) console.log(`Purged ${purged.length} unsaved studies older than ${config.harness.retention.unsavedDays} days`);
createServer(harness).listen(config.port, () => {
  console.log(`Vantage Point harness on http://localhost:${config.port} (search: ${config.providers.search}, model: ${config.providers.llm})`);
});
