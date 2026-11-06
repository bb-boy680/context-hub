import type { CSSProperties } from "react";
import { copy, type Lang } from "./copy";
import { asset, LINKS } from "./config";
import { ArrowDownToLine, ArrowRight, ArrowUpRight, Check, GithubIcon } from "./icons";

const AGENT_FILES: Record<string, string> = {
  "Claude Code": "claude.code.svg",
  Codex: "codex.svg",
  Cursor: "cursor.svg",
  Antigravity: "antigravity.svg",
  "Kimi Code": "kimi.png",
  OpenCode: "opencode.svg",
  "Qwen Code": "qwen-code.png",
  "DeepSeek Harness": "deepseek-harness.svg",
  Kiro: "kiro.svg",
  "GitHub Copilot": "copilot.svg",
  "Qoder CLI": "qoder.png",
  Trae: "trae.png",
  WorkBuddy: "workbuddy.svg",
  ZCode: "zcode.svg",
};

const SUPPORTED = [
  "Claude Code",
  "Codex",
  "Cursor",
  "Antigravity",
  "Kimi Code",
  "OpenCode",
  "Qwen Code",
  "DeepSeek Harness",
  "Kiro",
  "GitHub Copilot",
  "Qoder CLI",
  "Trae",
  "WorkBuddy",
  "ZCode",
];

const DEFAULT_ORDER: [string, boolean][] = [
  ["Claude Code", true],
  ["Codex", true],
  ["Kiro", false],
  ["OpenCode", false],
  ["Antigravity", false],
  ["Cursor", false],
  ["DeepSeek Harness", true],
  ["Kimi Code", false],
  ["WorkBuddy", true],
  ["Qwen Code", false],
];

const DRAGGED_AGENT = "DeepSeek Harness";

const shot = (lang: Lang, name: string) => asset(`screenshots/${name}-${lang}.png`);

const DRAGGED_ORDER: [string, boolean][] = [
  ["Claude Code", true],
  ["Codex", true],
  ["Kiro", false],
  ["DeepSeek Harness", true],
  ["OpenCode", false],
  ["Antigravity", false],
  ["Cursor", false],
  ["Kimi Code", false],
  ["WorkBuddy", true],
  ["Qwen Code", false],
];

function AgentIcon({ name, size }: { name: string; size?: number }) {
  return (
    <img
      src={asset(`agents/${AGENT_FILES[name]}`)}
      alt=""
      width={size}
      height={size}
      loading="lazy"
    />
  );
}

export function Nav({
  lang,
  onLang,
  downloadHref,
  downloadTitle,
}: {
  lang: Lang;
  onLang: (lang: Lang) => void;
  downloadHref: string;
  downloadTitle?: string;
}) {
  const t = copy[lang].nav;

  return (
    <header className="nav">
      <a className="brand" href="#top">
        <img src={asset("icon-64.png")} alt="" width={30} height={30} />
        <span className="brand-name">Context Hub</span>
        <span className="brand-id">/ CH–001</span>
      </a>

      <nav className="nav-links" aria-label="Sections">
        {t.links.map((link) => (
          <a key={link.href} href={link.href}>
            {link.label}
          </a>
        ))}
      </nav>

      <div className="nav-actions">
        <div className="lang-switch" role="group" aria-label={t.language}>
          <button type="button" aria-pressed={lang === "zh"} onClick={() => onLang("zh")}>
            中
          </button>
          <button
            type="button"
            className="lang-en"
            aria-pressed={lang === "en"}
            onClick={() => onLang("en")}
          >
            EN
          </button>
        </div>
        <a className="icon-link" href={LINKS.github} aria-label={t.github}>
          <GithubIcon />
        </a>
        <a className="btn btn-primary btn-sm" href={downloadHref} title={downloadTitle}>
          {t.download}
          <ArrowDownToLine />
        </a>
      </div>
    </header>
  );
}

function SectionHead({
  eyebrow,
  title1,
  title2,
  desc,
}: {
  eyebrow: string;
  title1: string;
  title2: string;
  desc: string;
}) {
  return (
    <div className="section-head">
      <div className="head-main">
        <p className="eyebrow">{eyebrow}</p>
        <h2>
          {title1}
          <br />
          {title2}
        </h2>
      </div>
      <p className="head-desc">{desc}</p>
    </div>
  );
}

function Caption({
  left,
  right,
  dark,
}: {
  left: string;
  right?: string;
  dark?: boolean;
}) {
  return (
    <div className={`plate-caption${dark ? " dark" : ""}`}>
      <span>{left}</span>
      {right && <span>{right}</span>}
    </div>
  );
}

export function Catalog({ lang }: { lang: Lang }) {
  const t = copy[lang].catalog;
  const geo = [
    ["0%", "82.3%"],
    ["13%", "79.3%"],
    ["4.6%", "88.4%"],
    ["17.5%", "74.7%"],
    ["8.4%", "83.8%"],
  ];

  return (
    <section id="catalog" className="section section--light catalog">
      <div className="wrap">
        <SectionHead eyebrow={t.eyebrow} title1={t.title1} title2={t.title2} desc={t.desc} />
        <div className="catalog-list">
          {t.items.map((item, i) => (
            <a
              className="catalog-row"
              key={item.title}
              href={i === 0 ? "#skills" : i === 2 ? "#plugins" : "#dossier"}
              style={{ "--x": geo[i][0], "--w": geo[i][1], "--y": `${i * 112}px` } as CSSProperties}
            >
              <span className="catalog-n">{item.n}</span>
              <span className="catalog-title">{item.title}</span>
              <span className="catalog-label">{item.label}</span>
              <span className="catalog-desc">{item.desc}</span>
              <ArrowUpRight className="catalog-arrow" />
            </a>
          ))}
        </div>
      </div>
    </section>
  );
}

export function Skills({ lang }: { lang: Lang }) {
  const t = copy[lang].skills;
  const p = copy[lang].plugins;

  return (
    <section id="skills" className="section section--light skills">
      <div className="wrap">
        <SectionHead eyebrow={t.eyebrow} title1={t.title1} title2={t.title2} desc={t.desc} />

        <div className="market-stage">
          <div className="plate market-list">
            <div
              className="plate-shot"
              role="img"
              aria-label={t.listAlt}
              style={{ aspectRatio: "1312 / 508", backgroundImage: `url(${shot(lang, "skills-market")})` }}
            />
            <Caption left={t.listCaption} right={t.listActions} />
          </div>

          <div className="plate market-detail">
            <div
              className="plate-shot"
              role="img"
              aria-label={t.detailAlt}
              style={{ aspectRatio: "500 / 328", backgroundImage: `url(${shot(lang, "skill-detail")})` }}
            />
            <Caption left={t.detailCaption} />
          </div>

          <div className="market-note">
            <p className="eyebrow">{t.noteEyebrow}</p>
            <h3>
              {t.noteTitle1}
              <br />
              {t.noteTitle2}
            </h3>
            <p>{t.noteBody}</p>
          </div>
        </div>

        <div id="plugins" className="plugin-row">
          <div className="plate plugin-plate">
            <div
              className="plate-shot"
              role="img"
              aria-label={p.alt}
              style={{ aspectRatio: "700 / 332", backgroundImage: `url(${shot(lang, "plugin-market")})` }}
            />
            <Caption left={p.caption} right={p.captionActions} />
          </div>
          <div className="plugin-copy">
            <p className="eyebrow">{p.eyebrow}</p>
            <h2>
              {p.title1}
              <br />
              {p.title2}
            </h2>
            <p className="head-desc">{p.desc}</p>
            <a className="text-link" href={LINKS.plugins}>
              {p.link}
              <ArrowUpRight />
            </a>
          </div>
        </div>
      </div>
    </section>
  );
}

export function Dossier({ lang }: { lang: Lang }) {
  const t = copy[lang].dossier;

  return (
    <section id="dossier" className="section section--dark dossier">
      <div className="wrap">
        <SectionHead eyebrow={t.eyebrow} title1={t.title1} title2={t.title2} desc={t.desc} />

        <div className="dossier-stage">
          <div className="plate dossier-main">
            <div
              className="plate-shot"
              role="img"
              aria-label={t.skillAlt}
              style={{ aspectRatio: "820 / 530", backgroundImage: `url(${shot(lang, "skill-dossier")})` }}
            />
            <Caption left={t.plate1} right={t.plate1Actions} dark />
          </div>

          <div className="plate dossier-env">
            <div
              className="plate-shot"
              role="img"
              aria-label={t.envAlt}
              style={{ aspectRatio: "452 / 311", backgroundImage: `url(${shot(lang, "env-dossier")})` }}
            />
            <Caption left={t.plate2} dark />
          </div>

          <div className="dossier-note">
            <p className="eyebrow">{t.noteEyebrow}</p>
            <h3>
              {t.noteTitle1}
              <br />
              {t.noteTitle2}
            </h3>
            <p>{t.noteBody}</p>
          </div>
        </div>
      </div>
    </section>
  );
}

function SidebarPanel({
  rows,
  title,
  label,
  accent,
  dragging,
}: {
  rows: [string, boolean][];
  title: string;
  label: string;
  accent?: boolean;
  dragging?: string;
}) {
  return (
    <div className="sidebar-col">
      <p className={`sidebar-label${accent ? " accent" : ""}`}>{label}</p>
      <div className="sidebar-panel">
        <p className="sidebar-title">{title}</p>
        <div className="sidebar-list">
          {rows.map(([name, on]) => (
            <div
              key={name}
              className={`sidebar-row${on ? " on" : ""}${name === dragging ? " dragging" : ""}`}
            >
              <span className="agent-tile">
                <AgentIcon name={name} size={17} />
              </span>
              <span className="agent-name">{name}</span>
              {on && <Check className="agent-check" />}
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

export function Agents({ lang }: { lang: Lang }) {
  const t = copy[lang].agents;

  return (
    <section id="agents" className="section section--light agents">
      <div className="wrap">
        <div className="section-head">
          <div className="head-main">
            <p className="eyebrow">{t.eyebrow}</p>
            <h2>
              {t.title1}
              <br />
              {t.title2}
            </h2>
          </div>
          <div className="agents-head-desc">
            <p className="head-desc">{t.desc}</p>
            <p className="eyebrow">{t.annotation}</p>
          </div>
        </div>

        <div className="agents-grid">
          <div className="agents-left">
            <div className="capabilities">
              {t.capabilities.map((cap) => (
                <div className="capability" key={cap.n}>
                  <span className="capability-n">{cap.n}</span>
                  <div>
                    <h3>{cap.title}</h3>
                    <p>{cap.desc}</p>
                  </div>
                </div>
              ))}
            </div>

            <div className="agent-catalog">
              <div className="agent-catalog-head">
                <p>{t.listTitle}</p>
                <span className="eyebrow">{t.ready}</span>
              </div>
              <ul className="agent-columns">
                {SUPPORTED.map((name) => (
                  <li key={name}>
                    <AgentIcon name={name} size={18} />
                    <span>{name}</span>
                  </li>
                ))}
              </ul>
            </div>
          </div>

          <div className="sidebar-demo">
            <div className="sidebar-compare">
              <SidebarPanel rows={DEFAULT_ORDER} title={t.panelTitle} label={t.defaultLabel} />
              <div className="compare-arrow">
                <ArrowRight />
              </div>
              <SidebarPanel
                rows={DRAGGED_ORDER}
                title={t.panelTitle}
                label={t.draggedLabel}
                accent
                dragging={DRAGGED_AGENT}
              />
            </div>
            <div className="sort-notes">
              {t.notes.map((note) => (
                <p key={note}>{note}</p>
              ))}
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}

export function Runtime({ lang }: { lang: Lang }) {
  const t = copy[lang].runtime;

  return (
    <section id="runtime" className="section section--dark runtime">
      <div className="wrap">
        <div className="section-head">
          <div className="head-main">
            <p className="eyebrow">{t.eyebrow}</p>
            <h2>
              {t.title1}
              <br />
              {t.title2}
            </h2>
          </div>
        </div>

        <div className="volumes">
          {t.volumes.map((vol) => (
            <div className="volume" key={vol.vol}>
              <p className="volume-vol">{vol.vol}</p>
              <h3>{vol.name}</h3>
              <p className="volume-label">{vol.label}</p>
              <p className="volume-desc">{vol.desc}</p>
              <p className="volume-meta">{vol.meta}</p>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}

export function Footer({ lang }: { lang: Lang }) {
  const t = copy[lang].footer;

  return (
    <footer className="footer">
      <div className="footer-brand">
        <img src={asset("icon-64.png")} alt="" width={24} height={24} />
        <span>Context Hub</span>
      </div>
      <p className="footer-definition">{t.definition}</p>
      <nav className="footer-links" aria-label="Footer">
        <a href={LINKS.releases}>{t.links[0]}</a>
        <a href={LINKS.docs}>{t.links[1]}</a>
        <a href={LINKS.license}>{t.links[2]}</a>
      </nav>
    </footer>
  );
}
