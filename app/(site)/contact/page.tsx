import type { Metadata } from 'next';
import ContactForm from '@/components/ContactForm';

export const metadata: Metadata = {
  title: 'Inquire | Miami Private Chef & Meal Prep | Tailored Taste',
  description:
    'Book Tailored Taste for meal prep, private chef dinners, or event catering in Miami-Dade & Broward. Inquire today—responses within 24–48 hours.',
  alternates: { canonical: 'https://www.mytailoredtaste.com/contact' },
  robots: { index: true, follow: true, 'max-image-preview': 'large' },
  openGraph: {
    title: 'Inquire | Miami Private Chef & Meal Prep | Tailored Taste',
    description: 'Book Tailored Taste for meal prep, private chef dinners, or event catering in Miami-Dade & Broward Counties.',
    url: 'https://www.mytailoredtaste.com/contact',
  },
  twitter: {
    title: 'Inquire | Miami Private Chef & Meal Prep | Tailored Taste',
    description: 'Book Tailored Taste for meal prep, private chef dinners, or event catering in Miami-Dade & Broward Counties.',
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
        { '@type': 'ListItem', position: 2, name: 'Inquire', item: 'https://www.mytailoredtaste.com/contact' },
      ],
    },
  ],
};

export default function ContactPage() {
  return (
    <>
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd) }} />

      {/* PAGE HERO */}
      <section className="page-hero">
        <span className="script">Let&apos;s Connect</span>
        <h1>Inquire</h1>
        <div className="ornament" style={{ margin: '1.25rem auto' }}><div className="ornament-diamond"></div></div>
        <p>Tell me a little about what you&apos;re looking for and I&apos;ll be in touch within 24–48 hours.</p>
      </section>

      {/* CONTACT SECTION */}
      <section className="section" style={{ background: 'var(--cream)' }}>
        <div className="container">
          <div className="contact-grid">

            {/* SIDEBAR */}
            <div className="contact-info-sticky" data-animate>
              <div className="contact-info">
                <h3>Get in Touch</h3>
                <p>Whether you&apos;re looking for weekly meal prep, a special dinner, or have a gathering in mind—I&apos;d love to hear from you.</p>
                <div className="contact-divider"></div>

                <div className="contact-detail">
                  <p className="contact-detail-label">Response Time</p>
                  <p className="contact-detail-value">Within 24–48 hours</p>
                </div>
                <div className="contact-detail">
                  <p className="contact-detail-label">Service Area</p>
                  <p className="contact-detail-value">Miami-Dade &amp; Broward Counties, FL</p>
                </div>
                <div className="contact-detail">
                  <p className="contact-detail-label">Availability</p>
                  <p className="contact-detail-value">Booking select dates—inquire early</p>
                </div>

                <a
                  href="https://www.instagram.com/miaprivatechef"
                  target="_blank"
                  rel="noopener"
                  className="contact-social"
                >
                  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
                    <rect x="2" y="2" width="20" height="20" rx="5" ry="5" />
                    <circle cx="12" cy="12" r="4" />
                    <circle cx="17.5" cy="6.5" r="0.5" fill="currentColor" stroke="none" />
                  </svg>
                  Follow on Instagram
                </a>
              </div>
            </div>

            {/* FORM */}
            <div data-animate>
              <div className="contact-form-wrapper">
                <h2 className="form-title">Send an Inquiry</h2>
                <p className="form-subtitle">All fields help me prepare the best response for you.</p>
                <ContactForm />
              </div>
            </div>

          </div>
        </div>
      </section>
    </>
  );
}
