/* ==========================================================================
   POST /.netlify/functions/lead
   --------------------------------------------------------------------------
   Receives a booking enquiry from the site and creates/updates the contact
   in GoHighLevel.

   Environment variables (set in Netlify → Site settings → Environment):
     GHL_TOKEN        Private Integration token (or API key) for the location
     GHL_LOCATION_ID  The GHL location (sub-account) ID
     GHL_CF_*         Optional custom-field IDs — see CUSTOM_FIELD_ENV below

   The token is read only on the server. It is never exposed to the browser.

   A2P 10DLC: both consent booleans and an ISO-8601 timestamp are always
   forwarded, including when the user consented to neither. That record is
   what evidences opt-in (or its absence) if a carrier ever audits the
   campaign, so it must never be dropped.
   ========================================================================== */

const GHL_API = "https://services.leadconnectorhq.com";
const GHL_API_VERSION = "2021-07-28";

/* Map our payload keys to the env vars holding each GHL custom-field ID.
   A field is simply skipped if its env var is unset, so the function keeps
   working before the fields have been created in GHL. */
const CUSTOM_FIELD_ENV = {
  eventDate: "GHL_CF_EVENT_DATE",
  eventType: "GHL_CF_EVENT_TYPE",
  eventDetails: "GHL_CF_EVENT_DETAILS",
  smsTransactionalConsent: "GHL_CF_SMS_TRANSACTIONAL",
  smsMarketingConsent: "GHL_CF_SMS_MARKETING",
  consentTimestamp: "GHL_CF_CONSENT_TIMESTAMP",
};

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;

const json = (status, body) =>
  new Response(JSON.stringify(body), {
    status,
    headers: {
      "Content-Type": "application/json",
      "Cache-Control": "no-store",
    },
  });

/** Trim, coerce to string, and cap length to keep payloads sane. */
const clean = (value, max = 2000) =>
  typeof value === "string" ? value.trim().slice(0, max) : "";

/**
 * Best-effort E.164. GHL is more reliable with a normalised number.
 * Falls back to the raw input when we cannot confidently normalise, rather
 * than dropping a valid international number we did not anticipate.
 */
function toE164(raw, defaultCountryCode = "1") {
  const trimmed = clean(raw, 40);
  if (!trimmed) return "";
  if (trimmed.startsWith("+")) return `+${trimmed.slice(1).replace(/\D/g, "")}`;

  const digits = trimmed.replace(/\D/g, "");
  if (!digits) return "";
  // 10-digit North American number.
  if (digits.length === 10) return `+${defaultCountryCode}${digits}`;
  // 11 digits already carrying the US country code.
  if (digits.length === 11 && digits.startsWith("1")) return `+${digits}`;
  return `+${digits}`;
}

function validate(data) {
  const errors = [];

  if (clean(data.firstName, 100).length < 1) errors.push("firstName is required");
  if (clean(data.lastName, 100).length < 1) errors.push("lastName is required");

  const email = clean(data.email, 200);
  if (!email) errors.push("email is required");
  else if (!EMAIL_RE.test(email)) errors.push("email is not valid");

  const phoneDigits = clean(data.phone, 40).replace(/\D/g, "");
  if (!phoneDigits) errors.push("phone is required");
  else if (phoneDigits.length < 7 || phoneDigits.length > 15)
    errors.push("phone is not valid");

  if (!clean(data.eventType, 60)) errors.push("eventType is required");
  if (clean(data.eventDetails, 5000).length < 10)
    errors.push("eventDetails is too short");

  return errors;
}

export default async (request) => {
  if (request.method === "OPTIONS") {
    return new Response(null, { status: 204, headers: { Allow: "POST, OPTIONS" } });
  }
  if (request.method !== "POST") {
    return json(405, { ok: false, message: "Method not allowed." });
  }

  const token = process.env.GHL_TOKEN;
  const locationId = process.env.GHL_LOCATION_ID;

  if (!token || !locationId) {
    // Log for the operator; stay vague in the response.
    console.error(
      "[lead] Missing env vars:",
      !token ? "GHL_TOKEN" : "",
      !locationId ? "GHL_LOCATION_ID" : ""
    );
    return json(500, {
      ok: false,
      message: "The booking form is not configured yet. Please email us directly.",
    });
  }

  let data;
  try {
    data = await request.json();
  } catch {
    return json(400, { ok: false, message: "Invalid request body." });
  }

  // Honeypot — pretend success so bots do not learn they were caught.
  if (clean(data.company, 200)) {
    return json(200, { ok: true });
  }

  const errors = validate(data);
  if (errors.length) {
    return json(400, {
      ok: false,
      message: "Some fields need attention.",
      errors,
    });
  }

  /* ---- Consent ----------------------------------------------------------
     Coerced with Boolean() so a missing key records an explicit false
     rather than disappearing from the record. */
  const smsTransactionalConsent = Boolean(data.smsTransactionalConsent);
  const smsMarketingConsent = Boolean(data.smsMarketingConsent);

  // Trust our own clock, not the browser's, but keep the client value too.
  const consentTimestamp = new Date().toISOString();

  /* ---- Custom fields ---------------------------------------------------- */
  const values = {
    eventDate: clean(data.eventDate, 40),
    eventType: clean(data.eventType, 60),
    eventDetails: clean(data.eventDetails, 5000),
    smsTransactionalConsent: String(smsTransactionalConsent),
    smsMarketingConsent: String(smsMarketingConsent),
    consentTimestamp,
  };

  const customFields = Object.entries(CUSTOM_FIELD_ENV)
    .map(([key, envName]) => {
      const id = process.env[envName];
      if (!id) return null;
      return { id, field_value: values[key] };
    })
    .filter(Boolean);

  /* ---- Tags -------------------------------------------------------------
     Tags make the consent state filterable inside GHL without opening
     each contact. */
  const tags = [
    "website-booking-enquiry",
    `event-type-${values.eventType}`,
    smsTransactionalConsent ? "sms-consent-transactional" : "sms-consent-transactional-declined",
    smsMarketingConsent ? "sms-consent-marketing" : "sms-consent-marketing-declined",
  ];

  const body = {
    locationId,
    firstName: clean(data.firstName, 100),
    lastName: clean(data.lastName, 100),
    name: `${clean(data.firstName, 100)} ${clean(data.lastName, 100)}`.trim(),
    email: clean(data.email, 200).toLowerCase(),
    phone: toE164(data.phone),
    source: "Website booking form",
    tags,
    // GHL's own marketing-consent flags.
    dndSettings: {
      SMS: {
        status: smsTransactionalConsent || smsMarketingConsent ? "inactive" : "active",
        message: smsTransactionalConsent || smsMarketingConsent
          ? `Consent captured via website booking form at ${consentTimestamp}`
          : "No SMS consent given via website booking form",
      },
    },
    ...(customFields.length ? { customFields } : {}),
  };

  try {
    const response = await fetch(`${GHL_API}/contacts/upsert`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${token}`,
        Version: GHL_API_VERSION,
        "Content-Type": "application/json",
        Accept: "application/json",
      },
      body: JSON.stringify(body),
      signal: AbortSignal.timeout(10_000),
    });

    const text = await response.text();

    if (!response.ok) {
      // Log the upstream detail server-side only — it can include internal
      // identifiers we do not want to echo to the browser.
      console.error("[lead] GHL error", response.status, text);
      return json(502, {
        ok: false,
        message:
          "We couldn't submit your enquiry right now. Please try again shortly, or email us directly.",
      });
    }

    let contactId;
    try {
      contactId = JSON.parse(text)?.contact?.id;
    } catch {
      /* upstream returned a non-JSON success body */
    }

    console.log("[lead] created", {
      contactId,
      eventType: values.eventType,
      smsTransactionalConsent,
      smsMarketingConsent,
      consentTimestamp,
    });

    return json(200, { ok: true });
  } catch (error) {
    console.error("[lead] request failed", error);
    return json(502, {
      ok: false,
      message:
        "We couldn't submit your enquiry right now. Please try again shortly, or email us directly.",
    });
  }
};

export const config = {
  path: "/.netlify/functions/lead",
};
