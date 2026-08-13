import type { Metadata } from 'next';
import Link from 'next/link';
import { TERMS_VERSION, genericTerms, longDate } from '@/lib/terms';

export const metadata: Metadata = {
  title: 'Service Terms | Tailored Taste',
  description:
    'The service terms for Tailored Taste private chef and meal prep bookings in Miami — deposits, final payment, groceries at cost, and cancellations.',
  alternates: { canonical: 'https://www.mytailoredtaste.com/terms' },
  robots: { index: true, follow: true },
  openGraph: {
    title: 'Service Terms | Tailored Taste',
    description: 'Deposits, final payment, groceries at cost, and cancellations — the terms behind every Tailored Taste booking.',
    url: 'https://www.mytailoredtaste.com/terms',
  },
};

export default function TermsPage() {
  const terms = genericTerms();

  return (
    <>
      <section className="page-hero">
        <span className="script">Everything Up Front</span>
        <h1>Service Terms</h1>
        <div className="ornament" style={{ margin: '1.25rem auto' }}>
          <div className="ornament-diamond"></div>
        </div>
        <p>No fine print games — here is exactly how bookings, payments, and cancellations work.</p>
      </section>

      <section className="section" style={{ background: 'var(--cream)' }}>
        <div className="container">
          <div className="terms-page" data-animate>
            <p className="terms-intro">{terms.intro}</p>
            <dl className="terms-list">
              {terms.clauses.map(clause => (
                <div className="terms-clause" key={clause.id}>
                  <dt>{clause.title}</dt>
                  <dd>{clause.body}</dd>
                </div>
              ))}
            </dl>
            <p className="terms-closing">{terms.closing}</p>
            <p className="terms-meta">
              Version {TERMS_VERSION} · Last updated {longDate(TERMS_VERSION)}
            </p>
          </div>
        </div>
      </section>

      <div className="cta-section">
        <span className="cta-script">Still Have Questions?</span>
        <h2>Just Ask</h2>
        <p>I would much rather talk it through than have you wondering.</p>
        <Link href="/contact" className="btn btn-outline-green">
          Ask Me Anything
        </Link>
      </div>
    </>
  );
}
