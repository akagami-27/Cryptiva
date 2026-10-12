import { Link } from 'react-router-dom';
import { useLayoutEffect, useRef } from 'react';
import { gsap } from 'gsap';

export default function Landing() {
  const heroRef = useRef(null);
  useLayoutEffect(() => {
    if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) return;
    const ctx = gsap.context(() => {
      gsap.from('.landing-reveal', { y: 22, autoAlpha: 0, duration: 0.65, stagger: 0.1, ease: 'power2.out' });
    }, heroRef);
    return () => ctx.revert();
  }, []);

  return (
    <main className="landing-page" ref={heroRef}>
      <nav className="landing-nav">
        <a className="brand" href="/react"><span className="brand-mark">C</span><span>cryptiva</span></a>
        <div><Link className="nav-link" to="/react/login">Sign in</Link><Link className="primary-button nav-cta" to="/react/register">Get started</Link></div>
      </nav>
      <section className="landing-hero">
        <p className="eyebrow landing-reveal">PRIVACY BY DESIGN</p>
        <h1 className="landing-reveal">Your files.<br /><span>Under your control.</span></h1>
        <p className="landing-description landing-reveal">Share sensitive files with confidence using encrypted storage, controlled access, and secure sharing links.</p>
        <div className="landing-actions landing-reveal"><Link className="primary-button" to="/react/register">Create your account <span aria-hidden="true">→</span></Link><Link className="secondary-button" to="/react/login">I already have an account</Link></div>
        <div className="trust-row landing-reveal"><span><i /> Encrypted file storage</span><span><i /> Access controls</span><span><i /> Integrity verification</span></div>
      </section>
      <div className="landing-glow landing-glow--one" aria-hidden="true" /><div className="landing-glow landing-glow--two" aria-hidden="true" />
    </main>
  );
}
