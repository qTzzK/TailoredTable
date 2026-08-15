import Link from 'next/link';

export default function Footer() {
  return (
    <footer>
      <div className="footer-brand">Tailored Taste</div>
      <div className="footer-tagline">Flavors True to You</div>
      <ul className="footer-nav">
        <li><Link href="/services">Services</Link></li>
        <li><Link href="/menus">Menus</Link></li>
        <li><Link href="/contact">Inquire</Link></li>
        <li><Link href="/terms">Terms</Link></li>
      </ul>
      <div className="footer-divider"></div>
      <a
        href="https://www.instagram.com/miaprivatechef"
        target="_blank"
        rel="noopener"
        className="footer-instagram"
      >
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
          <rect x="2" y="2" width="20" height="20" rx="5" ry="5" />
          <circle cx="12" cy="12" r="4" />
          <circle cx="17.5" cy="6.5" r="0.5" fill="currentColor" stroke="none" />
        </svg>
        Instagram
      </a>
      <p className="footer-copy">© 2026 Tailored Taste · Miami, FL — Serving Miami-Dade &amp; Broward Counties. All rights reserved.</p>
    </footer>
  );
}
