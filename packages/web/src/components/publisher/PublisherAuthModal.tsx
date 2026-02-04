import React from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from '../ui/dialog';
import { useAuth } from '../../contexts/AuthContext';
import { Loader2, DollarSign, Shield, Zap } from 'lucide-react';

interface PublisherAuthModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

export function PublisherAuthModal({ open, onOpenChange }: PublisherAuthModalProps) {
  const { signInWithGoogle } = useAuth();
  const [loading, setLoading] = React.useState(false);

  const handleGoogleLogin = async () => {
    setLoading(true);
    try {
      await signInWithGoogle();
    } catch (error) {
      console.error('Login error:', error);
      setLoading(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md bg-[#1a1a1a] border-white/10">
        <DialogHeader>
          <DialogTitle className="text-2xl text-white text-center">
            Create a Publisher Account
          </DialogTitle>
          <DialogDescription className="text-gray-400 text-center pt-2">
            Sign in to submit agents and start earning
          </DialogDescription>
        </DialogHeader>

        <div className="py-6">
          {/* Benefits */}
          <div className="space-y-4 mb-8">
            <div className="flex items-start gap-3">
              <div className="w-8 h-8 bg-teal-500/10 rounded-lg flex items-center justify-center flex-shrink-0">
                <DollarSign className="w-4 h-4 text-teal-400" />
              </div>
              <div>
                <h4 className="text-white font-medium">Get Paid Directly</h4>
                <p className="text-sm text-gray-400">Receive 80% of sales in USDC to your wallet</p>
              </div>
            </div>
            <div className="flex items-start gap-3">
              <div className="w-8 h-8 bg-teal-500/10 rounded-lg flex items-center justify-center flex-shrink-0">
                <Zap className="w-4 h-4 text-teal-400" />
              </div>
              <div>
                <h4 className="text-white font-medium">Instant Publishing</h4>
                <p className="text-sm text-gray-400">No review queue - go live immediately</p>
              </div>
            </div>
            <div className="flex items-start gap-3">
              <div className="w-8 h-8 bg-teal-500/10 rounded-lg flex items-center justify-center flex-shrink-0">
                <Shield className="w-4 h-4 text-teal-400" />
              </div>
              <div>
                <h4 className="text-white font-medium">Dashboard Access</h4>
                <p className="text-sm text-gray-400">Track sales, manage agents, and view analytics</p>
              </div>
            </div>
          </div>

          {/* Google Sign In Button */}
          <button
            onClick={handleGoogleLogin}
            disabled={loading}
            className="w-full flex items-center justify-center gap-3 px-6 py-3 bg-white text-gray-900 font-semibold rounded-lg hover:bg-gray-100 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {loading ? (
              <Loader2 className="w-5 h-5 animate-spin" />
            ) : (
              <svg className="w-5 h-5" viewBox="0 0 24 24">
                <path
                  fill="currentColor"
                  d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z"
                />
                <path
                  fill="currentColor"
                  d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"
                />
                <path
                  fill="currentColor"
                  d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z"
                />
                <path
                  fill="currentColor"
                  d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z"
                />
              </svg>
            )}
            {loading ? 'Signing in...' : 'Continue with Google'}
          </button>

          <p className="text-xs text-gray-500 text-center mt-4">
            By continuing, you agree to our Terms of Service and Privacy Policy
          </p>
        </div>
      </DialogContent>
    </Dialog>
  );
}
