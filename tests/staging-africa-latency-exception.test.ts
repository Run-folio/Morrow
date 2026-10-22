import assert from 'node:assert/strict';
import test from 'node:test';
import * as latency from './helpers/staging-africa-latency.ts';

// Replaces the former branch exception with the approved performance reporting contract.
test('multi-area acceptance exposes a fixed target and bounded completion', () => {
  assert.equal(typeof latency.createAcceptancePerformanceReport, 'function');
  assert.equal(latency.ACCEPTANCE_TARGET_MS, 2500);
  assert.equal(latency.ACCEPTANCE_COMPLETION_TIMEOUT_MS, 15000);
});
for (const area of ['South Korea', 'Africa']) for (const [width, type] of [[1440, 'return_to_start'], [390, 'one_way']] as const) {
  for (const elapsedMs of [0, 2499.9, 2500, 3171.7, 6869.5]) test(`${area} ${width}px reports ${elapsedMs}ms without completing functional checks`, () => {
    assert.equal(typeof latency.createAcceptancePerformanceReport, 'function');
    const report = latency.createAcceptancePerformanceReport(area, width, type, elapsedMs, elapsedMs + 20);
    assert.deepEqual(report, { area, scope: 'multi-area-discovery-acceptance', width, type, elapsedMs, driverMs: elapsedMs + 20,
      thresholdMs: 2500, thresholdPassed: elapsedMs < 2500, functionalTimeoutMs: 15000, functionalStatus: 'pending' });
  });
}
for (const elapsedMs of [NaN, Infinity, -Infinity, -1, 15000]) test(`invalid or uncompleted elapsed time ${elapsedMs} fails closed`, () => {
  assert.equal(typeof latency.createAcceptancePerformanceReport, 'function');
  assert.throws(() => latency.createAcceptancePerformanceReport('Africa', 390, 'one_way', elapsedMs, 5000), /Invalid acceptance timing/);
});
for (const [area, width, type] of [['Japan', 390, 'one_way'], ['Africa', 430, 'one_way'], ['South Korea', 390, 'return_to_start']] as const) {
  test(`unreviewed report context ${area} ${width}px ${type} fails closed`, () => {
    assert.equal(typeof latency.createAcceptancePerformanceReport, 'function');
    assert.throws(() => latency.createAcceptancePerformanceReport(area, width, type, 3000, 3020), /Invalid acceptance context/);
  });
}
