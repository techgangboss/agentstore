import React, { useState } from 'react';
import { motion } from 'motion/react';
import { Tag, Check, Copy } from 'lucide-react';
import { Agent } from '../types';

interface AgentCardProps {
  agent: Agent;
}

export function AgentCard({ agent }: AgentCardProps) {
  const [copied, setCopied] = useState(false);
  const isPaid = agent.pricing && agent.pricing.amount > 0;
  const installCommand = `agentstore install ${agent.agent_id}`;

  const handleCopy = (e: React.MouseEvent) => {
    e.stopPropagation();
    navigator.clipboard.writeText(installCommand);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  return (
    <motion.div
      initial={{ opacity: 0, scale: 0.95 }}
      whileInView={{ opacity: 1, scale: 1 }}
      viewport={{ once: true }}
      className="bg-[#1a1a1a] rounded-xl border border-white/10 hover:border-teal-500/40 p-5 transition-all hover:shadow-[0_0_20px_-10px_rgba(45,212,191,0.3)] group flex flex-col h-full relative overflow-hidden"
    >
        {/* Hover overlay for install command */}
        <div className="absolute inset-0 bg-black/80 backdrop-blur-sm opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center z-10 p-4">
            <div className="w-full">
                <p className="text-teal-400 text-xs font-mono font-bold mb-2 uppercase tracking-wider text-center">Install Command</p>
                <div 
                    onClick={handleCopy}
                    className="bg-black border border-white/20 rounded-lg p-3 flex items-center justify-between cursor-pointer hover:border-teal-500/50 transition-colors"
                >
                    <code className="text-sm text-gray-300 font-mono truncate mr-2">{installCommand}</code>
                    {copied ? <Check className="w-4 h-4 text-green-500" /> : <Copy className="w-4 h-4 text-gray-500" />}
                </div>
            </div>
        </div>

      <div className="flex justify-between items-start mb-3">
        <div>
          <h3 className="text-lg font-bold text-white group-hover:text-teal-400 transition-colors">{agent.name}</h3>
          <p className="text-sm text-gray-500">by {agent.publisher?.display_name || 'Unknown'}</p>
        </div>
        <span className={`px-2 py-1 rounded-md text-xs font-bold ${
          isPaid 
            ? 'bg-orange-500/10 text-orange-400 border border-orange-500/20' 
            : 'bg-teal-500/10 text-teal-400 border border-teal-500/20'
        }`}>
          {isPaid ? `$${agent.pricing.amount.toFixed(2)}` : 'FREE'}
        </span>
      </div>

      <p className="text-gray-400 text-sm mb-4 line-clamp-2 flex-grow">
        {agent.description}
      </p>

      <div className="flex flex-wrap gap-2 mt-auto">
        {agent.tags?.map((tag) => (
          <span key={tag} className="inline-flex items-center px-2 py-0.5 rounded text-xs font-medium bg-white/5 text-gray-400 border border-white/5">
            {tag}
          </span>
        ))}
      </div>
    </motion.div>
  );
}
