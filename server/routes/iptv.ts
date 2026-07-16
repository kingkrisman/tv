import type { RequestHandler } from "express";

const PLAYLIST_URL = "https://iptv-org.github.io/iptv/index.m3u";

export const handleIptvPlaylist: RequestHandler = async (_req, res) => {
  try {
    const response = await fetch(PLAYLIST_URL);
    if (!response.ok) {
      res.status(response.status).send("Unable to load the IPTV playlist");
      return;
    }

    res.type("text/plain").send(await response.text());
  } catch {
    res.status(502).send("Unable to load the IPTV playlist");
  }
};
