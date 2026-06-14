import type { Metadata } from 'next';
import './globals.css';

export const metadata: Metadata = {
  title: 'sentinel — paper rig',
  description: 'Read-only dashboard for the sentinel pump.fun paper-trading rig.',
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
