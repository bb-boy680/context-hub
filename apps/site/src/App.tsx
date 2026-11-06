import { useEffect, useState } from "react";
import type { Lang } from "./copy";
import { LINKS } from "./config";
import { Hero } from "./Hero";
import { Download } from "./Download";
import { isChineseRegion } from "./geo";
import { currentPlatform, sizeLabel, useLatestRelease } from "./release";
import { Agents, Catalog, Dossier, Footer, Nav, Runtime, Skills } from "./Sections";

const browserLang = (): Lang => (navigator.language?.toLowerCase().startsWith("zh") ? "zh" : "en");

export function App() {
  const [lang, setLang] = useState<Lang>(browserLang);
  const [manual, setManual] = useState(false);
  const release = useLatestRelease();
  const platform = currentPlatform();
  const installer = platform ? release?.download[platform] : undefined;
  const downloadHref = installer?.url ?? LINKS.releases;
  const downloadTitle = installer ? `${installer.name} · ${sizeLabel(installer.size)}` : undefined;

  useEffect(() => {
    document.documentElement.lang = lang === "zh" ? "zh-CN" : "en";
    document.title =
      lang === "zh"
        ? "Context Hub — 本地上下文档案"
        : "Context Hub — The local context archive";
  }, [lang]);

  // No language cache: every load asks the IP lookup again. A manual toggle
  // only wins until this page is reloaded.
  useEffect(() => {
    try {
      localStorage.removeItem("ch-lang");
      localStorage.removeItem("ch-lang-choice");
    } catch {
      /* storage can be blocked */
    }
  }, []);

  useEffect(() => {
    if (manual) return;
    let cancelled = false;
    isChineseRegion().then((chinese) => {
      if (!cancelled && chinese !== null) setLang(chinese ? "zh" : "en");
    });
    return () => {
      cancelled = true;
    };
  }, [manual]);

  const chooseLang = (next: Lang) => {
    setManual(true);
    setLang(next);
  };

  return (
    <div className="site">
      <Nav
        lang={lang}
        onLang={chooseLang}
        downloadHref={downloadHref}
        downloadTitle={downloadTitle}
      />
      <main>
        <Hero lang={lang} downloadHref={downloadHref} downloadTitle={downloadTitle} />
        <Catalog lang={lang} />
        <Skills lang={lang} />
        <Dossier lang={lang} />
        <Agents lang={lang} />
        <Runtime lang={lang} />
        <Download
          lang={lang}
          release={release}
          downloadHref={downloadHref}
          downloadTitle={downloadTitle}
        />
      </main>
      <Footer lang={lang} />
    </div>
  );
}
