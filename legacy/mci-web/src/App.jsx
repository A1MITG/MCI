import React from 'react'
import { Routes, Route, Link } from 'react-router-dom'
import Home from './pages/Home'
import Platform from './pages/Platform'
import Products from './pages/Products'
import Solutions from './pages/Solutions'
import Resources from './pages/Resources'
import Company from './pages/Company'

export default function App(){
  return (
    <div className="min-h-screen bg-gradient-to-br from-[#0f172a] via-[#071124] to-[#001219] text-slate-100">
      <nav className="max-w-6xl mx-auto p-6 flex items-center justify-between">
        <div className="text-2xl font-bold">MCI</div>
        <div className="space-x-4">
          <Link to="/">Home</Link>
          <Link to="/platform">Platform</Link>
          <Link to="/products">Products</Link>
          <Link to="/solutions">Solutions</Link>
          <Link to="/resources">Resources</Link>
          <Link to="/company">Company</Link>
        </div>
      </nav>

      <main className="max-w-6xl mx-auto px-6 pb-20">
        <Routes>
          <Route path="/" element={<Home/>} />
          <Route path="/platform" element={<Platform/>} />
          <Route path="/products" element={<Products/>} />
          <Route path="/solutions" element={<Solutions/>} />
          <Route path="/resources" element={<Resources/>} />
          <Route path="/company" element={<Company/>} />
        </Routes>
      </main>

      <footer className="border-t border-slate-700 mt-12 py-8 text-center">
        © {new Date().getFullYear()} MCI — Market & Competitive Intelligence
      </footer>
    </div>
  )
}
