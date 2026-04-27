'use client';

import { useEffect } from 'react';
import { usePathname, useRouter, useSearchParams } from 'next/navigation';
import { Loader2 } from 'lucide-react';
import { useAuth } from '@/context/AuthContext';
import LoginScreen from './LoginScreen';
import AppShell from '@/components/layout/AppShell';

export default function AuthShell({ children }) {
  const { session, loading } = useAuth();
  const pathname = usePathname();
  const router = useRouter();
  const searchParams = useSearchParams();

  useEffect(() => {
    if (!loading && session && pathname === '/login') {
      router.replace(searchParams.get('next') || '/');
    }
  }, [loading, pathname, router, searchParams, session]);

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
  if (pathname === '/login') return null;

  return <AppShell>{children}</AppShell>;
}
