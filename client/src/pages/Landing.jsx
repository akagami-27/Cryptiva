import { Link } from "react-router-dom";
import { useLayoutEffect, useRef } from "react";
import { gsap } from "gsap";
import { ScrollTrigger } from "gsap/ScrollTrigger";
import "../styles/landing.css";

gsap.registerPlugin(ScrollTrigger);

function CryptivaMark({ variant = "default" }) {
  return <img className={`cv-mark cv-mark--${variant}`} src="/images/cryptiva-logo.png" alt="" aria-hidden="true" />;
}

function WorkspacePreview() {
  return (
    <div className="cv-product-scene" aria-label="Illustrative Cryptiva workspace preview">
      <div className="cv-product-aura cv-product-aura--one" />
      <div className="cv-product-aura cv-product-aura--two" />
      <div className="cv-product-orbit cv-product-orbit--one" />
      <div className="cv-product-orbit cv-product-orbit--two" />

      <div className="cv-floating-note cv-floating-note--access">
        <span className="cv-note-symbol">↗</span>
        <span><b>Sharing controls</b><small>Access, expiry, limits</small></span>
      </div>

      <div className="cv-product-window">
        <div className="cv-window-top">
          <div className="cv-window-controls"><i /><i /><i /></div>
          <div className="cv-window-location"><span /> workspace / files</div>
          <span className="cv-window-menu">•••</span>
        </div>
        <div className="cv-window-body">
          <aside className="cv-window-sidebar">
            <div className="cv-window-brand"><CryptivaMark /><span>cryptiva</span></div>
            <div className="cv-window-label">YOUR SPACE</div>
            <div className="cv-window-nav cv-window-nav--active"><span>◫</span> Overview</div>
            <div className="cv-window-nav"><span>▤</span> Files</div>
            <div className="cv-window-nav"><span>↗</span> Shared links</div>
            <div className="cv-window-nav"><span>◷</span> Activity</div>
            <div className="cv-window-user"><span className="cv-user-avatar">H</span><span><b>My workspace</b><small>Personal account</small></span></div>
          </aside>

          <div className="cv-window-main">
            <div className="cv-window-heading">
              <div><span className="cv-window-kicker">PRIVATE WORKSPACE</span><h3>Your files, in focus.</h3><p>A clearer view of what matters.</p></div>
              <span className="cv-upload-action">＋ Upload</span>
            </div>
            <div className="cv-window-summary">
              <div className="cv-summary-item"><span className="cv-summary-icon cv-summary-icon--violet">▤</span><span className="cv-summary-label">Files</span><b>My workspace</b><small>Organised in one place</small></div>
              <div className="cv-summary-item"><span className="cv-summary-icon cv-summary-icon--blue">↗</span><span className="cv-summary-label">Sharing</span><b>Access controls</b><small>Set your sharing rules</small></div>
              <div className="cv-summary-item"><span className="cv-summary-icon cv-summary-icon--mint">#</span><span className="cv-summary-label">Integrity</span><b>Hash details</b><small>Review verification</small></div>
            </div>
            <div className="cv-window-files-title"><b>Recent files</b><span>View files ↗</span></div>
            <div className="cv-window-file"><span className="cv-file-type cv-file-type--pdf">PDF</span><span className="cv-file-name"><b>Project-proposal.pdf</b><small>Updated recently</small></span><span className="cv-file-access"><i /> Protected</span><span className="cv-file-menu">···</span></div>
            <div className="cv-window-file"><span className="cv-file-type cv-file-type--doc">DOC</span><span className="cv-file-name"><b>Research-notes.docx</b><small>Updated yesterday</small></span><span className="cv-file-access"><i /> Protected</span><span className="cv-file-menu">···</span></div>
            <div className="cv-window-file"><span className="cv-file-type cv-file-type--zip">ZIP</span><span className="cv-file-name"><b>Design-assets.zip</b><small>Updated 3 days ago</small></span><span className="cv-file-access"><i /> Protected</span><span className="cv-file-menu">···</span></div>
            <div className="cv-window-disclaimer">Illustrative workspace preview</div>
          </div>
        </div>
      </div>

      <div className="cv-floating-note cv-floating-note--integrity">
        <span className="cv-hash-mark">#</span>
        <span><b>SHA-256</b><small>Integrity details</small></span>
        <span className="cv-note-tag">REVIEW</span>
      </div>
      <div className="cv-scene-caption"><span>01</span><i /> A MORE CONSIDERED WORKSPACE</div>
    </div>
  );
}

const featureItems = [
  {
    number: "01",
    eyebrow: "FILE MANAGEMENT",
    title: <>A calmer place<br />for sensitive work.</>,
    description: "Bring important documents into one focused workspace, with the details you need close at hand.",
    kind: "workspace",
  },
  {
    number: "02",
    eyebrow: "CONTROLLED SHARING",
    title: <>Share the file.<br />Keep the boundaries.</>,
    description: "Make sharing more deliberate with available access settings, expiry options, and download limits.",
    kind: "sharing",
  },
  {
    number: "03",
    eyebrow: "FILE INTEGRITY",
    title: <>Trust the process.<br />Check the details.</>,
    description: "Review hash information and integrity-verification results to understand the state of a file.",
    kind: "integrity",
  },
];

function FeatureArtwork({ kind }) {
  if (kind === "workspace") {
    return (
      <div className="cv-feature-art cv-feature-art--workspace">
        <div className="cv-art-grid" />
        <div className="cv-focus-ring cv-focus-ring--outer" />
        <div className="cv-focus-ring cv-focus-ring--inner" />
        <div className="cv-art-file"><span className="cv-art-file-fold" /><span className="cv-art-file-line" /><span className="cv-art-file-line cv-art-file-line--short" /><span className="cv-art-file-seal">C</span></div>
        <div className="cv-art-annotation cv-art-annotation--left"><i /> PRIVATE BY DESIGN</div>
        <div className="cv-art-annotation cv-art-annotation--right">FILES, IN FOCUS <span>↗</span></div>
      </div>
    );
  }
  if (kind === "sharing") {
    return (
      <div className="cv-feature-art cv-feature-art--sharing">
        <div className="cv-art-grid" />
        <div className="cv-share-window">
          <div className="cv-share-window-heading"><span>SHARE SETTINGS</span><span className="cv-share-window-dots">•••</span></div>
          <h4>Research-notes.pdf</h4>
          <div className="cv-share-url">cryptiva.app/s/•••••••• <span>▣</span></div>
          <div className="cv-share-rule"><span>Link expiry</span><b>24 hours</b></div>
          <div className="cv-share-rule"><span>Download limit</span><b>3 downloads</b></div>
          <div className="cv-share-state"><i /> Settings ready to review</div>
        </div>
        <span className="cv-share-orb cv-share-orb--one" /><span className="cv-share-orb cv-share-orb--two" />
      </div>
    );
  }
  return (
    <div className="cv-feature-art cv-feature-art--integrity">
      <div className="cv-art-grid" />
      <div className="cv-integrity-window">
        <div className="cv-integrity-heading"><span className="cv-hash-mark">#</span><span><small>FILE INTEGRITY</small><b>SHA-256 hash</b></span><i>✓</i></div>
        <div className="cv-hash-lines"><span>8f14e45fceea167a5a36dedd4bea2543</span><span>0f8f5f6f8a2b4c9d7e1a3f5b6c8d0e2a</span></div>
        <div className="cv-integrity-foot"><i /> Verification information</div>
      </div>
      <div className="cv-integrity-stamp">✓</div>
    </div>
  );
}

export default function Landing() {
  const pageRef = useRef(null);

  useLayoutEffect(() => {
    const root = pageRef.current;
    if (!root) return;
    const reduceMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;

    const ctx = gsap.context(() => {
      if (reduceMotion) return;

      gsap.from(".cv-nav", { y: -12, autoAlpha: 0, duration: .65, ease: "power2.out" });
      gsap.from(".cv-hero-copy > *", { y: 22, autoAlpha: 0, duration: .8, stagger: .09, ease: "power3.out", delay: .08 });
      gsap.from(".cv-product-scene", { y: 38, scale: .98, autoAlpha: 0, duration: 1, ease: "power3.out", delay: .2 });

      gsap.to(".cv-hero-aura--violet", {
        yPercent: 20, scale: 1.08, ease: "none",
        scrollTrigger: { trigger: ".cv-hero", start: "top top", end: "bottom top", scrub: 1 },
      });
      gsap.to(".cv-product-scene", {
        y: -42, ease: "none",
        scrollTrigger: { trigger: ".cv-hero", start: "top top", end: "bottom top", scrub: 1.1 },
      });
      gsap.to(".cv-light-ribbon", {
        xPercent: 45, ease: "none",
        scrollTrigger: { trigger: ".cv-hero", start: "top top", end: "bottom top", scrub: 1 },
      });
      gsap.utils.toArray(".cv-story-copy").forEach((node) => {
        gsap.from(node.children, {
          y: 20, autoAlpha: 0, duration: .7, stagger: .09, ease: "power2.out",
          scrollTrigger: { trigger: node, start: "top 78%", once: true },
        });
      });
      gsap.utils.toArray(".cv-feature-art").forEach((node) => {
        gsap.from(node, {
          y: 28, autoAlpha: 0, duration: .85, ease: "power2.out",
          scrollTrigger: { trigger: node, start: "top 82%", once: true },
        });
      });
      gsap.from(".cv-cta-content > *", {
        y: 18, autoAlpha: 0, duration: .65, stagger: .08, ease: "power2.out",
        scrollTrigger: { trigger: ".cv-final-cta", start: "top 78%", once: true },
      });
    }, root);

    const onPointerMove = (event) => {
      const rect = root.getBoundingClientRect();
      root.style.setProperty("--cv-pointer-x", `${event.clientX - rect.left}px`);
      root.style.setProperty("--cv-pointer-y", `${event.clientY - rect.top}px`);
    };
    root.addEventListener("pointermove", onPointerMove, { passive: true });
    return () => {
      root.removeEventListener("pointermove", onPointerMove);
      ctx.revert();
    };
  }, []);

  return (
    <main className="cv-landing" ref={pageRef}>
      <div className="cv-atmosphere" aria-hidden="true">
        <div className="cv-hero-aura cv-hero-aura--violet" />
        <div className="cv-hero-aura cv-hero-aura--blue" />
        <div className="cv-hero-aura cv-hero-aura--ice" />
        <div className="cv-light-ribbon" />
        <div className="cv-atmosphere-grid" />
        <div className="cv-pointer-glow" />
      </div>

      <nav className="cv-nav" aria-label="Main navigation">
        <Link className="cv-brand" to="/react" aria-label="Cryptiva home"><CryptivaMark /><span>cryptiva<span className="cv-brand-dot">.</span></span></Link>
        <div className="cv-nav-links"><a href="#security">Security</a><a href="#approach">Our approach</a></div>
        <div className="cv-nav-actions"><Link className="cv-sign-in" to="/react/login">Sign in</Link><Link className="cv-nav-cta" to="/react/register">Get started <span>↗</span></Link></div>
      </nav>

      <section className="cv-hero" id="top">
        <div className="cv-hero-waves" aria-hidden="true" />
        <div className="cv-hero-copy">
          <div className="cv-hero-emblem landing-reveal"><CryptivaMark variant="hero" /></div>
          <h1 className="cv-hero-wordmark landing-reveal">CRYPTIVA</h1>
          <p className="cv-hero-subtitle landing-reveal">Secure File Sharing with AES Encryption</p>
          <div className="cv-hero-accent" aria-hidden="true" />
          <p className="cv-hero-lede landing-reveal">Sensitive files, thoughtfully protected—with clear sharing controls and integrity details that stay within reach.</p>
          <div className="cv-hero-actions landing-reveal"><Link className="cv-button cv-button--primary" to="/react/register">Enter Vault <span>→</span></Link><a className="cv-button cv-button--secondary" href="#approach">Explore the system <span>↓</span></a></div>
          <div className="cv-hero-meta landing-reveal" aria-label="Cryptiva features"><span className="cv-meta--cyan"><i /> Privacy-minded workflow</span><span className="cv-meta--violet"><i /> Clear sharing controls</span><span className="cv-meta--amber"><i /> Integrity visibility</span></div>
        </div>
        <WorkspacePreview />
        <div className="cv-scroll-hint"><span className="cv-scroll-indicator"><i /></span><span>SCROLL TO EXPLORE</span><i className="cv-scroll-line" /></div>
      </section>

      <section className="cv-approach" id="approach">
        <div className="cv-approach-top"><span>01 / THE APPROACH</span><span>SECURITY, WITHOUT THE NOISE</span></div>
        <h2>Good security is<br />felt in the <em>details.</em></h2>
        <div className="cv-approach-bottom"><p>Tools should make control easier to understand. Cryptiva brings files, sharing settings, and integrity information into one focused experience.</p><span className="cv-approach-index">DESIGNED AROUND YOUR FILES <b>↘</b></span></div>
      </section>

      <section className="cv-stories" id="security">
        {featureItems.map((feature) => (
          <article className={`cv-story cv-story--${feature.kind}`} key={feature.number}>
            <div className="cv-story-copy">
              <div className="cv-story-eyebrow"><span>{feature.number}</span><i /> {feature.eyebrow}</div>
              <h2>{feature.title}</h2>
              <p>{feature.description}</p>
              <Link className="cv-text-link" to="/react/register">Explore the workspace <span>↗</span></Link>
            </div>
            <FeatureArtwork kind={feature.kind} />
          </article>
        ))}
      </section>

      <section className="cv-final-cta">
        <div className="cv-cta-aura" aria-hidden="true" />
        <div className="cv-cta-content">
          <div className="cv-cta-overline"><span>04</span><i /> MAKE SPACE FOR FOCUS</div>
          <h2>Your files.<br /><em>Your call.</em></h2>
          <p>Bring your documents into a workspace that puts the important controls where you need them.</p>
          <Link className="cv-button cv-button--primary" to="/react/register">Get started with Cryptiva <span>↗</span></Link>
          <small>Already have an account? <Link to="/react/login">Sign in</Link></small>
        </div>
      </section>

      <footer className="cv-footer"><Link className="cv-brand" to="/react"><CryptivaMark /><span>cryptiva<span className="cv-brand-dot">.</span></span></Link><span>Thoughtful file sharing. Built around control.</span><a href="#top">Back to top ↑</a></footer>
    </main>
  );
}
