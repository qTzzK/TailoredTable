import type { Metadata } from 'next';
import Link from 'next/link';

export const metadata: Metadata = {
  title: 'About the Chef | Private Chef in Miami, FL | Tailored Taste',
  description:
    'The story behind Tailored Taste—a Miami private chef and meal prep service born from a love of cooking for others, serving Miami-Dade & Broward.',
  alternates: { canonical: 'https://www.mytailoredtaste.com/about' },
  robots: { index: false, follow: false },
  openGraph: {
    title: 'About the Chef | Private Chef in Miami, FL | Tailored Taste',
    description: 'The story behind Tailored Taste—a Miami private chef and meal prep service serving Miami-Dade & Broward Counties.',
    url: 'https://www.mytailoredtaste.com/about',
  },
  twitter: {
    title: 'About the Chef | Private Chef in Miami, FL | Tailored Taste',
    description: 'The story behind Tailored Taste—a Miami private chef and meal prep service serving Miami-Dade & Broward Counties.',
  },
};

const jsonLd = {
  '@context': 'https://schema.org',
  '@graph': [
    {
      '@type': 'Caterer',
      '@id': 'https://www.mytailoredtaste.com/#business',
      name: 'Tailored Taste',
      url: 'https://www.mytailoredtaste.com/',
      address: { '@type': 'PostalAddress', addressLocality: 'Miami', addressRegion: 'FL', addressCountry: 'US' },
      areaServed: [
        { '@type': 'AdministrativeArea', name: 'Miami-Dade County' },
        { '@type': 'AdministrativeArea', name: 'Broward County' },
      ],
      sameAs: ['https://www.instagram.com/miaprivatechef'],
    },
    {
      '@type': 'BreadcrumbList',
      itemListElement: [
        { '@type': 'ListItem', position: 1, name: 'Home', item: 'https://www.mytailoredtaste.com/' },
        { '@type': 'ListItem', position: 2, name: 'About', item: 'https://www.mytailoredtaste.com/about' },
      ],
    },
  ],
};

export default function AboutPage() {
  return (
    <>
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd) }} />

      {/* PAGE HERO */}
      <section className="page-hero">
        <span className="script">The Story</span>
        <h1>About</h1>
        <div className="ornament" style={{ margin: '1.25rem auto' }}><div className="ornament-diamond"></div></div>
        <p>A love of cooking for others—and a belief that food should bring both joy and ease.</p>
      </section>

      {/* ABOUT CONTENT */}
      <section className="section" style={{ background: 'var(--cream)' }}>
        <div className="container">
          <div className="about-grid">
            <div className="about-image-wrapper" data-animate>
              <div className="about-image-placeholder">
                <span>✦</span>
                <p>Add your photo here</p>
              </div>
            </div>
            <div className="about-text" data-animate>
              <h2>Chef &amp; Creator</h2>
              <span className="script-accent">Behind the Taste</span>
              <p>Tailored Taste was born from a love of cooking for others and creating meals that bring people together.</p>
              <p>I&apos;ve always believed that food should feel both exciting and comforting—something you actually look forward to, not just something you check off your list.</p>
              <p>Through personalized meal prep and private chef experiences, I focus on creating flavorful, fresh meals that fit seamlessly into your lifestyle. No stress, no overthinking—just really good food made for you.</p>
              <p>Whether you&apos;re looking for weekly meals or a special dinner at home—anywhere across Miami-Dade or Broward—everything is designed with intention, care, and your preferences in mind.</p>
              <div style={{ marginTop: '2.5rem' }}>
                <Link href="/contact" className="btn btn-primary">Let&apos;s Work Together</Link>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* VALUES */}
      <section className="section" style={{ background: 'var(--off-white)', borderTop: '1px solid var(--border-color)' }}>
        <div className="container">
          <div className="section-header" data-animate>
            <span className="section-script green">What Drives the Work</span>
            <h2>The Values Behind Every Meal</h2>
            <div className="ornament green"><div className="ornament-diamond"></div></div>
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3,1fr)', gap: '2rem' }} className="values-grid">
            <div className="service-card" data-animate>
              <div className="service-icon">✦</div>
              <h3>Intentional</h3>
              <p>Every menu is built around you—your goals, your tastes, your schedule. Nothing is accidental or generic.</p>
            </div>
            <div className="service-card" data-animate>
              <div className="service-icon">✦</div>
              <h3>Elevated</h3>
              <p>Restaurant-quality technique and ingredients brought directly into your home, without the formality.</p>
            </div>
            <div className="service-card" data-animate>
              <div className="service-icon">✦</div>
              <h3>Effortless</h3>
              <p>The goal is for you to open your fridge and feel taken care of—not overwhelmed. Good food, simplified.</p>
            </div>
          </div>
        </div>
      </section>

      {/* CTA */}
      <div className="cta-section">
        <span className="cta-script">Work Together</span>
        <h2>Ready to Get Started?</h2>
        <p>Reach out and let&apos;s create something delicious, together.</p>
        <Link href="/contact" className="btn btn-outline-green">Send an Inquiry</Link>
      </div>
    </>
  );
}
