export type NightAllocationBand = { minimum: number; maximum: number };

export type NightAllocationExpectation = {
  fixtureId: string;
  rationale: string;
  /** Human-reviewed defensible bands. They are benchmark evidence, never production lookup data. */
  goodBands: Record<string, NightAllocationBand>;
  /** Optional guard against one destination absorbing the route indefinitely. */
  maximumSpread?: number;
  /** The accepted pre-v2 result, retained only for before/after calibration. */
  previousAllocations: Record<string, number>;
};

const expectation = (
  fixtureId: string,
  rationale: string,
  goodBands: Record<string, NightAllocationBand>,
  previousAllocations: Record<string, number>,
  maximumSpread?: number,
): NightAllocationExpectation => ({ fixtureId, rationale, goodBands, previousAllocations, maximumSpread });

/**
 * Human calibration for the same route corpus. Bands deliberately admit more
 * than one defensible answer; a one-night miss is acceptable-but-suboptimal.
 */
export const NIGHT_ALLOCATION_EXPECTATIONS: readonly NightAllocationExpectation[] = [
  expectation("japan-excellent-entered-order", "Tokyo and Kyoto should deepen before smaller regional stops, while Takayama remains compact.", { tokyo: { minimum: 4, maximum: 5 }, kanazawa: { minimum: 2, maximum: 3 }, kyoto: { minimum: 4, maximum: 5 }, hiroshima: { minimum: 2, maximum: 3 }, takayama: { minimum: 2, maximum: 2 } }, { tokyo: 5, kanazawa: 2, takayama: 2, kyoto: 5, hiroshima: 2, osaka: 2 }, 3),
  expectation("japan-deliberate-backtracking", "The route-order correction must not erase the stronger Tokyo and Kyoto stays.", { tokyo: { minimum: 4, maximum: 4 }, kyoto: { minimum: 4, maximum: 4 }, takayama: { minimum: 2, maximum: 2 }, kanazawa: { minimum: 2, maximum: 2 } }, { tokyo: 4, takayama: 2, kanazawa: 2, kyoto: 4, hiroshima: 2, osaka: 2 }, 2),
  expectation("southern-spain-linear", "Seville can productively absorb the spare nights; the other bases remain viable two-night stays.", { madrid: { minimum: 2, maximum: 2 }, seville: { minimum: 4, maximum: 5 }, granada: { minimum: 2, maximum: 2 }, cordoba: { minimum: 2, maximum: 2 }, malaga: { minimum: 2, maximum: 2 } }, { madrid: 3, granada: 2, cordoba: 2, seville: 4, malaga: 2 }, 3),
  expectation("southern-spain-very-short", "One-night transit/visit stops are unavoidable; the strongest anchor receives the only spare night.", { madrid: { minimum: 1, maximum: 1 }, cordoba: { minimum: 1, maximum: 1 }, seville: { minimum: 2, maximum: 2 }, granada: { minimum: 1, maximum: 1 }, malaga: { minimum: 1, maximum: 1 } }, { madrid: 1, cordoba: 1, seville: 2, granada: 1, malaga: 1 }, 1),
  expectation("portugal-fixed-algarve-gateway", "Lisbon is the deep anchor; the gateway and visit-oriented stops should not be inflated to match it.", { porto: { minimum: 2, maximum: 3 }, lisbon: { minimum: 4, maximum: 5 }, algarve: { minimum: 2, maximum: 3 }, sintra: { minimum: 1, maximum: 2 } }, { porto: 2, "douro-valley": 2, coimbra: 2, lisbon: 5, sintra: 2, algarve: 2 }, 3),
  expectation("portugal-long-fixed-order", "A long trip may deepen Lisbon, but bounded returns must continue spreading nights across every retained base.", { porto: { minimum: 5, maximum: 7 }, "douro-valley": { minimum: 5, maximum: 7 }, coimbra: { minimum: 5, maximum: 7 }, lisbon: { minimum: 7, maximum: 10 }, sintra: { minimum: 5, maximum: 7 }, algarve: { minimum: 5, maximum: 7 } }, { porto: 6, "douro-valley": 7, coimbra: 7, lisbon: 8, sintra: 7, algarve: 6 }, 4),
  expectation("andes-cross-border-linear", "Sparse destination-depth evidence makes a near-even result defensible; long transfers justify the small variation.", { lima: { minimum: 3, maximum: 4 }, huacachina: { minimum: 3, maximum: 4 }, cusco: { minimum: 3, maximum: 4 }, "sacred-valley": { minimum: 3, maximum: 4 }, "lake-titicaca": { minimum: 3, maximum: 4 }, "la-paz": { minimum: 3, maximum: 4 }, uyuni: { minimum: 3, maximum: 4 } }, { lima: 4, huacachina: 4, cusco: 4, "sacred-valley": 4, "lake-titicaca": 3, "la-paz": 3, uyuni: 3 }, 1),
  expectation("andes-deliberate-backtracking", "Unknown place depth remains neutral; the route correction should not manufacture an extreme stay split.", { lima: { minimum: 3, maximum: 4 }, huacachina: { minimum: 3, maximum: 4 }, "sacred-valley": { minimum: 3, maximum: 4 }, cusco: { minimum: 3, maximum: 4 }, "lake-titicaca": { minimum: 3, maximum: 4 }, "la-paz": { minimum: 3, maximum: 4 }, uyuni: { minimum: 3, maximum: 4 } }, { lima: 4, huacachina: 4, "sacred-valley": 3, cusco: 3, "lake-titicaca": 3, "la-paz": 3, uyuni: 3 }, 1),
  expectation("maya-cross-border-island", "With sparse comparative depth evidence, an even three-night split is a valid neutral recommendation.", { cancun: { minimum: 3, maximum: 3 }, tulum: { minimum: 3, maximum: 3 }, "caye-caulker": { minimum: 3, maximum: 3 }, flores: { minimum: 3, maximum: 3 }, "lake-atitlan": { minimum: 3, maximum: 3 }, antigua: { minimum: 3, maximum: 3 } }, { cancun: 3, tulum: 3, "caye-caulker": 3, flores: 3, "lake-atitlan": 3, antigua: 3 }, 0),
  expectation("maya-fixed-antigua-backtracking", "The fixed endpoint remains viable while the other unknown-depth stops stay neutral.", { cancun: { minimum: 3, maximum: 3 }, tulum: { minimum: 3, maximum: 3 }, "caye-caulker": { minimum: 3, maximum: 3 }, flores: { minimum: 3, maximum: 3 }, "lake-atitlan": { minimum: 3, maximum: 3 }, antigua: { minimum: 2, maximum: 2 } }, { cancun: 3, tulum: 3, "caye-caulker": 3, flores: 3, "lake-atitlan": 3, antigua: 2 }, 1),
  expectation("italy-excellent-entered-order", "Curated Rome, Florence and Bologna depth should outrank the smaller unknown bases without creating churn.", { rome: { minimum: 4, maximum: 4 }, florence: { minimum: 3, maximum: 4 }, bologna: { minimum: 3, maximum: 3 }, venice: { minimum: 2, maximum: 3 }, milan: { minimum: 2, maximum: 3 } }, { rome: 4, florence: 3, bologna: 3, venice: 2, milan: 2 }, 2),
  expectation("italy-very-short-anchors", "The only defensible compressed answer protects Rome and leaves the remaining retained stops visibly short.", { rome: { minimum: 3, maximum: 3 }, florence: { minimum: 1, maximum: 1 }, bologna: { minimum: 1, maximum: 1 }, venice: { minimum: 1, maximum: 1 }, milan: { minimum: 1, maximum: 1 } }, { rome: 3, florence: 1, bologna: 1, venice: 1, milan: 1 }, 2),
  expectation("balkans-adriatic-flow", "Sparse comparative stay evidence supports a near-even result with the fixed final gateway one night shorter.", { ljubljana: { minimum: 3, maximum: 3 }, zagreb: { minimum: 3, maximum: 3 }, split: { minimum: 3, maximum: 3 }, sarajevo: { minimum: 3, maximum: 3 }, mostar: { minimum: 3, maximum: 3 }, dubrovnik: { minimum: 2, maximum: 2 } }, { ljubljana: 3, zagreb: 3, split: 3, sarajevo: 3, mostar: 3, dubrovnik: 2 }, 1),
  expectation("balkans-deliberate-reversal", "Route correction may change transfer tax, but it should retain viable two- and three-night stays.", { ljubljana: { minimum: 3, maximum: 3 }, zagreb: { minimum: 3, maximum: 3 }, sarajevo: { minimum: 3, maximum: 3 }, mostar: { minimum: 3, maximum: 3 }, split: { minimum: 2, maximum: 3 }, dubrovnik: { minimum: 2, maximum: 2 } }, { ljubljana: 3, zagreb: 3, sarajevo: 3, mostar: 3, split: 2, dubrovnik: 2 }, 1),
  expectation("thailand-island-flight-transition", "The two city anchors may take the spare night; island/coast stays must remain viable after the flight transition.", { bangkok: { minimum: 3, maximum: 4 }, "chiang-mai": { minimum: 3, maximum: 4 }, krabi: { minimum: 3, maximum: 3 }, "koh-lanta": { minimum: 3, maximum: 3 } }, { bangkok: 3, "chiang-mai": 4, krabi: 3, "koh-lanta": 3 }, 1),
  expectation("vietnam-north-south-correction", "Curated Hanoi and Hoi An depth should survive the route correction; compact Hue and Ninh Bình remain two-night stays.", { hanoi: { minimum: 4, maximum: 4 }, "ninh-binh": { minimum: 2, maximum: 2 }, "hoi-an": { minimum: 3, maximum: 4 }, hue: { minimum: 2, maximum: 2 }, "ho-chi-minh-city": { minimum: 3, maximum: 3 } }, { hanoi: 4, "ninh-binh": 2, "hoi-an": 3, hue: 2, "ho-chi-minh-city": 3 }, 2),
  expectation("vietnam-excellent-slow-route", "A long relaxed trip can deepen the curated anchors while bounded returns keep every base meaningful.", { hanoi: { minimum: 5, maximum: 7 }, "ninh-binh": { minimum: 4, maximum: 5 }, hue: { minimum: 4, maximum: 5 }, "hoi-an": { minimum: 5, maximum: 6 }, "ho-chi-minh-city": { minimum: 5, maximum: 6 } }, { hanoi: 6, "ninh-binh": 5, hue: 5, "hoi-an": 5, "ho-chi-minh-city": 6 }, 3),
  expectation("morocco-north-to-atlantic", "Unknown comparative depth supports a neutral split; the final coast stop may be one night shorter.", { casablanca: { minimum: 3, maximum: 3 }, rabat: { minimum: 3, maximum: 3 }, chefchaouen: { minimum: 3, maximum: 3 }, fes: { minimum: 3, maximum: 3 }, marrakech: { minimum: 3, maximum: 3 }, essaouira: { minimum: 2, maximum: 2 } }, { casablanca: 3, rabat: 3, chefchaouen: 3, fes: 3, marrakech: 3, essaouira: 2 }, 1),
  expectation("us-southwest-road-arc", "Road-trip transfer burden supports compact two- and three-night bases rather than deepening one park indefinitely.", { "las-vegas": { minimum: 2, maximum: 3 }, zion: { minimum: 2, maximum: 3 }, "bryce-canyon": { minimum: 2, maximum: 3 }, page: { minimum: 2, maximum: 3 }, "grand-canyon": { minimum: 2, maximum: 3 }, sedona: { minimum: 2, maximum: 3 } }, { "las-vegas": 3, zion: 3, "bryce-canyon": 2, page: 2, "grand-canyon": 2, sedona: 2 }, 1),
  expectation("scotland-highlands-to-inverness", "Edinburgh and Glencoe may take three nights while Skye and the fixed departure gateway remain viable at two.", { edinburgh: { minimum: 3, maximum: 3 }, glencoe: { minimum: 3, maximum: 3 }, "isle-of-skye": { minimum: 2, maximum: 2 }, inverness: { minimum: 2, maximum: 2 } }, { edinburgh: 3, glencoe: 3, "isle-of-skye": 2, inverness: 2 }, 1),
];

const byFixtureId = new Map(NIGHT_ALLOCATION_EXPECTATIONS.map((item) => [item.fixtureId, item]));

export function nightAllocationExpectationFor(fixtureId: string) {
  return byFixtureId.get(fixtureId);
}

export function classifyNightAllocation(
  expectation: NightAllocationExpectation,
  allocations: Readonly<Record<string, number>>,
) {
  const reasons: string[] = [];
  let misses = 0;
  for (const [stopId, band] of Object.entries(expectation.goodBands)) {
    const nights = allocations[stopId];
    if (nights === undefined) {
      reasons.push(`${stopId} is missing from the allocation.`);
      misses += 2;
      continue;
    }
    if (nights < band.minimum || nights > band.maximum) {
      const distance = nights < band.minimum ? band.minimum - nights : nights - band.maximum;
      misses += distance;
      reasons.push(`${stopId} has ${nights} nights; the reviewed band is ${band.minimum}–${band.maximum}.`);
    }
  }
  if (expectation.maximumSpread !== undefined) {
    const values = Object.values(allocations);
    const spread = values.length ? Math.max(...values) - Math.min(...values) : 0;
    if (spread > expectation.maximumSpread) {
      misses += spread - expectation.maximumSpread;
      reasons.push(`The ${spread}-night spread exceeds the reviewed ${expectation.maximumSpread}-night bound.`);
    }
  }
  if (!reasons.length) reasons.push(expectation.rationale);
  return {
    quality: misses === 0 ? "GOOD" as const : misses <= 1 ? "ACCEPTABLE BUT SUBOPTIMAL" as const : "CLEARLY POOR" as const,
    reasons,
  };
}
