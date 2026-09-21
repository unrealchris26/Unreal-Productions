/* ==========================================================================
   POST /api/lead  —  Netlify adapter
   --------------------------------------------------------------------------
   Netlify Functions v2 hands this function a Web `Request` and expects a Web
   `Response`. All this file does is translate between that shape and the
   shared core in lib/lead-core.mjs, so the behaviour is identical to the
   Vercel deployment.

   The route is declared as /api/lead (not /.netlify/functions/lead) so the
   browser can post to the same path on either platform — on Vercel that path
   is served by api/lead.mjs.

   Environment variables are set in:
     Netlify -> Site settings -> Environment variables
   Redeploy after changing them; functions only pick up new values on a build.
   ========================================================================== */

import { handleLead } from "../../lib/lead-core.mjs";

const json = (status, body) =>
  new Response(JSON.stringify(body), {
    status,
    headers: {
      "Content-Type": "application/json",
      "Cache-Control": "no-store",
    },
  });

export default async (request) => {
  if (request.method === "OPTIONS") {
    return new Response(null, {
      status: 204,
      headers: { Allow: "POST, OPTIONS" },
    });
  }
  if (request.method !== "POST") {
    return json(405, { ok: false, message: "Method not allowed." });
  }

  let data;
  try {
    data = await request.json();
  } catch {
    return json(400, { ok: false, message: "Invalid request body." });
  }

  const { status, body } = await handleLead(data, process.env);
  return json(status, body);
};

export const config = {
  path: "/api/lead",
};
