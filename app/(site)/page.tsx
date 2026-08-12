import type { Metadata } from 'next';
import Link from 'next/link';

export const metadata: Metadata = {
  title: 'Private Chef & Meal Prep in Miami, FL | Tailored Taste',
  description:
    'Personalized weekly meal prep, private chef dinners, and small-event catering across Miami-Dade & Broward. Restaurant-quality meals, made for you.',
  alternates: { canonical: 'https://www.mytailoredtaste.com/' },
  robots: { index: true, follow: true, 'max-image-preview': 'large' },
  openGraph: {
    title: 'Private Chef & Meal Prep in Miami, FL | Tailored Taste',
    description:
      'Personalized weekly meal prep, private chef dinners, and small-event catering across Miami-Dade & Broward Counties.',
    url: 'https://www.mytailoredtaste.com/',
  },
  twitter: {
    title: 'Private Chef & Meal Prep in Miami, FL | Tailored Taste',
    description:
      'Personalized weekly meal prep, private chef dinners, and small-event catering across Miami-Dade & Broward Counties.',
  },
};

const jsonLd = {
  '@context': 'https://schema.org',
  '@graph': [
    {
      '@type': 'Caterer',
      '@id': 'https://www.mytailoredtaste.com/#business',
      name: 'Tailored Taste',
      slogan: 'Flavors True to You',
      description:
        'Personalized weekly meal prep, private chef experiences, and small-event catering serving Miami-Dade and Broward Counties, Florida.',
      url: 'https://www.mytailoredtaste.com/',
      priceRange: '$$-$$$',
      address: { '@type': 'PostalAddress', addressLocality: 'Miami', addressRegion: 'FL', addressCountry: 'US' },
      geo: { '@type': 'GeoCoordinates', latitude: 25.7617, longitude: -80.1918 },
      areaServed: [
        { '@type': 'AdministrativeArea', name: 'Miami-Dade County' },
        { '@type': 'AdministrativeArea', name: 'Broward County' },
        { '@type': 'City', name: 'Miami' },
        { '@type': 'City', name: 'Miami Beach' },
        { '@type': 'City', name: 'Coral Gables' },
        { '@type': 'City', name: 'Fort Lauderdale' },
        { '@type': 'City', name: 'Hollywood' },
      ],
      sameAs: ['https://www.instagram.com/miaprivatechef'],
      hasOfferCatalog: {
        '@type': 'OfferCatalog',
        name: 'Tailored Taste Services',
        itemListElement: [
          { '@type': 'Offer', itemOffered: { '@type': 'Service', name: 'Weekly Meal Prep', description: 'Customized weekly meals prepared fresh—in-home or delivered—portioned and labeled, with dietary accommodations.' } },
          { '@type': 'Offer', itemOffered: { '@type': 'Service', name: 'Private Chef Experience', description: 'Intimate multi-course dinners designed, prepared, and plated in your home for 2–10 guests.' } },
          { '@type': 'Offer', itemOffered: { '@type': 'Service', name: 'Events & Gatherings', description: 'Custom-catered dinner parties and celebrations, including setup, service, and cleanup.' } },
        ],
      },
    },
    {
      '@type': 'WebSite',
      '@id': 'https://www.mytailoredtaste.com/#website',
      name: 'Tailored Taste',
      url: 'https://www.mytailoredtaste.com/',
      publisher: { '@id': 'https://www.mytailoredtaste.com/#business' },
    },
  ],
};

const learnMoreBtn = { fontSize: '0.85rem', padding: '0.65rem 1.75rem' } as const;

export default function HomePage() {
  return (
    <>
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd) }} />

      {/* HERO */}
      <section className="hero">
        <div className="hero-inner">
          <span className="hero-script">Welcome to</span>
          <h1>Tailored<br />Taste</h1>
          <p className="hero-tagline">Flavors True to You</p>
          <div className="hero-divider"></div>
          <p className="hero-subtitle">Personalized Meal Prep &amp; Private Chef Experiences</p>
          <p className="hero-detail">Bringing restaurant-quality meals to homes across Miami-Dade &amp; Broward</p>
          <div className="btn-group">
            <Link href="/services" className="btn btn-primary">View Services</Link>
            <Link href="/contact" className="btn btn-outline">Inquire</Link>
          </div>
        </div>
      </section>

      {/* SERVICES PREVIEW */}
      <section className="section" style={{ background: 'var(--cream)' }}>
        <div className="container">
          <div className="section-header" data-animate>
            <span className="section-script">What I Offer</span>
            <h2>Every Meal, Made for You</h2>
            <div className="ornament"><div className="ornament-diamond"></div></div>
            <p>From weekly meal prep to intimate multi-course dinners—each experience is thoughtfully crafted around your lifestyle and preferences, right here in Miami.</p>
          </div>
          <div className="services-grid">
            <div className="service-card" data-animate>
              <div className="service-icon">✦</div>
              <h3>Weekly Meal Prep</h3>
              <p>Customized meals prepared fresh each week—delivered or cooked directly in your home kitchen. No stress, just really good food.</p>
              <Link href="/services" className="btn btn-outline" style={learnMoreBtn}>Learn More</Link>
            </div>
            <div className="service-card" data-animate>
              <div className="service-icon">✦</div>
              <h3>Private Chef</h3>
              <p>Intimate, multi-course dining experiences in the comfort of your own home. Special occasions made unforgettable.</p>
              <Link href="/services" className="btn btn-outline" style={learnMoreBtn}>Learn More</Link>
            </div>
            <div className="service-card" data-animate>
              <div className="service-icon">✦</div>
              <h3>Events</h3>
              <p>Dinner parties, gatherings, and celebrations—beautifully catered and curated so you can enjoy every moment as a guest.</p>
              <Link href="/services" className="btn btn-outline" style={learnMoreBtn}>Learn More</Link>
            </div>
          </div>
        </div>
      </section>

      {/* QUOTE */}
      <div className="quote-section">
        <span className="quote-mark">&quot;</span>
        <p className="quote-text">Food should feel both exciting and comforting—something you actually look forward to, not just something you check off your list.</p>
        <p className="quote-attr">— Tailored Taste</p>
      </div>

      {/* ABOUT PREVIEW */}
      <section className="section" style={{ background: 'var(--off-white)' }}>
        <div className="container">
          <div
            style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '5rem', alignItems: 'center' }}
            className="about-preview-grid"
          >
            <div data-animate>
              <span className="section-script">The Story</span>
              <h2 style={{ fontFamily: "'Playfair Display',serif", fontSize: 'clamp(2rem,3.5vw,2.75rem)', fontWeight: 700, color: 'var(--charcoal)', marginBottom: '1.5rem', lineHeight: 1.2 }}>Born from a Love of Cooking for Others</h2>
              <p style={{ fontFamily: "'Cormorant Garamond',serif", fontSize: '1.2rem', color: 'var(--charcoal)', lineHeight: 1.85, marginBottom: '1.25rem' }}>Through personalized meal prep and private chef experiences, I focus on creating flavorful, fresh meals that fit seamlessly into your lifestyle.</p>
              <p style={{ fontFamily: "'Cormorant Garamond',serif", fontStyle: 'italic', fontSize: '1.15rem', color: 'var(--warm-gray)', lineHeight: 1.8, marginBottom: '2rem' }}>Everything is designed with intention, care, and your preferences in mind.</p>
            </div>
            <div data-animate style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '1rem' }}>
              <div style={{ background: 'var(--burgundy-light)', border: '1px solid var(--border-color)', aspectRatio: '3/4', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                <span style={{ fontFamily: "'Dancing Script',cursive", fontSize: '1.25rem', color: 'rgba(122,21,48,0.3)' }}>Tailored</span>
              </div>
              <div style={{ background: 'var(--green-light)', border: '1px solid var(--border-green)', aspectRatio: '3/4', marginTop: '2rem', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                <span style={{ fontFamily: "'Dancing Script',cursive", fontSize: '1.25rem', color: 'rgba(45,78,26,0.3)' }}>Taste</span>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* MENUS TEASER */}
      <section className="section" style={{ background: 'var(--cream)' }}>
        <div className="container">
          <div className="section-header" data-animate>
            <span className="section-script green">Explore</span>
            <h2>Sample Menus</h2>
            <div className="ornament green"><div className="ornament-diamond"></div></div>
            <p>Take a look at some of the curated menus Tailored Taste has crafted—from intimate chef&apos;s dinners to weekly meal prep selections.</p>
          </div>
          <div style={{ textAlign: 'center' }} data-animate>
            <Link href="/menus" className="btn btn-green">View Sample Menus</Link>
          </div>
        </div>
      </section>

      {/* CTA */}
      <div className="cta-section">
        <span className="cta-script">Let&apos;s Begin</span>
        <h2>Ready to Experience It?</h2>
        <p>Let&apos;s talk about how Tailored Taste can bring something special to your table.</p>
        <Link href="/contact" className="btn btn-outline-green">Start the Conversation</Link>
      </div>
    </>
  );
}
