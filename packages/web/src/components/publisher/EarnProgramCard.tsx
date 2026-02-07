import { useEffect, useState } from 'react';
import { Trophy, TrendingUp, DollarSign, ExternalLink } from 'lucide-react';
import { supabase } from '../../lib/supabase';

interface EarnStats {
  current_month: {
    rank: number | null;
    total_publishers: number;
    my_platform_fees: number;
    share_percent: number;
    estimated_earn: number;
    total_earn_pool: number;
  };
  history: {
    period_start: string;
    rank: number;
    earn_amount: number;
    payout_status: string;
  }[];
  total_earned: number;
}

export function EarnProgramCard() {
  const [data, setData] = useState<EarnStats | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetchEarnStats();
  }, []);

  const fetchEarnStats = async () => {
    try {
      const session = await supabase.auth.getSession();
      const token = session.data.session?.access_token;
      if (!token) return;

      const apiUrl = import.meta.env.VITE_API_URL || '';
      const res = await fetch(`${apiUrl}/api/publishers/me/earn-program`, {
        headers: { 'Authorization': `Bearer ${token}` },
      });
      if (res.ok) {
        setData(await res.json());
      }
    } catch (e) {
      console.error('Error fetching earn stats:', e);
    } finally {
      setLoading(false);
    }
  };

  if (loading) {
    return (
      <div className="bg-[#1a1a1a] rounded-xl border border-white/10 p-6">
        <div className="flex items-center gap-2 mb-4">
          <Trophy className="w-5 h-5 text-teal-400" />
          <h3 className="text-lg font-semibold text-white">Earn Program</h3>
        </div>
        <div className="animate-pulse space-y-3">
          <div className="h-4 bg-white/5 rounded w-3/4"></div>
          <div className="h-4 bg-white/5 rounded w-1/2"></div>
        </div>
      </div>
    );
  }

  const current = data?.current_month;
  const history = data?.history?.slice(0, 6) || [];
  const sharePercent = current?.share_percent || 0;

  return (
    <div className="bg-[#1a1a1a] rounded-xl border border-white/10 p-6">
      <div className="flex items-center justify-between mb-6">
        <div className="flex items-center gap-2">
          <Trophy className="w-5 h-5 text-teal-400" />
          <h3 className="text-lg font-semibold text-white">Earn Program</h3>
        </div>
        <div className="flex items-center gap-3">
          {data?.total_earned ? (
            <span className="text-sm text-teal-400 font-medium">
              ${data.total_earned.toFixed(2)} earned total
            </span>
          ) : null}
          <a
            href="/#earn"
            className="text-xs text-gray-400 hover:text-teal-400 transition-colors flex items-center gap-1"
          >
            Leaderboard
            <ExternalLink className="w-3 h-3" />
          </a>
        </div>
      </div>

      {/* Current month stats */}
      <div className="grid grid-cols-3 gap-4 mb-6">
        <div className="bg-white/5 rounded-lg p-4">
          <div className="flex items-center gap-1.5 text-gray-400 text-xs mb-1">
            <Trophy className="w-3.5 h-3.5" />
            Rank
          </div>
          <p className="text-xl font-bold text-white">
            {current?.rank ? `#${current.rank}` : '-'}
          </p>
          {current?.total_publishers ? (
            <p className="text-xs text-gray-500">of {current.total_publishers} publishers</p>
          ) : null}
        </div>

        <div className="bg-white/5 rounded-lg p-4">
          <div className="flex items-center gap-1.5 text-gray-400 text-xs mb-1">
            <TrendingUp className="w-3.5 h-3.5" />
            Pool Share
          </div>
          <p className="text-xl font-bold text-white">
            {sharePercent ? `${sharePercent.toFixed(1)}%` : '-'}
          </p>
        </div>

        <div className="bg-white/5 rounded-lg p-4">
          <div className="flex items-center gap-1.5 text-gray-400 text-xs mb-1">
            <DollarSign className="w-3.5 h-3.5" />
            Est. Earn
          </div>
          <p className="text-xl font-bold text-teal-400">
            {current?.estimated_earn ? `$${current.estimated_earn.toFixed(2)}` : '$0.00'}
          </p>
        </div>
      </div>

      {/* Pool share progress bar */}
      <div className="mb-6">
        <div className="flex items-center justify-between text-xs mb-2">
          <span className="text-gray-400">Your share of this month's pool</span>
          <span className="text-gray-300">
            Pool: ${(current?.total_earn_pool || 0).toFixed(2)} USDC
          </span>
        </div>
        <div className="h-2 bg-white/5 rounded-full overflow-hidden">
          <div
            className="h-full bg-gradient-to-r from-teal-500 to-cyan-400 rounded-full transition-all duration-500"
            style={{ width: `${Math.min(sharePercent, 100)}%` }}
          />
        </div>
        <div className="flex items-center justify-between text-xs mt-1">
          <span className="text-gray-500">{sharePercent.toFixed(1)}% of pool</span>
          {current?.my_platform_fees ? (
            <span className="text-gray-500">${current.my_platform_fees.toFixed(2)} in fees generated</span>
          ) : null}
        </div>
      </div>

      {/* Recent history */}
      {history.length > 0 ? (
        <div>
          <h4 className="text-sm font-medium text-gray-400 mb-3">Recent Distributions</h4>
          <div className="space-y-2">
            {history.map((h, i) => {
              const date = new Date(h.period_start);
              const monthLabel = date.toLocaleDateString('en-US', { month: 'short', year: 'numeric', timeZone: 'UTC' });
              return (
                <div key={i} className="flex items-center justify-between py-2 px-3 bg-white/[0.02] rounded-lg">
                  <div className="flex items-center gap-3">
                    <span className="text-sm text-gray-400">{monthLabel}</span>
                    <span className="text-xs text-gray-500">Rank #{h.rank}</span>
                  </div>
                  <div className="flex items-center gap-2">
                    <span className="text-sm font-medium text-white">${parseFloat(String(h.earn_amount)).toFixed(2)}</span>
                    <span className={`text-xs px-1.5 py-0.5 rounded ${
                      h.payout_status === 'paid'
                        ? 'bg-green-400/10 text-green-400'
                        : 'bg-yellow-400/10 text-yellow-400'
                    }`}>
                      {h.payout_status}
                    </span>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      ) : (
        <p className="text-sm text-gray-500">
          No distributions yet. Sell agents to start earning from the monthly pool!
        </p>
      )}
    </div>
  );
}
