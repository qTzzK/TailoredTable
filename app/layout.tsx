import type { Metadata, Viewport } from 'next';
import './styles.css';
import './admin-invoice.css';

const SITE_URL = process.env.SITE_URL || 'https://www.mytailoredtaste.com';

export const metadata: Metadata = {
  metadataBase: new URL(SITE_URL),
  title: 'Private Chef & Meal Prep in Miami, FL | Tailored Taste',
  description:
    'Personalized weekly meal prep, private chef dinners, and small-event catering across Miami-Dade & Broward. Restaurant-quality meals, made for you.',
  icons: { icon: [{ url: '/favicon.svg', type: 'image/svg+xml' }] },
  openGraph: {
    type: 'website',
    siteName: 'Tailored Taste',
    locale: 'en_US',
  },
  twitter: { card: 'summary' },
  other: {
    'geo.region': 'US-FL',
    'geo.placename': 'Miami',
    ICBM: '25.7617, -80.1918',
  },
};

export const viewport: Viewport = {
  themeColor: '#7a1530',
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
