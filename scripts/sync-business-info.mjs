#!/usr/bin/env node
/* ==========================================================================
   Sync business identity from js/config.js into the static HTML.
   --------------------------------------------------------------------------
   A2P 10DLC reviewers may read the raw HTML without executing JavaScript,
   so the business name, address, phone and email must be correct in the
   markup itself — not only injected at runtime.

   Usage:
       node scripts/sync-business-info.mjs           # rewrite the HTML
       node scripts/sync-business-info.mjs --check   # verify only (CI-safe)

   It rewrites the text inside every `data-biz="<key>"` element, plus the
   href of `data-biz-href="tel|email"` links and `data-social="..."` links.
   No dependencies.
   ========================================================================== */

import { readFile, writeFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const { BUSINESS, formatAddress } = await import(
  new URL("../js/config.js", import.meta.url).href
);

const FILES = ["index.html", "privacy-policy.html", "terms.html"];
const checkOnly = process.argv.includes("--check");

const values = {
  name: BUSINESS.name,
  "legal-name": BUSINESS.legalName,
  phone: BUSINESS.phone,
  email: BUSINESS.email,
  address: formatAddress(),
  street: BUSINESS.address.street,
  "city-state": [
    BUSINESS.address.city,
    [BUSINESS.address.state, BUSINESS.address.postalCode].filter(Boolean).join(" "),
  ]
    .filter(Boolean)
    .join(", "),
  year: String(new Date().getFullYear()),
};

const escapeHtml = (s) =>
  s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");

let changedFiles = 0;
let totalReplacements = 0;

for (const file of FILES) {
  const path = join(root, file);
  let html;
  try {
    html = await readFile(path, "utf8");
  } catch {
    console.warn(`  skip   ${file} (not found)`);
    continue;
  }

  const before = html;
  let count = 0;

  // <tag data-biz="key" ...>TEXT</tag>  — text-only elements.
  for (const [key, value] of Object.entries(values)) {
    const re = new RegExp(
      `(<([a-zA-Z0-9]+)([^>]*\\sdata-biz="${key}"[^>]*)>)([^<]*)(</\\2>)`,
      "g"
    );
    html = html.replace(re, (match, open, _tag, _attrs, text, close) => {
      const next = escapeHtml(value);
      if (text === next) return match;
      count++;
      return `${open}${next}${close}`;
    });
  }

  // tel: / mailto: hrefs
  html = html.replace(
    /(<a[^>]*\sdata-biz-href="tel"[^>]*\shref=")[^"]*(")/g,
    (m, a, b) => {
      const next = `${a}tel:${BUSINESS.phoneE164}${b}`;
      if (next !== m) count++;
      return next;
    }
  );
  html = html.replace(
    /(<a[^>]*\sdata-biz-href="email"[^>]*\shref=")[^"]*(")/g,
    (m, a, b) => {
      const next = `${a}mailto:${BUSINESS.email}${b}`;
      if (next !== m) count++;
      return next;
    }
  );

  // social hrefs — only when a real URL is configured
  for (const [network, url] of Object.entries(BUSINESS.social)) {
    if (!url || url === "#") continue;
    const re = new RegExp(
      `(<a[^>]*\\sdata-social="${network}"[^>]*\\shref=")[^"]*(")`,
      "g"
    );
    html = html.replace(re, (m, a, b) => {
      const next = `${a}${url}${b}`;
      if (next !== m) count++;
      return next;
    });
  }

  totalReplacements += count;

  if (html === before) {
    console.log(`  ok     ${file}`);
    continue;
  }

  changedFiles++;
  if (checkOnly) {
    console.error(`  STALE  ${file} — ${count} value(s) out of date`);
  } else {
    await writeFile(path, html, "utf8");
    console.log(`  wrote  ${file} — ${count} value(s) updated`);
  }
}

console.log("");
if (checkOnly && changedFiles) {
  console.error(
    `${changedFiles} file(s) are out of sync with js/config.js.\n` +
      `Run: node scripts/sync-business-info.mjs`
  );
  process.exit(1);
}

if (!BUSINESS.address.postalCode) {
  console.warn(
    "WARNING: BUSINESS.address.postalCode is empty.\n" +
      "         A2P 10DLC review generally expects a complete postal address."
  );
}

console.log(
  changedFiles
    ? `Done — ${totalReplacements} value(s) synced across ${changedFiles} file(s).`
    : "Done — everything already in sync."
);
