import { useLayoutEffect, useRef } from 'react';
import { gsap } from 'gsap';
import '../styles/auth.css';

export default function AuthFrame({ children }) {
  const cardRef = useRef(null);

  useLayoutEffect(() => {
    if (!cardRef.current) return;

    const motion = gsap.matchMedia();
    motion.add('(prefers-reduced-motion: no-preference)', () => {
      const ctx = gsap.context(() => {
        const entrance = gsap.timeline();
        entrance.fromTo(cardRef.current,
          { autoAlpha: 0, y: 18, scale: 0.985 },
          { autoAlpha: 1, y: 0, scale: 1, duration: 0.48, ease: 'power2.out' }
        );
        entrance.fromTo('.auth-form > :not([type="hidden"])',
          { autoAlpha: 0, y: 8 },
          { autoAlpha: 1, y: 0, duration: 0.25, stagger: 0.045, ease: 'power1.out' },
          '-=0.2'
        );
        gsap.to('.auth-orb--purple', {
          x: 24, y: 18, duration: 8, ease: 'sine.inOut', yoyo: true, repeat: -1
        });
        gsap.to('.auth-orb--cyan', {
          x: -20, y: -16, duration: 10, ease: 'sine.inOut', yoyo: true, repeat: -1
        });
      });

      return () => ctx.revert();
    });

    return () => motion.revert();
  }, []);

  return (
    <main className="auth-page">
      <div className="auth-background" aria-hidden="true">
        <div className="auth-grid" />
        <div className="auth-orb auth-orb--purple" />
        <div className="auth-orb auth-orb--cyan" />
      </div>
      <section className="auth-card" ref={cardRef}>
        {children}
      </section>
    </main>
  );
}
