import type { Metadata } from 'next';
import Link from 'next/link';

export const metadata: Metadata = {
  title: 'Miami Meal Prep, Private Chef & Catering | Tailored Taste',
  description:
    'Weekly meal prep, private chef dinners, and small-event catering—personalized for your lifestyle and serving Miami-Dade & Broward Counties.',
  alternates: { canonical: 'https://www.mytailoredtaste.com/services' },
  robots: { index: true, follow: true, 'max-image-preview': 'large' },
  openGraph: {
    title: 'Miami Meal Prep, Private Chef & Catering | Tailored Taste',
    description: 'Weekly meal prep, private chef dinners, and small-event catering serving Miami-Dade & Broward Counties.',
    url: 'https://www.mytailoredtaste.com/services',
  },
  twitter: {
    title: 'Miami Meal Prep, Private Chef & Catering | Tailored Taste',
    description: 'Weekly meal prep, private chef dinners, and small-event catering serving Miami-Dade & Broward Counties.',
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
      hasOfferCatalog: {
        '@type': 'OfferCatalog',
        name: 'Tailored Taste Services',
        itemListElement: [
          { '@type': 'Offer', itemOffered: { '@type': 'Service', name: 'Weekly Meal Prep', url: 'https://www.mytailoredtaste.com/services#meal-prep', description: 'Customized weekly meals prepared fresh—in-home or delivered—portioned and labeled, with dietary accommodations.' } },
          { '@type': 'Offer', itemOffered: { '@type': 'Service', name: 'Private Chef Experience', url: 'https://www.mytailoredtaste.com/services#private-chef', description: 'Intimate multi-course dinners designed, prepared, and plated in your home for 2–10 guests.' } },
          { '@type': 'Offer', itemOffered: { '@type': 'Service', name: 'Events & Gatherings', url: 'https://www.mytailoredtaste.com/services#events', description: 'Custom-catered dinner parties and celebrations, including setup, service, and cleanup.' } },
        ],
      },
    },
    {
      '@type': 'BreadcrumbList',
      itemListElement: [
        { '@type': 'ListItem', position: 1, name: 'Home', item: 'https://www.mytailoredtaste.com/' },
        { '@type': 'ListItem', position: 2, name: 'Services', item: 'https://www.mytailoredtaste.com/services' },
      ],
    },
  ],
};

export default function ServicesPage() {
  return (
    <>
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd) }} />

      {/* PAGE HERO */}
      <section className="page-hero">
        <span className="script">How We Work Together</span>
        <h1>Services</h1>
        <div className="ornament" style={{ margin: '1.25rem auto' }}><div className="ornament-diamond"></div></div>
        <p>Three ways to bring Tailored Taste into your life—each one crafted around your needs, anywhere in Miami-Dade &amp; Broward.</p>
      </section>

      {/* SERVICE 1: MEAL PREP */}
      <div id="meal-prep" className="service-row">
        <div className="service-content" data-animate>
          <p className="service-number">01</p>
          <h3>Weekly Meal Prep</h3>
          <p>Take the guesswork out of your week. I come to your home, shop for the freshest ingredients, and prepare a full week of meals tailored to your dietary preferences, health goals, and schedule.</p>
          <ul className="service-includes">
            <li>Weekly customized meal plan</li>
            <li>Fresh, quality ingredient sourcing</li>
            <li>In-home preparation or delivery</li>
            <li>Portioned &amp; labeled for the week</li>
            <li>Breakfasts, lunches, dinners &amp; snacks</li>
            <li>Dietary accommodations (GF, dairy-free, etc.)</li>
          </ul>
          <Link href="/contact" className="btn btn-primary">Inquire About Meal Prep</Link>
        </div>
        <div className="service-visual">
          <div className="service-visual-inner" style={{ padding: '3rem' }}>
            <span className="service-visual-number">01</span>
            <span className="service-visual-label">Meal Prep</span>
          </div>
        </div>
      </div>

      {/* SERVICE 2: PRIVATE CHEF */}
      <div id="private-chef" className="service-row">
        <div className="service-content" data-animate>
          <p className="service-number" style={{ color: 'var(--green)' }}>02</p>
          <h3>Private Chef Experience</h3>
          <p>Elevate any evening into something truly memorable. I design an intimate, multi-course menu just for your occasion—curated around your palate and preferences, prepared and plated in your home.</p>
          <ul className="service-includes">
            <li>Custom multi-course menu design</li>
            <li>In-home preparation &amp; tableside service</li>
            <li>Wine pairing suggestions</li>
            <li>Full kitchen cleanup included</li>
            <li>Perfect for date nights, anniversaries &amp; celebrations</li>
            <li>Intimate gatherings (2–10 guests)</li>
          </ul>
          <Link href="/contact" className="btn btn-green">Inquire About Private Chef Experience</Link>
        </div>
        <div className="service-visual">
          <div className="service-visual-inner" style={{ padding: '3rem' }}>
            <span className="service-visual-number">02</span>
            <span className="service-visual-label" style={{ color: 'var(--green)' }}>Private Chef</span>
          </div>
        </div>
      </div>

      {/* SERVICE 3: EVENTS */}
      <div id="events" className="service-row">
        <div className="service-content" data-animate>
          <p className="service-number">03</p>
          <h3>Events &amp; Gatherings</h3>
          <p>Hosting a dinner party, birthday celebration, or intimate gathering? Let Tailored Taste handle the food so you can be fully present with your guests. Elegant, stress-free, and exactly your style.</p>
          <ul className="service-includes">
            <li>Custom menus for your event &amp; guests</li>
            <li>Canapés, passed bites &amp; plated courses</li>
            <li>Setup, service &amp; cleanup</li>
            <li>Dessert &amp; beverage coordination</li>
            <li>Seasonal &amp; themed menus available</li>
          </ul>
          <Link href="/contact" className="btn btn-primary">Inquire About Events</Link>
        </div>
        <div className="service-visual">
          <div className="service-visual-inner" style={{ padding: '3rem' }}>
            <span className="service-visual-number">03</span>
            <span className="service-visual-label">Events</span>
          </div>
        </div>
      </div>

      {/* CTA */}
      <div className="cta-section">
        <span className="cta-script">Not Sure Where to Start?</span>
        <h2>Let&apos;s Find the Right Fit</h2>
        <p>Send me a message with what you have in mind and we&apos;ll figure out what works best for you.</p>
        <Link href="/contact" className="btn btn-outline-green">Get in Touch</Link>
      </div>
    </>
  );
}
