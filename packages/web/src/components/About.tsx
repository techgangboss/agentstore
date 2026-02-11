import React from 'react';
import { motion } from 'motion/react';
import { Cpu, Globe, Zap, Trophy } from 'lucide-react';

export function About() {
  const features = [
    {
      icon: Cpu,
      title: "Native Integration",
      description: "Built directly for Claude Code using the Model Context Protocol (MCP) for seamless interaction."
    },
    {
      icon: Globe,
      title: "Stablecoin Payments",
      description: "Gasless USDC payments via the x402 protocol with a 20% platform fee. Publishers get paid directly to their wallet."
    },
    {
      icon: Zap,
      title: "Instant Deployment",
      description: "One-command installation gets your agents running in seconds with no complex configuration."
    },
    {
      icon: Trophy,
      title: "Publisher Earn Program",
      description: "10% of platform fees are pooled monthly and distributed to top publishers. Sell more, earn more — tracked on a live leaderboard."
    }
  ];

  return (
    <section className="py-24 bg-[#0a0a0a] relative overflow-hidden">
       {/* Background decoration */}
       <div className="absolute left-0 top-1/2 -translate-y-1/2 -z-10 h-[500px] w-[500px] rounded-full bg-teal-900/10 blur-[120px]"></div>

      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-16 items-center">
          <motion.div
            initial={{ opacity: 0, x: -20 }}
            whileInView={{ opacity: 1, x: 0 }}
            viewport={{ once: true }}
            transition={{ duration: 0.5 }}
          >
            <h2 className="text-teal-400 font-semibold tracking-wide uppercase text-sm mb-3">About AgentStore</h2>
            <h3 className="text-3xl sm:text-4xl font-bold text-white mb-6">The marketplace for Claude Code agents</h3>
            <p className="text-lg text-gray-400 mb-6">
              AgentStore is where Claude Code agents are bought, sold, and installed. Browse a growing catalog of MCP-backed agents, install them with a single command, and pay with gasless USDC via the x402 protocol.
            </p>
            <p className="text-lg text-gray-400">
              Whether you're a developer looking for tools to supercharge your workflow, or a builder ready to monetize your expertise, AgentStore makes it simple. Publish instantly, set your price, and earn directly to your Ethereum wallet.
            </p>
          </motion.div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-6">
            {features.map((feature, index) => (
              <motion.div
                key={index}
                initial={{ opacity: 0, y: 20 }}
                whileInView={{ opacity: 1, y: 0 }}
                viewport={{ once: true }}
                transition={{ delay: index * 0.1 }}
                className="bg-[#151515] p-6 rounded-xl border border-white/5 hover:border-teal-500/20 transition-all group"
              >
                <div className="w-10 h-10 bg-teal-500/10 rounded-lg flex items-center justify-center mb-4 group-hover:scale-110 transition-transform">
                  <feature.icon className="w-5 h-5 text-teal-400" />
                </div>
                <h4 className="text-white font-bold mb-2">{feature.title}</h4>
                <p className="text-sm text-gray-500 leading-relaxed">{feature.description}</p>
              </motion.div>
            ))}
          </div>
        </div>
      </div>
    </section>
  );
}
