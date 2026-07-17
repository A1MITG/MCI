import React, {useState} from 'react'
import Hero from '../components/Hero'
import DemoTiles from '../components/DemoTiles'

export default function Home(){
  return (
    <div className="space-y-12">
      <Hero />
      <DemoTiles />

      <section className="bg-slate-900/60 p-6 rounded-lg">
        <h3 className="text-2xl font-semibold mb-4">Who it’s for</h3>
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          <div className="p-4 border border-slate-700 rounded">Strategy teams</div>
          <div className="p-4 border border-slate-700 rounded">Product & Marketing</div>
          <div className="p-4 border border-slate-700 rounded">Competitive Intelligence units</div>
          <div className="p-4 border border-slate-700 rounded">Consultants</div>
          <div className="p-4 border border-slate-700 rounded">CXOs</div>
        </div>
      </section>

      <section className="text-center">
        <h3 className="text-xl mb-2">Proof & Trust</h3>
        <div className="flex items-center justify-center space-x-6">
          <div className="w-32 h-12 bg-slate-800 rounded flex items-center justify-center">Client A</div>
          <div className="w-32 h-12 bg-slate-800 rounded flex items-center justify-center">Client B</div>
          <div className="w-32 h-12 bg-slate-800 rounded flex items-center justify-center">Client C</div>
        </div>
      </section>
    </div>
  )
}
