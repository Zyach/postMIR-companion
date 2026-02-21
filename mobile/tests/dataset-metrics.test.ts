import {
  computeOrderStats,
  computePercentile,
  getSelectedYearOrders,
  getYearlyClosures,
  formatPercent,
} from '../hooks/dataset-metrics';

function assertEqual(actual: unknown, expected: unknown, label: string) {
  if (actual !== expected) {
    throw new Error(`${label}: expected ${expected} but got ${actual}`);
  }
}

function assertNear(actual: number | null, expected: number, eps: number, label: string) {
  if (actual === null || Math.abs(actual - expected) > eps) {
    throw new Error(`${label}: expected ${expected}±${eps} but got ${actual}`);
  }
}

function assert(condition: boolean, label: string) {
  if (!condition) throw new Error(label);
}

function testComputeOrderStats() {
  const stats = computeOrderStats([1, 2, 3, 4]);
  assert(stats !== null, 'computeOrderStats returned null');
  assertEqual(stats?.min, 1, 'min');
  assertEqual(stats?.max, 4, 'max');
  assertNear(stats?.median ?? null, 2.5, 1e-9, 'median');
  assertNear(stats?.mean ?? null, 2.5, 1e-9, 'mean');
  assertEqual(stats?.count, 4, 'count');
}

function testComputePercentile() {
  const sorted = [1, 2, 3, 4];
  assertEqual(computePercentile(sorted, 0), 1, 'p0');
  assertEqual(computePercentile(sorted, 1), 4, 'p1');
  assertNear(computePercentile(sorted, 0.25), 1.75, 1e-9, 'p25');
  assertNear(computePercentile(sorted, 0.75), 3.25, 1e-9, 'p75');
}

function testGetSelectedYearOrders() {
  const row = {
    last_year: 2025,
    last_year_orders: [200, 210],
    orders_by_year: {
      '2023': [300],
      '2024': [250, 260],
      '2025': [200, 210],
    },
  };

  const single = getSelectedYearOrders(row, '2024');
  assertEqual(single.year, '2024', 'selected year');
  assertEqual(single.orders.length, 2, 'selected orders length');
  assert(single.yearAvailable, 'selected yearAvailable');

  const all = getSelectedYearOrders(row, 'Todos');
  assertEqual(all.year, 'Todos', 'all years label');
  assertEqual(all.orders.length, 3, 'all years closures length');
  assertEqual(all.orders[0], 210, 'closure 2025');
  assertEqual(all.orders[1], 260, 'closure 2024');
  assertEqual(all.orders[2], 300, 'closure 2023');
}

function testGetYearlyClosures() {
  const row = {
    last_year: 2025,
    last_year_orders: [200, 210],
    orders_by_year: {
      '2023': [300],
      '2024': [250, 260],
      '2025': [200, 210],
    },
  };

  const closures = getYearlyClosures(row);
  assertEqual(closures.length, 3, 'yearly closures length');
  assertEqual(closures[0].year, '2025', 'year 2025');
  assertEqual(closures[0].closure, 210, 'closure 2025 value');
}

function testFormatPercent() {
  assertEqual(formatPercent(0.25), '25.0%', 'formatPercent 25%');
  assertEqual(formatPercent(1.5), '100.0%', 'formatPercent clamp >1');
}

function run() {
  testComputeOrderStats();
  testComputePercentile();
  testGetSelectedYearOrders();
  testGetYearlyClosures();
  testFormatPercent();
  console.log('dataset-metrics tests: ok');
}

run();
