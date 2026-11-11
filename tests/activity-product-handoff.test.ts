import assert from "node:assert/strict";
import test from "node:test";
import * as inventory from "../lib/easyt/activity-inventory.ts";

test("a Viator product handoff preserves the complete provider attribution URL", () => {
  const href = "https://www.viator.com/tours/Tokyo/tour/d334-123?pid=P00123&mcid=42383&medium=link";
  assert.equal(typeof inventory.viatorProductAction,"function");
  assert.deepEqual(inventory.viatorProductAction("viator",href), {provider:"viator",category:"activities",href,cta:"View on Viator",affiliate:true});
});

test("missing, insecure, credential-bearing and mismatched products have no Viator handoff", () => {
  assert.equal(typeof inventory.viatorProductAction,"function");
  for (const href of [undefined,"javascript:alert(1)","http://www.viator.com/tour","https://user:secret@www.viator.com/tour","https://viator.com.evil.example/tour","https://example.com/tour"]) assert.equal(inventory.viatorProductAction("viator",href),null);
  assert.equal(inventory.viatorProductAction("openstreetmap","https://www.viator.com/tour"),null);
});
