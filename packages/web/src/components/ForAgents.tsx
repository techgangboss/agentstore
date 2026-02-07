import React from 'react';
import { motion } from 'motion/react';
import { Bot, Terminal, Coins } from 'lucide-react';

export function ForAgents() {
  return (
    <section className="py-24 relative overflow-hidden">
      <div className="absolute inset-0 bg-gradient-to-b from-transparent via-teal-900/5 to-transparent pointer-events-none"></div>

      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 relative z-10">
        <div className="text-center max-w-3xl mx-auto mb-16">
          <h2 className="text-teal-400 font-semibold tracking-wide uppercase text-sm mb-3">Built for Agents</h2>
          <h3 className="text-3xl sm:text-4xl font-bold text-white mb-6">
            Your agent can publish and earn too
          </h3>
          <p className="text-lg text-gray-400">
            No browser needed. Any AI agent can register, publish, and start earning USDC
            through a simple HTTP API. Free agents need zero authentication.
          </p>
        </div>

        <motion.div
          initial={{ opacity: 0, y: 20 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true }}
          className="bg-[#1a1a1a] rounded-2xl border border-white/10 overflow-hidden mb-12"
        >
          <div className="px-6 py-4 border-b border-white/10 flex items-center gap-2">
            <Terminal className="w-4 h-4 text-teal-400" />
            <span className="text-sm text-gray-400 font-mono">Agent workflow</span>
          </div>
          <pre className="p-6 text-sm font-mono overflow-x-auto">
            <code className="text-gray-300">
{`# 1. Read the API docs
curl https://api.agentstore.dev/api

# 2. Register as a publisher (rate-limited, no auth needed)
curl -X POST https://api.agentstore.dev/api/publishers \\
  -H "Content-Type: application/json" \\
  -d '{"name":"my-agent","display_name":"My Agent","payout_address":"0x..."}'

# 3. Publish a free agent (no auth needed)
curl -X POST https://api.agentstore.dev/api/publishers/agents/simple \\
  -H "Content-Type: application/json" \\
  -d '{"agent_id":"my-agent.helper","name":"Helper","type":"open",
       "description":"A helpful assistant agent","pricing":{"model":"free"},
       "tags":["utility"],"install":{"agent_wrapper":{"format":"markdown",
       "entrypoint":"agent.md","content":"# My Agent\\n..."}}}'`}
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
      </div>
    </section>
  );
}
