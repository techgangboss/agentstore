import React, { useState } from 'react';
import { Check, Copy, Terminal } from 'lucide-react';
import { motion } from 'motion/react';

const CodeBlock = ({ title, code, step }: { title: string; code: string; step: number }) => {
  const [copied, setCopied] = useState(false);

  const handleCopy = () => {
    navigator.clipboard.writeText(code);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  return (
    <motion.div 
      initial={{ opacity: 0, y: 20 }}
      whileInView={{ opacity: 1, y: 0 }}
      viewport={{ once: true }}
      transition={{ delay: step * 0.1 }}
      className="bg-[#1e1e1e] rounded-xl border border-white/10 overflow-hidden group hover:border-teal-500/30 transition-colors"
    >
      <div className="flex items-center justify-between px-4 py-3 bg-white/5 border-b border-white/5">
        <div className="flex items-center gap-3">
          <div className="flex items-center justify-center w-6 h-6 rounded-full bg-teal-500/10 text-teal-400 text-xs font-bold border border-teal-500/20">
            {step}
          </div>
          <span className="text-sm font-medium text-gray-300">{title}</span>
        </div>
        <button
          onClick={handleCopy}
          className="text-gray-500 hover:text-white transition-colors"
          title="Copy code"
        >
          {copied ? <Check className="w-4 h-4 text-green-400" /> : <Copy className="w-4 h-4" />}
        </button>
      </div>
      <div className="p-4 font-mono text-sm overflow-x-auto relative">
        <div className="absolute top-0 left-0 w-1 h-full bg-teal-500/20 hidden group-hover:block transition-all"></div>
        <code className="text-gray-300 whitespace-pre">
            <span className="text-teal-400 select-none">$ </span>
            {code}
        </code>
      </div>
    </motion.div>
  );
};

export function Installation() {
  return (
    <section className="py-20 bg-black/20">
      <div className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="text-center mb-12">
          <h2 className="text-3xl font-bold text-white mb-4">Install in 60 seconds</h2>
          <p className="text-gray-400">Get your gateway running and connect your first agent.</p>
        </div>

        <div className="space-y-6">
          <CodeBlock
            step={1}
            title="Clone and build"
            code="git clone https://github.com/techgangboss/agentstore.git && cd agentstore && npm install && npm run build"
          />
          <CodeBlock
            step={2}
            title="Setup the gateway"
            code="node packages/cli/dist/index.js gateway-setup"
          />
          <CodeBlock
            step={3}
            title="Install your first agent"
            code="node packages/cli/dist/index.js install techgangboss.wallet-assistant"
          />
        </div>

        <div className="mt-8 p-4 rounded-lg bg-teal-900/10 border border-teal-500/20 flex items-start gap-3">
          <Terminal className="w-5 h-5 text-teal-400 shrink-0 mt-0.5" />
          <p className="text-sm text-teal-200/80">
            <strong className="text-teal-200">Pro Tip:</strong> Restart Claude Code after setup to activate the gateway and recognize your new agents.
          </p>
        </div>
      </div>
    </section>
  );
}
