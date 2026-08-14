import type { Metadata } from 'next';
import './globals.css';
import { Providers } from '@/components/shared/providers';

// Fonts are self-hosted via system-font stacks in globals.css (no next/font/google
// or Google Fonts <link> tags). Both of those require a live network round-trip to
// fonts.googleapis.com at build/dev-server-start time and on every page load —
// on slow, unstable, or restricted networks this was the main cause of slow /
// hanging page loads. System fonts render instantly with zero network dependency.

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
      <body>
        <Providers>{children}</Providers>
      </body>
    </html>
  );
}
