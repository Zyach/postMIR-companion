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
    const yearLabel = isAllYears ? '3 anos (2023-2025)' : selected.year || yearFilter;

    const closureValue = stats ? (isAllYears ? stats.median : stats.max) : null;
    const closureText = stats ? formatMetric(closureValue) : '-';

    const rangeText = stats
      ? stats.min === stats.max
        ? formatMetric(stats.min)
        : `${formatMetric(stats.min)} - ${formatMetric(stats.max)}`
      : '-';
    const medianText = stats ? formatMetric(stats.median) : '-';
    const meanText = stats ? formatMetric(stats.mean) : '-';

    let iqrText = '-';
    if (isAllYears && selected.orders.length >= 3) {
      const sorted = [...selected.orders].sort((a, b) => a - b);
      const p25 = computePercentile(sorted, 0.25);
      const p75 = computePercentile(sorted, 0.75);
      if (p25 !== null && p75 !== null && p25 !== p75) {
        iqrText = `${formatMetric(p25)} - ${formatMetric(p75)}`;
      }
    }

    const pctLines: string[] = [];
    if (!isAllYears) {
      const year = selected.year || yearFilter;
      const total = MIR_ORDER_TOTAL_BY_YEAR[year];
      const closure = stats ? stats.max : null;
      if (total && closure !== null) {
        const top = closure / total;
        const betterThan = (total - closure) / total;
        pctLines.push(`Top requerido: ${formatPercent(top)} | Mejor que: ${formatPercent(betterThan)} (N=${total})`);
      }
    } else {
      const topByYear = getYearlyClosures(item)
        .map(({ year, closure }) => {
          const total = MIR_ORDER_TOTAL_BY_YEAR[year];
          if (!total) return null;
          return closure / total;
        })
        .filter((v): v is number => typeof v === 'number');

      const topStats = computeOrderStats(topByYear);
      const betterStats = computeOrderStats(topByYear.map((p) => 1 - p));
      if (topStats && betterStats) {
        const topSorted = [...topByYear].sort((a, b) => a - b);
        const betterSorted = [...topByYear.map((p) => 1 - p)].sort((a, b) => a - b);

        const topP25 = topByYear.length >= 3 ? computePercentile(topSorted, 0.25) : null;
        const topP75 = topByYear.length >= 3 ? computePercentile(topSorted, 0.75) : null;
        const betterP25 = topByYear.length >= 3 ? computePercentile(betterSorted, 0.25) : null;
        const betterP75 = topByYear.length >= 3 ? computePercentile(betterSorted, 0.75) : null;

        const topIqr =
          topP25 !== null && topP75 !== null && topP25 !== topP75
            ? `${formatPercent(topP25)} - ${formatPercent(topP75)}`
            : '-';
        const betterIqr =
          betterP25 !== null && betterP75 !== null && betterP25 !== betterP75
            ? `${formatPercent(betterP25)} - ${formatPercent(betterP75)}`
            : '-';

        const topRange =
          topStats.min === topStats.max
            ? formatPercent(topStats.min)
            : `${formatPercent(topStats.min)} - ${formatPercent(topStats.max)}`;
        const betterRange =
          betterStats.min === betterStats.max
            ? formatPercent(betterStats.min)
            : `${formatPercent(betterStats.min)} - ${formatPercent(betterStats.max)}`;

        pctLines.push(
          `Top requerido (3 anos): ${formatPercent(topStats.median)} | p25-p75: ${topIqr} | Rango: ${topRange}`
        );
        pctLines.push(
          `Mejor que (3 anos): ${formatPercent(betterStats.median)} | p25-p75: ${betterIqr} | Rango: ${betterRange}`
        );
      }
    }

    return (
      <View style={styles.card}>
        <Text style={styles.cardTitle}>{item.center || 'Centro desconocido'}</Text>
        <Text style={styles.cardMeta}>
          {item.city || '-'} | {item.province || '-'} | {item.ccaa || '-'}
        </Text>
        <Text style={styles.cardMeta}>Especialidad: {item.specialty}</Text>
        <Text style={styles.cardMeta}>Cierre ({yearLabel}): {closureText}</Text>
        {pctLines.map((line, idx) => (
          <Text key={idx} style={styles.cardMeta}>
            {line}
          </Text>
        ))}
        <Text style={styles.cardMeta}>Rango: {rangeText}</Text>
        <Text style={styles.cardMeta}>Mediana: {medianText}</Text>
        <Text style={styles.cardMeta}>Media: {meanText}</Text>
        {iqrText !== '-' && <Text style={styles.cardMeta}>IQR: {iqrText}</Text>}
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
