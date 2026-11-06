import { Fragment, useCallback, useRef } from "react";
import { copy, type Lang } from "./copy";
import { asset, LINKS } from "./config";
import { useScrollProgress, lerp, smooth } from "./hooks";
import { ArrowDownToLine, GithubIcon } from "./icons";
import { archLabel, sizeLabel, type LatestRelease, type Platform } from "./release";

const PLATFORMS: [Platform, string][] = [
  ["windows", "WINDOWS"],
  ["macos", "MACOS"],
  ["linux", "LINUX"],
];

export function Download({
  lang,
  release,
  downloadHref,
  downloadTitle,
}: {
  lang: Lang;
  release: LatestRelease | null;
  downloadHref: string;
  downloadTitle?: string;
}) {
  const sectionRef = useRef<HTMLElement>(null);
  const stickyRef = useRef<HTMLDivElement>(null);
  const t = copy[lang].download;

  const apply = useCallback((p: number) => {
    const el = stickyRef.current;
    if (!el) return;

    const vw = window.innerWidth;
    const root = parseFloat(getComputedStyle(document.documentElement).fontSize);
    const cw = Math.min(vw, 100 * root);
    const off = (vw - cw) / 2;
    const mobile = window.matchMedia("(max-width: 45em)").matches;
    const e = smooth(p, 0.12, 0.82);
    const startSize = mobile ? 4 * root : 5.75 * root;
    const endSize = mobile ? 3 * root : 3.5 * root;
    const sx = mobile ? vw - 1.5 * root - startSize : off + cw * 0.757;
    const startY = mobile ? 10 : 30;
    const endY = 27;
    const ex = (vw - endSize) / 2;
    const rem = (n: number) => `${Math.round((n / root) * 10000) / 10000}rem`;

    el.style.setProperty("--ix", rem(lerp(sx, ex, e)));
    el.style.setProperty("--iy", `${lerp(startY, endY, e)}vh`);
    el.style.setProperty("--nx", rem(sx + startSize / 2 - 8.4375 * root));
    el.style.setProperty("--ny", `calc(${startY}vh + ${rem(startSize + 1.75 * root)})`);
    el.style.setProperty("--is", rem(lerp(startSize, endSize, e)));
    el.style.setProperty("--ir", rem(lerp(20, 12, e)));
    el.style.setProperty("--so", String(1 - smooth(p, 0.08, 0.42)));
    el.style.setProperty("--eo", String(smooth(p, 0.45, 0.82)));
    el.style.setProperty("--wmo", String(1 - smooth(p, 0.15, 0.55)));
    el.style.setProperty("--go", String(smooth(p, 0.2, 0.85)));
    el.classList.toggle("is-ended", p > 0.8);
  }, []);

  useScrollProgress(sectionRef, apply);

  return (
    <section className="download-scroll" ref={sectionRef}>
      <div className="download-sticky" ref={stickyRef}>
        <div className="download-watermark" aria-hidden="true">
          CH
        </div>
        <div className="download-glow" />
        <div className="download-line download-line-a" />
        <div className="download-line download-line-b" />

        <div className="download-start">
          <p className="eyebrow">{t.eyebrow}</p>
          <h2>
            {t.title1}
            <br />
            {t.title2}
          </h2>
          <p className="download-desc">{t.desc}</p>
          <div className="hero-actions">
            <a className="btn btn-primary" href={downloadHref} title={downloadTitle}>
              {t.download}
              <ArrowDownToLine />
            </a>
            <a className="btn btn-ghost" href={LINKS.github}>
              <GithubIcon />
              {t.github}
            </a>
          </div>
        </div>

        <img className="download-icon" src={asset("icon-64.png")} alt="" />
        <p className="download-brand-note">{t.brandNote}</p>

        <div className="download-end">
          <h2>
            {t.title1}
            <br />
            {t.title2}
          </h2>
          <p className="download-desc">{t.endDesc}</p>
          <div className="hero-actions">
            <a className="btn btn-primary" href={downloadHref} title={downloadTitle}>
              {t.download}
              <ArrowDownToLine />
            </a>
            <a className="btn btn-ghost" href={LINKS.github}>
              <GithubIcon />
              {t.github}
            </a>
          </div>
          <p className="download-platforms">
            {release && <>V{release.version} · </>}
            {PLATFORMS.map(([key, label], index) => {
              const file = release?.download[key];
              return (
                <Fragment key={key}>
                  {index > 0 && " / "}
                  <a
                    href={file?.url ?? LINKS.releases}
                    title={file ? `${file.name} · ${sizeLabel(file.size)}` : undefined}
                  >
                    {label}
                    {file && ` ${archLabel(file)}`}
                  </a>
                </Fragment>
              );
            })}
          </p>
        </div>
      </div>
    </section>
  );
}
