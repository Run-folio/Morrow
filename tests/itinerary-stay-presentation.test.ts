import assert from "node:assert/strict";
import test from "node:test";
import { itineraryStayPresentation } from "../lib/easyt/itinerary-stay-presentation.ts";

test("a stay is booked only when canonical confirmation evidence exists", () => {
  const presentation = itineraryStayPresentation({
    state: "booked",
    destination: "Cusco",
    stopId: "cusco",
    booking: { id: "stay-cusco", type: "stay", title: "Casa Andina", date: "2026-09-22", confirmation: "ABC123", url: null },
  });

  assert.deepEqual(presentation, {
    state: "booked",
    title: "Casa Andina",
    detail: "Booked · Cusco",
  });
});

test("a saved stay without confirmation is selected but not booked", () => {
  const presentation = itineraryStayPresentation({
    state: "booked",
    destination: "Cusco",
    stopId: "cusco",
    booking: { id: "stay-cusco", type: "stay", title: "Casa Andina", date: "2026-09-22", confirmation: null, url: null },
  });

  assert.deepEqual(presentation, {
    state: "selected",
    title: "Casa Andina",
    detail: "Selected · not booked",
  });
});

test("missing accommodation is shown only for a real overnight requirement", () => {
  assert.deepEqual(itineraryStayPresentation({
    state: "not-organised",
    destination: "Cusco",
    stopId: "cusco",
    booking: null,
  }), {
    state: "missing",
    title: "Cusco",
    detail: "No stay organised",
  });

  assert.equal(itineraryStayPresentation({
    state: "no-overnight",
    destination: null,
    stopId: null,
    booking: null,
  }), null);
});
