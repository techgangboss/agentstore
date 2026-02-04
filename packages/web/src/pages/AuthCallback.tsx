import React, { useEffect, useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { supabase } from '../lib/supabase';
import { useAuth } from '../contexts/AuthContext';
import { Loader2 } from 'lucide-react';

export function AuthCallback() {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const { refreshPublisher } = useAuth();
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const handleCallback = async () => {
      try {
        // Get the session from the URL hash
        const { data: { session }, error: authError } = await supabase.auth.getSession();

        if (authError) {
          throw authError;
        }

        if (!session) {
          throw new Error('No session found');
        }

        // Check if user has a publisher account
        const { data: publisher } = await supabase
          .from('publishers')
          .select('id')
          .eq('auth_user_id', session.user.id)
          .single();

        // Get the intended destination
        const returnTo = searchParams.get('returnTo') || '/dashboard';
        const pendingSubmission = sessionStorage.getItem('pendingAgentSubmission');

        if (!publisher) {
          // New user - create publisher account
          const apiUrl = import.meta.env.VITE_API_URL || '';
          const response = await fetch(`${apiUrl}/api/auth/link-publisher`, {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
              'Authorization': `Bearer ${session.access_token}`,
            },
            body: JSON.stringify({
              display_name: session.user.user_metadata?.full_name || session.user.email?.split('@')[0] || 'Publisher',
            }),
          });

          if (!response.ok) {
            const errData = await response.json();
            throw new Error(errData.error || 'Failed to create publisher account');
          }
        }

        await refreshPublisher();

        // If there's a pending submission, go to submit page
        if (pendingSubmission) {
          navigate('/submit', { replace: true });
        } else {
          navigate(returnTo, { replace: true });
        }
      } catch (err) {
        console.error('Auth callback error:', err);
        setError(err instanceof Error ? err.message : 'Authentication failed');
      }
    };

    handleCallback();
  }, [navigate, searchParams, refreshPublisher]);

  if (error) {
    return (
      <div className="min-h-screen bg-[#0a0a0a] flex items-center justify-center">
        <div className="text-center">
          <h1 className="text-2xl font-bold text-white mb-4">Authentication Error</h1>
          <p className="text-gray-400 mb-6">{error}</p>
          <button
            onClick={() => navigate('/')}
            className="px-6 py-3 bg-teal-500 text-black font-semibold rounded-lg hover:bg-teal-400 transition-colors"
          >
            Return Home
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-[#0a0a0a] flex items-center justify-center">
      <div className="text-center">
        <Loader2 className="w-12 h-12 text-teal-400 animate-spin mx-auto mb-4" />
        <p className="text-gray-400">Setting up your account...</p>
      </div>
    </div>
  );
}
