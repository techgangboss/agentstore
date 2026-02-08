import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../contexts/AuthContext';
import { AgentForm, AgentFormData } from '../components/publisher/AgentForm';
import { PublisherAuthModal } from '../components/publisher/PublisherAuthModal';
import { Navbar } from '../components/Navbar';
import { toast } from 'sonner';
import { ArrowLeft, CheckCircle2 } from 'lucide-react';

export function SubmitAgent() {
  useEffect(() => {
    document.title = 'Submit an Agent - AgentStore';
  }, []);

  const navigate = useNavigate();
  const { user, publisher, loading } = useAuth();
  const [showAuthModal, setShowAuthModal] = useState(false);
  const [submitted, setSubmitted] = useState(false);
  const [submittedAgent, setSubmittedAgent] = useState<{ agent_id: string; name: string } | null>(null);

  // Show auth modal if not logged in when they try to submit
  const [pendingSubmission, setPendingSubmission] = useState<AgentFormData | null>(null);

  useEffect(() => {
    // Check for pending submission after auth
    const stored = sessionStorage.getItem('pendingAgentSubmission');
    if (stored && user && publisher) {
      const data = JSON.parse(stored) as AgentFormData;
      sessionStorage.removeItem('pendingAgentSubmission');
      handleSubmitAgent(data);
    }
  }, [user, publisher]);

  const handleSubmitAgent = async (data: AgentFormData) => {
    if (!user || !publisher) {
      // Store submission data and show auth modal
      sessionStorage.setItem('pendingAgentSubmission', JSON.stringify(data));
      setPendingSubmission(data);
      setShowAuthModal(true);
      return;
    }

    try {
      const apiUrl = import.meta.env.VITE_API_URL || '';

      // Generate agent_id from publisher_id and name
      const agentSlug = data.name.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
      const agentId = `${publisher.publisher_id}.${agentSlug}`;

      // Build the agent manifest
      const manifest: any = {
        agent_id: agentId,
        name: data.name,
        type: data.type,
        description: data.description,
        version: '1.0.0',
        pricing: {
          model: data.pricingModel,
          currency: 'USD',
          amount: data.pricingModel === 'free' ? 0 : (data.price || 0),
        },
        tags: data.tags,
        // Simplified install config for agents without MCP
        install: {
          agent_wrapper: {
            format: 'markdown',
            entrypoint: 'agent.md',
            content: `# ${data.name}\n\n${data.description}`,
          },
          gateway_routes: data.hasMcpEndpoint && data.mcpEndpoint ? [
            {
              route_id: `${agentSlug}-route`,
              mcp_endpoint: data.mcpEndpoint,
              tools: [],
              auth: {
                type: data.type === 'proprietary' ? 'entitlement' : 'none',
              },
            },
          ] : [],
        },
        permissions: {
          requires_network: !!data.hasMcpEndpoint,
          requires_filesystem: false,
        },
      };

      const response = await fetch(`${apiUrl}/api/publishers/agents/simple`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          ...manifest,
          auth_user_id: user.id,
        }),
      });

      if (!response.ok) {
        const errData = await response.json();
        throw new Error(errData.error || 'Failed to submit agent');
      }

      const result = await response.json();

      setSubmittedAgent({ agent_id: agentId, name: data.name });
      setSubmitted(true);
      toast.success('Agent submitted successfully!');
    } catch (error) {
      console.error('Submit error:', error);
      toast.error(error instanceof Error ? error.message : 'Failed to submit agent');
    }
  };

  if (loading) {
    return (
      <div className="min-h-screen bg-[#0a0a0a]">
        <Navbar />
        <div className="pt-24 flex items-center justify-center">
          <div className="animate-pulse text-gray-400">Loading...</div>
        </div>
      </div>
    );
  }

  if (submitted && submittedAgent) {
    return (
      <div className="min-h-screen bg-[#0a0a0a]">
        <Navbar />
        <div className="pt-24 max-w-2xl mx-auto px-4">
          <div className="bg-[#1a1a1a] rounded-2xl p-8 border border-white/10 text-center">
            <div className="w-16 h-16 bg-teal-500/10 rounded-full flex items-center justify-center mx-auto mb-6">
              <CheckCircle2 className="w-8 h-8 text-teal-400" />
            </div>
            <h1 className="text-2xl font-bold text-white mb-2">Agent Submitted!</h1>
            <p className="text-gray-400 mb-6">
              "{submittedAgent.name}" is now live in the marketplace
            </p>
            <div className="flex gap-4 justify-center">
              <button
                onClick={() => navigate('/dashboard')}
                className="px-6 py-3 bg-teal-500 text-black font-semibold rounded-lg hover:bg-teal-400 transition-colors"
              >
                Go to Dashboard
              </button>
              <button
                onClick={() => {
                  setSubmitted(false);
                  setSubmittedAgent(null);
                }}
                className="px-6 py-3 bg-white/10 text-white font-semibold rounded-lg hover:bg-white/20 transition-colors"
              >
                Submit Another
              </button>
            </div>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-[#0a0a0a]">
      <Navbar />
      <div className="pt-24 pb-16 max-w-2xl mx-auto px-4">
        <button
          onClick={() => navigate('/')}
          className="flex items-center gap-2 text-gray-400 hover:text-white mb-8 transition-colors"
        >
          <ArrowLeft className="w-4 h-4" />
          Back to Home
        </button>

        <div className="mb-8">
          <h1 className="text-3xl font-bold text-white mb-2">Submit Your Agent</h1>
          <p className="text-gray-400">
            Create a listing for your agent in the AgentStore marketplace.
            {!user && ' Sign in with Google to get started.'}
          </p>
        </div>

        <div className="bg-[#1a1a1a] rounded-2xl p-6 sm:p-8 border border-white/10">
          <AgentForm
            onSubmit={handleSubmitAgent}
            publisherId={publisher?.publisher_id || ''}
          />
        </div>
      </div>

      <PublisherAuthModal
        open={showAuthModal}
        onOpenChange={setShowAuthModal}
      />
    </div>
  );
}
