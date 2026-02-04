import React, { useState } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from '../ui/dialog';
import { Input } from '../ui/input';
import { Label } from '../ui/label';
import { Loader2, Wallet, AlertCircle } from 'lucide-react';

interface WalletPromptProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSubmit: (address: string) => Promise<void>;
}

export function WalletPrompt({ open, onOpenChange, onSubmit }: WalletPromptProps) {
  const [address, setAddress] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const isValidAddress = /^0x[a-fA-F0-9]{40}$/.test(address);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!isValidAddress) {
      setError('Please enter a valid Ethereum address');
      return;
    }

    setLoading(true);
    setError(null);
    try {
      await onSubmit(address);
      onOpenChange(false);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to save wallet address');
    } finally {
      setLoading(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md bg-[#1a1a1a] border-white/10">
        <DialogHeader>
          <DialogTitle className="text-xl text-white flex items-center gap-2">
            <Wallet className="w-5 h-5 text-teal-400" />
            Add Your Wallet
          </DialogTitle>
          <DialogDescription className="text-gray-400">
            Add your Ethereum wallet address to receive payments in USDC
          </DialogDescription>
        </DialogHeader>

        <form onSubmit={handleSubmit} className="space-y-4 pt-4">
          <div className="space-y-2">
            <Label htmlFor="wallet" className="text-white">
              Ethereum Address
            </Label>
            <Input
              id="wallet"
              value={address}
              onChange={(e) => {
                setAddress(e.target.value);
                setError(null);
              }}
              placeholder="0x..."
              className="bg-[#0a0a0a] border-white/10 text-white font-mono"
            />
            {error && (
              <div className="flex items-center gap-2 text-sm text-red-400">
                <AlertCircle className="w-4 h-4" />
                {error}
              </div>
            )}
          </div>

          <div className="bg-teal-500/5 border border-teal-500/20 rounded-lg p-4">
            <h4 className="text-sm font-medium text-white mb-1">Why add a wallet?</h4>
            <p className="text-sm text-gray-400">
              When users purchase your agents, you'll receive 80% of each sale directly to this wallet in USDC.
            </p>
          </div>

          <div className="flex gap-3 pt-2">
            <button
              type="button"
              onClick={() => onOpenChange(false)}
              className="flex-1 py-2.5 bg-white/5 text-white font-medium rounded-lg hover:bg-white/10 transition-colors"
            >
              Skip for Now
            </button>
            <button
              type="submit"
              disabled={loading || !isValidAddress}
              className="flex-1 py-2.5 bg-teal-500 text-black font-semibold rounded-lg hover:bg-teal-400 transition-colors disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2"
            >
              {loading ? (
                <>
                  <Loader2 className="w-4 h-4 animate-spin" />
                  Saving...
                </>
              ) : (
                'Save Wallet'
              )}
            </button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}
