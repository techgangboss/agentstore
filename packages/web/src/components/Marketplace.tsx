import React, { useEffect, useState } from 'react';
import { Search, Filter, RefreshCw } from 'lucide-react';
import { Agent } from '../types';
import { AgentCard } from './AgentCard';

// Mock data to use if API fails or for initial state
const MOCK_AGENTS: Agent[] = [
  {
    agent_id: "techgangboss.sql-expert",
    name: "SQL Expert",
    description: "Expert SQL agent that writes optimized queries, explains execution plans, and helps debug database performance issues.",
    publisher: { display_name: "TechGang Boss" },
    pricing: { model: "one_time", amount: 5 },
    tags: ["Productivity", "Database", "DevTools"]
  },
  {
    agent_id: "techgangboss.wallet-assistant",
    name: "Wallet Assistant",
    description: "Manage your crypto portfolio directly from Claude. Check balances, gas fees, and transaction history.",
    publisher: { display_name: "TechGang Boss" },
    pricing: { model: "free", amount: 0 },
    tags: ["Crypto", "Utilities"]
  },
  {
    agent_id: "alice.react-master",
    name: "React Master",
    description: "Generates production-ready React components with Tailwind CSS. Follows best practices and accessibility guidelines.",
    publisher: { display_name: "Alice Dev" },
    pricing: { model: "one_time", amount: 10 },
    tags: ["Frontend", "React", "Productivity"]
  },
  {
    agent_id: "bob.python-script",
    name: "Python Scripter",
    description: "Quickly generate Python automation scripts for file handling, data processing, and system administration.",
    publisher: { display_name: "Bob Builder" },
    pricing: { model: "free", amount: 0 },
    tags: ["Python", "Automation", "Utilities"]
  }
];

export function Marketplace() {
  const [agents, setAgents] = useState<Agent[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedTag, setSelectedTag] = useState<string | null>(null);

  const fetchAgents = async () => {
    setLoading(true);
    try {
      const apiUrl = import.meta.env.VITE_API_URL || '';
      const response = await fetch(`${apiUrl}/api/agents`);
      if (response.ok) {
        const data = await response.json();
        // Defensive check to ensure we have an array
        const agentsList = Array.isArray(data) ? data : (data.agents || data.data || []);
        
        if (Array.isArray(agentsList)) {
            setAgents(agentsList);
            setError(false);
        } else {
            throw new Error("API response is not an array");
        }
      } else {
        throw new Error("Failed to fetch");
      }
    } catch (e) {
      console.error("API Error, using mock data", e);
      setAgents(MOCK_AGENTS); // Fallback to mock data so the UI isn't empty
      setError(true);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchAgents();
  }, []);

  // Extract unique tags
  // Ensure agents is an array before calling flatMap
  const safeAgents = Array.isArray(agents) ? agents : [];
  const allTags = Array.from(new Set(safeAgents.flatMap(agent => agent.tags || [])));

  // Filter agents
  const filteredAgents = safeAgents.filter(agent => {
    const matchesSearch = (agent.name || '').toLowerCase().includes(searchQuery.toLowerCase()) || 
                          (agent.description || '').toLowerCase().includes(searchQuery.toLowerCase()) ||
                          (agent.publisher?.display_name || '').toLowerCase().includes(searchQuery.toLowerCase());
    const matchesTag = selectedTag ? agent.tags?.includes(selectedTag) : true;
    return matchesSearch && matchesTag;
  });

  return (
    <section className="py-24 bg-[#0a0a0a]">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="flex flex-col md:flex-row md:items-end justify-between mb-10 gap-6">
          <div>
            <h2 className="text-3xl font-bold text-white mb-2">Explore the marketplace</h2>
            <p className="text-gray-400">Discover agents to supercharge your workflow.</p>
          </div>
          
          <div className="flex flex-col sm:flex-row gap-4 w-full md:w-auto">
            {/* Search Bar */}
            <div className="relative group w-full sm:w-64">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-gray-500 group-focus-within:text-teal-400 transition-colors" />
              <input
                type="text"
                placeholder="Search agents..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="w-full bg-[#1a1a1a] border border-white/10 rounded-lg py-2.5 pl-10 pr-4 text-sm text-white placeholder-gray-500 focus:outline-none focus:border-teal-500/50 focus:ring-1 focus:ring-teal-500/50 transition-all"
              />
            </div>
            
            {/* Tag Filter Dropdown (Mobile) / Pills (Desktop) could go here, but let's do a simple row of pills below or above */}
          </div>
        </div>

        {/* Tag Filters */}
        <div className="flex flex-wrap gap-2 mb-8">
          <button
            onClick={() => setSelectedTag(null)}
            className={`px-3 py-1.5 rounded-full text-sm font-medium transition-all ${
              selectedTag === null
                ? 'bg-teal-500 text-black'
                : 'bg-white/5 text-gray-400 hover:bg-white/10 hover:text-white'
            }`}
          >
            All
          </button>
          {allTags.map(tag => (
            <button
              key={tag}
              onClick={() => setSelectedTag(tag === selectedTag ? null : tag)}
              className={`px-3 py-1.5 rounded-full text-sm font-medium transition-all ${
                selectedTag === tag
                  ? 'bg-teal-500 text-black'
                  : 'bg-white/5 text-gray-400 hover:bg-white/10 hover:text-white'
              }`}
            >
              {tag}
            </button>
          ))}
        </div>

        {/* Grid */}
        {loading ? (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6 animate-pulse">
            {[1, 2, 3, 4, 5, 6].map(i => (
              <div key={i} className="bg-[#1a1a1a] rounded-xl h-64 border border-white/5"></div>
            ))}
          </div>
        ) : filteredAgents.length > 0 ? (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
            {filteredAgents.map(agent => (
              <AgentCard key={agent.agent_id} agent={agent} />
            ))}
          </div>
        ) : (
          <div className="text-center py-20 border border-dashed border-white/10 rounded-xl">
            <p className="text-gray-500">No agents found matching your criteria.</p>
            <button 
                onClick={() => {setSearchQuery(''); setSelectedTag(null);}}
                className="mt-4 text-teal-400 hover:text-teal-300 text-sm font-medium"
            >
                Clear filters
            </button>
          </div>
        )}
      </div>
    </section>
  );
}
