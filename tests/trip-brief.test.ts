import assert from "node:assert/strict";
import test from "node:test";
import { parseTripBrief } from "../lib/easyt/trip-brief.ts";

type Expected = { brief: string; origin?: string; stops: string[]; regions?: string[]; durationDays?: number; routeHints?: string[] };

// Add anonymised production misses here before fixing them, so location capture
// gains coverage permanently rather than relying on one-off manual checks.
const cases: Expected[] = [
  { brief: "3 weeks from London through south east asia: Bangkok, Chiang Mai and Ankor Wat.", origin: "London", stops: ["Bangkok", "Chiang Mai", "Angkor Wat"], regions: ["Southeast Asia"], durationDays: 21 },
  { brief: "Flying from London to Tokyo for three weeks in Japan, with Kyoto and the Japanese Alps. I want north and south too.", origin: "London", stops: ["Tokyo", "Kyoto"], regions: ["Japanese Alps"], durationDays: 21, routeHints: ["north-japan", "south-japan"] },
  { brief: "Two weeks in Japan this October — Tokyo, Kyoto and time in the Japanese Alps.", stops: ["Tokyo", "Kyoto"], regions: ["Japanese Alps"], durationDays: 14 },
  { brief: "10 days from Paris to Rome and Venice", origin: "Paris", stops: ["Rome", "Venice"], durationDays: 10 },
  { brief: "Una semana desde Madrid para Barcelona y Lisboa", origin: "Madrid", stops: ["Barcelona", "Lisbon"], durationDays: 7 },
  { brief: "Dos semanas por Asia sudoriental: Bangkok, Chiang Mai y Angkor Wat", stops: ["Bangkok", "Chiang Mai", "Angkor Wat"], regions: ["Southeast Asia"], durationDays: 14 },
  { brief: "Leaving from LHR for Tokyo marathon, Kanazawa then Kyoto", origin: "London", stops: ["Tokyo", "Kanazawa", "Kyoto"] },
  { brief: "Fly from Hong Kong to Hanoi, then finish in Ho Chi Minh City", origin: "Hong Kong", stops: ["Hanoi", "Ho Chi Minh City"] },
  { brief: "A week in Tokyo", stops: ["Tokyo"], durationDays: 7 },
  { brief: "One week in Kyoto and Osaka", stops: ["Kyoto", "Osaka"], durationDays: 7 },
  { brief: "Two weeks from London to Tokyo and Kyoto", origin: "London", stops: ["Tokyo", "Kyoto"], durationDays: 14 },
  { brief: "3 days from Tokyo to Kanazawa", origin: "Tokyo", stops: ["Kanazawa"], durationDays: 3 },
  { brief: "4 days from Osaka to Hiroshima", origin: "Osaka", stops: ["Hiroshima"], durationDays: 4 },
  { brief: "Five days in Taipei and Tainan", stops: ["Taipei", "Tainan"], durationDays: 5 },
  { brief: "7 days from Hong Kong to Chengdu and Zhangjiajie", origin: "Hong Kong", stops: ["Chengdu", "Zhangjiajie"], durationDays: 7 },
  { brief: "A week from Beijing to Shanghai", origin: "Beijing", stops: ["Shanghai"], durationDays: 7 },
  { brief: "12 days in Hanoi, Siem Reap and Bangkok", stops: ["Hanoi", "Siem Reap", "Bangkok"], durationDays: 12 },
  { brief: "9 days from BKK to Luang Prabang", origin: "Bangkok", stops: ["Luang Prabang"], durationDays: 9 },
  { brief: "Two weeks in Lima, Cusco and Machu Picchu", stops: ["Lima", "Cusco", "Machu Picchu"], durationDays: 14 },
  { brief: "10 days from Quito to La Paz", origin: "Quito", stops: ["La Paz"], durationDays: 10 },
  { brief: "A week in Medellin and Bogota", stops: ["Medellín", "Bogotá"], durationDays: 7 },
  { brief: "2 weeks from Santiago to Buenos Aires", origin: "Santiago", stops: ["Buenos Aires"], durationDays: 14 },
  { brief: "6 days in Lisbon and Porto", stops: ["Lisbon", "Porto"], durationDays: 6 },
  { brief: "5 days from Barcelona to Madrid", origin: "Barcelona", stops: ["Madrid"], durationDays: 5 },
  { brief: "A week in Rome, Venice and Milan", stops: ["Rome", "Venice", "Milan"], durationDays: 7 },
  { brief: "Four days from Paris to Istanbul", origin: "Paris", stops: ["Istanbul"], durationDays: 4 },
  { brief: "8 days from Marrakech to Cape Town", origin: "Marrakech", stops: ["Cape Town"], durationDays: 8 },
  { brief: "One week in Reykjavik", stops: ["Reykjavík"], durationDays: 7 },
  { brief: "10 days from Nairobi to Kilimanjaro", origin: "Nairobi", stops: ["Moshi"], durationDays: 10 },
  { brief: "Two weeks from Kathmandu to Everest Base Camp", origin: "Kathmandu", stops: [], durationDays: 14 },
  { brief: "5 days from Agra to Jaipur", origin: "Agra", stops: [], durationDays: 5 },
  { brief: "Desde Londres, dos semanas por Japón: Tokio, Kioto y Osaka", origin: "London", stops: ["Tokyo", "Kyoto", "Osaka"], durationDays: 14 },
  { brief: "Una semana de Tokio a Kanazawa", stops: ["Tokyo", "Kanazawa"], durationDays: 7 },
  { brief: "Tres semanas desde Madrid por el sudeste asiático", origin: "Madrid", stops: [], regions: ["Southeast Asia"], durationDays: 21 },
  { brief: "10 días en Roma y Venecia", stops: ["Rome", "Venice"], durationDays: 10 },
  { brief: "Dos semanas desde París hasta Estambul", origin: "Paris", stops: ["Istanbul"], durationDays: 14 },
  { brief: "Una semana en Lisboa, Oporto y Barcelona", stops: ["Lisbon", "Porto", "Barcelona"], durationDays: 7 },
  { brief: "3 semanas desde Londres a BKK, Chiang Mai y ankor", origin: "London", stops: ["Bangkok", "Chiang Mai", "Angkor Wat"], durationDays: 21 },
  { brief: "From LHR to HND then KIX", origin: "London", stops: ["Tokyo", "Osaka"] },
  { brief: "From CDG to FCO and VCE", origin: "Paris", stops: ["Rome", "Venice"] },
  { brief: "From SCL through EZE", origin: "Santiago", stops: ["Buenos Aires"] },
  { brief: "From RAK to CPT", origin: "Marrakech", stops: ["Cape Town"] },
  { brief: "From NBO to JRO", origin: "Nairobi", stops: ["Moshi"] },
  { brief: "From LIM to CUZ", origin: "Lima", stops: ["Cusco"] },
  { brief: "From UIO to LPB", origin: "Quito", stops: ["La Paz"] },
  { brief: "From BCN to LIS", origin: "Barcelona", stops: ["Lisbon"] },
  { brief: "From HKG to SGN", origin: "Hong Kong", stops: ["Ho Chi Minh City"] },
  { brief: "Tokyo marathon and Kyoto", stops: ["Tokyo", "Kyoto"] },
  { brief: "Great Wall, Beijing and Xi'an", stops: ["Beijing", "Xi'an"] },
  { brief: "Sagrada Familia then Barcelona", stops: ["Barcelona"] },
  { brief: "Machu Picchu with Lima and Cusco", stops: ["Machu Picchu", "Lima", "Cusco"] },
];

for (const expected of cases) {
  test(expected.brief, () => {
    const actual = parseTripBrief(expected.brief);
    assert.equal(actual.origin, expected.origin);
    assert.deepEqual(actual.stops, expected.stops);
    assert.deepEqual(actual.regions, expected.regions ?? []);
    assert.equal(actual.durationDays, expected.durationDays);
    assert.deepEqual(actual.routeHints, expected.routeHints ?? []);
  });
}
