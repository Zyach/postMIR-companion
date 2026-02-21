import React from 'react';
import { FlatList, Text, View } from 'react-native';

import {
  computeOrderStats,
  computePercentile,
  formatMetric,
  formatPercent,
  getSelectedYearOrders,
  getYearlyClosures,
  MIR_ORDER_TOTAL_BY_YEAR,
  PlaceRow,
} from '@/hooks/use-dataset';

type Props = {
  data: PlaceRow[];
  yearFilter: string;
  styles: any;
  listHeaderComponent?: React.ReactElement | null;
};

const keyExtractor = (_item: PlaceRow, idx: number) => String(idx);

export function PlaceList({ data, yearFilter, styles, listHeaderComponent }: Props) {
  const renderRow = ({ item }: { item: PlaceRow }) => {
    const selected = getSelectedYearOrders(item, yearFilter);
    const stats = computeOrderStats(selected.orders);
    const isAllYears = yearFilter === 'Todos';
    const yearLabel = isAllYears ? '2023-2025' : selected.year || yearFilter;

    const closureValue = stats ? (isAllYears ? stats.median : stats.max) : null;
    const closureText = stats ? formatMetric(closureValue) : '-';

    const metrics: Array<{ label: string; value: string }> = [];
    metrics.push({ label: `Cierre (${yearLabel})`, value: closureText });

    if (!isAllYears) {
      const year = selected.year || yearFilter;
      const total = MIR_ORDER_TOTAL_BY_YEAR[year];
      const closure = stats ? stats.max : null;
      if (total && closure !== null) {
        const top = closure / total;
        metrics.push({
          label: 'Top requerido',
          value: `${formatPercent(top)} (N=${total})`,
        });
      }

      let iqrText = '-';
      if (selected.orders.length >= 3) {
        const sorted = [...selected.orders].sort((a, b) => a - b);
        const p25 = computePercentile(sorted, 0.25);
        const p75 = computePercentile(sorted, 0.75);
        if (p25 !== null && p75 !== null && p25 !== p75) {
          iqrText = `${formatMetric(p25)} - ${formatMetric(p75)}`;
        }
      }
      if (iqrText !== '-') metrics.push({ label: 'IQR', value: iqrText });

      if (stats) metrics.push({ label: 'N plazas', value: String(stats.count) });
    } else {
      const closures = getYearlyClosures(item)
        .sort((a, b) => Number(a.year) - Number(b.year));
      const closureValues = closures.map((c) => c.closure);
      const closureStats = computeOrderStats(closureValues);

      if (closureStats) {
        metrics.push({
          label: 'Cierre mediano 3 anos',
          value: formatMetric(closureStats.median),
        });
      }

      const topByYear = closures
        .map(({ year, closure }) => {
          const total = MIR_ORDER_TOTAL_BY_YEAR[year];
          if (!total) return null;
          return closure / total;
        })
        .filter((v): v is number => typeof v === 'number');
      const topStats = computeOrderStats(topByYear);
      if (topStats) {
        metrics.push({
          label: 'Top mediano 3 anos',
          value: formatPercent(topStats.median),
        });
      }

      let iqrText = '-';
      if (closureValues.length >= 3) {
        const sorted = [...closureValues].sort((a, b) => a - b);
        const p25 = computePercentile(sorted, 0.25);
        const p75 = computePercentile(sorted, 0.75);
        if (p25 !== null && p75 !== null && p25 !== p75) {
          iqrText = `${formatMetric(p25)} - ${formatMetric(p75)}`;
        }
      }
      if (iqrText !== '-') metrics.push({ label: 'IQR 3 anos', value: iqrText });

      if (closures.length >= 2) {
        const first = closures[0].closure;
        const last = closures[closures.length - 1].closure;
        const trend = last - first;
        const trendText = trend === 0 ? '0' : (trend > 0 ? `+${trend}` : `${trend}`);
        metrics.push({ label: 'Tendencia 3 anos', value: trendText });
      }

      if (closures.length) metrics.push({ label: 'N anos', value: String(closures.length) });
    }

    return (
      <View style={styles.card}>
        <Text style={styles.cardTitle}>{item.center || 'Centro desconocido'}</Text>
        <Text style={styles.cardMeta}>
          {item.city || '-'} | {item.province || '-'} | {item.ccaa || '-'}
        </Text>
        <Text style={styles.cardMeta}>Especialidad: {item.specialty}</Text>
        <View style={styles.metricGrid}>
          {metrics.map((metric, idx) => (
            <View key={idx} style={styles.metricItem}>
              <Text style={styles.metricLabel}>{metric.label}</Text>
              <Text style={styles.metricValue}>{metric.value}</Text>
            </View>
          ))}
        </View>
      </View>
    );
  };

  return (
    <FlatList
      data={data}
      renderItem={renderRow}
      keyExtractor={keyExtractor}
      ListHeaderComponent={listHeaderComponent || null}
    />
  );
}
