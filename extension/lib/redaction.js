/**
 * Visual Activity Agent — PII Redaction Module
 *
 * This module ensures sensitive data NEVER leaves the browser.
 * Redaction happens at the source, before any data is batched or transmitted.
 *
 * What is redacted:
 * 1. Password fields (input[type=password]) — value is never read
 * 2. Credit card fields (autocomplete=cc-*) — value is never read
 * 3. SSN patterns (NNN-NN-NNNN) in any captured text
 * 4. Credit card number patterns (13-19 digit sequences)
 * 5. Email addresses in captured metadata
 * 6. Fields with sensitive autocomplete attributes
 *
 * Design principle: We don't read and then redact — we NEVER READ
 * sensitive field values in the first place.
 */

// =============================================================================
// Sensitive Field Detection
// =============================================================================

/**
 * List of autocomplete attribute values that indicate sensitive fields.
 * Values from these fields are NEVER read.
 */
const SENSITIVE_AUTOCOMPLETE = [
  "cc-name",
  "cc-given-name",
  "cc-additional-name",
  "cc-family-name",
  "cc-number",
  "cc-exp",
  "cc-exp-month",
  "cc-exp-year",
  "cc-csc",
  "cc-type",
  "new-password",
  "current-password",
];

/**
 * List of input type attributes that indicate sensitive fields.
 */
const SENSITIVE_INPUT_TYPES = ["password"];

/**
 * Name/id patterns (case-insensitive) that suggest sensitive fields.
 */
const SENSITIVE_NAME_PATTERNS = [
  /pass(word)?/i,
  /\bpin\b/i,
  /ssn/i,
  /social.?sec/i,
  /credit.?card/i,
  /card.?num/i,
  /\bcvv\b/i,
  /\bcvc\b/i,
  /\bcsc\b/i,
  /secret/i,
  /token/i,
];

// =============================================================================
// PII Pattern Matching (for text that was already captured)
// =============================================================================

/**
 * Regex patterns for PII that should be redacted from any captured text.
 * These are defense-in-depth — the primary defense is never reading
 * sensitive field values at all.
 */
const PII_PATTERNS = [
  {
    name: "ssn",
    // SSN: 3 digits, dash/space, 2 digits, dash/space, 4 digits
    pattern: /\b\d{3}[-\s]?\d{2}[-\s]?\d{4}\b/g,
    replacement: "[SSN REDACTED]",
  },
  {
    name: "credit_card",
    // Credit card: 13-19 digits, optionally separated by spaces or dashes
    pattern: /\b(?:\d[-\s]?){13,19}\b/g,
    replacement: "[CARD REDACTED]",
  },
  {
    name: "email",
    // Email addresses
    pattern: /\b[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Z|a-z]{2,}\b/g,
    replacement: "[EMAIL REDACTED]",
  },
];

// =============================================================================
// Core Redaction Functions
// =============================================================================

/**
 * Check if a DOM element is a sensitive field whose value should never be read.
 *
 * @param {Element} element - The DOM element to check
 * @returns {boolean} True if the element is a sensitive field
 */
export function isSensitiveField(element) {
  if (!element || !element.tagName) return false;

  const tagName = element.tagName.toLowerCase();

  // Check input type
  if (tagName === "input") {
    const inputType = (element.getAttribute("type") || "text").toLowerCase();
    if (SENSITIVE_INPUT_TYPES.includes(inputType)) {
      return true;
    }
  }

  // Check autocomplete attribute
  const autocomplete = (element.getAttribute("autocomplete") || "").toLowerCase();
  if (SENSITIVE_AUTOCOMPLETE.some((val) => autocomplete.includes(val))) {
    return true;
  }

  // Check name/id patterns
  const name = (element.getAttribute("name") || "").toLowerCase();
  const id = (element.getAttribute("id") || "").toLowerCase();
  const ariaLabel = (element.getAttribute("aria-label") || "").toLowerCase();

  const textToCheck = `${name} ${id} ${ariaLabel}`;
  if (SENSITIVE_NAME_PATTERNS.some((pattern) => pattern.test(textToCheck))) {
    return true;
  }

  return false;
}

/**
 * Redact PII patterns from a string.
 * This is a defense-in-depth measure — the primary defense is never
 * capturing sensitive values in the first place.
 *
 * @param {string} text - The text to redact
 * @returns {string} Text with PII patterns replaced
 */
export function redactPII(text) {
  if (!text || typeof text !== "string") return text;

  let result = text;
  for (const { pattern, replacement } of PII_PATTERNS) {
    // Reset regex lastIndex since we use /g flag
    pattern.lastIndex = 0;
    result = result.replace(pattern, replacement);
  }
  return result;
}

/**
 * Build safe metadata about a DOM element for event capture.
 * NEVER reads the .value property of sensitive fields.
 *
 * @param {Element} element - The DOM element
 * @returns {object} Safe metadata about the element
 */
export function getSafeElementInfo(element) {
  if (!element || !element.tagName) {
    return { tag: "unknown" };
  }

  const info = {
    tag: element.tagName.toLowerCase(),
    role: element.getAttribute("role") || null,
    ariaLabel: element.getAttribute("aria-label") || null,
    type: element.getAttribute("type") || null,
    id: element.id || null,
    className: element.className
      ? String(element.className).substring(0, 100)
      : null,
  };

  // Flag if the element is sensitive (but don't read its value)
  if (isSensitiveField(element)) {
    info.sensitive = true;
    info.value = "[REDACTED]";
    return info;
  }

  // For non-sensitive elements, we still DON'T capture text content
  // by default — only structural metadata
  // Exception: we can capture href for links (but redact PII from it)
  if (info.tag === "a") {
    info.href = redactPII(element.getAttribute("href") || "");
  }

  return info;
}

/**
 * Redact PII from a URL string.
 *
 * @param {string} url - The URL to redact
 * @returns {string} URL with PII patterns removed from query params
 */
export function redactURL(url) {
  if (!url || typeof url !== "string") return url;

  try {
    const parsed = new URL(url);

    // Redact sensitive query parameter values
    const sensitiveParams = [
      "email", "password", "pass", "token", "secret",
      "ssn", "cc", "card", "cvv", "key", "auth",
    ];

    for (const [key] of parsed.searchParams) {
      if (sensitiveParams.some((p) => key.toLowerCase().includes(p))) {
        parsed.searchParams.set(key, "[REDACTED]");
      }
    }

    return parsed.toString();
  } catch {
    // If URL parsing fails, apply text-level redaction
    return redactPII(url);
  }
}
