export type OrdersByYear = Record<string, number[]>;

export type PlaceRowMetricsInput = {
  last_year: number | null;
  last_year_orders: number[];
  orders_by_year?: OrdersByYear;
};

export const YEAR_OPTIONS = ['Todos', '2025', '2024', '2023'];

export const MIR_ORDER_TOTAL_BY_YEAR: Record<string, number> = {
  '2025': 13691,
  '2024': 11755,
  '2023': 10793,
};

export function computeOrderStats(orders: number[]): {
  min: number;
  max: number;
  median: number;
  mean: number;
  count: number;
} | null {
  if (!orders || !orders.length) return null;
  const sorted = [...orders].sort((a, b) => a - b);
  const count = sorted.length;
  const min = sorted[0];
  const max = sorted[count - 1];
  const mid = Math.floor(count / 2);
  const median = count % 2 ? sorted[mid] : (sorted[mid - 1] + sorted[mid]) / 2;
  const mean = sorted.reduce((sum, value) => sum + value, 0) / count;
  return { min, max, median, mean, count };
}

export function computePercentile(sortedAsc: number[], p: number) {
  if (!sortedAsc.length) return null;
  if (p <= 0) return sortedAsc[0];
  if (p >= 1) return sortedAsc[sortedAsc.length - 1];

  const idx = (sortedAsc.length - 1) * p;
  const lo = Math.floor(idx);
  const hi = Math.ceil(idx);
  if (lo === hi) return sortedAsc[lo];
  const w = idx - lo;
  return sortedAsc[lo] * (1 - w) + sortedAsc[hi] * w;
}

export function clamp01(value: number) {
  if (value < 0) return 0;
  if (value > 1) return 1;
  return value;
}

export function formatPercent(value: number | null, digits = 1) {
  if (value === null || Number.isNaN(value)) return '-';
  return `${(clamp01(value) * 100).toFixed(digits)}%`;
}

export function formatMetric(value: number | null, digits = 2) {
  if (value === null || Number.isNaN(value)) return '-';
  if (Number.isInteger(value)) return String(value);
  return value.toFixed(digits);
}

function normalizeOrdersByYear(row: PlaceRowMetricsInput) {
  if (row.orders_by_year && Object.keys(row.orders_by_year).length) {
    return row.orders_by_year;
  }
  if (row.last_year) {
    return { [String(row.last_year)]: row.last_year_orders || [] };
  }
  return {};
}

export function getSelectedYearOrders(row: PlaceRowMetricsInput, yearFilter: string) {
  const ordersByYear = normalizeOrdersByYear(row);
  if (yearFilter !== 'Todos') {
    const orders = ordersByYear[yearFilter] ?? [];
    return {
      year: yearFilter,
      orders,
      yearAvailable: orders.length > 0,
    };
  }

  const years = YEAR_OPTIONS.filter((y) => y !== 'Todos');
  const closures = years
    .map((year) => {
      const list = ordersByYear[year] ?? [];
      const stats = computeOrderStats(list);
      return stats ? stats.max : null;
    })
    .filter((v): v is number => typeof v === 'number');

  if (closures.length) {
    return {
      year: 'Todos',
      orders: closures,
      yearAvailable: true,
    };
  }

  const fallback = row.last_year_orders ?? [];
  const fallbackStats = computeOrderStats(fallback);
  return {
    year: 'Todos',
    orders: fallbackStats ? [fallbackStats.max] : [],
    yearAvailable: !!fallbackStats,
  };
}

export function getYearlyClosures(row: PlaceRowMetricsInput) {
  const ordersByYear = normalizeOrdersByYear(row);
  const years = YEAR_OPTIONS.filter((y) => y !== 'Todos');
  return years
    .map((year) => {
      const orders = ordersByYear[year] ?? [];
      if (!orders.length) return null;
      const max = Math.max(...orders);
      return { year, closure: max };
    })
    .filter((v): v is { year: string; closure: number } => !!v);
}
