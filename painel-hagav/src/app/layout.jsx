import './globals.css';
import { Suspense } from 'react';
import { AuthProvider } from '@/context/AuthContext';
import AuthShell from '@/components/auth/AuthShell';

export const metadata = {
  title: 'HAGAV · Painel Interno',
  description: 'Painel interno HAGAV Studio — uso exclusivo.',
  robots: 'noindex, nofollow',
};

export default function RootLayout({ children }) {
  return (
    <html lang="pt-BR">
      <body>
        <AuthProvider>
          <Suspense fallback={null}>
            <AuthShell>{children}</AuthShell>
          </Suspense>
        </AuthProvider>
      </body>
    </html>
  );
}
