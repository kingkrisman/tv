import dotenv from "dotenv";
import express from "express";
import cors from "cors";
import { handleDemo } from "./routes/demo";
import { handleChannels, handleIptvPlaylist, handleRelayConfig, handleStreamProxy } from "./routes/iptv";

// .env.local (git-ignored) holds secrets such as proxy credentials and wins over .env.
dotenv.config({ path: [".env.local", ".env"], quiet: true });

export function createServer() {
  const app = express();

  // Middleware
  app.use(cors());
  app.use(express.json());
  app.use(express.urlencoded({ extended: true }));

  // Example API routes
  app.get("/api/ping", (_req, res) => {
    const ping = process.env.PING_MESSAGE ?? "ping";
    res.json({ message: ping });
  });

  app.get("/api/demo", handleDemo);
  app.get("/api/channels", handleChannels);
  app.get("/api/stream", handleStreamProxy);
  app.get("/api/relay", handleRelayConfig);
  app.get(["/api/iptv/playlist", "/iptv/playlist"], handleIptvPlaylist);

  return app;
}
