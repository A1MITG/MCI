const express = require('express');
const bodyParser = require('body-parser');
const path = require('path');
const fs = require('fs-extra');
require('dotenv').config({ path: path.join(__dirname, '.env') });
const aiClient = require('./aiClient');

const app = express();
const PORT = process.env.PORT || 3000;

app.use(bodyParser.json());
app.use(express.static(path.join(__dirname, 'public')));

// Analyze single company
app.post('/api/analyze', async (req, res) => {
  try {
    const { company, region } = req.body;
    if (!company) return res.status(400).json({ error: 'company is required' });
    const result = await aiClient.generateAnalysis({ company, region });
    res.json({ ok: true, data: result });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: err.message || String(err) });
  }
});

// Run sample on 5 insurance companies and store results
app.post('/api/run-sample', async (req, res) => {
  try {
    const companies = req.body.companies || [
      'Allianz',
      'AXA',
      'Prudential',
      'MetLife',
      'AIA Group'
    ];

    const results = [];
    for (const c of companies) {
      const out = await aiClient.generateAnalysis({ company: c, region: 'global' });
      results.push({ company: c, timestamp: new Date().toISOString(), analysis: out });
    }

    const dataDir = path.join(__dirname, 'data');
    await fs.ensureDir(dataDir);
    const outPath = path.join(dataDir, 'insurance_samples.json');
    await fs.writeJson(outPath, { generatedAt: new Date().toISOString(), samples: results }, { spaces: 2 });

    res.json({ ok: true, path: '/data/insurance_samples.json', samples: results });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: err.message || String(err) });
  }
});

// Serve stored samples
app.get('/api/samples', async (req, res) => {
  try {
    const outPath = path.join(__dirname, 'data', 'insurance_samples.json');
    if (!(await fs.pathExists(outPath))) return res.status(404).json({ error: 'samples not found' });
    const data = await fs.readJson(outPath);
    res.json({ ok: true, data });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: err.message || String(err) });
  }
});

// fallback to index.html
app.get('*', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

app.listen(PORT, () => {
  console.log(`MCI Platform server listening on http://localhost:${PORT}`);
});
