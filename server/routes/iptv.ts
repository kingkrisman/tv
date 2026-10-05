import type { RequestHandler } from "express";
import { Readable } from "node:stream";
import { gzipSync } from "node:zlib";
import { isIP } from "node:net";
import { parsePlaylist, type ChannelsResponse } from "../../shared/api";
import { relayConfig, relayFetch } from "../proxy";

// Serverless platforms (Netlify, Lambda) compress responses themselves and
// mangle bodies that arrive pre-compressed, so only gzip on a plain Node server.
const SERVERLESS = Boolean(process.env.NETLIFY || process.env.AWS_LAMBDA_FUNCTION_NAME || process.env.LAMBDA_TASK_ROOT);

const PLAYLIST_URL = "https://iptv-org.github.io/iptv/index.m3u";
const CACHE_TTL = 30 * 60 * 1000;
const DEFAULT_UA =
  "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/140.0.0.0 Safari/537.36";

type Cached = { at: number; raw: string; json: Buffer; gzip: Buffer };
let cache: Cached | null = null;
let inflight: Promise<Cached> | null = null;

async function refresh(): Promise<Cached> {
  const response = await fetch(PLAYLIST_URL, { signal: AbortSignal.timeout(20_000) });
  if (!response.ok) throw new Error(`Playlist responded ${response.status}`);
  const raw = await response.text();
  const body: ChannelsResponse = { updatedAt: Date.now(), channels: parsePlaylist(raw) };
  if (body.channels.length === 0) throw new Error("Playlist contained no channels");
  const json = Buffer.from(JSON.stringify(body));
  cache = { at: Date.now(), raw, json, gzip: gzipSync(json) };
  return cache;
}

/** Serves the cache immediately and refreshes it in the background once stale. */
function getPlaylist(): Promise<Cached> {
  const stale = !cache || Date.now() - cache.at > CACHE_TTL;
  if (stale && !inflight) inflight = refresh().finally(() => (inflight = null));
  if (cache) return Promise.resolve(cache);
  return inflight!;
}

export const handleChannels: RequestHandler = async (req, res) => {
  try {
    const { json, gzip } = await getPlaylist();
    res.set("Cache-Control", "public, max-age=300, stale-while-revalidate=3600");
    res.set("Vary", "Accept-Encoding");
    res.type("application/json");
    if (!SERVERLESS && /\bgzip\b/.test(req.get("accept-encoding") ?? "")) {
      res.set("Content-Encoding", "gzip").send(gzip);
    } else {
      res.send(json);
    }
  } catch {
    res.status(502).json({ error: "Unable to load the channel guide" });
  }
};

export const handleIptvPlaylist: RequestHandler = async (_req, res) => {
  try {
    res.type("text/plain").send((await getPlaylist()).raw);
  } catch {
    res.status(502).send("Unable to load the IPTV playlist");
  }
};

function isPrivateHost(hostname: string) {
  const host = hostname.replace(/^\[|\]$/g, "").toLowerCase();
  if (host === "localhost" || host.endsWith(".localhost") || host.endsWith(".local") || host.endsWith(".internal")) return true;
  if (isIP(host) === 4) {
    const [a, b] = host.split(".").map(Number);
    return a === 0 || a === 10 || a === 127 || (a === 169 && b === 254) || (a === 172 && b >= 16 && b <= 31) || (a === 192 && b === 168) || (a === 100 && b >= 64 && b <= 127);
  }
  if (isIP(host) === 6) return host === "::1" || host.startsWith("fc") || host.startsWith("fd") || host.startsWith("fe80") || host.startsWith("::ffff:");
  return false;
}

type RelayOptions = { ua?: string; ref?: string; cc?: string };

function proxied(url: string, { ua, ref, cc }: RelayOptions) {
  const params = new URLSearchParams({ url });
  if (ua) params.set("ua", ua);
  if (ref) params.set("ref", ref);
  if (cc) params.set("cc", cc);
  return `/api/stream?${params}`;
}

export const handleRelayConfig: RequestHandler = (_req, res) => {
  res.set("Cache-Control", "no-cache").json(relayConfig());
};

/** Points every URI in an HLS playlist back through this proxy. */
function rewritePlaylist(text: string, base: string, options: RelayOptions) {
  const resolve = (uri: string) => {
    try {
      return proxied(new URL(uri, base).href, options);
    } catch {
      return uri;
    }
  };
  return text
    .split(/\r?\n/)
    .map((line) => {
      const trimmed = line.trim();
      if (!trimmed) return line;
      if (trimmed.startsWith("#")) return line.replace(/URI="([^"]+)"/g, (_, uri: string) => `URI="${resolve(uri)}"`);
      return resolve(trimmed);
    })
    .join("\n");
}

/**
 * Stream relay. Lets the browser play streams that need custom headers,
 * lack CORS headers, or are plain http on an https page.
 */
export const handleStreamProxy: RequestHandler = async (req, res) => {
  const target = String(req.query.url ?? "");
  const ua = req.query.ua ? String(req.query.ua) : undefined;
  const ref = req.query.ref ? String(req.query.ref) : undefined;
  const cc = typeof req.query.cc === "string" && /^[A-Za-z]{2}$/.test(req.query.cc) ? req.query.cc.toUpperCase() : undefined;

  let url: URL;
  try {
    url = new URL(target);
  } catch {
    res.status(400).send("Invalid url");
    return;
  }
  if ((url.protocol !== "http:" && url.protocol !== "https:") || isPrivateHost(url.hostname)) {
    res.status(403).send("Host not allowed");
    return;
  }

  const controller = new AbortController();
  res.on("close", () => controller.abort());
  const timeout = setTimeout(() => controller.abort(), 15_000);

  try {
    const headers: Record<string, string> = { "User-Agent": ua || DEFAULT_UA, Accept: "*/*" };
    if (ref) {
      headers.Referer = ref;
      try {
        headers.Origin = new URL(ref).origin;
      } catch {
        // Referrer without a parseable origin; send it as-is.
      }
    }
    const range = req.get("range");
    if (range) headers.Range = range;

    const upstream = await relayFetch(url, { headers, redirect: "follow", signal: controller.signal }, cc);
    clearTimeout(timeout);
    const type = upstream.headers.get("content-type") ?? "";
    const finalUrl = upstream.url || url.href;
    const looksLikePlaylist = /mpegurl|m3u/i.test(type) || /\.m3u8?(?:$|\?)/i.test(new URL(finalUrl).pathname + new URL(finalUrl).search);

    res.set("Access-Control-Allow-Origin", "*");
    if (!upstream.ok && upstream.status !== 206) {
      // 451 tells the player this is most likely a regional block rather than a dead stream.
      if (upstream.status === 403 || upstream.status === 451) {
        res.status(451).set("X-Region-Locked", "1").send("Region-locked");
        return;
      }
      res.status(upstream.status).send("Upstream error");
      return;
    }

    if (looksLikePlaylist) {
      const text = await upstream.text();
      if (text.trimStart().startsWith("#EXTM3U")) {
        res.set("Cache-Control", "no-cache");
        res.type("application/vnd.apple.mpegurl").send(rewritePlaylist(text, finalUrl, { ua, ref, cc }));
        return;
      }
      res.status(upstream.status).type(type || "application/octet-stream").send(text);
      return;
    }

    res.status(upstream.status);
    for (const header of ["content-type", "content-length", "content-range", "accept-ranges"]) {
      const value = upstream.headers.get(header);
      if (value) res.set(header, value);
    }
    res.set("Cache-Control", "public, max-age=30");
    if (!upstream.body) {
      res.end();
      return;
    }
    Readable.fromWeb(upstream.body as import("node:stream/web").ReadableStream).on("error", () => res.destroy()).pipe(res);
  } catch {
    clearTimeout(timeout);
    if (!res.headersSent) res.status(502).send("Upstream unreachable");
    else res.destroy();
  }
};
