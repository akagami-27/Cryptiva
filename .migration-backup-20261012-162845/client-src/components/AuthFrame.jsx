import { useLayoutEffect, useRef } from 'react';
import { gsap } from 'gsap';

export default function AuthFrame({ children }) {
  const cardRef = useRef(null);

  useLayoutEffect(() => {
    const reduceMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    if (reduceMotion || !cardRef.current) return;

    const ctx = gsap.context(() => {
      gsap.fromTo(cardRef.current,
        { autoAlpha: 0, y: 18, scale: 0.985 },
        { autoAlpha: 1, y: 0, scale: 1, duration: 0.55, ease: 'power2.out' }
      );
      gsap.to('.auth-orb--purple', {
        x: 24, y: 18, duration: 8, ease: 'sine.inOut', yoyo: true, repeat: -1
      });
      gsap.to('.auth-orb--cyan', {
        x: -20, y: -16, duration: 10, ease: 'sine.inOut', yoyo: true, repeat: -1
      });
    });

    return () => ctx.revert();
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
