const express = require('express')
const path = require('path')
const app = express()
const port = process.env.PORT || 4000

// Basic logger
app.use((req, res, next) => { console.log(req.method, req.url); next(); })

// API stub for insights — replace with real AI integration
app.get('/api/insights', (req, res) => {
  const q = req.query.q || 'sample'
  // Return a mock response for now
  res.json({
    query: q,
    summary: `This is a mock executive summary for "${q}". Replace /api/insights with real AI calls.`,
    top_competitors: [
      { name: 'Competitor A', relevance: 0.92 },
      { name: 'Competitor B', relevance: 0.87 },
      { name: 'Competitor C', relevance: 0.75 }
    ],
    tam: {
      value: '1.2B',
      currency: 'USD',
      confidence: 'medium'
    }
  })
})

// Serve static preview (optional)
app.use(express.static(path.join(__dirname, '..', 'dist')))

app.listen(port, () => console.log(`Server running on http://localhost:${port}`))
