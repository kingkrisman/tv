import type { Dispatcher } from "undici";
import type { RelayConfig } from "../shared/api.js";

/**
 * Outbound proxies for the stream relay, so region-locked channels can be
 * fetched from an exit in the right country. Configured in .env.local:
 *
 *   STREAM_PROXY=socks5://user:pass@host:1080      fallback for every relayed stream
 *   STREAM_PROXY_US=http://user:pass@us-host:8080  channels from one country (ISO code)
 *
 * http://, https:// and socks5:// URLs are supported.
 *
 * undici is only loaded once a proxy is actually used, so the rest of the API
 * (the guide included) never depends on it or on its Node version floor.
 */

const agents = new Map<string, Dispatcher>();
const warned = new Set<string>();

function envKey(country: string) {
  // iptv-org writes the UK as "uk"; channels are normalised to GB.
  return country === "GB" ? ["STREAM_PROXY_GB", "STREAM_PROXY_UK"] : [`STREAM_PROXY_${country}`];
}

export function proxyUrlFor(country?: string) {
  const code = country?.toUpperCase();
  if (code && /^[A-Z]{2}$/.test(code)) {
    for (const key of envKey(code)) if (process.env[key]) return process.env[key];
  }
  return process.env.STREAM_PROXY || undefined;
}

/** fetch, routed through the proxy configured for `country` when there is one. */
export async function relayFetch(url: URL, init: RequestInit, country?: string): Promise<Response> {
  const proxy = proxyUrlFor(country);
  if (!proxy) return fetch(url, init);

  const undici = await import("undici");
  let agent = agents.get(proxy);
  if (!agent) {
    const parsed = new URL(proxy);
    if (parsed.protocol === "socks5:" || parsed.protocol === "socks:") {
      agent = new undici.Socks5ProxyAgent(`socks5://${parsed.host}`, {
        ...(parsed.username ? { username: decodeURIComponent(parsed.username), password: decodeURIComponent(parsed.password) } : {}),
      });
    } else {
      agent = new undici.ProxyAgent(proxy);
    }
    agents.set(proxy, agent);
  }
  try {
    // undici's fetch and Node's global fetch share the WHATWG Response shape.
    return (await undici.fetch(url, { ...(init as Parameters<typeof undici.fetch>[1]), dispatcher: agent })) as unknown as Response;
  } catch (error) {
    if (!init.signal?.aborted) reportProxyFailure(proxy, error);
    throw error;
  }
}

/** Logs a proxy failure once per proxy, without leaking credentials. */
function reportProxyFailure(proxy: string, error: unknown) {
  if (warned.has(proxy)) return;
  warned.add(proxy);
  const { protocol, host } = new URL(proxy);
  const cause = error instanceof Error ? ((error as Error & { cause?: unknown }).cause ?? error.message) : error;
  console.warn(`[relay] proxy ${protocol}//${host} failed: ${cause}`);
}

export function relayConfig(): RelayConfig {
  const countries = new Set<string>();
  for (const [key, value] of Object.entries(process.env)) {
    const match = key.match(/^STREAM_PROXY_([A-Z]{2})$/);
    if (match && value) countries.add(match[1] === "UK" ? "GB" : match[1]);
  }
  return { all: Boolean(process.env.STREAM_PROXY), countries: [...countries].sort() };
}
