/* ==========================================================================
   Booking form
   --------------------------------------------------------------------------
   A2P 10DLC note: the two SMS consent checkboxes are OPTIONAL. Nothing in
   this file may ever block submission on them. They are read and forwarded
   as explicit booleans (never omitted), because the carrier record needs to
   show what the user actually chose, including "no".
   ========================================================================== */

const ENDPOINT = "/.netlify/functions/lead";

/* Deliberately permissive. Client-side validation is a convenience, not a
   gate — the function re-validates. Rejecting unusual but valid addresses
   costs real enquiries. */
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;

const RULES = {
  firstName: {
    label: "First name",
    validate: (v) => (v.trim().length >= 2 ? null : "Please enter your first name."),
  },
  lastName: {
    label: "Last name",
    validate: (v) => (v.trim().length >= 2 ? null : "Please enter your last name."),
  },
  email: {
    label: "Email",
    validate: (v) =>
      !v.trim()
        ? "Please enter your email address."
        : EMAIL_RE.test(v.trim())
        ? null
        : "Please enter a valid email address, for example name@example.com.",
  },
  phone: {
    label: "Phone",
    validate: (v) => {
      const digits = v.replace(/\D/g, "");
      if (!digits) return "Please enter a phone number.";
      // 7 (local) to 15 (E.164 max) digits.
      if (digits.length < 7 || digits.length > 15)
        return "Please enter a valid phone number including area code.";
      return null;
    },
  },
  eventDate: {
    label: "Event date",
    // Optional, but if supplied it must not be in the past.
    validate: (v) => {
      if (!v) return null;
      const picked = new Date(`${v}T00:00:00`);
      if (Number.isNaN(picked.getTime())) return "Please enter a valid date.";
      const today = new Date();
      today.setHours(0, 0, 0, 0);
      return picked < today ? "Please choose a date in the future." : null;
    },
  },
  eventType: {
    label: "Event type",
    validate: (v) => (v ? null : "Please choose an event type."),
  },
  eventDetails: {
    label: "Event details",
    validate: (v) =>
      v.trim().length >= 10
        ? null
        : "Please tell us a little more about your event (at least 10 characters).",
  },
};

export function initBookingForm() {
  const form = document.getElementById("booking-form");
  if (!form) return;

  const statusEl = document.getElementById("form-status");
  const summaryEl = document.getElementById("form-errors");
  const summaryList = summaryEl?.querySelector("ul");
  const submitBtn = document.getElementById("booking-submit");

  const fieldOf = (name) => form.elements[name];
  const wrapperOf = (input) => input?.closest(".field");

  /* ---- Error display ---------------------------------------------------- */

  function showError(name, message) {
    const input = fieldOf(name);
    const wrapper = wrapperOf(input);
    const errorEl = document.getElementById(`${name}-error`);
    if (!input || !wrapper || !errorEl) return;

    wrapper.classList.add("has-error");
    errorEl.textContent = message;
    input.setAttribute("aria-invalid", "true");
  }

  function clearError(name) {
    const input = fieldOf(name);
    const wrapper = wrapperOf(input);
    const errorEl = document.getElementById(`${name}-error`);
    if (!input || !wrapper || !errorEl) return;

    wrapper.classList.remove("has-error");
    errorEl.textContent = "";
    input.removeAttribute("aria-invalid");
  }

  function clearAllErrors() {
    Object.keys(RULES).forEach(clearError);
    summaryEl?.classList.remove("is-visible");
    if (summaryList) summaryList.innerHTML = "";
  }

  function setStatus(message, kind) {
    if (!statusEl) return;
    statusEl.textContent = message;
    statusEl.classList.remove("is-success", "is-error");
    if (kind) statusEl.classList.add(`is-${kind}`);
  }

  /* ---- Validation ------------------------------------------------------- */

  function validate() {
    const errors = [];
    Object.entries(RULES).forEach(([name, rule]) => {
      const input = fieldOf(name);
      if (!input) return;
      const message = rule.validate(input.value);
      if (message) {
        errors.push({ name, label: rule.label, message });
        showError(name, message);
      } else {
        clearError(name);
      }
    });
    return errors;
  }

  // Re-validate a field once it has been blurred, so the user gets
  // confirmation as they fix things — but never before first submit.
  let submitted = false;
  Object.keys(RULES).forEach((name) => {
    const input = fieldOf(name);
    if (!input) return;
    input.addEventListener("blur", () => {
      if (!submitted) return;
      const message = RULES[name].validate(input.value);
      message ? showError(name, message) : clearError(name);
    });
    input.addEventListener("input", () => {
      if (submitted && wrapperOf(input)?.classList.contains("has-error")) {
        const message = RULES[name].validate(input.value);
        if (!message) clearError(name);
      }
    });
  });

  /* ---- Submit ----------------------------------------------------------- */

  form.addEventListener("submit", async (event) => {
    event.preventDefault();
    submitted = true;
    setStatus("", null);

    const errors = validate();

    if (errors.length) {
      // Build a summary of links to each bad field.
      if (summaryEl && summaryList) {
        summaryList.innerHTML = "";
        errors.forEach(({ name, label, message }) => {
          const li = document.createElement("li");
          const a = document.createElement("a");
          a.href = `#${name}`;
          a.textContent = `${label}: ${message}`;
          a.addEventListener("click", (e) => {
            e.preventDefault();
            fieldOf(name)?.focus();
          });
          li.appendChild(a);
          summaryList.appendChild(li);
        });
        summaryEl.classList.add("is-visible");
        summaryEl.focus();
      } else {
        fieldOf(errors[0].name)?.focus();
      }
      return;
    }

    clearAllErrors();

    // Silently succeed for bots that filled the honeypot.
    if (form.elements.company?.value) {
      setStatus("Thanks — your enquiry has been sent.", "success");
      form.reset();
      return;
    }

    const payload = {
      firstName: fieldOf("firstName").value.trim(),
      lastName: fieldOf("lastName").value.trim(),
      email: fieldOf("email").value.trim(),
      phone: fieldOf("phone").value.trim(),
      eventDate: fieldOf("eventDate").value || "",
      eventType: fieldOf("eventType").value,
      eventDetails: fieldOf("eventDetails").value.trim(),

      // Always explicit booleans — never omitted, whatever the user chose.
      smsTransactionalConsent: Boolean(fieldOf("smsTransactional")?.checked),
      smsMarketingConsent: Boolean(fieldOf("smsMarketing")?.checked),
      consentTimestamp: new Date().toISOString(),

      // Provenance for the consent record.
      pageUrl: window.location.href,
    };

    submitBtn?.setAttribute("aria-busy", "true");
    const originalLabel = submitBtn?.textContent;
    if (submitBtn) submitBtn.textContent = "Sending…";

    try {
      const response = await fetch(ENDPOINT, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });

      if (!response.ok) {
        let detail = "";
        try {
          const body = await response.json();
          detail = body?.message || "";
        } catch {
          /* response had no JSON body */
        }
        throw new Error(detail || `Request failed (${response.status})`);
      }

      setStatus(
        "Thank you — your enquiry has been sent. We'll be in touch shortly.",
        "success"
      );
      form.reset();
      submitted = false;
      clearAllErrors();
      statusEl?.focus?.();
    } catch (error) {
      console.error("[booking-form]", error);
      setStatus(
        "Sorry — we couldn't send your enquiry. Please try again, or email us directly.",
        "error"
      );
    } finally {
      submitBtn?.removeAttribute("aria-busy");
      if (submitBtn && originalLabel) submitBtn.textContent = originalLabel;
    }
  });
}
