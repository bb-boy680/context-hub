// Mainland China, Hong Kong, Macau and Taiwan share the Simplified Chinese copy.
const CHINESE_REGIONS = new Set(["CN", "HK", "MO", "TW"]);

const SOURCES = [
  "https://get.geojs.io/v1/ip/country.json",
  "https://ipwho.is/",
];

async function countryFrom(url: string): Promise<string | null> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 2500);
  try {
    const response = await fetch(url, { signal: controller.signal });
    if (!response.ok) return null;
    const data = (await response.json()) as { country?: string; country_code?: string };
    const code = data.country_code ?? data.country;
    return typeof code === "string" && code.length === 2 ? code.toUpperCase() : null;
  } catch {
    return null;
  } finally {
    clearTimeout(timer);
  }
}

/** Whether the visitor's IP is in a Chinese region; null when every lookup fails. */
export async function isChineseRegion(): Promise<boolean | null> {
  for (const source of SOURCES) {
    const country = await countryFrom(source);
    if (country) return CHINESE_REGIONS.has(country);
  }
  return null;
}
