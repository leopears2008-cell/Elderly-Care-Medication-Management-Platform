import type { Metadata } from 'next';
import { Inter } from 'next/font/google';
import './globals.css';

const inter = Inter({ subsets: ['latin'] });

export const metadata: Metadata = {
  title: 'SushrutaCare AI | Elderly Medication Management',
  description:
    'AI-powered medication management platform for elderly care — prescription scanning, drug interaction detection, reminders, and adherence tracking.',
  keywords: ['elderly care', 'medication management', 'AI health', 'drug interactions'],
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body className={inter.className}>
        <a
          href="#main-content"
          className="sr-only focus:not-sr-only focus:absolute focus:top-4 focus:left-4 focus:z-50 focus:bg-blue-900 focus:text-white focus:px-4 focus:py-2 focus:rounded-lg focus:text-lg focus:font-bold"
        >
          Skip to main content
        </a>
        <main id="main-content">{children}</main>
      </body>
    </html>
  );
}
