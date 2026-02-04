import React, { createContext, useContext, useEffect, useState } from 'react';
import { Session, User } from '@supabase/supabase-js';
import { supabase } from '../lib/supabase';

interface Publisher {
  id: string;
  publisher_id: string;
  display_name: string;
  payout_address: string | null;
  email: string | null;
  created_at: string;
}

interface AuthContextType {
  session: Session | null;
  user: User | null;
  publisher: Publisher | null;
  loading: boolean;
  signInWithGoogle: () => Promise<void>;
  signOut: () => Promise<void>;
  refreshPublisher: () => Promise<void>;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [session, setSession] = useState<Session | null>(null);
  const [user, setUser] = useState<User | null>(null);
  const [publisher, setPublisher] = useState<Publisher | null>(null);
  const [loading, setLoading] = useState(true);

  const fetchPublisher = async (userId: string) => {
    try {
      const { data, error } = await supabase
        .from('publishers')
        .select('*')
        .eq('auth_user_id', userId)
        .single();

      if (error && error.code !== 'PGRST116') {
        console.error('Error fetching publisher:', error);
      }
      setPublisher(data || null);
    } catch (err) {
      console.error('Error fetching publisher:', err);
      setPublisher(null);
    }
  };

  const refreshPublisher = async () => {
    if (user?.id) {
      await fetchPublisher(user.id);
    }
  };

  useEffect(() => {
    // Get initial session
    supabase.auth.getSession().then(({ data: { session } }) => {
      setSession(session);
      setUser(session?.user ?? null);
      if (session?.user?.id) {
        fetchPublisher(session.user.id);
      }
      setLoading(false);
    });

    // Listen for auth changes
    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange(async (_event, session) => {
      setSession(session);
      setUser(session?.user ?? null);
      if (session?.user?.id) {
        await fetchPublisher(session.user.id);
      } else {
        setPublisher(null);
      }
      setLoading(false);
    });

    return () => subscription.unsubscribe();
  }, []);

  const signInWithGoogle = async () => {
    const { error } = await supabase.auth.signInWithOAuth({
      provider: 'google',
      options: {
        redirectTo: `${window.location.origin}/auth/callback`,
      },
    });
    if (error) {
      console.error('Error signing in with Google:', error);
      throw error;
    }
  };

  const signOut = async () => {
    const { error } = await supabase.auth.signOut();
    if (error) {
      console.error('Error signing out:', error);
      throw error;
    }
    setPublisher(null);
  };

  return (
    <AuthContext.Provider
      value={{
        session,
        user,
        publisher,
        loading,
        signInWithGoogle,
        signOut,
        refreshPublisher,
      }}
    >
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const context = useContext(AuthContext);
  if (context === undefined) {
    throw new Error('useAuth must be used within an AuthProvider');
  }
  return context;
}
