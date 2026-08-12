'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useEffect, useState } from 'react';

const links = [
  { href: '/', label: 'Home' },
  { href: '/services', label: 'Services' },
  { href: '/menus', label: 'Menus' },
];

export default function Nav() {
  const pathname = usePathname();
  const [menuOpen, setMenuOpen] = useState(false);

  useEffect(() => {
    document.body.style.overflow = menuOpen ? 'hidden' : '';
    return () => {
      document.body.style.overflow = '';
    };
  }, [menuOpen]);

  // Close the overlay on navigation.
  useEffect(() => {
    setMenuOpen(false);
  }, [pathname]);

  return (
    <>
      <nav>
        <Link className="nav-brand" href="/">
          <span className="nav-brand-name">Tailored Taste</span>
          <span className="nav-brand-tag">Flavors True to You</span>
        </Link>
        <ul className="nav-links">
          {links.map(({ href, label }) => (
            <li key={href}>
              <Link href={href} className={pathname === href ? 'active' : undefined}>
                {label}
              </Link>
            </li>
          ))}
        </ul>
        <Link href="/contact" className={pathname === '/contact' ? 'nav-inquire active' : 'nav-inquire'}>
          Inquire
        </Link>
        <button className="hamburger" aria-label="Open menu" onClick={() => setMenuOpen(true)}>
          <span></span>
          <span></span>
          <span></span>
        </button>
      </nav>

      <div className={menuOpen ? 'mobile-overlay active' : 'mobile-overlay'}>
        <button className="mobile-close" aria-label="Close menu" onClick={() => setMenuOpen(false)}>
          ×
        </button>
        <Link href="/" onClick={() => setMenuOpen(false)}>Home</Link>
        <Link href="/services" onClick={() => setMenuOpen(false)}>Services</Link>
        <Link href="/menus" onClick={() => setMenuOpen(false)}>Menus</Link>
        <Link href="/contact" onClick={() => setMenuOpen(false)}>Inquire</Link>
      </div>
    </>
  );
}
