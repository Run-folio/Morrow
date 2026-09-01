import assert from "node:assert/strict";
import test from "node:test";

import { resolveOptionalAffiliateConfiguration, validateOptionalAffiliateUrl, warnOptionalAffiliateConfiguration } from "../lib/easyt/affiliate-configuration.ts";

test("unset optional partners remain disabled and quiet", () => {
  const configuration = resolveOptionalAffiliateConfiguration({
    CAR_HIRE_AFFILIATE_ENABLED: "false",
    SAILY_AFFILIATE_ENABLED: "false",
    GROUND_TRANSPORT_AFFILIATE_ENABLED: "false",
  });
  assert.deepEqual(configuration.urls, {});
  assert.deepEqual(configuration.warnings, []);
});

test("an explicitly enabled partner with no URL emits a safe configuration warning", () => {
  const configuration = resolveOptionalAffiliateConfiguration({ CAR_HIRE_AFFILIATE_ENABLED: "true" });
  const messages: string[] = [];
  warnOptionalAffiliateConfiguration(configuration, (message) => messages.push(message));
  assert.deepEqual(configuration.urls, {});
  assert.deepEqual(configuration.warnings, [{ partner: "car_hire", configKey: "CAR_HIRE_AFFILIATE_URL", enabledKey: "CAR_HIRE_AFFILIATE_ENABLED", reason: "missing" }]);
  assert.deepEqual(messages, ["[Morrovia config] Optional partner \"car_hire\" is enabled or configured but its URL is missing or invalid. The partner action remains disabled."]);
});

test("an empty value stays quiet when disabled and fails closed when enabled", () => {
  assert.deepEqual(resolveOptionalAffiliateConfiguration({
    SAILY_AFFILIATE_URL: "",
    SAILY_AFFILIATE_ENABLED: "false",
  }), { urls: {}, warnings: [] });
  assert.deepEqual(resolveOptionalAffiliateConfiguration({
    SAILY_AFFILIATE_URL: "",
    SAILY_AFFILIATE_ENABLED: "true",
  }).warnings, [{ partner: "saily", configKey: "SAILY_AFFILIATE_URL", enabledKey: "SAILY_AFFILIATE_ENABLED", reason: "missing" }]);
});

test("malformed, whitespace, and non-HTTP partner URLs are rejected without logging their values", () => {
  const configuration = resolveOptionalAffiliateConfiguration({
    CAR_HIRE_AFFILIATE_URL: " javascript:alert(1)",
    SAILY_AFFILIATE_URL: "data:text/html,not-a-link",
    GROUND_TRANSPORT_AFFILIATE_URL: "https://partner.example/has whitespace",
  });
  const messages: string[] = [];
  warnOptionalAffiliateConfiguration(configuration, (message) => messages.push(message));
  assert.deepEqual(configuration.urls, {});
  assert.deepEqual(configuration.warnings.map((warning) => warning.reason), ["invalid", "invalid", "invalid"]);
  assert.equal(messages.join(" ").includes("javascript:"), false);
  assert.equal(messages.join(" ").includes("data:text"), false);
  assert.equal(messages.every((message) => message.startsWith("[Morrovia config] Optional partner")), true);
  assert.equal(messages.every((message) => message.endsWith("The partner action remains disabled.")), true);
});

test("absolute HTTP(S) is required and unsafe or malformed schemes fail closed", () => {
  for (const value of [
    "not a URL",
    "/relative/partner",
    "javascript:alert(1)",
    "data:text/html,partner",
    "ftp://partner.example/path",
    "https://user:password@partner.example/path",
  ]) assert.equal(validateOptionalAffiliateUrl(value), undefined, value);
});

test("valid HTTP(S) URLs preserve existing query parameters", () => {
  assert.equal(validateOptionalAffiliateUrl("http://partner.example/stays?campaign=approved"), "http://partner.example/stays?campaign=approved");
  assert.equal(validateOptionalAffiliateUrl("https://partner.example/car?ref=approved"), "https://partner.example/car?ref=approved");
  const configuration = resolveOptionalAffiliateConfiguration({
    CAR_HIRE_AFFILIATE_URL: "http://partner.example/car?ref=approved",
    SAILY_AFFILIATE_URL: "https://partner.example/esim?campaign=approved",
  });
  assert.equal(configuration.urls.carHireUrl, "http://partner.example/car?ref=approved");
  assert.equal(configuration.urls.sailyUrl, "https://partner.example/esim?campaign=approved");
  assert.deepEqual(configuration.warnings, []);
  const attributed = "https://partner.example/path?utm_source=morrovia&aff_id=123&encoded=a%2Fb#offer";
  assert.equal(validateOptionalAffiliateUrl(attributed), attributed);
});

test("warning text never exposes configured hosts, paths, query values, or credentials", () => {
  const sensitive = "javascript:https://private.partner.example/offer?token=do-not-log";
  const configuration = resolveOptionalAffiliateConfiguration({ CAR_HIRE_AFFILIATE_URL: sensitive });
  const messages: string[] = [];
  warnOptionalAffiliateConfiguration(configuration, (message) => messages.push(message));
  assert.equal(messages.length, 1);
  assert.doesNotMatch(messages[0], /private\.partner|offer|token|do-not-log|javascript|CAR_HIRE_AFFILIATE_URL/);
});
