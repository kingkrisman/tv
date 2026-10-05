/**
 * Shared code between client and server
 */

/** Example response type for /api/demo */
export interface DemoResponse {
  message: string;
}

/** A playable channel, as served by /api/channels. */
export interface Channel {
  /** Stable id derived from the stream URL, safe to persist (favourites, deep links). */
  id: string;
  name: string;
  logo?: string;
  /** Categories, e.g. ["News"] or ["Movies", "Series"]. */
  groups: string[];
  /** ISO 3166-1 alpha-2 code, upper case, when known. */
  country?: string;
  /** e.g. "1080p" */
  quality?: string;
  /** Stream flags such as "Geo-blocked" or "Not 24/7". */
  tags?: string[];
  url: string;
  /** Request headers the stream requires; these force playback through the proxy. */
  userAgent?: string;
  referrer?: string;
}

/** Which countries the stream relay can reach through a configured proxy. */
export interface RelayConfig {
  /** A catch-all proxy (STREAM_PROXY) is set. */
  all: boolean;
  /** Countries with their own proxy (STREAM_PROXY_XX). */
  countries: string[];
}

export interface ChannelsResponse {
  updatedAt: number;
  channels: Channel[];
}

/**
 * Parses an M3U playlist. Attribute values may contain commas (user agents
 * do), so the display name is whatever follows the first comma outside quotes.
 */
export function parsePlaylist(playlist: string): Channel[] {
  const channels: Channel[] = [];
  const seen = new Set<string>();
  let current: Omit<Channel, "id" | "url"> | null = null;

  for (const rawLine of playlist.split(/\r?\n/)) {
    const line = rawLine.trim();
    if (!line) continue;

    if (line.startsWith("#EXTINF:")) {
      current = parseExtinf(line);
      continue;
    }
    if (!current) continue;

    if (line.startsWith("#EXTVLCOPT:")) {
      const [key, ...rest] = line.slice("#EXTVLCOPT:".length).split("=");
      const value = rest.join("=").trim();
      if (key === "http-user-agent" && value && !value.startsWith("#")) current.userAgent ??= value;
      if (key === "http-referrer" && value) current.referrer ??= value;
      continue;
    }
    if (line.startsWith("#")) continue;

    try {
      const { protocol } = new URL(line);
      if (protocol === "http:" || protocol === "https:") {
        let id = hash(line);
        while (seen.has(id)) id = hash(id + line);
        seen.add(id);
        channels.push({ ...current, id, url: line });
      }
    } catch {
      // Ignore malformed stream URLs from the external playlist.
    }
    current = null;
  }

  return channels;
}

function parseExtinf(line: string): Omit<Channel, "id" | "url"> {
  const attrs: Record<string, string> = {};
  let inQuotes = false;
  let nameStart = -1;
  for (let i = 0; i < line.length; i++) {
    if (line[i] === '"') inQuotes = !inQuotes;
    else if (line[i] === "," && !inQuotes) {
      nameStart = i + 1;
      break;
    }
  }
  const head = nameStart === -1 ? line : line.slice(0, nameStart - 1);
  for (const match of head.matchAll(/([\w-]+)="([^"]*)"/g)) attrs[match[1]] = match[2];

  let name = nameStart === -1 ? "" : line.slice(nameStart).trim();
  const tags: string[] = [];
  name = name.replace(/\s*\[([^\]]+)\]/g, (_, tag: string) => {
    tags.push(tag.trim());
    return "";
  });
  let quality: string | undefined;
  name = name.replace(/\s*\((\d{3,4}[pi])\)/i, (_, q: string) => {
    quality = q.toLowerCase();
    return "";
  });

  const groups = (attrs["group-title"] || "")
    .split(";")
    .map((group) => group.trim())
    .filter((group) => group && group !== "Undefined");

  // iptv-org ids look like "CNN.us@HD"; the suffix before "@" is the country.
  let country = attrs["tvg-country"]?.split(/[,;]/)[0]?.trim().toUpperCase();
  const idCountry = attrs["tvg-id"]?.match(/\.([a-z]{2})(?:@|$)/i)?.[1];
  if (!country && idCountry) country = idCountry.toUpperCase();
  if (country === "UK") country = "GB";

  const userAgent = attrs["http-user-agent"];
  const referrer = attrs["http-referrer"];

  return {
    name: name.trim() || "Untitled channel",
    ...(attrs["tvg-logo"] ? { logo: attrs["tvg-logo"] } : {}),
    groups: groups.length ? groups : ["Other"],
    ...(country && country.length === 2 ? { country } : {}),
    ...(quality ? { quality } : {}),
    ...(tags.length ? { tags } : {}),
    ...(userAgent ? { userAgent } : {}),
    ...(referrer ? { referrer } : {}),
  };
}

/** FNV-1a, base36. Short and stable; collisions are resolved by the caller. */
function hash(input: string) {
  let h = 0x811c9dc5;
  for (let i = 0; i < input.length; i++) {
    h ^= input.charCodeAt(i);
    h = Math.imul(h, 0x01000193);
  }
  return (h >>> 0).toString(36);
}
