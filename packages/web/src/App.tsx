import React from 'react';
import { Routes, Route } from 'react-router-dom';
import { Navbar } from './components/Navbar';
import { Home } from './pages/Home';
import { SubmitAgent } from './pages/SubmitAgent';
import { Dashboard } from './pages/Dashboard';
import { AuthCallback } from './pages/AuthCallback';

export default function App() {
  return (
    <div className="min-h-screen bg-[#0a0a0a] text-gray-100 font-sans selection:bg-teal-500/30">
      <Routes>
        <Route path="/" element={<><Navbar /><Home /></>} />
        <Route path="/submit" element={<SubmitAgent />} />
        <Route path="/dashboard" element={<Dashboard />} />
        <Route path="/auth/callback" element={<AuthCallback />} />
      </Routes>
    </div>
  );
}
