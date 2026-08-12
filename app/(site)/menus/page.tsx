import type { Metadata } from 'next';
import Link from 'next/link';

export const metadata: Metadata = {
  title: 'Sample Menus | Miami Private Chef & Meal Prep | Tailored Taste',
  description:
    'Sample menus from Tailored Taste—private chef dinners, weekly meal prep selections, and event menus crafted in Miami, FL.',
  alternates: { canonical: 'https://www.mytailoredtaste.com/menus' },
  robots: { index: true, follow: true, 'max-image-preview': 'large' },
  openGraph: {
    title: 'Sample Menus | Miami Private Chef & Meal Prep | Tailored Taste',
    description: 'Sample menus from Tailored Taste—private chef dinners, weekly meal prep selections, and event menus crafted in Miami, FL.',
    url: 'https://www.mytailoredtaste.com/menus',
  },
  twitter: {
    title: 'Sample Menus | Miami Private Chef & Meal Prep | Tailored Taste',
    description: 'Sample menus from Tailored Taste—private chef dinners, weekly meal prep selections, and event menus crafted in Miami, FL.',
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
        { '@type': 'ListItem', position: 2, name: 'Sample Menus', item: 'https://www.mytailoredtaste.com/menus' },
      ],
    },
  ],
};

export default function MenusPage() {
  return (
    <>
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd) }} />

      {/* PAGE HERO */}
      <section className="page-hero">
        <span className="script">A Taste of What&apos;s Possible</span>
        <h1>Sample Menus</h1>
        <div className="ornament" style={{ margin: '1.25rem auto' }}><div className="ornament-diamond"></div></div>
        <p>Each menu is one-of-a-kind and built around you. These samples offer a glimpse into the craft and care behind every Tailored Taste experience.</p>
      </section>

      {/* MENUS SECTION */}
      <section className="section menus-section">
        <div className="container">

          {/* HEADING */}
          <div className="section-header" data-animate>
            <span className="section-script">Private Dining</span>
            <h2>Chef&apos;s Menu</h2>
            <div className="ornament"><div className="ornament-diamond"></div></div>
            <p>An intimate, multi-course dinner—designed to feel special without feeling formal.</p>
          </div>

          {/* CHEF'S MENU CARD */}
          <div style={{ maxWidth: '560px', margin: '0 auto 6rem' }} data-animate>
            <div className="menu-card">
              <span className="sample-badge">Sample Menu</span>
              <p className="menu-card-eyebrow">Chef&apos;s Selection</p>
              <h2 className="menu-card-title">An Evening&apos;s Menu</h2>
              <p className="menu-card-subtitle">A sample evening—every menu is crafted for your occasion</p>

              <div className="menu-ornament-line"></div>

              <ul className="menu-list">
                <li>Chef&apos;s Selection Soup</li>
                <li>Market Fresh Salad</li>
                <li>
                  American Wagyu Steak
                  <span className="item-sub">truffle jus, roasted shallots</span>
                </li>
                <li>
                  Butter-Poached Lobster Tail
                  <span className="item-sub">lemon beurre blanc, chive oil</span>
                </li>
                <li>
                  Roasted Garlic Whipped Potatoes
                </li>
                <li>
                  Charred Broccolini
                  <span className="item-sub">lemon &amp; chili</span>
                </li>
                <li>Fresh Made Dessert</li>
                <li>Chef-Selected Wine Bottle</li>
              </ul>
            </div>
          </div>

          {/* HEADING 2 */}
          <div className="section-header" data-animate>
            <span className="section-script green">Weekly Meal Prep</span>
            <h2>Meal Prep Menu</h2>
            <div className="ornament green"><div className="ornament-diamond"></div></div>
            <p>A full week of nourishing, thoughtfully prepared meals—ready when you are.</p>
          </div>

          {/* MEAL PREP MENU CARD */}
          <div style={{ maxWidth: '560px', margin: '0 auto 4rem' }} data-animate>
            <div className="menu-card sage">
              <span className="sample-badge">Sample Menu</span>
              <p className="menu-card-eyebrow">Weekly Selection</p>
              <h2 className="menu-card-title">Weekly Meal Prep</h2>
              <p className="menu-card-subtitle">A sample week · 10 Entrees · Breakfast · Dessert</p>

              <div className="menu-ornament-line"></div>

              <p className="menu-category">Breakfast</p>
              <ul className="menu-list">
                <li>
                  <span className="item-count">3×</span> Chia Pudding
                </li>
                <li>
                  <span className="item-count">3×</span> Protein Overnight Oats
                </li>
              </ul>

              <p className="menu-category">10 Entrees</p>
              <ul className="menu-list">
                <li>
                  <span className="item-count">2×</span> Grass-Fed Beef Loaded Sweet Potato
                  <span className="item-sub">cottage cheese, seasoned beef, roasted peppers</span>
                </li>
                <li>
                  <span className="item-count">2×</span> Pistachio Pesto Chicken Plate
                  <span className="item-sub">blistered tomatoes, roasted broccoli</span>
                </li>
                <li>
                  <span className="item-count">2×</span> Miso Glazed Honey Salmon
                  <span className="item-sub">carrot ribbon salad, spicy cucumber salad</span>
                </li>
                <li>
                  <span className="item-count">2×</span> Pollo Saltado
                  <span className="item-sub">roasted potatoes, onions and peppers</span>
                </li>
                <li>
                  <span className="item-count">2×</span> Pot Roast
                  <span className="item-sub">cauliflower parm puree, garlic green beans</span>
                </li>
              </ul>

              <p className="menu-category">Dessert</p>
              <ul className="menu-list">
                <li>Stuffed Dates</li>
                <li>
                  Pineapple Coconut Sorbet
                  <span className="item-sub">no added sugar</span>
                </li>
              </ul>
            </div>
          </div>

        </div>
      </section>

      {/* NOTE */}
      <section style={{ background: 'var(--off-white)', borderTop: '1px solid var(--border-color)', padding: '5rem 0' }}>
        <div className="container">
          <div style={{ maxWidth: '640px', margin: '0 auto', textAlign: 'center' }} data-animate>
            <span className="section-script">Remember</span>
            <h2 style={{ fontFamily: "'Playfair Display',serif", fontSize: '2rem', fontWeight: 700, color: 'var(--charcoal)', marginBottom: '1rem' }}>Every Menu Is Unique to You</h2>
            <p style={{ fontFamily: "'Cormorant Garamond',serif", fontStyle: 'italic', fontSize: '1.2rem', color: 'var(--warm-gray)', lineHeight: 1.8, marginBottom: '2.5rem' }}>These are samples of past menus—your experience will be built from scratch around your preferences, dietary needs, and what feels right for the moment.</p>
            <Link href="/contact" className="btn btn-primary">Inquire &amp; Get Your Menu</Link>
          </div>
        </div>
      </section>

      {/* CTA */}
      <div className="cta-section">
        <span className="cta-script">Let&apos;s Create Yours</span>
        <h2>Your Menu Awaits</h2>
        <p>Tell me about your preferences and I&apos;ll craft something truly tailored.</p>
        <Link href="/contact" className="btn btn-outline-green">Start the Conversation</Link>
      </div>
    </>
  );
}
