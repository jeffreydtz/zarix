import type { Metadata, Viewport } from 'next';
import { Inter } from 'next/font/google';
import './globals.css';
import ClientProviders from '@/components/ClientProviders';
import { brandAsset } from '@/lib/brand';

const inter = Inter({
  subsets: ['latin'],
  display: 'swap',
  preload: true,
  variable: '--font-inter',
});

export const viewport: Viewport = {
  width: 'device-width',
  initialScale: 1,
  maximumScale: 5,
  viewportFit: 'cover',
  themeColor: [
    { media: '(prefers-color-scheme: light)', color: '#ffffff' },
    { media: '(prefers-color-scheme: dark)', color: '#06070A' },
  ],
};

const appBase =
  process.env.NEXT_PUBLIC_APP_URL?.replace(/\/$/, '') || 'http://localhost:3000';

export const metadata: Metadata = {
  metadataBase: new URL(appBase),
  title: 'Zarix - Finanzas Personales',
  description: 'App financiera personal para Argentina',
  manifest: '/manifest.json',
  appleWebApp: {
    capable: true,
    statusBarStyle: 'default',
    title: 'Zarix',
  },
  icons: {
    icon: [
      { url: brandAsset.faviconIco, type: 'image/x-icon' },
      { url: brandAsset.favicon16, sizes: '16x16', type: 'image/png' },
      { url: brandAsset.favicon32, sizes: '32x32', type: 'image/png' },
      { url: brandAsset.icon192, sizes: '192x192', type: 'image/png' },
      { url: brandAsset.icon512, sizes: '512x512', type: 'image/png' },
    ],
    shortcut: [brandAsset.faviconIco],
    apple: [{ url: brandAsset.appleTouch, sizes: '180x180', type: 'image/png' }],
  },
  openGraph: {
    title: 'Zarix - Finanzas Personales',
    description: 'App financiera personal para Argentina',
    type: 'website',
    locale: 'es_AR',
    images: [
      {
        url: brandAsset.ogImage,
        width: 1200,
        height: 630,
        alt: 'Zarix',
      },
    ],
  },
  twitter: {
    card: 'summary_large_image',
    title: 'Zarix - Finanzas Personales',
    description: 'App financiera personal para Argentina',
    images: [brandAsset.ogImage],
  },
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="es-AR" suppressHydrationWarning className={inter.variable}>
      <body className={`${inter.className} antialiased`}>
        <ClientProviders>{children}</ClientProviders>
      </body>
    </html>
  );
}
