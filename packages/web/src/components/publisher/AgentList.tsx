import React from 'react';
import { Package, ExternalLink, MoreVertical, Settings, Trash2, Eye } from 'lucide-react';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '../ui/dropdown-menu';

interface Agent {
  id: string;
  agent_id: string;
  name: string;
  description: string;
  type: string;
  version: string;
  download_count: number;
  is_published: boolean;
  created_at: string;
  manifest: {
    pricing?: {
      model: string;
      amount: number;
    };
  };
}

interface AgentListProps {
  agents: Agent[];
  onConfigureAgent?: (agent: Agent) => void;
}

export function AgentList({ agents, onConfigureAgent }: AgentListProps) {
  if (agents.length === 0) {
    return (
      <div className="bg-[#1a1a1a] rounded-xl p-8 border border-white/10 text-center">
        <div className="w-16 h-16 bg-white/5 rounded-full flex items-center justify-center mx-auto mb-4">
          <Package className="w-8 h-8 text-gray-500" />
        </div>
        <h3 className="text-lg font-semibold text-white mb-2">No agents yet</h3>
        <p className="text-gray-400 mb-6">Submit your first agent to see it here</p>
        <a
          href="/submit"
          className="inline-flex px-6 py-3 bg-teal-500 text-black font-semibold rounded-lg hover:bg-teal-400 transition-colors"
        >
          Submit Agent
        </a>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {agents.map((agent) => (
        <div
          key={agent.id}
          className="bg-[#1a1a1a] rounded-xl p-5 border border-white/10 hover:border-white/20 transition-colors"
        >
          <div className="flex items-start justify-between gap-4">
            <div className="flex-1 min-w-0">
              <div className="flex items-center gap-2 mb-1">
                <h3 className="text-lg font-semibold text-white truncate">{agent.name}</h3>
                <span className="text-xs text-gray-500">v{agent.version}</span>
                {agent.is_published ? (
                  <span className="px-2 py-0.5 text-xs bg-green-500/10 text-green-400 rounded-full">
                    Live
                  </span>
                ) : (
                  <span className="px-2 py-0.5 text-xs bg-yellow-500/10 text-yellow-400 rounded-full">
                    Draft
                  </span>
                )}
              </div>
              <p className="text-sm text-gray-400 line-clamp-2 mb-3">{agent.description}</p>
              <div className="flex items-center gap-4 text-sm">
                <span className="text-gray-500">
                  {agent.manifest?.pricing?.model === 'free' ? (
                    <span className="text-teal-400">Free</span>
                  ) : (
                    <span className="text-teal-400">${agent.manifest?.pricing?.amount || 0}</span>
                  )}
                </span>
                <span className="text-gray-500 flex items-center gap-1">
                  <Eye className="w-4 h-4" />
                  {agent.download_count} installs
                </span>
                <span className="text-gray-500">
                  {agent.type === 'open' ? 'Open' : 'Proprietary'}
                </span>
              </div>
            </div>

            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <button className="p-2 hover:bg-white/5 rounded-lg transition-colors">
                  <MoreVertical className="w-5 h-5 text-gray-400" />
                </button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end" className="bg-[#1a1a1a] border-white/10">
                <DropdownMenuItem
                  className="text-gray-300 hover:text-white cursor-pointer"
                  onClick={() => window.open(`/#marketplace`, '_blank')}
                >
                  <ExternalLink className="w-4 h-4 mr-2" />
                  View in Marketplace
                </DropdownMenuItem>
                <DropdownMenuItem
                  className="text-gray-300 hover:text-white cursor-pointer"
                  onClick={() => onConfigureAgent?.(agent)}
                >
                  <Settings className="w-4 h-4 mr-2" />
                  Configure
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
          </div>
        </div>
      ))}
    </div>
  );
}
