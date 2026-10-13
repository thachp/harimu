import type { Metadata } from 'next';
import './globals.css';
import { Providers } from './providers';

export const metadata: Metadata = {
  metadataBase: new URL('https://harimu-world.thachp.chatgpt.site'),
  icons: { icon: '/favicon.svg' },
  title: 'Harimu — The World Continues',
  description:
    'A persistent political strategy world where every player lives as one citizen of one nation.',
  openGraph: {
    title: 'Harimu — The World Continues',
    description:
      'Choose a nation, build a life, and shape a permanent world through work, politics, trade, and diplomacy.',
    type: 'website',
    images: [
      {
        url: '/og.png',
        width: 1200,
        height: 630,
        alt: 'Harimu — The World Continues',
      },
    ],
  },
  twitter: {
    card: 'summary_large_image',
    title: 'Harimu — The World Continues',
    description:
      'Choose a nation, build a life, and shape a permanent world through work, politics, trade, and diplomacy.',
    images: ['/og.png'],
  },
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="en">
      <body>
        <Providers>{children}</Providers>
      </body>
    </html>
  );
}
