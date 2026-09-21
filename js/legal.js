/* ==========================================================================
   Legal pages — header, nav and business-detail injection only.
   No reveals, parallax, lightbox or form on these pages.
   ========================================================================== */

import { applyBusinessInfo } from "./config.js";

function initHeader() {
  const header = document.querySelector(".site-header");
  if (!header || !("IntersectionObserver" in window)) return;

  const sentinel = document.createElement("div");
  sentinel.setAttribute("aria-hidden", "true");
  sentinel.style.cssText = "position:absolute;top:0;height:1px;width:1px;pointer-events:none";
  document.body.prepend(sentinel);

  new IntersectionObserver(
    ([entry]) => header.classList.toggle("is-stuck", !entry.isIntersecting),
    { threshold: 0 }
  ).observe(sentinel);
}

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

  nav.addEventListener("click", (e) => {
    if (e.target.closest("a") && mq.matches) setOpen(false);
  });

  document.addEventListener("keydown", (e) => {
    if (e.key === "Escape" && toggle.getAttribute("aria-expanded") === "true") {
      setOpen(false);
      toggle.focus();
    }
  });

  document.addEventListener("click", (e) => {
    if (!mq.matches) return;
    if (toggle.getAttribute("aria-expanded") !== "true") return;
    if (e.target.closest(".nav") || e.target.closest(".nav-toggle")) return;
    setOpen(false);
  });

  mq.addEventListener("change", (e) => {
    if (!e.matches) setOpen(false);
  });
}

function init() {
  applyBusinessInfo();
  initHeader();
  initNav();
}

if (document.readyState === "loading") {
  document.addEventListener("DOMContentLoaded", init, { once: true });
} else {
  init();
}
