# Unreal Productions — Website

Static, framework-free site (semantic HTML + CSS + vanilla JS) for **Unreal Productions LLC**,
built to pass **A2P 10DLC** carrier review for SMS campaign registration.

- **3 pages** — `index.html`, `privacy-policy.html`, `terms.html`
- **1 serverless function** — booking form → GoHighLevel. Deploys to **Vercel or Netlify**:
  shared logic in `lib/lead-core.mjs`, thin adapters in `api/lead.mjs` (Vercel) and
  `netlify/functions/lead.mjs` (Netlify). Both serve `POST /api/lead`.
- **No build step.** No dependencies. No bundler. Open the folder and it runs.

---

## Contents

1. [Local preview](#1-local-preview)
2. [Deploying to Netlify](#2-deploying-to-netlify)
3. [Environment variables](#3-environment-variables)
4. [GoHighLevel setup](#4-gohighlevel-setup)
5. [Changing business details](#5-changing-business-details-one-place)
6. [Swapping images, videos and copy](#6-swapping-images-videos-and-copy)
7. [A2P 10DLC compliance notes](#7-a2p-10dlc-compliance-notes)
8. [Animations](#8-animations)
9. [Accessibility](#9-accessibility)
10. [TODO checklist](#10-todo-checklist)
11. [Project structure](#11-project-structure)

---

## 1. Local preview

The site is plain static files, but it uses **ES modules**, so it must be served over HTTP —
opening `index.html` from the filesystem will fail with a CORS error.

**Option A — any static server (no form submission):**

```bash
python -m http.server 8791
# → http://127.0.0.1:8791
```

```bash
npx serve .        # or:  npx http-server -p 8791
```

**Option B — Netlify CLI (recommended; runs the booking function too):**

```bash
npm install -g netlify-cli
netlify dev
# → http://localhost:8888
```

Only `netlify dev` runs `/.netlify/functions/lead`. With a plain static server the form will
validate correctly and then report a submission error, which is expected.

---

## 2. Deploying

The site runs on either host. The browser always posts to **`/api/lead`**: on Vercel
that path is served by `api/lead.mjs`, and on Netlify the function declares
`path = "/api/lead"`. Nothing in the client is platform-specific.

| | Vercel | Netlify |
|---|---|---|
| Config file | `vercel.json` | `netlify.toml` |
| Function | `api/lead.mjs` | `netlify/functions/lead.mjs` |
| Shared logic | `lib/lead-core.mjs` | same |
| Env vars | Project → Settings → Environment Variables | Site settings → Environment variables |

**Each host ignores the other's config file**, so the headers, caching and redirects
are defined twice and must be kept in step if you change one.

### Vercel

1. Import the GitHub repo. It is a static site with functions — no build command,
   no output directory, no framework preset.
2. Add `GHL_TOKEN` and `GHL_LOCATION_ID` under Environment Variables.
3. **Redeploy.** Functions only pick up env changes on a new build.

`vercel.json` sets the security headers (CSP, X-Frame-Options, Referrer-Policy,
Permissions-Policy), asset caching, `cleanUrls`, and the `/privacy` + `/terms`
redirects.

## 2b. Deploying to Netlify

1. **Push to GitHub.**

   ```bash
   git init
   git add .
   git commit -m "Unreal Productions website"
   git branch -M main
   git remote add origin https://github.com/<you>/<repo>.git
   git push -u origin main
   ```

2. **Create the Netlify site.** Netlify → *Add new site* → *Import an existing project* → pick
   the repo.

3. **Build settings** — `netlify.toml` already sets these; leave the UI fields blank:

   | Setting | Value |
   |---|---|
   | Build command | *(empty)* |
   | Publish directory | `.` |
   | Functions directory | `netlify/functions` |

4. **Add the environment variables** (see below) under
   *Site settings → Environment variables*.

5. **Redeploy** after adding the variables — functions only pick up env changes on a new deploy.

6. **Custom domain** — *Domain management → Add a domain*. Netlify provisions HTTPS
   automatically. Then update `siteUrl` in `js/config.js` and the `og:*` / canonical URLs in the
   three HTML files.

`netlify.toml` also sets security headers (CSP, `X-Frame-Options`, `Referrer-Policy`), asset
caching, and `/privacy` + `/terms` redirects to the `.html` files.

---

## 3. Environment variables

Copy `.env.example` → `.env` for local use. Set the same keys in the Netlify UI for production.
**Never commit `.env`** — `.gitignore` already excludes it.

### Required

| Variable | What it is |
|---|---|
| `GHL_TOKEN` | GoHighLevel Private Integration token (scopes: `contacts.write`, `contacts.readonly`) |
| `GHL_LOCATION_ID` | Your GHL location / sub-account ID |

### Optional — custom field IDs

Each is skipped if unset, so the form works before you create the fields.

| Variable | Suggested GHL field type |
|---|---|
| `GHL_CF_EVENT_DATE` | Date |
| `GHL_CF_EVENT_TYPE` | Dropdown or Text |
| `GHL_CF_EVENT_DETAILS` | Multi-line text |
| `GHL_CF_SMS_TRANSACTIONAL` | Text — stores `"true"` / `"false"` |
| `GHL_CF_SMS_MARKETING` | Text — stores `"true"` / `"false"` |
| `GHL_CF_CONSENT_TIMESTAMP` | Text — stores an ISO-8601 timestamp |

`GHL_TOKEN` is read **only** inside the serverless function and is never sent to the browser.

---

## 4. GoHighLevel setup

1. **Token** — GHL → *Settings → Private Integrations → Create new*. Grant `contacts.write`
   and `contacts.readonly`. Copy the token into `GHL_TOKEN`.
2. **Location ID** — *Settings → Business Profile*. Copy into `GHL_LOCATION_ID`.
3. **Custom fields** — *Settings → Custom Fields*. Create the six fields above, copy each ID
   into the matching `GHL_CF_*` variable.
4. **Redeploy.**

### What gets sent

The function calls `POST https://services.leadconnectorhq.com/contacts/upsert` with name,
email, phone (normalised to E.164), the custom fields, and:

- **Tags** — `website-booking-enquiry`, `event-type-<type>`, plus one tag per consent recording
  either `sms-consent-marketing` or `sms-consent-marketing-declined` (and the same for
  transactional), so consent state is filterable in GHL without opening each contact.
- **`dndSettings.SMS`** — set to `active` (do not text) when no consent was given, `inactive`
  when it was.

Upstream errors are logged server-side and returned to the browser as a generic message —
GHL error details are never echoed to the client.

---

## 5. Changing business details (one place)

All business identity lives in **`js/config.js`**:

```js
export const BUSINESS = {
  name: "Unreal Productions",
  legalName: "Unreal Productions LLC",
  address: { street: "…", city: "…", state: "NV", postalCode: "", country: "USA" },
  phone: "(207) 458-3115",
  phoneE164: "+12074583115",
  email: "unrealvegas@gmail.com",
  social: { youtube: "#", instagram: "#", facebook: "#", tiktok: "#" },
};
```

After editing, run:

```bash
node scripts/sync-business-info.mjs
```

This rewrites the matching static text in all three HTML files, so the details are correct in
the **raw HTML** — important because A2P reviewers may read the page without executing
JavaScript. `config.js` also applies the values at runtime as a safety net.

```bash
node scripts/sync-business-info.mjs --check   # verify only; exits 1 if stale (CI-safe)
```

> The script warns while `postalCode` is empty. The reference site showed no ZIP, but carrier
> review generally expects a complete postal address — **fill this in before submitting.**

---

## 6. Swapping images, videos and copy

### Images

Everything lives in `assets/images/` with descriptive filenames. Replace a file with one of the
same name and the site picks it up — no code change. Keep roughly the same aspect ratio.

| File | Used for | Current size |
|---|---|---|
| `unreal-logo.png` | Header, hero, footer | 2000×1333 |
| `hero-bg.jpg` | Hero background | 1920×1080 |
| `hero-video-thumbnail.jpg` | Torn-frame show-reel still | 1920×1080 |
| `hidden-chamber-logo.png` | Hidden Chamber mark | 1400×1080 |
| `hidden-chamber-venue.jpg` | Hidden Chamber background | 1920×1080 |
| `btn-on-tour.png`, `btn-residencies.png` | Art-deco buttons | 900×241 |
| `ghost-stories-card.jpg` + 3 more `*-card.jpg` | Show grid portraits | ~1100×1600 |
| `ghost-stories-bg.jpg` + 3 more `*-bg.jpg` | Feature backgrounds | 1920×1105 |
| `the-team-logo.png` | "THE TEAM" heading | 1800×522 |
| `team-*.jpg` | Four headshots | 900×966 |
| `favicon.svg`, `apple-touch-icon.png` | **Placeholders — replace** | — |

The originals are untouched in `Images/`. They were re-encoded into `assets/images/`
(32 MB → 3.3 MB, 91 % smaller) — the biggest was a 15 MB JPEG. If you drop in new originals,
re-optimise before committing.

### Videos

Play buttons currently carry `data-video="TODO_YOUTUBE_ID"` and open a styled
*"Video coming soon"* panel rather than a broken embed. To wire one up, put the YouTube ID
(the part after `v=`) in the attribute:

```html
<button class="play-btn" data-video="dQw4w9WgXcQ" data-video-title="Ghost Stories — trailer">
```

There are **5** of them: hero, Ghost Stories, Psychic Vampire, Magic Show and Mindreader.
Embeds use `youtube-nocookie.com` and are torn down on close so audio stops.

For self-hosted video instead, drop files in `assets/video/` and swap the `<iframe>` for a
`<video>` in `initLightbox()` in `js/main.js`.

### Copy

Placeholder and uncertain copy is marked in the HTML:

- `<!-- TODO: replace copy -->` — invented placeholder, must be rewritten.
- `<!-- TODO: review -->` — read off the reference screenshot; confirm it is current.

Text in `[square brackets with italics]` is reconstructed from parts of the screenshot that
were cropped or illegible — see the checklist below.

---

## 6a. Typography

Body and UI type comes from Google Fonts (Oswald, Playfair Display, Barlow). Each show title
is set in its **own self-hosted face**, served from `assets/fonts/` and preloaded in the
`<head>`:

| Show | Font file | CSS token |
|---|---|---|
| Ghost Stories | `enigma.woff2` | `--f-ghost` |
| The Psychic Vampire | `benguiat-bold-condensed.woff2` | `--f-vampire` |
| The Mindreader | `cloudsters.woff2` | `--f-mind` |

All three are WOFF2 with full A–Z / a–z coverage, declared `font-display: swap`, and each
token falls back to a stock face of similar proportion so the layout holds if a file fails to
load. Sizes are tuned per font in `css/layout.css` (`.feature__title--ghost` etc.) because
their cap heights differ significantly at the same `font-size`. The same three faces are
used on the matching show cards (`.show-card__title--ghost` etc.).

> **Licensing:** these are commercial typefaces supplied by you. Confirm you hold a webfont
> licence for each before going live — self-hosting a font redistributes it publicly.

---

## 7. A2P 10DLC compliance notes

Implemented and verified:

| Requirement | Where |
|---|---|
| Consistent business name everywhere | `js/config.js` + sync script |
| Physical address, phone, email visible | Footer + contact section, all 3 pages |
| Two **separate**, **optional**, **unchecked** consent boxes | Booking form |
| Form submits with neither box ticked | Verified by test |
| Both consents sent as explicit `true`/`false` + ISO timestamp | `lead.mjs` |
| "Consent is not a condition of purchase" + working legal links | Directly below the checkboxes |
| Verbatim mobile-information statement | `privacy-policy.html` § 4 |
| SMS Terms: programme name, message types, frequency varies, rates, STOP, HELP, carrier liability, privacy link | `terms.html` § 6 |
| Footer SMS disclosure | All 3 pages |

**The verbatim statement in the privacy policy must not be reworded:**

> No mobile information will be shared with third parties or affiliates for marketing or
> promotional purposes. All the above categories exclude text messaging originator opt-in data
> and consent; this information will not be shared with any third parties.

### Before you submit for registration

- [ ] **Add the ZIP code** to `BUSINESS.address.postalCode`.
- [ ] **Consider a branded email domain.** `unrealvegas@gmail.com` is a free consumer address;
      reviewers sometimes flag these for business registration. A `@unrealproductions.co`
      address is safer.
- [ ] **Check the phone number.** `(207)` is a **Maine** area code on a Las Vegas business.
      Confirm it is correct and reachable — reviewers do call.
- [ ] Have both legal pages reviewed by counsel (every `TODO: review` marker).
- [ ] Make sure the live site is publicly reachable at the URL you submit.

---

## 8. Animations

CSS-driven, `IntersectionObserver` for triggers, no animation library.

| Effect | Where |
|---|---|
| Logo flickers in like a stage lamp | `logo-strike` keyframes |
| Tagline / subline / media / CTA rise in, staggered | `rise-in` |
| Drifting smoke behind the hero | `.smoke__layer` × 3 |
| Scroll reveals with 70 ms stagger | `[data-reveal]` + `--reveal-i` |
| Show row drifts left forever; drag with a mouse, swipe on touch | `.show-marquee` + `initShowMarquee()` |
| Show card: lift + gold glow + image zoom + diagonal sheen | `.show-card:hover` / `.is-touched` |
| Parallax on section backgrounds | `[data-parallax]`, rAF-throttled |
| Pulsing rings on play buttons | `ring-pulse`, two offset rings |
| Spotlight sweep across the Hidden Chamber logo | `.chamber__sweep` |
| Team cards grayscale → colour | `.team-card__img` |
| Gold shimmer sweep on buttons | `.btn::after` |

House rules the motion layer follows:

- `transform` / `opacity` / `filter` only — never `width`, `height`, `top` or `left`.
- No `transition: all`; no `ease-in` on entrances; no `scale(0)` (starts at `0.96`).
- UI feedback stays under 300 ms; only decorative motion runs longer.
- Hover motion is gated behind `@media (hover: hover) and (pointer: fine)` so a tap on a touch
  screen cannot strand an element mid-animation. Keyboard focus gets the same states.
- The show row is a **native horizontal scroller**, not a CSS transform, so touch swipe,
  momentum and trackpad panning work without extra code; mouse drag is layered on top. Its
  children are duplicated and `scrollLeft` wraps at the halfway point, so it never reaches an
  end stop in either direction. Auto-advance pauses by *reason* (hover / focus / touch / wheel),
  so one input releasing the row cannot cancel a pause another still holds.
- **`prefers-reduced-motion`**: smoke, sweep, flicker and parallax are removed outright;
  reveals degrade to a plain opacity fade. There is deliberately **no** blanket
  `* { transition-duration: 0.01ms !important }` — that would also flatten the considered
  fades, and reduced motion means *gentler*, not *none*.
- With JS disabled, `html:not(.js-reveal)` keeps every element at full opacity, so the page is
  fully readable.

---

## 9. Accessibility

- Semantic landmarks, skip link, exactly one `<h1>` per page, no heading-level skips.
- All text meets **WCAG AA** on the near-black background — measured, not assumed:
  body `16.06:1`, secondary `8.07:1`, muted `5.03:1`, gold `8.89:1`.
  `--c-red` is `3.95:1` and is marked **large text only** in `tokens.css`.
- Lightbox: focus moves in on open, is trapped while open, Escape closes, focus returns to the
  button that opened it, and the embed is destroyed on close.
- Form: every control labelled, `aria-invalid` on failure, an error summary that is focused on
  failed submit with links to each bad field, and a polite live region for the result.
- Mobile nav: `aria-expanded`, Escape to close, click-outside to dismiss, scroll lock.
- Gold focus rings on every interactive element; images lazy-loaded below the fold with
  explicit `width`/`height` to avoid layout shift.

---

## 10. TODO checklist

Every placeholder, grouped. Search the codebase for `TODO` to find them.

### Must do before launch

- [ ] `js/config.js` — **ZIP code** (`postalCode` is empty)
- [ ] `js/config.js` — real social URLs (all four are `#`)
- [ ] `js/config.js` — `siteUrl` if the domain differs
- [ ] `assets/images/favicon.svg` — placeholder gold "U"
- [ ] `assets/images/apple-touch-icon.png` — placeholder
- [ ] `assets/images/og-card.jpg` — **does not exist yet**; needs a 1200×630 share image
- [ ] `index.html` — 5 × `data-video="TODO_YOUTUBE_ID"`
- [ ] Netlify env vars: `GHL_TOKEN`, `GHL_LOCATION_ID`

### Copy to replace (invented placeholder)

- [ ] `index.html` — The Magic Show card subtitle
- [ ] `index.html` — The Magic Show section subtitle
- [ ] `index.html` — **On Tour** section body (no dates were legible)
- [ ] `index.html` — **Residencies** section body
- [ ] `index.html` — Contact section intro

### Copy to verify (read off the reference screenshot)

- [ ] Ticket price `$69 USD + fees`, `90 mins`, `Saturday to Wednesday`, `18+` — repeated
      across **5** sections; confirm all are current
- [ ] The Magic Show paragraph — left edge was cropped out of the screenshot; bracketed text
      is reconstructed
- [ ] The Mindreader paragraph — right edge was cropped out; bracketed text is reconstructed
- [ ] Footer brand description

### Legal (needs your or counsel's review)

- [ ] `privacy-policy.html` — effective date, cookies/analytics section, retention periods
- [ ] `terms.html` — effective date, ticketing/refunds, age limits, disclaimers, liability,
      governing law (currently Nevada / Clark County)

### Assets not supplied

- [ ] A display face for **The Magic Show** — the other three shows each have their own
      self-hosted font; Magic Show still uses Oswald

---

## 11. Project structure

```
.
├── index.html                     Main page
├── privacy-policy.html            Privacy Policy (SMS section + verbatim statement)
├── terms.html                     Terms & Conditions (SMS programme terms)
├── netlify.toml                   Build config, security headers, redirects
├── .env.example                   Environment variable template
├── .gitignore
├── css/
│   ├── tokens.css                 All colours, fonts, spacing, motion — edit here first
│   ├── base.css                   Reset, typography, buttons, focus
│   ├── layout.css                 Header, hero, sections, form, footer, lightbox
│   └── animations.css             Motion layer + reduced-motion handling
├── js/
│   ├── config.js                  BUSINESS constants (single source of truth)
│   ├── main.js                    Nav, reveals, parallax, lightbox, scroll-spy
│   ├── form.js                    Validation, consent capture, submission
│   └── legal.js                   Header + nav only, for the legal pages
├── netlify/functions/
│   └── lead.mjs                   Booking form → GoHighLevel
├── scripts/
│   └── sync-business-info.mjs     Propagates config.js into the static HTML
├── assets/
│   ├── fonts/                     Self-hosted display faces (see below)
│   ├── images/                    Optimised site images
│   └── video/                     (empty — for self-hosted video)
└── Images/                        Original unoptimised assets (gitignored)
```

### Where to change what

| I want to… | Edit |
|---|---|
| Change a colour, font or spacing | `css/tokens.css` |
| Change a show's title font | `--f-ghost` / `--f-vampire` / `--f-mind` in `css/tokens.css` |
| Change the business name / phone / address | `js/config.js`, then run the sync script |
| Change a show's colour tint | `--tint-*` in `css/tokens.css` |
| Add a video | `data-video` on the relevant `.play-btn` in `index.html` |
| Change form fields | `index.html`, `js/form.js` (`RULES`), `netlify/functions/lead.mjs` |
| Tune an animation | `css/animations.css` |
| Swap an image | Drop a same-named file into `assets/images/` |
