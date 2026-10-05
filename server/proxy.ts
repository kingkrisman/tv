import { Agent, ProxyAgent, Socks5ProxyAgent, type Dispatcher } from "undici";
import type { RelayConfig } from "../shared/api";

/**
 * Outbound proxies for the stream relay, so region-locked channels can be
 * fetched from an exit in the right country. Configured in .env.local:
 *
 *   STREAM_PROXY=socks5://user:pass@host:1080      fallback for every relayed stream
 *   STREAM_PROXY_US=http://user:pass@us-host:8080  channels from one country (ISO code)
 *
 * http://, https:// and socks5:// URLs are supported.
 */

const direct = new Agent();
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

export function dispatcherFor(country?: string): Dispatcher {
  const proxy = proxyUrlFor(country);
  if (!proxy) return direct;
  let agent = agents.get(proxy);
  if (!agent) {
    const url = new URL(proxy);
    if (url.protocol === "socks5:" || url.protocol === "socks:") {
      agent = new Socks5ProxyAgent(`socks5://${url.host}`, {
        ...(url.username ? { username: decodeURIComponent(url.username), password: decodeURIComponent(url.password) } : {}),
      });
    } else {
      agent = new ProxyAgent(proxy);
    }
    agents.set(proxy, agent);
  }
  return agent;
}

/** Logs a proxy failure once per proxy, without leaking credentials. */
export function reportProxyFailure(country: string | undefined, error: unknown) {
  const proxy = proxyUrlFor(country);
  if (!proxy || warned.has(proxy)) return;
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
