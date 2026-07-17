const axios = require('axios');

// AI client: supports mock mode. If OPENAI_API_KEY present and MOCK not set,
// we'll call OpenAI's Chat Completions API to request a structured JSON analysis.

const OPENAI_API_KEY = process.env.OPENAI_API_KEY;
const MOCK = process.env.MOCK === 'true' || !OPENAI_API_KEY;

async function generateAnalysis({ company, region = 'global' }) {
  if (MOCK) return mockedAnalysis(company, region);

  try {
    const systemPrompt = `You are an expert market & competitive intelligence analyst. Given a company name and region, produce a JSON object containing the following keys: company, region, executiveSummary (string), competitorDiscovery (object with topCompetitors array and notes), marketSizing (object with TAM, SAM, SOM, growthRate), companyXRay (object with businessModel, revenueEstimate, leadership array, techStack array), alerts (array of {type,text}), scenarioSimulations (array of {scenario,impact}), generatedAt (ISO timestamp). Respond ONLY with valid JSON.`;

    const userPrompt = `Analyze the company: name=${company}; region=${region}. Keep outputs concise but informative. Use best-effort public facts and reasonable estimates. Mark any estimate as (estimate).`;

    const resp = await axios.post('https://api.openai.com/v1/chat/completions', {
      model: 'gpt-4o-mini',
      messages: [
        { role: 'system', content: systemPrompt },
        { role: 'user', content: userPrompt }
      ],
      temperature: 0.2,
      max_tokens: 800
    }, {
      headers: {
        'Authorization': `Bearer ${OPENAI_API_KEY}`,
        'Content-Type': 'application/json'
      },
      timeout: 20000
    });

    const raw = resp.data?.choices?.[0]?.message?.content || resp.data?.choices?.[0]?.text;
    if (!raw) throw new Error('No content from OpenAI');

    // Try to parse JSON. If the model returned extra text, extract the JSON block.
    let parsed = tryParseJson(raw);
    if (!parsed) {
      // fallback: return mock but include the raw string for debugging
      const mock = mockedAnalysis(company, region);
      mock._openai_raw = raw;
      return mock;
    }

    // Ensure generatedAt exists
    parsed.generatedAt = parsed.generatedAt || new Date().toISOString();
    return parsed;
  } catch (err) {
    console.error('AI client error, falling back to mock:', err && err.message ? err.message : err);
    return mockedAnalysis(company, region);
  }
}

function tryParseJson(text) {
  try {
    return JSON.parse(text);
  } catch (e) {
    // attempt to extract the first {...} block
    const m = text.match(/\{[\s\S]*\}/);
    if (m) {
      try { return JSON.parse(m[0]); } catch (e2) { return null; }
    }
    return null;
  }
}

function mockedAnalysis(company, region) {
  const competitors = [company + ' Subsidiary A', 'Competitor 1', 'Competitor 2'];
  return {
    company,
    region,
    executiveSummary: `This is a mock executive summary for ${company} in ${region}.`,
    competitorDiscovery: {
      topCompetitors: competitors,
      notes: `Auto-generated competitor list for ${company}.`,
    },
    marketSizing: {
      TAM: 'USD 120B (mock)',
      SAM: 'USD 30B (mock)',
      SOM: 'USD 5B (mock)',
      growthRate: 'CAGR 4.5% (mock)'
    },
    companyXRay: {
      businessModel: 'B2B2C; distribution via brokers and direct channels (mock)',
      revenueEstimate: 'Approx. USD 8B (mock)',
      leadership: ['CEO: Jane Doe', 'CPO: John Roe'],
      techStack: ['Core policy platform', 'Claims automation (mock)']
    },
    alerts: [
      { type: 'Funding', text: `${company} raised a mock funding round.` },
      { type: 'Product', text: `${company} launched a mock product.` }
    ],
    scenarioSimulations: [
      { scenario: 'New entrant in region', impact: 'High; could compress pricing' },
      { scenario: 'Regulatory change', impact: 'Medium; may increase compliance costs' }
    ],
    generatedAt: new Date().toISOString()
  };
}

module.exports = { generateAnalysis };
