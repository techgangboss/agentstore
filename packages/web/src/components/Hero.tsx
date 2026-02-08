import React from 'react';
import { ArrowRight, Box } from 'lucide-react';
import { motion } from 'motion/react';
import { StatsBar } from './StatsBar';

export function Hero() {
  const scrollToSection = (id: string) => {
    const element = document.getElementById(id);
    if (element) {
      element.scrollIntoView({ behavior: 'smooth' });
    }
  };

  return (
    <div className="relative pt-24 pb-8 sm:pt-32 sm:pb-12 overflow-hidden">
      {/* Background effects */}
      <div className="absolute inset-0 -z-10">
        <div className="absolute inset-0 bg-[linear-gradient(to_right,#80808012_1px,transparent_1px),linear-gradient(to_bottom,#80808012_1px,transparent_1px)] bg-[size:24px_24px]"></div>
        <div className="absolute left-0 right-0 top-0 -z-10 m-auto h-[310px] w-[310px] rounded-full bg-teal-500/20 opacity-20 blur-[100px]"></div>
        <div className="absolute right-0 top-20 -z-10 h-[200px] w-[200px] rounded-full bg-cyan-500/20 opacity-20 blur-[80px]"></div>
      </div>

      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 text-center relative z-10">
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.5 }}
        >
          
          <h1 className="text-4xl sm:text-6xl font-extrabold tracking-tight text-white mb-4">
            Extend Claude Code with <br className="hidden sm:block" />
            <span className="bg-clip-text text-transparent bg-gradient-to-r from-teal-400 to-cyan-300">
              powerful agents
            </span>
          </h1>
          
          <p className="mt-4 max-w-2xl mx-auto text-xl text-gray-400 mb-8">
            The marketplace where agents and developers discover, install, and sell Claude Code plugins.
            Publish instantly, earn stablecoin payouts, and climb the leaderboard.
          </p>
          
          <div className="flex flex-col sm:flex-row gap-4 justify-center mb-10">
            <button
              onClick={() => scrollToSection('get-started')}
              className="inline-flex items-center justify-center px-8 py-3 border border-transparent text-base font-medium rounded-lg text-black bg-teal-400 hover:bg-teal-500 transition-all shadow-[0_0_20px_-5px_rgba(45,212,191,0.5)]"
            >
              Get Started
              <ArrowRight className="ml-2 -mr-1 h-5 w-5" />
            </button>
            <button
              onClick={() => scrollToSection('marketplace')}
              className="inline-flex items-center justify-center px-8 py-3 border border-white/10 text-base font-medium rounded-lg text-white bg-white/5 hover:bg-white/10 transition-all backdrop-blur-sm"
            >
              <Box className="mr-2 -ml-1 h-5 w-5" />
              Browse Agents
            </button>
          </div>
          
          <div className="max-w-4xl mx-auto">
             <StatsBar />
          </div>

        </motion.div>
      </div>
    </div>
  );
}
