import React from 'react'

export default function DemoTiles(){
  return (
    <section className="grid md:grid-cols-3 gap-4">
      <div className="p-4 bg-gradient-to-br from-[#061526] to-[#082238] border border-slate-700 rounded">
        <h4 className="font-semibold">Top competitors snapshot</h4>
        <p className="text-sm text-slate-300">Quick view of key competitors and positioning.</p>
      </div>
      <div className="p-4 bg-gradient-to-br from-[#061526] to-[#082238] border border-slate-700 rounded">
        <h4 className="font-semibold">Market overview example</h4>
        <p className="text-sm text-slate-300">TAM / growth / regional split sample.</p>
      </div>
      <div className="p-4 bg-gradient-to-br from-[#061526] to-[#082238] border border-slate-700 rounded">
        <h4 className="font-semibold">Battlecard preview</h4>
        <p className="text-sm text-slate-300">Sales-ready strengths & counter-messaging.</p>
      </div>
    </section>
  )
}
