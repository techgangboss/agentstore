import React from 'react';
import { motion } from 'motion/react';
import { ShieldCheck, Cpu, Globe, Zap } from 'lucide-react';

export function About() {
  const features = [
    {
      icon: ShieldCheck,
      title: "Secure & Verified",
      description: "Every agent is verified for security and performance before being listed on the marketplace."
    },
    {
      icon: Cpu,
      title: "Native Integration",
      description: "Built directly for Claude Code using the Model Context Protocol (MCP) for seamless interaction."
    },
    {
      icon: Globe,
      title: "Decentralized Payments",
      description: "Smart contract-based settlement ensures publishers get paid instantly in USDC without intermediaries."
    },
    {
      icon: Zap,
      title: "Instant Deployment",
      description: "One-command installation gets your agents running in seconds with no complex configuration."
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
            <h3 className="text-3xl sm:text-4xl font-bold text-white mb-6">The first decentralized marketplace for AI Agents</h3>
            <p className="text-lg text-gray-400 mb-6">
              AgentStore bridges the gap between AI developers and users. We provide a standardized platform for distributing, discovering, and monetizing Claude Code agents.
            </p>
            <p className="text-lg text-gray-400">
              By leveraging Ethereum for payments and MCP for communication, we're building an open ecosystem where intelligent agents can be shared and traded as easily as any other digital asset.
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
