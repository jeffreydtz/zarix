import type { Metadata } from 'next';
import { redirect } from 'next/navigation';
import Navbar from '@/components/landing/Navbar';
import BackgroundSpline from '@/components/landing/BackgroundSpline';
import HeroSection from '@/components/landing/HeroSection';
import TrustBar from '@/components/landing/TrustBar';
import ProblemSection from '@/components/landing/ProblemSection';
import FeaturesSection from '@/components/landing/FeaturesSection';
import HowItWorks from '@/components/landing/HowItWorks';
import PricingSection from '@/components/landing/PricingSection';
import FinalCTA from '@/components/landing/FinalCTA';
import Footer from '@/components/landing/Footer';
import { createClient } from '@/lib/supabase/server';
import { brandAsset } from '@/lib/brand';

const appBase =
  process.env.NEXT_PUBLIC_APP_URL?.replace(/\/$/, '') || 'http://localhost:3000';

export const metadata: Metadata = {
  metadataBase: new URL(appBase),
  title: 'Zarix | Tu patrimonio real en tiempo real',
  description:
    'Zarix es la app de finanzas personales para Argentina que unifica pesos, dolar blue, MEP, CCL y tus inversiones en un panel real.',
  openGraph: {
    title: 'Zarix | Tu patrimonio real en tiempo real',
    description:
      'Ordena tus finanzas en ARS y USD con cotizaciones nativas para Argentina, presupuestos y seguimiento patrimonial.',
    type: 'website',
    locale: 'es_AR',
    images: [
      {
        url: brandAsset.ogImage,
        width: 1200,
        height: 630,
        alt: 'Zarix - Finanzas Personales',
      },
    ],
  },
  twitter: {
    card: 'summary_large_image',
    title: 'Zarix | Tu patrimonio real en tiempo real',
    description:
      'La app de finanzas para Argentina con dashboard multi-moneda, cotizaciones y control real de tu patrimonio.',
    images: [brandAsset.ogImage],
  },
};

export default async function Home() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (user) {
    redirect('/dashboard');
  }

  return (
    <main className="relative min-h-screen bg-[rgb(var(--background))] text-[#F8F9FA] dark">
      <BackgroundSpline />
      <div className="relative z-20">
        <Navbar />
        <HeroSection />
        <TrustBar />
        <ProblemSection />
        <FeaturesSection />
        <HowItWorks />
        <PricingSection />
        <FinalCTA />
        <Footer />
      </div>
    </main>
  );
}
