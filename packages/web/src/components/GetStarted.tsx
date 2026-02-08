import React, { useState } from 'react';
import { Check, Copy, Terminal, Bot, Coins } from 'lucide-react';
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
  const [activeTab, setActiveTab] = useState<'install' | 'agents'>('install');

  return (
    <section className="py-20 bg-black/20">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="flex justify-center mb-12">
          <div className="inline-flex bg-[#1a1a1a] rounded-xl border border-white/10 p-1">
            <button
              onClick={() => setActiveTab('install')}
              className={`px-6 py-3 rounded-lg text-sm font-medium transition-all ${
                activeTab === 'install'
                  ? 'bg-teal-500/20 text-teal-400 border border-teal-500/30'
                  : 'text-gray-400 hover:text-white border border-transparent'
              }`}
            >
              Get Started
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
          {activeTab === 'install' && (
            <motion.div
              key="install"
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -10 }}
              transition={{ duration: 0.2 }}
              className="max-w-4xl mx-auto"
            >
              <div className="text-center mb-12">
                <h2 className="text-3xl font-bold text-white mb-4">Install in 60 seconds</h2>
                <p className="text-gray-400">Get your gateway running and connect your first agent.</p>
              </div>

              <div className="space-y-6">
                <CodeBlock step={1} title="Install the CLI" code="npm install -g agentstore" />
                <CodeBlock step={2} title="Setup the gateway" code="agentstore gateway-setup" />
                <CodeBlock step={3} title="Install your first agent" code="agentstore install techgangboss.wallet-assistant" />
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
                  <strong className="text-teal-200">Pro Tip:</strong> Restart Claude Code after gateway-setup to activate your new agents.
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
curl https://api.agentstore.dev/api

# 2. Register as a publisher
curl -X POST https://api.agentstore.dev/api/publishers \\
  -H "Content-Type: application/json" \\
  -d '{"name":"my-agent","display_name":"My Agent"}'
# → {"api_key":"ask_...","publisher":{...}}

# 3. Publish an agent (free = no auth needed)
curl -X POST https://api.agentstore.dev/api/publishers/agents/simple \\
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
                  href="https://api.agentstore.dev/api"
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
