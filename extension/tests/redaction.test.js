/**
 * Visual Activity Agent — Redaction Unit Tests
 *
 * These tests PROVE that sensitive data is never captured.
 * They are the single most important test file in the project.
 */

import { describe, it, expect } from "vitest";
import {
  isSensitiveField,
  redactPII,
  getSafeElementInfo,
  redactURL,
} from "../lib/redaction.js";

// =============================================================================
// Helper: Create a mock DOM element
// =============================================================================

function mockElement(tagName, attrs = {}) {
  return {
    tagName: tagName.toUpperCase(),
    id: attrs.id || "",
    className: attrs.className || "",
    getAttribute(name) {
      return attrs[name] || null;
    },
    get value() {
      return attrs._value || "";
    },
  };
}

// =============================================================================
// isSensitiveField()
// =============================================================================

describe("isSensitiveField", () => {
  it("detects input[type=password]", () => {
    const el = mockElement("input", { type: "password" });
    expect(isSensitiveField(el)).toBe(true);
  });

  it("detects autocomplete=cc-number", () => {
    const el = mockElement("input", { autocomplete: "cc-number" });
    expect(isSensitiveField(el)).toBe(true);
  });

  it("detects autocomplete=cc-csc", () => {
    const el = mockElement("input", { autocomplete: "cc-csc" });
    expect(isSensitiveField(el)).toBe(true);
  });

  it("detects autocomplete=cc-exp", () => {
    const el = mockElement("input", { autocomplete: "cc-exp" });
    expect(isSensitiveField(el)).toBe(true);
  });

  it("detects autocomplete=cc-name", () => {
    const el = mockElement("input", { autocomplete: "cc-name" });
    expect(isSensitiveField(el)).toBe(true);
  });

  it("detects autocomplete=current-password", () => {
    const el = mockElement("input", { autocomplete: "current-password" });
    expect(isSensitiveField(el)).toBe(true);
  });

  it("detects autocomplete=new-password", () => {
    const el = mockElement("input", { autocomplete: "new-password" });
    expect(isSensitiveField(el)).toBe(true);
  });

  it("detects name containing 'password'", () => {
    const el = mockElement("input", { name: "user_password" });
    expect(isSensitiveField(el)).toBe(true);
  });

  it("detects name containing 'ssn'", () => {
    const el = mockElement("input", { name: "ssn_field" });
    expect(isSensitiveField(el)).toBe(true);
  });

  it("detects id containing 'creditCard'", () => {
    const el = mockElement("input", { id: "creditCardNumber" });
    expect(isSensitiveField(el)).toBe(true);
  });

  it("detects id containing 'cvv'", () => {
    const el = mockElement("input", { id: "cvv" });
    expect(isSensitiveField(el)).toBe(true);
  });

  it("detects id containing 'cvc'", () => {
    const el = mockElement("input", { id: "card-cvc" });
    expect(isSensitiveField(el)).toBe(true);
  });

  it("detects aria-label with 'social security'", () => {
    const el = mockElement("input", { "aria-label": "Social Security Number" });
    expect(isSensitiveField(el)).toBe(true);
  });

  it("detects name with 'secret'", () => {
    const el = mockElement("input", { name: "api_secret" });
    expect(isSensitiveField(el)).toBe(true);
  });

  it("detects name with 'token'", () => {
    const el = mockElement("input", { name: "auth_token" });
    expect(isSensitiveField(el)).toBe(true);
  });

  it("does NOT flag regular text input", () => {
    const el = mockElement("input", { type: "text", name: "username" });
    expect(isSensitiveField(el)).toBe(false);
  });

  it("does NOT flag regular button", () => {
    const el = mockElement("button", { type: "submit" });
    expect(isSensitiveField(el)).toBe(false);
  });

  it("does NOT flag regular div", () => {
    const el = mockElement("div", { id: "main-content" });
    expect(isSensitiveField(el)).toBe(false);
  });

  it("does NOT flag search input", () => {
    const el = mockElement("input", { type: "search", name: "q" });
    expect(isSensitiveField(el)).toBe(false);
  });

  it("returns false for null element", () => {
    expect(isSensitiveField(null)).toBe(false);
  });

  it("returns false for element without tagName", () => {
    expect(isSensitiveField({})).toBe(false);
  });
});

// =============================================================================
// redactPII()
// =============================================================================

describe("redactPII", () => {
  it("redacts SSN patterns (XXX-XX-XXXX)", () => {
    expect(redactPII("SSN: 123-45-6789")).toBe("SSN: [SSN REDACTED]");
  });

  it("redacts SSN without dashes", () => {
    expect(redactPII("SSN: 123456789")).toBe("SSN: [SSN REDACTED]");
  });

  it("redacts SSN with spaces", () => {
    expect(redactPII("SSN: 123 45 6789")).toBe("SSN: [SSN REDACTED]");
  });

  it("redacts credit card numbers (16 digits)", () => {
    expect(redactPII("Card: 4111111111111111")).toBe("Card: [CARD REDACTED]");
  });

  it("redacts credit card numbers with dashes", () => {
    expect(redactPII("Card: 4111-1111-1111-1111")).toBe(
      "Card: [CARD REDACTED]"
    );
  });

  it("redacts credit card numbers with spaces", () => {
    expect(redactPII("Card: 4111 1111 1111 1111")).toBe(
      "Card: [CARD REDACTED]"
    );
  });

  it("redacts email addresses", () => {
    expect(redactPII("Contact: user@example.com")).toBe(
      "Contact: [EMAIL REDACTED]"
    );
  });

  it("redacts multiple PII instances", () => {
    const input = "SSN: 123-45-6789, Email: test@test.com";
    const result = redactPII(input);
    expect(result).toContain("[SSN REDACTED]");
    expect(result).toContain("[EMAIL REDACTED]");
    expect(result).not.toContain("123-45-6789");
    expect(result).not.toContain("test@test.com");
  });

  it("does not alter text without PII", () => {
    const text = "This is a normal sentence about browsing.";
    expect(redactPII(text)).toBe(text);
  });

  it("handles null input", () => {
    expect(redactPII(null)).toBe(null);
  });

  it("handles undefined input", () => {
    expect(redactPII(undefined)).toBe(undefined);
  });

  it("handles empty string", () => {
    expect(redactPII("")).toBe("");
  });
});

// =============================================================================
// getSafeElementInfo()
// =============================================================================

describe("getSafeElementInfo", () => {
  it("NEVER returns the value of a password field", () => {
    const el = mockElement("input", { type: "password", _value: "MySecret123!" });
    const info = getSafeElementInfo(el);
    expect(info.value).toBe("[REDACTED]");
    expect(info.sensitive).toBe(true);
    expect(JSON.stringify(info)).not.toContain("MySecret123!");
  });

  it("NEVER returns the value of a cc-number field", () => {
    const el = mockElement("input", {
      autocomplete: "cc-number",
      _value: "4111111111111111",
    });
    const info = getSafeElementInfo(el);
    expect(info.value).toBe("[REDACTED]");
    expect(info.sensitive).toBe(true);
    expect(JSON.stringify(info)).not.toContain("4111111111111111");
  });

  it("NEVER returns the value of a cvv field", () => {
    const el = mockElement("input", { id: "cvv", _value: "123" });
    const info = getSafeElementInfo(el);
    expect(info.value).toBe("[REDACTED]");
    expect(info.sensitive).toBe(true);
    expect(JSON.stringify(info)).not.toContain('"123"');
  });

  it("returns safe metadata for regular elements", () => {
    const el = mockElement("button", {
      role: "button",
      "aria-label": "Submit form",
      id: "submit-btn",
      className: "btn primary",
    });
    const info = getSafeElementInfo(el);
    expect(info.tag).toBe("button");
    expect(info.role).toBe("button");
    expect(info.ariaLabel).toBe("Submit form");
    expect(info.id).toBe("submit-btn");
    expect(info.sensitive).toBeUndefined();
  });

  it("redacts PII in link href", () => {
    const el = mockElement("a", { href: "https://example.com?email=user@test.com" });
    const info = getSafeElementInfo(el);
    expect(info.href).not.toContain("user@test.com");
    expect(info.href).toContain("[EMAIL REDACTED]");
  });

  it("handles null element", () => {
    const info = getSafeElementInfo(null);
    expect(info.tag).toBe("unknown");
  });
});

// =============================================================================
// redactURL()
// =============================================================================

describe("redactURL", () => {
  it("redacts email query parameters", () => {
    const url = "https://example.com/page?email=user@test.com&name=John";
    const result = redactURL(url);
    expect(result).toContain("email=%5BREDACTED%5D");
    expect(result).not.toContain("user@test.com");
  });

  it("redacts password query parameters", () => {
    const url = "https://example.com/login?password=secret123";
    const result = redactURL(url);
    expect(result).toContain("password=%5BREDACTED%5D");
    expect(result).not.toContain("secret123");
  });

  it("redacts token query parameters", () => {
    const url = "https://example.com/api?token=abc123secret";
    const result = redactURL(url);
    expect(result).toContain("token=%5BREDACTED%5D");
    expect(result).not.toContain("abc123secret");
  });

  it("preserves non-sensitive query parameters", () => {
    const url = "https://example.com/search?q=test&page=1";
    const result = redactURL(url);
    expect(result).toContain("q=test");
    expect(result).toContain("page=1");
  });

  it("handles URLs without query params", () => {
    const url = "https://example.com/page";
    expect(redactURL(url)).toBe("https://example.com/page");
  });

  it("handles null URL", () => {
    expect(redactURL(null)).toBe(null);
  });

  it("handles empty URL", () => {
    expect(redactURL("")).toBe("");
  });

  it("handles malformed URLs gracefully", () => {
    const result = redactURL("not-a-url with user@example.com");
    expect(result).not.toContain("user@example.com");
    expect(result).toContain("[EMAIL REDACTED]");
  });
});
