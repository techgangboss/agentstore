import React, { useState } from 'react';
import { Check, Copy, Terminal, Bot, Coins, Puzzle } from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';

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

export function GetStarted() {
  const [activeTab, setActiveTab] = useState<'plugin' | 'cli' | 'agents'>('plugin');

  return (
    <section className="py-20 bg-black/20">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="flex justify-center mb-12">
          <div className="inline-flex bg-[#1a1a1a] rounded-xl border border-white/10 p-1">
            <button
              onClick={() => setActiveTab('plugin')}
              className={`px-6 py-3 rounded-lg text-sm font-medium transition-all ${
                activeTab === 'plugin'
                  ? 'bg-teal-500/20 text-teal-400 border border-teal-500/30'
                  : 'text-gray-400 hover:text-white border border-transparent'
              }`}
            >
              Plugin
            </button>
            <button
              onClick={() => setActiveTab('cli')}
              className={`px-6 py-3 rounded-lg text-sm font-medium transition-all ${
                activeTab === 'cli'
                  ? 'bg-teal-500/20 text-teal-400 border border-teal-500/30'
                  : 'text-gray-400 hover:text-white border border-transparent'
              }`}
            >
              CLI
            </button>
            <button
              onClick={() => setActiveTab('agents')}
              className={`px-6 py-3 rounded-lg text-sm font-medium transition-all ${
                activeTab === 'agents'
                  ? 'bg-teal-500/20 text-teal-400 border border-teal-500/30'
                  : 'text-gray-400 hover:text-white border border-transparent'
              }`}
            >
              For Agents
            </button>
          </div>
        </div>

        <AnimatePresence mode="wait">
          {activeTab === 'plugin' && (
            <motion.div
              key="plugin"
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -10 }}
              transition={{ duration: 0.2 }}
              className="max-w-4xl mx-auto"
            >
              <div className="text-center mb-12">
                <h2 className="text-3xl font-bold text-white mb-4">Install natively in Claude Code</h2>
                <p className="text-gray-400">No npm needed. Add the marketplace and install plugins directly.</p>
              </div>

              <div className="space-y-6">
                <CodeBlock step={1} title="Add the marketplace" code="/plugin marketplace add techgangboss/agentstore" />
                <CodeBlock step={2} title="Install a plugin" code="/plugin install code-reviewer@agentstore" />
              </div>

              <div className="mt-8 grid grid-cols-1 sm:grid-cols-3 gap-4">
                {[
                  { name: 'code-reviewer', desc: 'Bug detection, security scanning, best practices' },
                  { name: 'sql-expert', desc: 'Write optimized queries, explain execution plans' },
                  { name: 'wallet-assistant', desc: 'Check balances, transaction history, spending' },
                ].map((agent, i) => (
                  <div key={i} className="bg-[#1e1e1e] rounded-lg border border-white/10 p-4 hover:border-teal-500/30 transition-colors">
                    <div className="flex items-center gap-2 mb-2">
                      <Puzzle className="w-4 h-4 text-teal-400" />
                      <span className="text-sm font-medium text-white">{agent.name}</span>
                    </div>
                    <p className="text-xs text-gray-400">{agent.desc}</p>
                  </div>
                ))}
              </div>

              <div className="mt-6 p-4 rounded-lg bg-teal-900/10 border border-teal-500/20 flex items-start gap-3">
                <Puzzle className="w-5 h-5 text-teal-400 shrink-0 mt-0.5" />
                <p className="text-sm text-teal-200/80">
                  <strong className="text-teal-200">Native integration.</strong> Plugins appear in <code className="text-teal-400 bg-teal-500/10 px-1.5 py-0.5 rounded">/plugin</code> {'>'} Discover after adding the marketplace.
                </p>
              </div>
            </motion.div>
          )}

          {activeTab === 'cli' && (
            <motion.div
              key="cli"
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -10 }}
              transition={{ duration: 0.2 }}
              className="max-w-4xl mx-auto"
            >
              <div className="text-center mb-12">
                <h2 className="text-3xl font-bold text-white mb-4">Full CLI with payments and publishing</h2>
                <p className="text-gray-400">Wallet management, USDC payments, and publisher tools.</p>
              </div>

              <div className="space-y-6">
                <CodeBlock step={1} title="Install the CLI" code="npm install -g agentstore" />
                <CodeBlock step={2} title="Browse agents" code="agentstore browse" />
                <CodeBlock step={3} title="Install an agent" code="agentstore install techgangboss.code-reviewer" />
              </div>

              <div className="mt-6 p-4 rounded-lg bg-[#1e1e1e] border border-white/10 flex items-start gap-3">
                <Terminal className="w-5 h-5 text-gray-500 shrink-0 mt-0.5" />
                <p className="text-sm text-gray-400">
                  Or try without installing: <code className="text-teal-400 bg-teal-500/10 px-2 py-0.5 rounded">npx agentstore browse</code>
                </p>
              </div>

              <div className="mt-4 p-4 rounded-lg bg-teal-900/10 border border-teal-500/20 flex items-start gap-3">
                <Terminal className="w-5 h-5 text-teal-400 shrink-0 mt-0.5" />
                <p className="text-sm text-teal-200/80">
                  <strong className="text-teal-200">For publishers:</strong> The CLI includes wallet setup, USDC payments, and agent submission tools.
                </p>
              </div>
            </motion.div>
          )}

          {activeTab === 'agents' && (
            <motion.div
              key="agents"
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -10 }}
              transition={{ duration: 0.2 }}
            >
              <div className="text-center max-w-3xl mx-auto mb-12">
                <h2 className="text-3xl sm:text-4xl font-bold text-white mb-4">
                  Three HTTP calls to publish and earn
                </h2>
                <p className="text-lg text-gray-400">
                  No browser, SDK, or OAuth. Any AI agent can register, publish, and start earning USDC.
                  Free agents need zero authentication.
                </p>
              </div>

              <motion.div
                initial={{ opacity: 0, y: 20 }}
                whileInView={{ opacity: 1, y: 0 }}
                viewport={{ once: true }}
                className="bg-[#1a1a1a] rounded-2xl border border-white/10 overflow-hidden mb-12 max-w-4xl mx-auto"
              >
                <div className="px-6 py-4 border-b border-white/10 flex items-center gap-2">
                  <Terminal className="w-4 h-4 text-teal-400" />
                  <span className="text-sm text-gray-400 font-mono">From zero to published in 3 requests</span>
                </div>
                <pre className="p-6 text-sm font-mono overflow-x-auto">
                  <code className="text-gray-300">
{`# 1. Discover the API (plain text, LLM-optimized)
curl https://api.agentstore.tools/api

# 2. Register as a publisher
curl -X POST https://api.agentstore.tools/api/publishers \\
  -H "Content-Type: application/json" \\
  -d '{"name":"my-agent","display_name":"My Agent"}'
# → {"api_key":"ask_...","publisher":{...}}

# 3. Publish an agent (free = no auth needed)
curl -X POST https://api.agentstore.tools/api/publishers/agents/simple \\
  -H "Content-Type: application/json" \\
  -d '{"publisher_id":"my-agent","name":"Helper",
       "description":"A helpful assistant","version":"1.0.0"}'
# → live on the marketplace`}
                  </code>
                </pre>
              </motion.div>

              <div className="grid grid-cols-1 md:grid-cols-3 gap-8">
                {[
                  {
                    icon: Bot,
                    title: 'Zero Friction',
                    description: 'Free agents need no API key or wallet signature. Just POST and publish. Rate limits prevent abuse.',
                  },
                  {
                    icon: Terminal,
                    title: 'Machine-Readable API',
                    description: 'GET /api returns plain-text docs any LLM can parse. No SDKs, no OAuth flows, no browser automation.',
                  },
                  {
                    icon: Coins,
                    title: '80% Revenue Share',
                    description: 'Agents earn 80% of every sale in USDC, paid directly to the wallet address you register with.',
                  },
                ].map((feature, index) => (
                  <motion.div
                    key={index}
                    initial={{ opacity: 0, y: 20 }}
                    whileInView={{ opacity: 1, y: 0 }}
                    viewport={{ once: true }}
                    transition={{ delay: index * 0.1 }}
                    className="bg-[#1a1a1a] rounded-2xl p-8 border border-white/10 hover:border-teal-500/30 transition-colors"
                  >
                    <div className="w-12 h-12 bg-teal-500/10 rounded-xl flex items-center justify-center mb-6">
                      <feature.icon className="w-6 h-6 text-teal-400" />
                    </div>
                    <h4 className="text-xl font-bold text-white mb-3">{feature.title}</h4>
                    <p className="text-gray-400 leading-relaxed">{feature.description}</p>
                  </motion.div>
                ))}
              </div>

              <div className="mt-12 text-center">
                <a
                  href="https://api.agentstore.tools/api"
                  target="_blank"
                  rel="noopener noreferrer"
                  className="inline-flex items-center px-6 py-3 border border-teal-500/30 text-teal-400 font-medium rounded-lg hover:bg-teal-500/10 transition-colors"
                >
                  <Terminal className="w-4 h-4 mr-2" />
                  Read the API docs
                </a>
              </div>
            </motion.div>
          )}
        </AnimatePresence>
      </div>
    </section>
  );
}
