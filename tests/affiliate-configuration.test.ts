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
  assert.deepEqual(messages, ["[affiliate-config] car_hire: CAR_HIRE_AFFILIATE_URL is missing while CAR_HIRE_AFFILIATE_ENABLED is enabled; the optional partner link remains disabled."]);
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
  assert.equal(messages.every((message) => message.includes("_AFFILIATE_URL is invalid")), true);
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
});
