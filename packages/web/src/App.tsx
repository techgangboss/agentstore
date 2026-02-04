import React, { useState, useEffect } from 'react';
import { Hero } from './components/Hero';
import { About } from './components/About';
import { Installation } from './components/Installation';
import { Marketplace } from './components/Marketplace';
import { Builders } from './components/Builders';
import { Docs } from './components/Docs';
import { Footer } from './components/Footer';
import { Navbar } from './components/Navbar';

export default function App() {
  return (
    <div className="min-h-screen bg-[#0a0a0a] text-gray-100 font-sans selection:bg-teal-500/30">
      <Navbar />
      <Hero />
      <div id="about">
        <About />
      </div>
      <div id="installation">
        <Installation />
      </div>
      <div id="marketplace">
        <Marketplace />
      </div>
      <div id="builders">
        <Builders />
      </div>
      <div id="docs">
        <Docs />
      </div>
      <Footer />
    </div>
  );
}
