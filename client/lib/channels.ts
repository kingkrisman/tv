import { useCallback, useEffect, useState } from "react";
import type { Channel, ChannelsResponse, RelayConfig } from "@shared/api";

export type { Channel };

export type IndexedChannel = Channel & { search: string; countryName?: string };

const regionNames = (() => {
  try {
    return new Intl.DisplayNames(["en"], { type: "region" });
  } catch {
    return null;
  }
})();

export function countryName(code?: string) {
  if (!code) return undefined;
  try {
    return regionNames?.of(code) ?? code;
  } catch {
    return code;
  }
}

function index(channels: Channel[]): IndexedChannel[] {
  return channels.map((channel) => {
    const name = countryName(channel.country);
    return { ...channel, countryName: name, search: `${channel.name} ${channel.groups.join(" ")} ${name ?? ""}`.toLowerCase() };
  });
}

export function useChannels() {
  const [channels, setChannels] = useState<IndexedChannel[]>([]);
  const [status, setStatus] = useState<"loading" | "ready" | "error">("loading");
  const [attempt, setAttempt] = useState(0);

  useEffect(() => {
    const controller = new AbortController();
    setStatus("loading");
    fetch("/api/channels", { signal: controller.signal })
      .then((response) => {
        if (!response.ok) throw new Error("Guide unavailable");
        return response.json() as Promise<ChannelsResponse>;
      })
      .then((data) => {
        setChannels(index(data.channels));
        setStatus("ready");
      })
      .catch((error: unknown) => {
        if (error instanceof DOMException && error.name === "AbortError") return;
        setStatus("error");
      });
    return () => controller.abort();
  }, [attempt]);

  const retry = useCallback(() => setAttempt((n) => n + 1), []);
  return { channels, status, retry };
}

/** useState backed by localStorage. Falls back to memory when storage is unavailable. */
export function usePersistent<T>(key: string, initial: T) {
  const [value, setValue] = useState<T>(() => {
    try {
      const stored = localStorage.getItem(key);
      return stored === null ? initial : (JSON.parse(stored) as T);
    } catch {
      return initial;
    }
  });
  useEffect(() => {
    try {
      localStorage.setItem(key, JSON.stringify(value));
    } catch {
      // Private mode or blocked storage: keep the value in memory only.
    }
  }, [key, value]);
  return [value, setValue] as const;
}

const NO_RELAY: RelayConfig = { all: false, countries: [] };

/** Which countries the server's relay can unlock through a configured proxy. */
export function useRelayConfig() {
  const [config, setConfig] = useState<RelayConfig>(NO_RELAY);
  useEffect(() => {
    fetch("/api/relay")
      .then((response) => (response.ok ? (response.json() as Promise<RelayConfig>) : NO_RELAY))
      .then(setConfig)
      .catch(() => undefined);
  }, []);
  return config;
}

export function relayUnlocks(config: RelayConfig, channel: Channel) {
  return config.all || Boolean(channel.country && config.countries.includes(channel.country));
}

export function isGeoTagged(channel: Channel) {
  return Boolean(channel.tags?.some((tag) => /geo/i.test(tag)));
}

export function proxiedUrl(channel: Channel) {
  const params = new URLSearchParams({ url: channel.url });
  if (channel.userAgent) params.set("ua", channel.userAgent);
  if (channel.referrer) params.set("ref", channel.referrer);
  if (channel.country) params.set("cc", channel.country);
  return `/api/stream?${params}`;
}

/**
 * Ordered playback sources. Direct first when the browser can reach the
 * stream itself; the relay covers CORS, header, mixed-content and, with a
 * proxy configured, regional failures.
 */
export function playbackSources(channel: Channel, options: { regionLocked: boolean; relay: RelayConfig }) {
  const needsRelay =
    Boolean(channel.userAgent || channel.referrer) ||
    (location.protocol === "https:" && channel.url.startsWith("http:")) ||
    // The browser's own connection would be refused; only the proxied relay can get through.
    (options.regionLocked && relayUnlocks(options.relay, channel));
  return needsRelay ? [proxiedUrl(channel)] : [channel.url, proxiedUrl(channel)];
}
