import React, { useEffect, useState } from 'react';
import { motion } from 'motion/react';
import { Users, Box, Zap, DollarSign } from 'lucide-react';
import { Agent } from '../types';

interface Stats {
  agents: number;
  publishers: number;
  free: number;
  paid: number;
}

export function StatsBar() {
  const [stats, setStats] = useState<Stats>({ agents: 0, publishers: 0, free: 0, paid: 0 });
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const fetchStats = async () => {
      try {
        const response = await fetch('https://api-inky-seven.vercel.app/api/agents');
        if (response.ok) {
          const data = await response.json();
          // Ensure data is an array
          const agents: Agent[] = Array.isArray(data) ? data : (data.agents || data.data || []);
          
          if (!Array.isArray(agents)) {
             throw new Error("Invalid API response format");
          }

          const publishers = new Set(agents.map(a => a.publisher?.display_name || 'Unknown')).size;
          const free = agents.filter(a => !a.pricing || a.pricing.amount === 0).length;
          const paid = agents.filter(a => a.pricing && a.pricing.amount > 0).length;

          setStats({
            agents: agents.length,
            publishers,
            free,
            paid
          });
        } else {
            // Fallback data if API fails
            setStats({ agents: 12, publishers: 5, free: 8, paid: 4 });
        }
      } catch (error) {
        console.error('Failed to fetch stats', error);
        // Fallback data
        setStats({ agents: 12, publishers: 5, free: 8, paid: 4 });
      } finally {
        setLoading(false);
      }
    };

    fetchStats();
  }, []);

  const statItems = [
    { label: 'Agents', value: stats.agents, icon: Box },
    { label: 'Publishers', value: stats.publishers, icon: Users },
    { label: 'Free Agents', value: stats.free, icon: Zap },
    { label: 'Paid Agents', value: stats.paid, icon: DollarSign },
  ];

  return (
    <div className="border border-white/5 bg-white/[0.02] rounded-2xl backdrop-blur-sm">
      <div className="">
        <div className="grid grid-cols-2 md:grid-cols-4 divide-x divide-white/5">
          {statItems.map((item, index) => (
            <motion.div
              key={item.label}
              initial={{ opacity: 0 }}
              whileInView={{ opacity: 1 }}
              viewport={{ once: true }}
              transition={{ delay: index * 0.1 }}
              className="px-4 py-4 flex flex-col items-center justify-center text-center group"
            >
              <item.icon className="w-5 h-5 text-teal-500/50 mb-2 group-hover:text-teal-400 transition-colors" />
              <div className="text-2xl font-bold text-white mb-0.5">
                {loading ? (
                  <span className="inline-block w-8 h-8 bg-white/10 animate-pulse rounded"></span>
                ) : (
                  item.value
                )}
              </div>
              <div className="text-sm font-medium text-gray-500 uppercase tracking-wider">{item.label}</div>
            </motion.div>
          ))}
        </div>
      </div>
    </div>
  );
}
