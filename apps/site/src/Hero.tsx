import { useCallback, useRef } from "react";
import { copy, type Lang } from "./copy";
import { asset, LINKS } from "./config";
import { useScrollProgress, lerp, smooth } from "./hooks";
import { ArrowDownToLine, ArrowRight, GithubIcon } from "./icons";

export function Hero({
  lang,
  downloadHref,
  downloadTitle,
}: {
  lang: Lang;
  downloadHref: string;
  downloadTitle?: string;
}) {
  const sectionRef = useRef<HTMLElement>(null);
  const stickyRef = useRef<HTMLDivElement>(null);
  const t = copy[lang].hero;

  const apply = useCallback((p: number) => {
    const el = stickyRef.current;
    if (!el) return;

    const vw = window.innerWidth;
    const root = parseFloat(getComputedStyle(document.documentElement).fontSize);
    const mobile = window.matchMedia("(max-width: 45em)").matches;
    const ratio = 2548 / 1305;
    const e = smooth(p, 0.08, 0.8);
    const edge = smooth(p, 0.04, 0.36);
    const archW = mobile ? vw * 0.92 : vw * 0.694;
    const chromeMax = (mobile ? 1.625 : 2.125) * root;
    const stickyTop = el.getBoundingClientRect().top;
    const stickyHeight = el.clientHeight;
    el.style.setProperty(
      "--ctop",
      `${lerp(mobile ? 12 : 13, mobile ? 4 : 2.5, smooth(p, 0.5, 0.88))}vh`,
    );
    const textActions = el.querySelector<HTMLElement>(".hero-center .hero-actions");
    const textBottom = textActions
      ? textActions.getBoundingClientRect().bottom - stickyTop
      : stickyHeight * 0.55;
    const finalTop = Math.min(textBottom + 0.75 * root, stickyHeight * 0.8);
    const available = Math.max(stickyHeight - finalTop - 0.75 * root, 0);
    const finalW = Math.min(
      (available - chromeMax) * ratio,
      vw * (mobile ? 0.92 : 0.82),
      104 * root,
    );
    const ax = mobile ? vw * 0.2 : vw * 0.271;
    const fx = (vw - finalW) / 2;
    const chrome = lerp(0, chromeMax, smooth(p, 0.08, 0.5));
    const width = lerp(archW, finalW, e);
    const rem = (n: number) => `${Math.round((n / root) * 10000) / 10000}rem`;

    el.style.setProperty("--ww", rem(width));
    el.style.setProperty("--wh", rem(width / ratio + chrome));
    el.style.setProperty("--wx", rem(lerp(ax, fx, e)));
    el.style.setProperty("--wy", rem(lerp(6 * root, finalTop, e)));
    el.style.setProperty("--wo", String(lerp(0.76, 1, e)));
    el.style.setProperty("--wr", rem(lerp(0, 14, edge)));
    el.style.setProperty("--wb", String(lerp(0, 0.14, edge)));
    el.style.setProperty("--co", String(smooth(p, 0.14, 0.42)));
    el.style.setProperty("--ch", rem(chrome));
    el.style.setProperty("--ao", String(1 - smooth(p, 0.3, 0.58)));
    el.style.setProperty("--ao2", String(1 - smooth(p, 0.04, 0.3)));
    el.style.setProperty("--co2", String(smooth(p, 0.46, 0.72)));
    el.style.setProperty("--co3", String(smooth(p, 0.66, 0.86)));
    el.style.setProperty("--shade", String(1 - 0.82 * e));
    el.style.setProperty("--glow", "1");
    el.classList.toggle("is-centered", p > 0.82);
  }, []);

  useScrollProgress(sectionRef, apply);

  return (
    <section id="top" className="hero-scroll" ref={sectionRef}>
      <div className="hero-sticky" ref={stickyRef}>
        <div className="hero-window" aria-hidden="true">
          <div className="hero-chrome">
            <i />
            <i />
            <i />
          </div>
          <div
            className="hero-shot"
            role="img"
            aria-label={t.windowAlt}
            style={{ backgroundImage: `url(${asset(`screenshots/hero-app-${lang}.png`)})` }}
          />
        </div>
        <div className="hero-shade" />
        <div className="hero-glow" />
        <div className="hero-line hero-line-a" />
        <div className="hero-line hero-line-b" />

        <div className="hero-archive">
          <p className="eyebrow">{t.eyebrow}</p>
          <h1 className="hero-title">
            {t.title1}
            <br />
            {t.title2}
          </h1>
          <p className="hero-desc">{t.desc}</p>
          <div className="hero-actions">
            <a className="btn btn-primary" href={downloadHref} title={downloadTitle}>
              {t.download}
              <ArrowRight />
            </a>
            <a className="btn btn-ghost" href={LINKS.github}>
              <GithubIcon />
              {t.github}
            </a>
          </div>
          <p className="hero-platforms">{t.platforms}</p>
        </div>

        <div className="hero-center">
          <h1>
            {t.centerTitle1}
            <br />
            {t.centerTitle2}
          </h1>
          <p>{t.centerDesc}</p>
          <div className="hero-actions">
            <a className="btn btn-primary" href={downloadHref} title={downloadTitle}>
              {t.download}
              <ArrowDownToLine />
            </a>
            <a className="btn btn-ghost" href={LINKS.docs}>
              {t.docs}
              <ArrowRight />
            </a>
          </div>
        </div>
      </div>
    </section>
  );
}
