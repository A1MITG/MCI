import React, {useState} from 'react'

export default function Hero(){
  const [query, setQuery] = useState('')
  const [loading, setLoading] = useState(false)
  const [result, setResult] = useState(null)

  async function handleSearch(e){
    e.preventDefault()
    setLoading(true)
    setResult(null)
    try{
      // call backend stub
      const res = await fetch(`/api/insights?q=${encodeURIComponent(query)}`)
      const data = await res.json()
      setResult(data)
    }catch(err){
      setResult({error: 'Failed to fetch insights'})
    }finally{
      setLoading(false)
    }
  }

  return (
    <section className="bg-transparent p-6 rounded-lg">
      <div className="grid md:grid-cols-2 gap-6 items-center">
        <div>
          <h1 className="text-4xl font-extrabold mb-4">Instant market & competitor insights powered by AI</h1>
          <p className="mb-6 text-slate-300">Enter any company or market to generate an executive summary, competitor snapshot, and market sizing.</p>

          <form onSubmit={handleSearch} className="flex gap-3">
            <input
              value={query}
              onChange={e => setQuery(e.target.value)}
              className="flex-1 rounded p-3 bg-slate-800 border border-slate-700"
              placeholder="Enter any company or market to generate insights"
            />
            <button className="bg-gradient-to-r from-cyan-400 to-blue-500 text-black font-semibold px-4 py-2 rounded" disabled={!query || loading}>
              {loading ? 'Generating...' : 'Try Free'}
            </button>
          </form>

          {result && (
            <div className="mt-4 bg-slate-900 p-4 rounded">
              <pre className="whitespace-pre-wrap text-sm">{result.error || JSON.stringify(result, null, 2)}</pre>
            </div>
          )}

        </div>

        <div>
          <div className="p-6 bg-slate-800/50 rounded">
            <h4 className="font-semibold mb-2">Capabilities</h4>
            <ul className="list-disc ml-6 text-slate-300">
              <li>Competitor discovery</li>
              <li>Market sizing</li>
              <li>Monitoring & alerts</li>
              <li>AI-powered analysis</li>
            </ul>
          </div>
        </div>
      </div>
    </section>
  )
}
