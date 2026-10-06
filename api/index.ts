// Vercel entry point: every /api/* request is rewritten here (see vercel.json)
// and handled by the same Express app the dev server and Netlify use.
import type { IncomingMessage, ServerResponse } from "node:http";
import { createServer } from "../server/index.js";

const app = createServer();

export default function handler(req: IncomingMessage, res: ServerResponse) {
  // The rewrite can deliver "/api/channels" as "/api?path=channels"; restore the
  // original path so Express routes it. Already-original URLs pass through.
  const url = new URL(req.url ?? "/", "http://localhost");
  if (url.pathname === "/api" && url.searchParams.has("path")) {
    const path = url.searchParams.get("path");
    url.searchParams.delete("path");
    req.url = `/api/${path}${url.search}`;
  }
  return app(req, res);
}
