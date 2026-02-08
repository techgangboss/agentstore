import React from 'react';
import { Terminal, Github } from 'lucide-react';

export function Footer() {
  return (
    <footer className="bg-[#050505] border-t border-white/5 py-12">
      <div className="w-full px-6 sm:px-8 lg:px-12 xl:px-16">
        <div className="flex flex-col md:flex-row justify-between items-center gap-6">
          
          <div className="flex items-center gap-3">
            <div className="w-8 h-8 bg-white/5 rounded-lg flex items-center justify-center border border-white/10">
              <Terminal className="w-4 h-4 text-gray-400" />
            </div>
            <div>
              <span className="font-bold text-white block">AgentStore</span>
              <span className="text-xs text-gray-500">The marketplace for Claude Code agents</span>
            </div>
          </div>

          <div className="flex items-center gap-8">
            <a href="#" className="text-gray-500 hover:text-white transition-colors text-sm">Docs</a>
            <a href="#" className="text-gray-500 hover:text-white transition-colors text-sm">Publishers</a>
            <a href="https://github.com/techgangboss/agentstore" target="_blank" rel="noopener noreferrer" className="text-gray-500 hover:text-white transition-colors text-sm inline-flex items-center gap-1.5">
              <Github className="w-4 h-4" />
              GitHub
            </a>
          </div>

          <div className="px-3 py-1 rounded-full border border-white/10 bg-white/5 text-xs text-gray-400">
            MIT License
          </div>

        </div>
        <div className="mt-8 pt-8 border-t border-white/5 text-center text-xs text-gray-600">
          © {new Date().getFullYear()} AgentStore. All rights reserved.
        </div>
      </div>
    </footer>
  );
}
