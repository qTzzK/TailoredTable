import Footer from '@/components/Footer';
import Nav from '@/components/Nav';
import ScrollAnimations from '@/components/ScrollAnimations';

export default function SiteLayout({ children }: { children: React.ReactNode }) {
  return (
    <>
      <Nav />
      <ScrollAnimations />
      <div className="page-wrapper">
        {children}
        <Footer />
      </div>
    </>
  );
}
