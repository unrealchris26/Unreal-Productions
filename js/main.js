/* ==========================================================================
   Unreal Productions — site behaviour
   Sticky header, mobile nav, scroll reveals, parallax, video lightbox.
   ========================================================================== */

import { applyBusinessInfo } from "./config.js";
import { initBookingForm } from "./form.js";

const prefersReducedMotion = window.matchMedia("(prefers-reduced-motion: reduce)");

/* ==========================================================================
   Sticky header
   ========================================================================== */

function initHeader() {
  const header = document.querySelector(".site-header");
  if (!header) return;

  // A zero-height sentinel at the top of the page. When it scrolls out of
  // view the header is "stuck". Cheaper and smoother than a scroll listener.
  const sentinel = document.createElement("div");
  sentinel.setAttribute("aria-hidden", "true");
  sentinel.style.cssText = "position:absolute;top:0;height:1px;width:1px;pointer-events:none";
  document.body.prepend(sentinel);

  if (!("IntersectionObserver" in window)) return;

  new IntersectionObserver(
    ([entry]) => header.classList.toggle("is-stuck", !entry.isIntersecting),
    { threshold: 0 }
  ).observe(sentinel);
}

/* ==========================================================================
   Mobile navigation
   ========================================================================== */

function initNav() {
  const toggle = document.querySelector(".nav-toggle");
  const nav = document.querySelector(".nav");
  if (!toggle || !nav) return;

  const mq = window.matchMedia("(max-width: 900px)");

  const setOpen = (open) => {
    toggle.setAttribute("aria-expanded", String(open));
    toggle.setAttribute("aria-label", open ? "Close menu" : "Open menu");
    nav.classList.toggle("is-open", open);
    document.body.classList.toggle("is-locked", open && mq.matches);
  };

  toggle.addEventListener("click", () => {
    setOpen(toggle.getAttribute("aria-expanded") !== "true");
  });

  // Close after choosing a destination.
  nav.addEventListener("click", (e) => {
    if (e.target.closest("a") && mq.matches) setOpen(false);
  });

  document.addEventListener("keydown", (e) => {
    if (e.key === "Escape" && toggle.getAttribute("aria-expanded") === "true") {
      setOpen(false);
      toggle.focus();
    }
  });

  // Click outside to dismiss.
  document.addEventListener("click", (e) => {
    if (!mq.matches) return;
    if (toggle.getAttribute("aria-expanded") !== "true") return;
    if (e.target.closest(".nav") || e.target.closest(".nav-toggle")) return;
    setOpen(false);
  });

  // Returning to desktop must clear the mobile state, or the body stays
  // scroll-locked and the nav keeps its collapsed transform.
  mq.addEventListener("change", (e) => {
    if (!e.matches) setOpen(false);
  });
}

/* ==========================================================================
   Scroll reveals
   Adds .is-visible once, then unobserves. Elements carry --reveal-i for
   stagger, which the CSS turns into a transition-delay.
   ========================================================================== */

function initReveals() {
  const items = document.querySelectorAll("[data-reveal]");
  if (!items.length) return;

  // Without IntersectionObserver, show everything immediately rather than
  // leaving the page blank.
  if (!("IntersectionObserver" in window)) {
    document.documentElement.classList.remove("js-reveal");
    return;
  }

  const observer = new IntersectionObserver(
    (entries) => {
      entries.forEach((entry) => {
        if (!entry.isIntersecting) return;
        const el = entry.target;
        el.classList.add("is-visible");
        // Release the compositor layer once the transition has finished.
        el.addEventListener(
          "transitionend",
          () => el.classList.add("reveal-done"),
          { once: true }
        );
        observer.unobserve(el);
      });
    },
    { rootMargin: "0px 0px -12% 0px", threshold: 0.08 }
  );

  items.forEach((el) => observer.observe(el));
}

/* ==========================================================================
   Parallax
   Each [data-parallax] layer translates at a fraction of scroll distance.
   Reads happen in the scroll handler, writes in a single rAF tick, so we
   never interleave layout reads and style writes.
   ========================================================================== */

function initParallax() {
  if (prefersReducedMotion.matches) return;

  const layers = Array.from(document.querySelectorAll("[data-parallax]"));
  if (!layers.length) return;

  // Skip on touch/small screens: the effect costs more than it adds, and
  // mobile address-bar resize makes it jitter.
  const mqSmall = window.matchMedia("(max-width: 860px)");

  let ticking = false;

  const update = () => {
    ticking = false;
    if (mqSmall.matches) {
      layers.forEach((el) => el.style.setProperty("--parallax-y", "0px"));
      return;
    }

    const vh = window.innerHeight;

    layers.forEach((el) => {
      // Measure against the SECTION, not the direct parent: feature
      // backgrounds are wrapped in a <picture> for the mobile art direction,
      // which would otherwise be measured instead of the section.
      const host = el.closest("section") || el.parentElement;
      if (!host) return;
      const rect = host.getBoundingClientRect();

      // Only compute for sections near the viewport.
      if (rect.bottom < -vh * 0.5 || rect.top > vh * 1.5) return;

      const speed = parseFloat(el.dataset.parallax) || 0.1;
      // Distance of the section's centre from the viewport's centre.
      const offset = rect.top + rect.height / 2 - vh / 2;
      el.style.setProperty("--parallax-y", `${(-offset * speed).toFixed(2)}px`);
    });
  };

  const onScroll = () => {
    if (ticking) return;
    ticking = true;
    requestAnimationFrame(update);
  };

  window.addEventListener("scroll", onScroll, { passive: true });
  window.addEventListener("resize", onScroll, { passive: true });

  // If the user turns reduced motion on mid-session, park every layer.
  prefersReducedMotion.addEventListener("change", (e) => {
    if (!e.matches) return;
    window.removeEventListener("scroll", onScroll);
    layers.forEach((el) => el.style.setProperty("--parallax-y", "0px"));
  });

  update();
}

/* ==========================================================================
   Video lightbox
   Keyboard accessible: focus moves in on open, is trapped while open,
   Escape closes, and focus returns to the button that opened it.
   ========================================================================== */

const FOCUSABLE =
  'a[href], button:not([disabled]), input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])';

function initLightbox() {
  const lightbox = document.getElementById("lightbox");
  const mount = document.getElementById("lightbox-mount");
  const closeBtn = document.getElementById("lightbox-close");
  const title = document.getElementById("lightbox-title");
  if (!lightbox || !mount || !closeBtn) return;

  let lastFocused = null;

  const open = (videoId, label) => {
    lastFocused = document.activeElement;

    if (title && label) title.textContent = label;

    // Placeholder IDs must not produce a broken embed.
    if (!videoId || videoId.startsWith("TODO")) {
      mount.innerHTML = `
        <div style="display:grid;place-items:center;height:100%;padding:2rem;text-align:center;color:var(--c-text-dim)">
          <div>
            <p style="color:var(--c-gold);font-weight:600;letter-spacing:.1em;text-transform:uppercase;margin-bottom:.75rem">Video coming soon</p>
            <p>TODO: add a YouTube video ID to this play button&rsquo;s <code>data-video</code> attribute.</p>
          </div>
        </div>`;
    } else {
      const iframe = document.createElement("iframe");
      iframe.src = `https://www.youtube-nocookie.com/embed/${encodeURIComponent(videoId)}?autoplay=1&rel=0`;
      iframe.title = label || "Video player";
      iframe.allow =
        "accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture; web-share";
      iframe.allowFullscreen = true;
      iframe.loading = "lazy";
      mount.replaceChildren(iframe);
    }

    lightbox.classList.add("is-open");
    document.body.classList.add("is-locked");
    closeBtn.focus();
  };

  const close = () => {
    if (!lightbox.classList.contains("is-open")) return;
    lightbox.classList.remove("is-open");
    document.body.classList.remove("is-locked");

    // Tear the embed down only after the fade-out, so the panel does not
    // go blank mid-transition. Stops audio either way.
    const teardown = () => mount.replaceChildren();
    if (prefersReducedMotion.matches) {
      teardown();
    } else {
      lightbox.addEventListener("transitionend", teardown, { once: true });
      setTimeout(teardown, 500); // fallback if transitionend never fires
    }

    if (lastFocused && document.contains(lastFocused)) lastFocused.focus();
  };

  document.querySelectorAll("[data-video]").forEach((btn) => {
    btn.addEventListener("click", () =>
      open(btn.dataset.video, btn.dataset.videoTitle)
    );
  });

  closeBtn.addEventListener("click", close);

  // Click the backdrop (but not the panel) to dismiss.
  lightbox.addEventListener("mousedown", (e) => {
    if (e.target === lightbox) close();
  });

  document.addEventListener("keydown", (e) => {
    if (!lightbox.classList.contains("is-open")) return;

    if (e.key === "Escape") {
      e.preventDefault();
      close();
      return;
    }

    if (e.key !== "Tab") return;

    // Focus trap.
    const focusables = Array.from(lightbox.querySelectorAll(FOCUSABLE)).filter(
      (el) => el.offsetParent !== null || el === closeBtn
    );
    if (!focusables.length) return;

    const first = focusables[0];
    const last = focusables[focusables.length - 1];

    if (e.shiftKey && document.activeElement === first) {
      e.preventDefault();
      last.focus();
    } else if (!e.shiftKey && document.activeElement === last) {
      e.preventDefault();
      first.focus();
    }
  });
}

/* ==========================================================================
   Show row
   --------------------------------------------------------------------------
   The four cards do not auto-scroll and are not duplicated. Below 900px the
   row overflows and becomes a native horizontal scroller — touch swipe and
   momentum come for free — and this adds mouse drag on top of that.
   ========================================================================== */

function initShowRow() {
  const track = document.getElementById("show-track");
  if (!track) return;

  const row = track.closest(".show-marquee");
  if (!row) return;

  /** Only offer drag when there is actually something to scroll to. */
  const canScroll = () => row.scrollWidth - row.clientWidth > 4;

  const syncAffordance = () => row.classList.toggle("is-draggable", canScroll());
  syncAffordance();
  window.addEventListener("resize", syncAffordance, { passive: true });
  if ("ResizeObserver" in window) new ResizeObserver(syncAffordance).observe(track);

  /* ---- mouse drag -------------------------------------------------------
     Touch already pans natively, so this only handles a real mouse. */
  let dragging = false;
  let startX = 0;
  let startScroll = 0;
  let moved = 0;

  row.addEventListener("pointerdown", (e) => {
    if (e.pointerType !== "mouse" || e.button !== 0 || !canScroll()) return;
    dragging = true;
    moved = 0;
    startX = e.clientX;
    startScroll = row.scrollLeft;
    row.classList.add("is-dragging");
    row.setPointerCapture(e.pointerId);
  });

  row.addEventListener("pointermove", (e) => {
    if (!dragging) return;
    const dx = e.clientX - startX;
    moved = Math.max(moved, Math.abs(dx));
    row.scrollLeft = startScroll - dx;
  });

  const endDrag = (e) => {
    if (!dragging) return;
    dragging = false;
    row.classList.remove("is-dragging");
    try {
      if (e && e.pointerId != null) row.releasePointerCapture(e.pointerId);
    } catch { /* already released */ }
  };
  row.addEventListener("pointerup", endDrag);
  row.addEventListener("pointercancel", endDrag);
  window.addEventListener("pointerup", endDrag);
  window.addEventListener("blur", () => {
    dragging = false;
    row.classList.remove("is-dragging");
  });

  // A drag that ends over a card must not also follow that card's link.
  row.addEventListener(
    "click",
    (e) => {
      if (moved > 6) {
        e.preventDefault();
        e.stopPropagation();
        moved = 0;
      }
    },
    true
  );

  /* ---- touch: play the hover treatment on tap ---------------------------- */
  let active = null;
  const clearTouched = () => {
    active?.classList.remove("is-touched");
    active = null;
  };
  track.addEventListener(
    "pointerdown",
    (e) => {
      if (e.pointerType === "mouse") return;
      const card = e.target.closest(".show-card");
      if (!card || card === active) return;
      clearTouched();
      active = card;
      card.classList.add("is-touched");
    },
    { passive: true }
  );
  document.addEventListener("pointerup", (e) => {
    if (e.pointerType === "mouse") return;
    setTimeout(clearTouched, 1200);
  }, { passive: true });
}

/* ==========================================================================
   Active nav link
   ========================================================================== */

function initScrollSpy() {
  if (!("IntersectionObserver" in window)) return;

  const links = new Map();
  document.querySelectorAll('.nav__link[href^="#"]').forEach((link) => {
    const id = link.getAttribute("href").slice(1);
    const section = document.getElementById(id);
    if (section) links.set(section, link);
  });
  if (!links.size) return;

  // Track which sections are currently in the band rather than reacting to
  // each entry in isolation. Otherwise, scrolling into a stretch of page
  // that no nav item covers (a feature section, or the very top) leaves the
  // previous link highlighted, which points the user at the wrong place.
  const active = new Set();

  const paint = () => {
    links.forEach((l) => l.removeAttribute("aria-current"));
    if (!active.size) return;
    // Highlight the topmost section currently in the band.
    const first = [...active].sort(
      (a, b) => a.getBoundingClientRect().top - b.getBoundingClientRect().top
    )[0];
    links.get(first)?.setAttribute("aria-current", "true");
  };

  const observer = new IntersectionObserver(
    (entries) => {
      entries.forEach((entry) => {
        if (entry.isIntersecting) active.add(entry.target);
        else active.delete(entry.target);
      });
      paint();
    },
    { rootMargin: "-45% 0px -50% 0px" }
  );

  links.forEach((_link, section) => observer.observe(section));
}

/* ==========================================================================
   Boot
   ========================================================================== */

function init() {
  applyBusinessInfo();
  initHeader();
  initNav();
  initReveals();
  initParallax();
  initShowRow();
  initLightbox();
  initScrollSpy();
  initBookingForm();
}

if (document.readyState === "loading") {
  document.addEventListener("DOMContentLoaded", init, { once: true });
} else {
  init();
}
