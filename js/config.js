/* ==========================================================================
   SINGLE SOURCE OF TRUTH for business identity.
   --------------------------------------------------------------------------
   A2P 10DLC carrier review requires the business name, physical address,
   phone and email to be CONSISTENT across the site, the booking form and
   both legal pages.

   Edit the values below, then run:

       node scripts/sync-business-info.mjs

   That script rewrites the matching static text inside every
   `data-biz="..."` element in index.html, privacy-policy.html and
   terms.html, so the details are correct in the raw HTML even for a
   reviewer or crawler that does not execute JavaScript.

   This file ALSO applies the values at runtime as a safety net, so a
   forgotten sync can never leave a stale name on screen.
   ========================================================================== */

export const BUSINESS = {
  /* Public-facing brand name. Used in body copy and SMS consent text. */
  name: "Unreal Productions",

  /* Registered legal entity. Used in the copyright line and legal pages.
     Must match the name on the A2P 10DLC brand registration. */
  legalName: "Unreal Productions LLC",

  /* TODO: confirm — the reference screenshot shows no ZIP code.
     A2P review generally expects a complete, verifiable postal address. */
  address: {
    street: "3930 South Las Vegas Boulevard",
    city: "Las Vegas",
    state: "NV",
    postalCode: "", // <-- TODO: supply ZIP
    country: "USA",
  },

  phone: "(207) 458-3115",
  /* E.164, used for tel: links and structured data. */
  phoneE164: "+12074583115",

  email: "unrealvegas@gmail.com",

  /* TODO: replace with the live domain before deploying. */
  siteUrl: "https://www.unrealproductions.co",

  /* TODO: replace # with real profile URLs. */
  social: {
    youtube: "#",
    instagram: "#",
    facebook: "#",
    tiktok: "#",
  },
};

/** Full address on one line. */
export function formatAddress(b = BUSINESS) {
  const { street, city, state, postalCode, country } = b.address;
  return [street, city, [state, postalCode].filter(Boolean).join(" "), country]
    .filter(Boolean)
    .join(", ");
}

/* --------------------------------------------------------------------------
   Runtime application.
   Any element with data-biz="<key>" has its text replaced. Supported keys
   map to the getters below.
   -------------------------------------------------------------------------- */
const VALUES = () => ({
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
});

export function applyBusinessInfo(root = document) {
  const values = VALUES();

  root.querySelectorAll("[data-biz]").forEach((el) => {
    const key = el.dataset.biz;
    if (!(key in values)) return;
    // Only touch text; never clobber child markup such as a nested link.
    if (el.children.length === 0) el.textContent = values[key];
  });

  // Links that must always point at the configured contact details.
  root.querySelectorAll('[data-biz-href="tel"]').forEach((el) => {
    el.setAttribute("href", `tel:${BUSINESS.phoneE164}`);
  });
  root.querySelectorAll('[data-biz-href="email"]').forEach((el) => {
    el.setAttribute("href", `mailto:${BUSINESS.email}`);
  });

  Object.entries(BUSINESS.social).forEach(([network, url]) => {
    root.querySelectorAll(`[data-social="${network}"]`).forEach((el) => {
      if (url && url !== "#") el.setAttribute("href", url);
    });
  });
}
