import { useCallback, useEffect, useMemo, useState } from 'react';
import { Alert } from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import * as FileSystem from 'expo-file-system';
import * as LegacyFileSystem from 'expo-file-system/legacy';
import * as SecureStore from 'expo-secure-store';
import * as Sharing from 'expo-sharing';

export type PlaceRow = {
  specialty: string;
  search_name: string;
  ccaa: string | null;
  province: string | null;
  city: string | null;
  center: string | null;
  total_places: number | null;
  last_year: number | null;
  last_year_order_max: number | null;
  last_year_orders: number[];
  orders_by_year?: Record<string, number[]>;
};

export type OrderPreset = { label: string; min: number | null; max: number | null };
export type SortKey =
  | 'order_selected_year'
  | 'total_places'
  | 'center'
  | 'city'
  | 'province'
  | 'specialty';

export const ORDER_PRESETS: OrderPreset[] = [
  { label: 'Personalizado', min: null, max: null },
  { label: '>= 6000', min: 6000, max: null },
  { label: '>= 5000', min: 5000, max: null },
  { label: '>= 3000', min: 3000, max: null },
  { label: '>= 1000', min: 1000, max: null },
  { label: '0 - 1000', min: 0, max: 1000 },
  { label: '1000 - 3000', min: 1000, max: 3000 },
  { label: '3000 - 5000', min: 3000, max: 5000 },
];

export const YEAR_OPTIONS = ['Todos', '2025', '2024', '2023'];

export const MIR_ORDER_TOTAL_BY_YEAR: Record<string, number> = {
  '2025': 13691,
  '2024': 11755,
  '2023': 10793,
};

const TOKEN_KEY = 'postmir_token';
const DATA_KEY = 'postmir_dataset_v1';
const UPDATED_KEY = 'postmir_dataset_updated';

type SavedSearch = {
  _id: string;
  name: string;
  specialty: string;
};

type UpdateFetchDeps = {
  login: (email: string, password: string) => Promise<string>;
  getSavedSearches: (token: string) => Promise<SavedSearch[]>;
  getSavedSearchById: (token: string, id: string) => Promise<any>;
  getPlacesTree: (token: string, specialty: string) => Promise<any[]>;
};

function mapPlacesTree(tree: any[]) {
  const mapping = new Map<string, { ccaa: string; province: string; city: string }>();
  for (const ccaa of tree || []) {
    const ccaaKey = ccaa?.key;
    for (const prov of ccaa?.values || []) {
      const provKey = prov?.key;
      for (const loc of prov?.values || []) {
        const locKey = loc?.key;
        for (const center of loc?.values || []) {
          const centerKey = center?.key;
          if (centerKey) {
            mapping.set(`${centerKey}|||${locKey}`, {
              ccaa: ccaaKey,
              province: provKey,
              city: locKey,
            });
          }
        }
      }
    }
  }
  return mapping;
}

function getLastYearInfo(pastYears: any[]) {
  if (!pastYears || !pastYears.length) return { lastYear: null, orders: [], maxOrder: null };
  const years = pastYears.map((p: any) => p?.year).filter((y: any) => typeof y === 'number');
  if (!years.length) return { lastYear: null, orders: [], maxOrder: null };
  const lastYear = Math.max(...years);
  const entry = pastYears.find((p: any) => p?.year === lastYear);
  const orders = (entry?.order || []).filter((o: any) => typeof o === 'number');
  const maxOrder = orders.length ? Math.max(...orders) : null;
  return { lastYear, orders, maxOrder };
}

function buildOrdersByYear(pastYears: any[]) {
  const byYear: Record<string, number[]> = {};
  for (const entry of pastYears || []) {
    const year = entry?.year;
    if (typeof year !== 'number') continue;
    const orders = (entry?.order || []).filter((o: any) => typeof o === 'number');
    byYear[String(year)] = orders;
  }
  return byYear;
}

export type UseDatasetState = {
  email: string;
  password: string;
  token: string | null;
  loading: boolean;
  exporting: boolean;
  dataset: PlaceRow[];
  lastUpdated: string | null;
  selectedSpecialties: string[];
  selectedCcaas: string[];
  selectedProvinces: string[];
  selectedCities: string[];
  yearFilter: string;
  orderPreset: OrderPreset;
  orderMin: string;
  orderMax: string;
  placesMin: string;
  placesMax: string;
  sortKey: SortKey;
  sortDir: 'asc' | 'desc';
  myOrder: string;
  myN: string;
  specialties: string[];
  ccaas: string[];
  provinces: string[];
  cities: string[];
  filtered: PlaceRow[];
  myPercentilesText: string | null;
};

export type UseDatasetApi = UseDatasetState & {
  setEmail: (v: string) => void;
  setPassword: (v: string) => void;
  setSelectedSpecialties: (v: string[]) => void;
  setSelectedCcaas: (v: string[]) => void;
  setSelectedProvinces: (v: string[]) => void;
  setSelectedCities: (v: string[]) => void;
  setYearFilter: (v: string) => void;
  setOrderPreset: (v: OrderPreset) => void;
  setOrderMin: (v: string) => void;
  setOrderMax: (v: string) => void;
  setPlacesMin: (v: string) => void;
  setPlacesMax: (v: string) => void;
  setSortKey: (v: SortKey) => void;
  setSortDir: (v: 'asc' | 'desc') => void;
  setMyOrder: (v: string) => void;
  setMyN: (v: string) => void;
  handleLogin: () => Promise<void>;
  handleLogout: () => Promise<void>;
  handleFetch: () => Promise<void>;
  handleClearCache: () => Promise<void>;
  handleExportCsv: (rows?: PlaceRow[]) => Promise<void>;
  handleExportJson: (rows?: PlaceRow[]) => Promise<void>;
};

export function useDataset(deps: UpdateFetchDeps): UseDatasetApi {
  const { login, getSavedSearches, getSavedSearchById, getPlacesTree } = deps;

  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [token, setToken] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [exporting, setExporting] = useState(false);
  const [dataset, setDataset] = useState<PlaceRow[]>([]);
  const [lastUpdated, setLastUpdated] = useState<string | null>(null);

  const [selectedSpecialties, setSelectedSpecialties] = useState<string[]>([]);
  const [selectedCcaas, setSelectedCcaas] = useState<string[]>([]);
  const [selectedProvinces, setSelectedProvinces] = useState<string[]>([]);
  const [selectedCities, setSelectedCities] = useState<string[]>([]);

  const [yearFilter, setYearFilter] = useState('2025');
  const [orderPreset, setOrderPreset] = useState<OrderPreset>(ORDER_PRESETS[0]);
  const [orderMin, setOrderMin] = useState('');
  const [orderMax, setOrderMax] = useState('');
  const [placesMin, setPlacesMin] = useState('');
  const [placesMax, setPlacesMax] = useState('');
  const [sortKey, setSortKey] = useState<SortKey>('order_selected_year');
  const [sortDir, setSortDir] = useState<'asc' | 'desc'>('desc');

  const [myOrder, setMyOrder] = useState('');
  const [myN, setMyN] = useState('');

  useEffect(() => {
    const load = async () => {
      const storedToken = await SecureStore.getItemAsync(TOKEN_KEY);
      if (storedToken) setToken(storedToken);

      const raw = await AsyncStorage.getItem(DATA_KEY);
      const updated = await AsyncStorage.getItem(UPDATED_KEY);
      if (raw) {
        try {
          const parsed = JSON.parse(raw) as PlaceRow[];
          setDataset(parsed);
          setLastUpdated(updated || null);
        } catch {
          // ignore
        }
      }
    };
    load();
  }, []);

  useEffect(() => {
    if (orderPreset.min !== null) setOrderMin(String(orderPreset.min));
    if (orderPreset.max !== null) setOrderMax(String(orderPreset.max));
    if (orderPreset.min === null && orderPreset.max === null) {
      setOrderMin('');
      setOrderMax('');
    }
  }, [orderPreset]);

  const specialties = useMemo(() => {
    const set = new Set(dataset.map((d) => d.specialty).filter(Boolean));
    return Array.from(set).sort();
  }, [dataset]);

  const ccaas = useMemo(() => {
    const set = new Set(dataset.map((d) => d.ccaa).filter(Boolean) as string[]);
    return Array.from(set).sort();
  }, [dataset]);

  const provinces = useMemo(() => {
    const set = new Set(dataset.map((d) => d.province).filter(Boolean) as string[]);
    return Array.from(set).sort();
  }, [dataset]);

  const cities = useMemo(() => {
    const set = new Set(dataset.map((d) => d.city).filter(Boolean) as string[]);
    return Array.from(set).sort();
  }, [dataset]);

  useEffect(() => {
    if (dataset.length && selectedSpecialties.length === 0) {
      setSelectedSpecialties([...specialties]);
    }
  }, [dataset, selectedSpecialties.length, specialties]);

  const filtered = useMemo(() => {
    let rows = dataset;
    if (selectedSpecialties.length) {
      rows = rows.filter((r) => selectedSpecialties.includes(r.specialty));
    }
    if (selectedCcaas.length) {
      rows = rows.filter((r) => r.ccaa && selectedCcaas.includes(r.ccaa));
    }
    if (selectedProvinces.length) {
      rows = rows.filter((r) => r.province && selectedProvinces.includes(r.province));
    }
    if (selectedCities.length) {
      rows = rows.filter((r) => r.city && selectedCities.includes(r.city));
    }

    if (yearFilter !== 'Todos') {
      rows = rows.filter((r) => {
        const selected = getSelectedYearOrders(r, yearFilter);
        return selected.yearAvailable;
      });
    }

    const minOrder = orderMin ? Number(orderMin) : null;
    const maxOrder = orderMax ? Number(orderMax) : null;
    if (minOrder !== null || maxOrder !== null) {
      rows = rows.filter((r) => {
        const selected = getSelectedYearOrders(r, yearFilter);
        const stats = computeOrderStats(selected.orders);
        if (!stats) return false;
        const max = stats.max;
        if (minOrder !== null && (max === null || max < minOrder)) return false;
        if (maxOrder !== null && (max === null || max > maxOrder)) return false;
        return true;
      });
    }

    const minPlaces = placesMin ? Number(placesMin) : null;
    const maxPlaces = placesMax ? Number(placesMax) : null;
    if (minPlaces !== null || maxPlaces !== null) {
      rows = rows.filter((r) => {
        const val = r.total_places;
        if (val === null || val === undefined) return false;
        if (minPlaces !== null && val < minPlaces) return false;
        if (maxPlaces !== null && val > maxPlaces) return false;
        return true;
      });
    }

    const dir = sortDir === 'asc' ? 1 : -1;
    const getValue = (row: PlaceRow) => {
      switch (sortKey) {
        case 'order_selected_year': {
          const selected = getSelectedYearOrders(row, yearFilter);
          const stats = computeOrderStats(selected.orders);
          return stats ? (yearFilter === 'Todos' ? stats.median : stats.max) : null;
        }
        case 'total_places':
          return row.total_places;
        case 'center':
          return row.center;
        case 'city':
          return row.city;
        case 'province':
          return row.province;
        case 'specialty':
          return row.specialty;
        default:
          return '';
      }
    };

    return [...rows].sort((a, b) => {
      const va = getValue(a);
      const vb = getValue(b);
      if (va === null || va === undefined) return 1;
      if (vb === null || vb === undefined) return -1;
      if (typeof va === 'number' && typeof vb === 'number') {
        return (va - vb) * dir;
      }
      return String(va).localeCompare(String(vb)) * dir;
    });
  }, [
    dataset,
    selectedSpecialties,
    selectedCcaas,
    selectedProvinces,
    selectedCities,
    yearFilter,
    orderMin,
    orderMax,
    placesMin,
    placesMax,
    sortKey,
    sortDir,
  ]);

  const myPercentilesText = useMemo(() => {
    const order = myOrder.trim() ? Number(myOrder) : null;
    const total = myN.trim() ? Number(myN) : null;
    if (order === null || total === null) return null;
    if (!Number.isFinite(order) || !Number.isFinite(total) || total <= 0 || order <= 0) return null;

    const top = order / total;
    const betterThan = (total - order) / total;
    return `Tu Top: ${formatPercent(top)} | Tu percentil (mejor que): ${formatPercent(betterThan)} (N=${Math.trunc(total)})`;
  }, [myOrder, myN]);

  const handleLogin = useCallback(async () => {
    if (!email || !password) {
      Alert.alert('Faltan datos', 'Introduce correo y contrasena');
      return;
    }
    setLoading(true);
    try {
      const newToken = await login(email, password);
      setToken(newToken);
      await SecureStore.setItemAsync(TOKEN_KEY, newToken);
      Alert.alert('Sesion', 'Token guardado');
    } catch (err: any) {
      Alert.alert('Inicio de sesion fallido', err.message || 'Error desconocido');
    } finally {
      setLoading(false);
    }
  }, [email, password, login]);

  const handleLogout = useCallback(async () => {
    setToken(null);
    await SecureStore.deleteItemAsync(TOKEN_KEY);
  }, []);

  const handleAuthError = useCallback(
    async (err: unknown) => {
      const message = (err as any)?.message || '';
      if (typeof message === 'string' && message.toLowerCase().includes('unauthorized')) {
        await handleLogout();
        Alert.alert('Sesion caducada', 'Vuelve a iniciar sesion.');
        return true;
      }
      return false;
    },
    [handleLogout]
  );

  const handleFetch = useCallback(async () => {
    if (!token) {
      Alert.alert('Falta el token', 'Inicia sesion primero');
      return;
    }
    setLoading(true);
    try {
      const searches = await getSavedSearches(token);
      const rows: PlaceRow[] = [];
      const mappingCache = new Map<string, Map<string, { ccaa: string; province: string; city: string }>>();

      for (const search of searches) {
        if (!search._id || !search.specialty) continue;
        let mapping = mappingCache.get(search.specialty);
        if (!mapping) {
          const tree = await getPlacesTree(token, search.specialty);
          mapping = mapPlacesTree(tree);
          mappingCache.set(search.specialty, mapping);
        }

        const detail = await getSavedSearchById(token, search._id);
        const places = detail?.places || [];
        for (const place of places) {
          const location = place?.location || null;
          const center = place?.center || null;
          const mapKey = `${center}|||${location}`;
          const mapInfo = mapping.get(mapKey);

          const last = getLastYearInfo(place?.pastYears || []);
          const ordersByYear = buildOrdersByYear(place?.pastYears || []);
          rows.push({
            specialty: search.specialty,
            search_name: search.name,
            ccaa: mapInfo?.ccaa || null,
            province: mapInfo?.province || null,
            city: mapInfo?.city || location || null,
            center: center,
            total_places: typeof place?.totalPlaces === 'number' ? place.totalPlaces : null,
            last_year: last.lastYear,
            last_year_order_max: last.maxOrder,
            last_year_orders: last.orders,
            orders_by_year: ordersByYear,
          });
        }
      }

      setDataset(rows);
      const stamp = new Date().toISOString();
      setLastUpdated(stamp);
      await AsyncStorage.setItem(DATA_KEY, JSON.stringify(rows));
      await AsyncStorage.setItem(UPDATED_KEY, stamp);
      Alert.alert('Listo', `Registros: ${rows.length}`);
    } catch (err: any) {
      if (!(await handleAuthError(err))) {
        Alert.alert('Error al obtener datos', err.message || 'Error desconocido');
      }
    } finally {
      setLoading(false);
    }
  }, [getSavedSearchById, getSavedSearches, getPlacesTree, handleAuthError, token]);

  const handleClearCache = useCallback(async () => {
    await AsyncStorage.removeItem(DATA_KEY);
    await AsyncStorage.removeItem(UPDATED_KEY);
    setDataset([]);
    setLastUpdated(null);
  }, []);

  const buildCsv = useCallback((rows: PlaceRow[]) => {
    const CSV_COLUMNS: Array<keyof PlaceRow> = [
      'specialty',
      'search_name',
      'ccaa',
      'province',
      'city',
      'center',
      'total_places',
      'last_year',
      'last_year_order_max',
      'last_year_orders',
      'orders_by_year',
    ];
    const csvEscape = (value: unknown) => {
      const text = value === null || value === undefined ? '' : String(value);
      return `"${text.replace(/"/g, '""')}"`;
    };
    const lines = [CSV_COLUMNS.join(',')];
    for (const row of rows) {
      const values = CSV_COLUMNS.map((col) => {
        if (col === 'last_year_orders') {
          return csvEscape(JSON.stringify(row.last_year_orders || []));
        }
        if (col === 'orders_by_year') {
          return csvEscape(JSON.stringify(row.orders_by_year || {}));
        }
        return csvEscape((row as any)[col]);
      });
      lines.push(values.join(','));
    }
    return lines.join('\n');
  }, []);

  const handleExportCsv = useCallback(
    async (rows?: PlaceRow[]) => {
      const rowsToUse = rows ?? filtered;
      if (!rowsToUse.length) {
        Alert.alert('Sin datos', 'Nada para exportar');
        return;
      }
      setExporting(true);
      try {
        const csv = buildCsv(rowsToUse);
        const baseDir = FileSystem.Paths.cache.uri || FileSystem.Paths.document.uri;
        if (!baseDir) throw new Error('Sin directorio con escritura');
        const fileUri = `${baseDir}postmir_${Date.now()}.csv`;
        await LegacyFileSystem.writeAsStringAsync(fileUri, csv, {
          encoding: 'utf8',
        });
        if (await Sharing.isAvailableAsync()) {
          await Sharing.shareAsync(fileUri, {
            mimeType: 'text/csv',
            dialogTitle: 'Exportar CSV',
          });
        } else {
          Alert.alert('Exportado', fileUri);
        }
      } catch (err: any) {
        Alert.alert('Fallo al exportar', err.message || 'Error desconocido');
      } finally {
        setExporting(false);
      }
    },
    [buildCsv, filtered]
  );

  const handleExportJson = useCallback(
    async (rows?: PlaceRow[]) => {
      const rowsToUse = rows ?? filtered;
      if (!rowsToUse.length) {
        Alert.alert('Sin datos', 'Nada para exportar');
        return;
      }
      setExporting(true);
      try {
        const baseDir = FileSystem.Paths.cache.uri || FileSystem.Paths.document.uri;
        if (!baseDir) throw new Error('Sin directorio con escritura');
        const fileUri = `${baseDir}postmir_${Date.now()}.json`;
        await LegacyFileSystem.writeAsStringAsync(fileUri, JSON.stringify(rowsToUse, null, 2), {
          encoding: 'utf8',
        });
        if (await Sharing.isAvailableAsync()) {
          await Sharing.shareAsync(fileUri, {
            mimeType: 'application/json',
            dialogTitle: 'Exportar JSON',
          });
        } else {
          Alert.alert('Exportado', fileUri);
        }
      } catch (err: any) {
        Alert.alert('Fallo al exportar', err.message || 'Error desconocido');
      } finally {
        setExporting(false);
      }
    },
    [filtered]
  );

  return {
    email,
    password,
    token,
    loading,
    exporting,
    dataset,
    lastUpdated,
    selectedSpecialties,
    selectedCcaas,
    selectedProvinces,
    selectedCities,
    yearFilter,
    orderPreset,
    orderMin,
    orderMax,
    placesMin,
    placesMax,
    sortKey,
    sortDir,
    myOrder,
    myN,
    specialties,
    ccaas,
    provinces,
    cities,
    filtered,
    myPercentilesText,
    setEmail,
    setPassword,
    setSelectedSpecialties,
    setSelectedCcaas,
    setSelectedProvinces,
    setSelectedCities,
    setYearFilter,
    setOrderPreset,
    setOrderMin,
    setOrderMax,
    setPlacesMin,
    setPlacesMax,
    setSortKey,
    setSortDir,
    setMyOrder,
    setMyN,
    handleLogin,
    handleLogout,
    handleFetch,
    handleClearCache,
    handleExportCsv,
    handleExportJson,
  };
}

// Helpers reused by components
export function getSelectedYearOrders(row: PlaceRow, yearFilter: string) {
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

function normalizeOrdersByYear(row: PlaceRow) {
  if (row.orders_by_year && Object.keys(row.orders_by_year).length) {
    return row.orders_by_year;
  }
  if (row.last_year) {
    return { [String(row.last_year)]: row.last_year_orders || [] };
  }
  return {};
}

export function getYearlyClosures(row: PlaceRow) {
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

export function formatMetric(value: number | null, digits = 2) {
  if (value === null || Number.isNaN(value)) return '-';
  if (Number.isInteger(value)) return String(value);
  return value.toFixed(digits);
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
