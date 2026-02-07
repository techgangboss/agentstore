import { useEffect, useState } from 'react';
import { motion } from 'motion/react';
import { TrendingUp, Trophy, Gift } from 'lucide-react';

interface LeaderboardEntry {
  rank: number;
  display_name: string;
  share_percent: number;
  estimated_earn: number;
}

interface EarnData {
  program: {
    name: string;
    description: string;
    earn_pool_percent: number;
  };
  current_month: {
    period_start: string;
    period_end: string;
    total_platform_fees: number;
    estimated_earn_pool: number;
    leaderboard: LeaderboardEntry[];
  };
  last_distribution: {
    period_start: string;
    period_end: string;
    earn_pool: number;
    status: string;
    top_publishers: {
      rank: number;
      display_name: string;
      share_percent: number;
      earn_amount: number;
      payout_status: string;
    }[];
  } | null;
}

export function EarnProgram() {
  const [data, setData] = useState<EarnData | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const apiUrl = import.meta.env.VITE_API_URL || '';
    fetch(`${apiUrl}/api/earn-program`)
      .then(res => res.ok ? res.json() : null)
      .then(d => setData(d))
      .catch(() => {})
      .finally(() => setLoading(false));
  }, []);

  const steps = [
    {
      icon: TrendingUp,
      title: "Sell Agents",
      description: "Publish and sell agents on the marketplace. Every sale contributes to your monthly ranking."
    },
    {
      icon: Trophy,
      title: "Climb the Ranks",
      description: "Publishers are ranked by their contribution to total platform sales each month."
    },
    {
      icon: Gift,
      title: "Get Rewarded",
      description: "10% of all platform fees are pooled and distributed monthly to publishers proportional to their sales."
    }
  ];

  const leaderboard = data?.current_month?.leaderboard || [];
  const estimatedPool = data?.current_month?.estimated_earn_pool || 0;

  return (
    <section className="py-24 relative overflow-hidden">
      <div className="absolute inset-0 bg-gradient-to-b from-purple-900/10 to-transparent pointer-events-none"></div>

      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 relative z-10">
        <div className="text-center max-w-3xl mx-auto mb-16">
          <h2 className="text-teal-400 font-semibold tracking-wide uppercase text-sm mb-3">Publisher Earn Program</h2>
          <h3 className="text-3xl sm:text-4xl font-bold text-white mb-6">Earn more as a top publisher</h3>
          <p className="text-lg text-gray-400">
            10% of platform fees are pooled each month and distributed to publishers based on their share of total sales. The more you sell, the more you earn.
          </p>
        </div>

        {/* How it works cards */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-8 mb-16">
          {steps.map((step, index) => (
            <motion.div
              key={index}
              initial={{ opacity: 0, y: 20 }}
              whileInView={{ opacity: 1, y: 0 }}
              viewport={{ once: true }}
              transition={{ delay: index * 0.1 }}
              className="bg-[#1a1a1a] rounded-2xl p-8 border border-white/10 hover:border-teal-500/30 transition-colors"
            >
              <div className="w-12 h-12 bg-teal-500/10 rounded-xl flex items-center justify-center mb-6">
                <step.icon className="w-6 h-6 text-teal-400" />
              </div>
              <h4 className="text-xl font-bold text-white mb-3">{step.title}</h4>
              <p className="text-gray-400 leading-relaxed">{step.description}</p>
            </motion.div>
          ))}
        </div>

        {/* Live Leaderboard */}
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true }}
          className="bg-[#1a1a1a] rounded-2xl border border-white/10 overflow-hidden"
        >
          <div className="px-8 py-6 border-b border-white/10 flex items-center justify-between">
            <div>
              <h4 className="text-lg font-bold text-white">Live Leaderboard</h4>
              <p className="text-sm text-gray-400 mt-1">
                {leaderboard.length > 0
                  ? `Current month — Est. pool: $${estimatedPool.toFixed(2)} USDC`
                  : 'Current month rankings'}
              </p>
            </div>
            {leaderboard.length > 0 && (
              <span className="flex items-center gap-1.5 text-xs font-medium text-green-400 bg-green-400/10 px-3 py-1 rounded-full">
                <span className="w-1.5 h-1.5 bg-green-400 rounded-full animate-pulse"></span>
                Live
              </span>
            )}
          </div>

          {loading ? (
            <div className="px-8 py-12 text-center">
              <div className="w-6 h-6 border-2 border-teal-400 border-t-transparent rounded-full animate-spin mx-auto mb-3"></div>
              <p className="text-gray-400 text-sm">Loading leaderboard...</p>
            </div>
          ) : leaderboard.length === 0 ? (
            <div className="px-8 py-12 text-center">
              <Trophy className="w-10 h-10 text-gray-600 mx-auto mb-3" />
              <p className="text-gray-400">No sales this month yet. Be the first to earn!</p>
            </div>
          ) : (
            <div className="divide-y divide-white/5">
              {/* Header */}
              <div className="grid grid-cols-4 px-8 py-3 text-xs font-medium text-gray-500 uppercase tracking-wider">
                <span>Rank</span>
                <span>Publisher</span>
                <span className="text-right">Share</span>
                <span className="text-right">Est. Earn</span>
              </div>
              {leaderboard.map((entry) => (
                <div
                  key={entry.rank}
                  className="grid grid-cols-4 px-8 py-4 items-center hover:bg-white/[0.02] transition-colors"
                >
                  <span className="text-white font-semibold">
                    {entry.rank <= 3 ? (
                      <span className={
                        entry.rank === 1 ? 'text-yellow-400' :
                        entry.rank === 2 ? 'text-gray-300' :
                        'text-orange-400'
                      }>
                        #{entry.rank}
                      </span>
                    ) : (
                      `#${entry.rank}`
                    )}
                  </span>
                  <span className="text-gray-300 truncate">{entry.display_name}</span>
                  <span className="text-right text-gray-400">{entry.share_percent.toFixed(1)}%</span>
                  <span className="text-right text-teal-400 font-medium">${entry.estimated_earn.toFixed(2)}</span>
                </div>
              ))}
            </div>
          )}
        </motion.div>
      </div>
    </section>
  );
}
