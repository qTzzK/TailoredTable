'use client';

import { usePathname } from 'next/navigation';
import { useEffect } from 'react';

// Ports the [data-animate] reveal from the original js/main.js. Re-runs on
// every client-side navigation so newly rendered sections animate in.
export default function ScrollAnimations() {
  const pathname = usePathname();

  useEffect(() => {
    const observer = new IntersectionObserver(
      entries => {
        entries.forEach(entry => {
          if (entry.isIntersecting) {
            entry.target.classList.add('visible');
            observer.unobserve(entry.target);
          }
        });
      },
      { threshold: 0.1 }
    );

    document.querySelectorAll('[data-animate]').forEach(el => observer.observe(el));
    return () => observer.disconnect();
  }, [pathname]);

  return null;
}
