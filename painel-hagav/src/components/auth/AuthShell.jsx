'use client';

import { useAuth } from '@/context/AuthContext';
import LoginScreen from './LoginScreen';
import AppShell from '@/components/layout/AppShell';
import { Loader2, Zap } from 'lucide-react';

export default function AuthShell({ children }) {
  const { session, loading } = useAuth();

  // Loading — checking session
  if (loading) {
    return (
      <div className="min-h-screen bg-hagav-black flex flex-col items-center justify-center gap-4">
        <div className="w-10 h-10 rounded-xl bg-gold-gradient flex items-center justify-center shadow-gold">
          <Zap size={18} className="text-hagav-black" fill="currentColor" />
        </div>
        <Loader2 size={18} className="animate-spin text-hagav-gold" />
      </div>
    );
  }

  // Not authenticated — show login
  if (!session) {
    return <LoginScreen />;
  }

  // Authenticated — show the full app
  return <AppShell>{children}</AppShell>;
}
