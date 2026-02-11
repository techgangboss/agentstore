import React from 'react';
import { Link } from 'react-router-dom';
import { motion } from 'motion/react';
import { Rocket, DollarSign, Wallet, ArrowRight } from 'lucide-react';

export function Builders() {
  const features = [
    {
      icon: Rocket,
      title: "Instant Publishing",
      description: "Submit your agent manifest and go live immediately. No manual review queues."
    },
    {
      icon: DollarSign,
      title: "You Set the Price",
      description: "Charge a one-time fee or offer it for free. You control your monetization strategy."
    },
    {
      icon: Wallet,
      title: "Direct Payouts",
      description: "Earn USDC directly to your wallet. The x402 facilitator handles settlement instantly."
    }
  ];

  return (
    <section className="py-24 relative overflow-hidden">
      {/* Background Gradient */}
      <div className="absolute inset-0 bg-gradient-to-b from-teal-900/10 to-transparent pointer-events-none"></div>

      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 relative z-10">
        <div className="text-center max-w-3xl mx-auto mb-16">
          <h2 className="text-teal-400 font-semibold tracking-wide uppercase text-sm mb-3">Agent Builders</h2>
          <h3 className="text-3xl sm:text-4xl font-bold text-white mb-6">Become a publisher to monetize your expertise</h3>
          <p className="text-lg text-gray-400">
            Create agents, set your price in USD, and earn USDC directly to your wallet.
            No approval process—publish instantly and start earning.
          </p>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-8">
          {features.map((feature, index) => (
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

        <div className="mt-16 text-center">
          <Link
            to="/submit"
            className="inline-flex items-center px-8 py-4 bg-white text-black font-bold rounded-lg hover:bg-gray-200 transition-colors"
          >
            Submit Agent
            <ArrowRight className="ml-2 w-5 h-5" />
          </Link>
        </div>
      </div>
    </section>
  );
}
