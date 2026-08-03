import type { Metadata } from 'next';
import { Inter } from 'next/font/google';
import './globals.css';
import { Providers } from '@/components/shared/providers';

const inter = Inter({ subsets: ['latin'] });

export const metadata: Metadata = {
  title: 'AI Virtual Lab',
  description: 'Intelligent virtual laboratory platform for educational institutions',
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en" suppressHydrationWarning>
      <body className={inter.className}>
        <Providers>{children}</Providers>
      </body>
    </html>
  );
}
