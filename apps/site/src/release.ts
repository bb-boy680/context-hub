import { useEffect, useState } from "react";
import { LINKS } from "./config";

export type ReleaseAsset = { name: string; url: string; size: number };
export type Platform = "windows" | "macos" | "linux";
export type LatestRelease = {
  version: string;
  download: Partial<Record<Platform, ReleaseAsset>>;
};

const CACHE_KEY = "ch-latest-release";
const CACHE_TTL = 10 * 60 * 1000;

const ASSET_PATTERNS: Record<Platform, RegExp> = {
  windows: /win-(x64|arm64)\.exe$/i,
  macos: /mac-(arm64|x64)\.dmg$/i,
  linux: /linux-(x86_64|arm64)\.AppImage$/i,
};

type ApiRelease = {
  tag_name: string;
  assets: { name: string; browser_download_url: string; size: number }[];
};

function parse(data: ApiRelease): LatestRelease {
  const download: LatestRelease["download"] = {};
  for (const [platform, pattern] of Object.entries(ASSET_PATTERNS) as [Platform, RegExp][]) {
    const asset = data.assets.find((item) => pattern.test(item.name));
    if (asset) {
      download[platform] = {
        name: asset.name,
        url: asset.browser_download_url,
        size: asset.size,
      };
    }
  }
  return { version: data.tag_name.replace(/^v/i, ""), download };
}

function readCache(): LatestRelease | null {
  try {
    const raw = sessionStorage.getItem(CACHE_KEY);
    if (!raw) return null;
    const cached = JSON.parse(raw) as { at: number; data: LatestRelease };
    return Date.now() - cached.at < CACHE_TTL ? cached.data : null;
  } catch {
    return null;
  }
}

export function useLatestRelease(): LatestRelease | null {
  const [release, setRelease] = useState<LatestRelease | null>(readCache);

  useEffect(() => {
    if (release) return;
    const controller = new AbortController();
    fetch(LINKS.latestReleaseApi, {
      signal: controller.signal,
      headers: { Accept: "application/vnd.github+json" },
    })
      .then((response) => (response.ok ? response.json() : Promise.reject(response.status)))
      .then((data: ApiRelease) => {
        const parsed = parse(data);
        setRelease(parsed);
        try {
          sessionStorage.setItem(CACHE_KEY, JSON.stringify({ at: Date.now(), data: parsed }));
        } catch {
          /* storage can be blocked; the release still renders for this page view */
        }
      })
      // shortcut: the public API allows 60 requests/hour per IP; on failure the
      // download links fall back to the Releases page.
      .catch(() => {});
    return () => controller.abort();
  }, [release]);

  return release;
}

export function currentPlatform(): Platform | null {
  const ua = navigator.userAgent;
  if (/Android|CrOS|iPhone|iPad|iPod/i.test(ua)) return null;
  if (/Windows/i.test(ua)) return "windows";
  if (/Mac OS X|Macintosh/i.test(ua)) return "macos";
  if (/Linux/i.test(ua)) return "linux";
  return null;
}

export function archLabel(asset: ReleaseAsset): string {
  const arch = /x86_64|arm64|x64/i.exec(asset.name)?.[0];
  return arch ? arch.toUpperCase() : "";
}

export function sizeLabel(bytes: number): string {
  return `${Math.round(bytes / 1024 / 1024)} MB`;
}
