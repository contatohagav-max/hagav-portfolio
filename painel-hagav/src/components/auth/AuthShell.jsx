'use client';

// Using img instead of next/image to avoid basePath prefix on static asset
import { useAuth } from '@/context/AuthContext';
import LoginScreen from './LoginScreen';
import AppShell from '@/components/layout/AppShell';
import { Loader2 } from 'lucide-react';

export default function AuthShell({ children }) {
  const { session, loading } = useAuth();

  if (loading) {
    return (
      <div className="min-h-screen bg-hagav-black flex flex-col items-center justify-center gap-5">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src="/admin/hagav-logo.png" alt="HAGAV Studio" className="h-14 w-auto object-contain opacity-80" />
        <Loader2 size={20} className="animate-spin text-hagav-gold" />
      </div>
    );
  }

  if (!session) return <LoginScreen />;

  return <AppShell>{children}</AppShell>;
}
