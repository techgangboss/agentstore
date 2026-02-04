import React from 'react';
import { Terminal, Copy, Check, Upload } from 'lucide-react';
import { motion } from 'motion/react';

export function Navbar() {
  return (
    <nav className="fixed top-0 left-0 right-0 z-50 border-b border-white/5 bg-[#0a0a0a]/80 backdrop-blur-md">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="flex items-center justify-between h-16">
          <div className="flex items-center gap-2">
            <div className="w-8 h-8 bg-gradient-to-tr from-teal-500 to-cyan-400 rounded-lg flex items-center justify-center">
              <Terminal className="w-5 h-5 text-black" />
            </div>
            <span className="font-bold text-xl tracking-tight text-white">AgentStore</span>
          </div>
          <div className="hidden md:block">
            <div className="flex items-center space-x-4">
              <a href="#about" className="text-gray-300 hover:text-white px-3 py-2 rounded-md text-sm font-medium transition-colors">About</a>
              <a href="#marketplace" className="text-gray-300 hover:text-white px-3 py-2 rounded-md text-sm font-medium transition-colors">Marketplace</a>
              <a href="#builders" className="text-gray-300 hover:text-white px-3 py-2 rounded-md text-sm font-medium transition-colors">Publishers</a>
              
              <a 
                href="https://github.com/techgangboss/agentstore/blob/main/docs/PUBLISHER.md"
                target="_blank"
                rel="noopener noreferrer"
                className="ml-2 inline-flex items-center gap-2 px-4 py-2 bg-white/10 hover:bg-white/20 text-white text-sm font-medium rounded-lg border border-white/10 transition-all"
              >
                <Upload className="w-4 h-4" />
                Submit Agent
              </a>
            </div>
          </div>
        </div>
      </div>
    </nav>
  );
}
