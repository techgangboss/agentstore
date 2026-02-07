import React, { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../contexts/AuthContext';
import { Navbar } from '../components/Navbar';
import { DashboardMetrics } from '../components/publisher/DashboardMetrics';
import { AgentList } from '../components/publisher/AgentList';
import { EarnProgramCard } from '../components/publisher/EarnProgramCard';
import { WalletPrompt } from '../components/publisher/WalletPrompt';
import { supabase } from '../lib/supabase';
import { toast } from 'sonner';
import { Plus, Loader2, LogOut, Settings } from 'lucide-react';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '../components/ui/dropdown-menu';

interface DashboardData {
  agents: any[];
  totalInstalls: number;
  totalSales: number;
  totalEarnings: number;
}

export function Dashboard() {
  const navigate = useNavigate();
  const { user, publisher, loading: authLoading, signOut, refreshPublisher } = useAuth();
  const [data, setData] = useState<DashboardData | null>(null);
  const [loading, setLoading] = useState(true);
  const [showWalletPrompt, setShowWalletPrompt] = useState(false);

  useEffect(() => {
    if (!authLoading && !user) {
      navigate('/submit');
      return;
    }

    if (publisher) {
      fetchDashboardData();
      // Show wallet prompt if no payout address set
      if (!publisher.payout_address || publisher.payout_address === '0x71483B877c40eb2BF99230176947F5ec1c2351cb') {
        setShowWalletPrompt(true);
      }
    }
  }, [user, publisher, authLoading, navigate]);

  const fetchDashboardData = async () => {
    if (!publisher) return;

    setLoading(true);
    try {
      // Fetch publisher's agents
      const { data: agents, error: agentsError } = await supabase
        .from('agents')
        .select('*')
        .eq('publisher_id', publisher.id)
        .order('created_at', { ascending: false });

      if (agentsError) throw agentsError;

      const agentList = agents || [];
      const totalInstalls = agentList.reduce((sum: number, a: any) => sum + (a.download_count || 0), 0);

      // Fetch real earnings from publisher API
      let totalSales = 0;
      let totalEarnings = 0;

      try {
        const session = await supabase.auth.getSession();
        const token = session.data.session?.access_token;
        if (token) {
          const apiUrl = import.meta.env.VITE_API_URL || '';
          const meResponse = await fetch(`${apiUrl}/api/publishers/me`, {
            headers: { 'Authorization': `Bearer ${token}` },
          });
          if (meResponse.ok) {
            const meData = await meResponse.json();
            totalSales = meData.publisher?.stats?.total_sales || 0;
            totalEarnings = meData.publisher?.stats?.total_earnings || 0;
          }
        }
      } catch (e) {
        console.error('Error fetching publisher stats:', e);
      }

      setData({
        agents: agentList,
        totalInstalls,
        totalSales,
        totalEarnings,
      });
    } catch (error) {
      console.error('Error fetching dashboard data:', error);
      toast.error('Failed to load dashboard data');
    } finally {
      setLoading(false);
    }
  };

  const handleSaveWallet = async (address: string) => {
    const apiUrl = import.meta.env.VITE_API_URL || '';

    const response = await fetch(`${apiUrl}/api/publishers/me`, {
      method: 'PATCH',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${(await supabase.auth.getSession()).data.session?.access_token}`,
      },
      body: JSON.stringify({ payout_address: address }),
    });

    if (!response.ok) {
      const errData = await response.json();
      throw new Error(errData.error || 'Failed to update wallet');
    }

    await refreshPublisher();
    toast.success('Wallet address saved!');
  };

  const handleSignOut = async () => {
    try {
      await signOut();
      navigate('/');
    } catch (error) {
      toast.error('Failed to sign out');
    }
  };

  if (authLoading || loading) {
    return (
      <div className="min-h-screen bg-[#0a0a0a]">
        <Navbar />
        <div className="pt-24 flex items-center justify-center">
          <Loader2 className="w-8 h-8 text-teal-400 animate-spin" />
        </div>
      </div>
    );
  }

  if (!publisher) {
    return (
      <div className="min-h-screen bg-[#0a0a0a]">
        <Navbar />
        <div className="pt-24 max-w-lg mx-auto px-4 text-center">
          <h1 className="text-2xl font-bold text-white mb-4">Publisher Account Required</h1>
          <p className="text-gray-400 mb-6">Submit an agent to create your publisher account.</p>
          <button
            onClick={() => navigate('/submit')}
            className="px-6 py-3 bg-teal-500 text-black font-semibold rounded-lg hover:bg-teal-400 transition-colors"
          >
            Submit Agent
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-[#0a0a0a]">
      <Navbar />

      <div className="pt-24 pb-16 max-w-6xl mx-auto px-4">
        {/* Header */}
        <div className="flex items-center justify-between mb-8">
          <div>
            <h1 className="text-2xl font-bold text-white">Publisher Dashboard</h1>
            <p className="text-gray-400">Welcome back, {publisher.display_name}</p>
          </div>

          <div className="flex items-center gap-4">
            <button
              onClick={() => navigate('/submit')}
              className="flex items-center gap-2 px-4 py-2 bg-teal-500 text-black font-semibold rounded-lg hover:bg-teal-400 transition-colors"
            >
              <Plus className="w-4 h-4" />
              New Agent
            </button>

            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <button className="flex items-center gap-2 px-4 py-2 bg-white/10 text-white rounded-lg hover:bg-white/20 transition-colors">
                  <div className="w-8 h-8 bg-teal-500/20 rounded-full flex items-center justify-center">
                    <span className="text-teal-400 font-semibold">
                      {publisher.display_name?.[0]?.toUpperCase() || 'P'}
                    </span>
                  </div>
                </button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end" className="bg-[#1a1a1a] border-white/10 w-56">
                <div className="px-3 py-2">
                  <p className="text-sm font-medium text-white">{publisher.display_name}</p>
                  <p className="text-xs text-gray-400">{user?.email}</p>
                </div>
                <DropdownMenuSeparator className="bg-white/10" />
                <DropdownMenuItem
                  className="text-gray-300 hover:text-white cursor-pointer"
                  onClick={() => setShowWalletPrompt(true)}
                >
                  <Settings className="w-4 h-4 mr-2" />
                  Wallet Settings
                </DropdownMenuItem>
                <DropdownMenuItem
                  className="text-gray-300 hover:text-white cursor-pointer"
                  onClick={handleSignOut}
                >
                  <LogOut className="w-4 h-4 mr-2" />
                  Sign Out
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
          </div>
        </div>

        {/* Metrics */}
        <div className="mb-8">
          <DashboardMetrics
            totalAgents={data?.agents.length || 0}
            totalInstalls={data?.totalInstalls || 0}
            totalSales={data?.totalSales || 0}
            totalEarnings={data?.totalEarnings || 0}
          />
        </div>

        {/* Earn Program */}
        <div className="mb-8">
          <EarnProgramCard />
        </div>

        {/* Agents */}
        <div>
          <h2 className="text-lg font-semibold text-white mb-4">Your Agents</h2>
          <AgentList agents={data?.agents || []} />
        </div>
      </div>

      <WalletPrompt
        open={showWalletPrompt}
        onOpenChange={setShowWalletPrompt}
        onSubmit={handleSaveWallet}
      />
    </div>
  );
}
