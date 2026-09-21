/* ==========================================================================
   POST /api/lead  —  Vercel adapter
   --------------------------------------------------------------------------
   Vercel's Node runtime hands this function Node-style (req, res) objects,
   not the Web Request/Response that Netlify Functions use. All this file
   does is translate between that shape and the shared core in
   lib/lead-core.mjs, so the behaviour is identical on both platforms.

   Environment variables are set in:
     Vercel -> Project -> Settings -> Environment Variables
   Redeploy after changing them; functions only pick up new values on a build.
   ========================================================================== */

import { handleLead } from "../lib/lead-core.mjs";

/** Vercel usually parses JSON for us, but not for every content-type. */
async function readJson(req) {
  if (req.body && typeof req.body === "object") return req.body;
  if (typeof req.body === "string") {
    try {
      return JSON.parse(req.body);
    } catch {
      return null;
    }
  }
  // Fall back to reading the stream ourselves.
  const chunks = [];
  for await (const chunk of req) chunks.push(chunk);
  if (!chunks.length) return null;
  try {
    return JSON.parse(Buffer.concat(chunks).toString("utf8"));
  } catch {
    return null;
  }
}

export default async function handler(req, res) {
  res.setHeader("Cache-Control", "no-store");

  if (req.method === "OPTIONS") {
    res.setHeader("Allow", "POST, OPTIONS");
    return res.status(204).end();
  }
  if (req.method !== "POST") {
    res.setHeader("Allow", "POST, OPTIONS");
    return res.status(405).json({ ok: false, message: "Method not allowed." });
  }

  const data = await readJson(req);
  if (!data) {
    return res.status(400).json({ ok: false, message: "Invalid request body." });
  }

  const { status, body } = await handleLead(data, process.env);
  return res.status(status).json(body);
}
