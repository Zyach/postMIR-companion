import AsyncStorage from '@react-native-async-storage/async-storage';
import React, { useEffect, useMemo, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  FlatList,
  Platform,
  Pressable,
  SafeAreaView,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import * as SecureStore from 'expo-secure-store';
import * as FileSystem from 'expo-file-system';
import * as Sharing from 'expo-sharing';
import { StatusBar } from 'expo-status-bar';
import * as Application from 'expo-application';
import * as IntentLauncher from 'expo-intent-launcher';

import MultiSelectModal from '@/components/MultiSelectModal';

const API_URL = 'https://postmir.binpar.cloud/api/graphql';
const TOKEN_KEY = 'postmir_token';
const DATA_KEY = 'postmir_dataset_v1';
const UPDATED_KEY = 'postmir_dataset_updated';

// Endpoint expected to return JSON like:
// { "versionCode": 3, "versionName": "1.0.0", "apkUrl": "https://.../postmir.apk", "notes": "..." }
const UPDATE_MANIFEST_URL =
  'https://github.com/Zyach/postMIR-companion/releases/latest/download/latest.json';

const UPDATE_LAST_CHECK_KEY = 'postmir_update_last_check_v1';
const UPDATE_LAST_NOTIFIED_KEY = 'postmir_update_last_notified_v1';
const UPDATE_CHECK_INTERVAL_MS = 6 * 60 * 60 * 1000; // 6h

const ANDROID_INTENT_FLAG_GRANT_READ_URI_PERMISSION = 0x00000001;
const ANDROID_INTENT_FLAG_ACTIVITY_NEW_TASK = 0x10000000;

type SavedSearch = {
  _id: string;
  name: string;
  specialty: string;
};

type UpdateManifest = {
  versionCode: number;
  versionName?: string;
  apkUrl: string;
  notes?: string;
  publishedAt?: string;
};

type PlaceRow = {
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

type OrderPreset = { label: string; min: number | null; max: number | null };
type SortKey =
  | 'order_selected_year'
  | 'total_places'
  | 'center'
  | 'city'
  | 'province'
  | 'specialty';

const ORDER_PRESETS: OrderPreset[] = [
  { label: 'Personalizado', min: null, max: null },
  { label: '>= 6000', min: 6000, max: null },
  { label: '>= 5000', min: 5000, max: null },
  { label: '>= 3000', min: 3000, max: null },
  { label: '>= 1000', min: 1000, max: null },
  { label: '0 - 1000', min: 0, max: 1000 },
  { label: '1000 - 3000', min: 1000, max: 3000 },
  { label: '3000 - 5000', min: 3000, max: 5000 },
];

const YEAR_OPTIONS = ['Todos', '2025', '2024', '2023'];

// Total de aspirantes MIR con numero de orden (o equivalente: personas que superan nota de corte)
// por anio de examen. Fuentes: notas de prensa oficiales del Ministerio de Sanidad.
const MIR_ORDER_TOTAL_BY_YEAR: Record<string, number> = {
  '2025': 13691,
  '2024': 11755,
  '2023': 10793,
};

const SORT_OPTIONS: Array<{ key: SortKey; label: string }> = [
  { key: 'order_selected_year', label: 'Cierre (ano)' },
  { key: 'total_places', label: 'Plazas' },
  { key: 'center', label: 'Centro' },
  { key: 'city', label: 'Ciudad' },
  { key: 'province', label: 'Provincia' },
  { key: 'specialty', label: 'Especialidad' },
];

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

const buildCsv = (rows: PlaceRow[]) => {
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
};


async function graphQL(token: string | null, query: string, variables?: Record<string, unknown>) {
  const payload: Record<string, unknown> = { query };
  if (variables) payload.variables = variables;

  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
  };
  if (token) headers.Authorization = `Bearer ${token}`;

  const res = await fetch(API_URL, {
    method: 'POST',
    headers,
    body: JSON.stringify(payload),
  });
  const json = await res.json();
  if (json.errors && json.errors.length) {
    const message = json.errors[0]?.message || 'Error desconocido';
    throw new Error(message);
  }
  return json.data;
}

async function shouldAutoCheckUpdates() {
  const raw = await AsyncStorage.getItem(UPDATE_LAST_CHECK_KEY);
  if (!raw) return true;
  const ts = Number(raw);
  if (!Number.isFinite(ts) || ts <= 0) return true;
  return Date.now() - ts > UPDATE_CHECK_INTERVAL_MS;
}

async function markUpdateCheckedNow() {
  await AsyncStorage.setItem(UPDATE_LAST_CHECK_KEY, String(Date.now()));
}

async function getLastNotifiedVersion() {
  const raw = await AsyncStorage.getItem(UPDATE_LAST_NOTIFIED_KEY);
  if (!raw) return null;
  const v = Number(raw);
  return Number.isFinite(v) ? v : null;
}

async function setLastNotifiedVersion(versionCode: number) {
  await AsyncStorage.setItem(UPDATE_LAST_NOTIFIED_KEY, String(versionCode));
}

async function login(email: string, password: string) {
  const query =
    'mutation($email:String!, $password:String!){ login(email:$email, password:$password){ OK error token } }';
  const data = await graphQL(null, query, { email, password });
  const result = data?.login;
  if (!result?.OK) {
    throw new Error(result?.error || 'Inicio de sesion fallido');
  }
  return result.token as string;
}

async function getSavedSearches(token: string): Promise<SavedSearch[]> {
  const query = 'query{ getSavedSearches{ _id name specialty } }';
  const data = await graphQL(token, query);
  return data?.getSavedSearches || [];
}

async function getSavedSearchById(token: string, id: string) {
  const query =
    'query($id:String!){ getSavedSearchById(_id:$id){ _id name specialty totalPlaces places{ title totalPlaces location center pastYears{ year places order } } } }';
  const data = await graphQL(token, query, { id });
  return data?.getSavedSearchById;
}

async function getPlacesTree(token: string, specialty: string) {
  const query =
    'query($specialty: String!){ getPlaces(specialty: $specialty){ key values{ key values{ key values{ key } } } } }';
  const data = await graphQL(token, query, { specialty });
  return data?.getPlaces || [];
}

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

function getMaxYear(ordersByYear: Record<string, number[]>) {
  const years = Object.keys(ordersByYear)
    .map((y) => Number(y))
    .filter((y) => Number.isFinite(y));
  if (!years.length) return null;
  return Math.max(...years);
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

type OrderStats = {
  min: number;
  max: number;
  median: number;
  mean: number;
  count: number;
};

function computeOrderStats(orders: number[]): OrderStats | null {
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

function computePercentile(sortedAsc: number[], p: number) {
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

function getSelectedYearOrders(row: PlaceRow, yearFilter: string) {
  const ordersByYear = normalizeOrdersByYear(row);
  if (yearFilter !== 'Todos') {
    const orders = ordersByYear[yearFilter] ?? [];
    return {
      year: yearFilter,
      orders,
      yearAvailable: orders.length > 0,
    };
  }

  // Option A: for "Todos", compute stats over per-year closures (max order per year)
  // to reduce bias from years with more total picks.
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

function formatMetric(value: number | null, digits = 2) {
  if (value === null || Number.isNaN(value)) return '-';
  if (Number.isInteger(value)) return String(value);
  return value.toFixed(digits);
}

function clamp01(value: number) {
  if (value < 0) return 0;
  if (value > 1) return 1;
  return value;
}

function formatPercent(value: number | null, digits = 1) {
  if (value === null || Number.isNaN(value)) return '-';
  return `${(clamp01(value) * 100).toFixed(digits)}%`;
}

function getYearlyClosures(row: PlaceRow) {
  const ordersByYear = normalizeOrdersByYear(row);
  const years = YEAR_OPTIONS.filter((y) => y !== 'Todos');
  return years
    .map((year) => {
      const orders = ordersByYear[year] ?? [];
      if (!orders.length) return null;
      // Closure = max order for that year.
      const max = Math.max(...orders);
      return { year, closure: max };
    })
    .filter((v): v is { year: string; closure: number } => !!v);
}

export default function HomeScreen() {
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

  const currentBuildVersionCode = useMemo(() => {
    const raw = Application.nativeBuildVersion;
    const parsed = raw ? Number(raw) : NaN;
    return Number.isFinite(parsed) ? parsed : null;
  }, []);
  const currentAppVersion = Application.nativeApplicationVersion || '1.0.0';

  const [updateManifest, setUpdateManifest] = useState<UpdateManifest | null>(null);
  const [updateAvailable, setUpdateAvailable] = useState(false);
  const [updateError, setUpdateError] = useState<string | null>(null);
  const [updateBusy, setUpdateBusy] = useState(false);
  const [updateProgress, setUpdateProgress] = useState<number | null>(null);

  const [activeModal, setActiveModal] = useState<'specialty' | 'ccaa' | 'province' | 'city' | null>(null);

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
    // Background update check (no UI blocking). If a new version exists, notify once per version.
    const run = async () => {
      const result = await checkUpdate({ silent: true, force: false });
      if (!result?.available || !result.manifest) return;

      const lastNotified = await getLastNotifiedVersion();
      if (lastNotified !== null && result.manifest.versionCode <= lastNotified) return;
      await setLastNotifiedVersion(result.manifest.versionCode);

      Alert.alert(
        'Actualizacion disponible',
        `Hay una nueva version (build ${result.manifest.versionCode}).`,
        [
          { text: 'Mas tarde', style: 'cancel' },
          { text: 'Descargar', onPress: handleDownloadAndInstallUpdate },
        ]
      );
    };

    run();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [currentBuildVersionCode]);

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
        if (r.last_year_order_max === null) return false;
        if (minOrder !== null && r.last_year_order_max < minOrder) return false;
        if (maxOrder !== null && r.last_year_order_max > maxOrder) return false;
        return true;
      });
    }

    const minPlaces = placesMin ? Number(placesMin) : null;
    const maxPlaces = placesMax ? Number(placesMax) : null;
    if (minPlaces !== null || maxPlaces !== null) {
      rows = rows.filter((r) => {
        if (r.total_places === null) return false;
        if (minPlaces !== null && r.total_places < minPlaces) return false;
        if (maxPlaces !== null && r.total_places > maxPlaces) return false;
        return true;
      });
    }

    const dir = sortDir === 'asc' ? 1 : -1;
    const getValue = (row: PlaceRow) => {
      switch (sortKey) {
        case 'order_selected_year': {
          const selected = getSelectedYearOrders(row, yearFilter);
          const stats = computeOrderStats(selected.orders);
          if (!stats) return null;
          // For a specific year, sort by closure (max). For "Todos" (option A),
          // sort by median of the yearly closures.
          return yearFilter === 'Todos' ? stats.median : stats.max;
        }
        case 'total_places':
          return row.total_places;
        case 'center':
          return row.center || '';
        case 'city':
          return row.city || '';
        case 'province':
          return row.province || '';
        case 'specialty':
          return row.specialty || '';
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

  const handleLogin = async () => {
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
  };

  const handleLogout = async () => {
    setToken(null);
    await SecureStore.deleteItemAsync(TOKEN_KEY);
  };

  const handleAuthError = async (err: unknown) => {
    const message = (err as any)?.message || '';
    if (typeof message === 'string' && message.toLowerCase().includes('unauthorized')) {
      await handleLogout();
      Alert.alert('Sesion caducada', 'Vuelve a iniciar sesion.');
      return true;
    }
    return false;
  };

  const handleFetch = async () => {
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
  };

  const handleClearCache = async () => {
    await AsyncStorage.removeItem(DATA_KEY);
    await AsyncStorage.removeItem(UPDATED_KEY);
    setDataset([]);
    setLastUpdated(null);
  };

  const handleExportCsv = async () => {
    if (!filtered.length) {
      Alert.alert('Sin datos', 'Nada para exportar');
      return;
    }
    setExporting(true);
    try {
      const csv = buildCsv(filtered);
      const baseDir = FileSystem.Paths.cache.uri || FileSystem.Paths.document.uri;
      if (!baseDir) throw new Error('Sin directorio con escritura');
      const fileUri = `${baseDir}postmir_${Date.now()}.csv`;
      await FileSystem.writeAsStringAsync(fileUri, csv, {
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
  };

  const handleExportJson = async () => {
    if (!filtered.length) {
      Alert.alert('Sin datos', 'Nada para exportar');
      return;
    }
    setExporting(true);
    try {
      const baseDir = FileSystem.Paths.cache.uri || FileSystem.Paths.document.uri;
      if (!baseDir) throw new Error('Sin directorio con escritura');
      const fileUri = `${baseDir}postmir_${Date.now()}.json`;
      await FileSystem.writeAsStringAsync(fileUri, JSON.stringify(filtered, null, 2), {
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
  };

  const checkUpdate = async (opts?: { silent?: boolean; force?: boolean }) => {
    const silent = !!opts?.silent;
    const force = !!opts?.force;

    if (!force) {
      const should = await shouldAutoCheckUpdates();
      if (!should) return null;
    }

    if (!silent) {
      setUpdateError(null);
      setUpdateManifest(null);
      setUpdateAvailable(false);
      setUpdateProgress(null);
      setUpdateBusy(true);
    }

    try {
      const res = await fetch(UPDATE_MANIFEST_URL, {
        headers: {
          'Cache-Control': 'no-cache',
        },
      });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const json = (await res.json()) as Partial<UpdateManifest>;
      const versionCode = Number(json.versionCode);
      const apkUrl = typeof json.apkUrl === 'string' ? json.apkUrl : '';
      if (!Number.isFinite(versionCode) || !apkUrl) {
        throw new Error('Manifest de actualizacion invalido');
      }

      const manifest: UpdateManifest = {
        versionCode,
        apkUrl,
        versionName: typeof json.versionName === 'string' ? json.versionName : undefined,
        notes: typeof json.notes === 'string' ? json.notes : undefined,
        publishedAt: typeof json.publishedAt === 'string' ? json.publishedAt : undefined,
      };

      setUpdateManifest(manifest);

      const available =
        currentBuildVersionCode !== null && manifest.versionCode > currentBuildVersionCode;
      setUpdateAvailable(available);

      await markUpdateCheckedNow();
      return { manifest, available };
    } catch (err: any) {
      if (!silent) {
        setUpdateError(err?.message || 'Error al buscar actualizacion');
      }
      return null;
    } finally {
      if (!silent) setUpdateBusy(false);
    }
  };

  const handleCheckUpdate = async () => {
    await checkUpdate({ silent: false, force: true });
  };

  const handleDownloadAndInstallUpdate = async () => {
    if (!updateManifest) {
      Alert.alert('Actualizaciones', 'No hay una actualizacion para descargar.');
      return;
    }
    if (Platform.OS !== 'android') {
      Alert.alert('Actualizaciones', 'La instalacion de APK solo esta disponible en Android.');
      return;
    }

    setUpdateError(null);
    setUpdateBusy(true);
    setUpdateProgress(0);
    try {
      const baseDir = FileSystem.Paths.cache.uri || FileSystem.Paths.document.uri;
      if (!baseDir) throw new Error('Sin directorio con escritura');

      const localUri = `${baseDir}postmir_companion_${updateManifest.versionCode}.apk`;
      const download = FileSystem.createDownloadResumable(
        updateManifest.apkUrl,
        localUri,
        {},
        (progress) => {
          if (progress.totalBytesExpectedToWrite > 0) {
            setUpdateProgress(progress.totalBytesWritten / progress.totalBytesExpectedToWrite);
          }
        }
      );
      const result = await download.downloadAsync();
      if (!result?.uri) throw new Error('Descarga incompleta');

      const contentUri = await FileSystem.getContentUriAsync(result.uri);
      const flags =
        ANDROID_INTENT_FLAG_ACTIVITY_NEW_TASK | ANDROID_INTENT_FLAG_GRANT_READ_URI_PERMISSION;

      await IntentLauncher.startActivityAsync('android.intent.action.VIEW', {
        data: contentUri,
        flags,
        type: 'application/vnd.android.package-archive',
      });
    } catch (err: any) {
      setUpdateError(err?.message || 'Error al descargar/instalar');
      Alert.alert(
        'Actualizaciones',
        'No se pudo iniciar la instalacion. En Android, puede que tengas que permitir "Instalar apps desconocidas" para esta app.'
      );
    } finally {
      setUpdateBusy(false);
      setUpdateProgress(null);
    }
  };


  const renderRow = ({ item }: { item: PlaceRow }) => (
    <View style={styles.card}>
      {(() => {
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
            pctLines.push(
              `Top requerido: ${formatPercent(top)} | Mejor que: ${formatPercent(betterThan)} (N=${total})`
            );
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
          <>
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
            {!isAllYears ? (
              <Text style={styles.cardMeta}>
                Rango: {rangeText} | Mediana: {medianText} | Media: {meanText}
              </Text>
            ) : (
              <Text style={styles.cardMeta}>
                Mediana: {medianText} | p25-p75: {iqrText} | Rango: {rangeText} | Media: {meanText}
              </Text>
            )}
            <Text style={styles.cardMeta}>
              Plazas totales: {item.total_places ?? '-'}
            </Text>
          </>
        );
      })()}
    </View>
  );

  return (
    <SafeAreaView style={styles.safe}>
      <StatusBar style="light" hidden />
      <FlatList
        data={filtered}
        keyExtractor={(item, index) => `${item.center || 'row'}-${index}`}
        renderItem={renderRow}
        ListHeaderComponent={
          <ScrollView contentContainerStyle={styles.header}>
            <Text style={styles.title}>PostMIR</Text>
            <Text style={styles.subtitle}>Busquedas guardadas + filtros</Text>

            {!token ? (
              <View style={styles.section}>
                <Text style={styles.sectionTitle}>Inicio de sesion</Text>
                <TextInput
                  value={email}
                  onChangeText={setEmail}
                  placeholder="Correo"
                  autoCapitalize="none"
                  style={styles.input}
                />
                <TextInput
                  value={password}
                  onChangeText={setPassword}
                  placeholder="Contrasena"
                  secureTextEntry
                  style={styles.input}
                />
                <View style={styles.row}>
                  <Pressable onPress={handleLogin} style={styles.primaryButton}>
                    <Text style={styles.primaryText}>Iniciar sesion</Text>
                  </Pressable>
                </View>
              </View>
            ) : (
              <View style={styles.section}>
                <Text style={styles.sectionTitle}>Sesion</Text>
                <Text style={styles.hint}>Sesion activa</Text>
                <View style={styles.row}>
                  <Pressable onPress={handleLogout} style={styles.secondaryButton}>
                    <Text style={styles.secondaryText}>Cerrar sesion</Text>
                  </Pressable>
                </View>
              </View>
            )}

            <View style={styles.section}>
              <Text style={styles.sectionTitle}>Datos</Text>
              <View style={styles.row}>
                <Pressable onPress={handleFetch} style={styles.primaryButton}>
                  <Text style={styles.primaryText}>Cargar datos</Text>
                </Pressable>
                <Pressable onPress={handleClearCache} style={styles.secondaryButton}>
                  <Text style={styles.secondaryText}>Limpiar cache</Text>
                </Pressable>
              </View>
              <View style={styles.row}>
                <Pressable onPress={handleExportCsv} style={styles.secondaryButton}>
                  <Text style={styles.secondaryText}>Exportar CSV</Text>
                </Pressable>
                <Pressable onPress={handleExportJson} style={styles.secondaryButton}>
                  <Text style={styles.secondaryText}>Exportar JSON</Text>
                </Pressable>
              </View>
              <Text style={styles.hint}>Ultima actualizacion: {lastUpdated || 'sin actualizar'}</Text>
              {(loading || exporting) && <ActivityIndicator color="#93c5fd" />}
            </View>

            <View style={styles.section}>
              <Text style={styles.sectionTitle}>Actualizaciones</Text>
              <Text style={styles.hint}>
                Version actual: {currentAppVersion}
                {currentBuildVersionCode !== null ? ` (build ${currentBuildVersionCode})` : ''}
              </Text>

              <View style={styles.row}>
                <Pressable
                  onPress={handleCheckUpdate}
                  style={styles.secondaryButton}
                  disabled={updateBusy}>
                  <Text style={styles.secondaryText}>
                    {updateBusy ? 'Buscando...' : 'Buscar actualizacion'}
                  </Text>
                </Pressable>

                {updateManifest && updateAvailable && (
                  <Pressable
                    onPress={handleDownloadAndInstallUpdate}
                    style={styles.primaryButton}
                    disabled={updateBusy}>
                    <Text style={styles.primaryText}>Descargar e instalar</Text>
                  </Pressable>
                )}
              </View>

              {updateManifest && currentBuildVersionCode !== null && !updateAvailable && (
                <Text style={styles.hint}>
                  No hay actualizaciones. Ultima version: build {updateManifest.versionCode}
                </Text>
              )}

              {updateManifest && updateAvailable && (
                <>
                  <Text style={styles.hint}>
                    Nueva version: {updateManifest.versionName || currentAppVersion} (build {updateManifest.versionCode})
                  </Text>
                  {!!updateManifest.notes && <Text style={styles.hint}>{updateManifest.notes}</Text>}
                </>
              )}

              {updateProgress !== null && (
                <Text style={styles.hint}>Descargando: {Math.round(updateProgress * 100)}%</Text>
              )}

              {!!updateError && <Text style={styles.errorText}>{updateError}</Text>}
              <Text style={styles.hint}>Requiere permitir "Instalar apps desconocidas".</Text>
            </View>

            <View style={styles.section}>
              <Text style={styles.sectionTitle}>Filtros</Text>
              <Pressable
                onPress={() => setActiveModal('specialty')}
                style={styles.filterButton}>
                <Text style={styles.filterText}>
                  Especialidades: {selectedSpecialties.length || 0}
                </Text>
              </Pressable>
              <Pressable onPress={() => setActiveModal('ccaa')} style={styles.filterButton}>
                <Text style={styles.filterText}>CCAA: {selectedCcaas.length || 0}</Text>
              </Pressable>
              <Pressable onPress={() => setActiveModal('province')} style={styles.filterButton}>
                <Text style={styles.filterText}>Provincia: {selectedProvinces.length || 0}</Text>
              </Pressable>
              <Pressable onPress={() => setActiveModal('city')} style={styles.filterButton}>
                <Text style={styles.filterText}>Ciudad: {selectedCities.length || 0}</Text>
              </Pressable>

              <Text style={styles.hint}>Ano</Text>
              <View style={styles.chipRow}>
                {YEAR_OPTIONS.map((opt) => (
                  <Pressable
                    key={opt}
                    onPress={() => setYearFilter(opt)}
                    style={[styles.chip, yearFilter === opt && styles.chipActive]}>
                    <Text style={[styles.chipText, yearFilter === opt && styles.chipTextActive]}>{opt}</Text>
                  </Pressable>
                ))}
              </View>

              <Text style={styles.hint}>Ordenar resultados por</Text>
              <View style={styles.chipRow}>
                {SORT_OPTIONS.map((opt) => (
                  <Pressable
                    key={opt.key}
                    onPress={() => setSortKey(opt.key)}
                    style={[styles.chip, sortKey === opt.key && styles.chipActive]}>
                    <Text style={[styles.chipText, sortKey === opt.key && styles.chipTextActive]}>
                      {opt.label}
                    </Text>
                  </Pressable>
                ))}
              </View>
              <View style={styles.row}>
                <Pressable
                  onPress={() => setSortDir(sortDir === 'asc' ? 'desc' : 'asc')}
                  style={styles.secondaryButton}>
                  <Text style={styles.secondaryText}>
                    Direccion: {sortDir === 'asc' ? 'Ascendente' : 'Descendente'}
                  </Text>
                </Pressable>
              </View>

              <Text style={styles.hint}>Orden predefinida</Text>
              <View style={styles.chipRow}>
                {ORDER_PRESETS.map((p) => (
                  <Pressable
                    key={p.label}
                    onPress={() => setOrderPreset(p)}
                    style={[styles.chip, orderPreset.label === p.label && styles.chipActive]}>
                    <Text style={[styles.chipText, orderPreset.label === p.label && styles.chipTextActive]}>
                      {p.label}
                    </Text>
                  </Pressable>
                ))}
              </View>

              <View style={styles.row}>
                <TextInput
                  value={orderMin}
                  onChangeText={setOrderMin}
                  placeholder="Orden min"
                  keyboardType="numeric"
                  style={[styles.input, styles.inputHalf]}
                />
                <TextInput
                  value={orderMax}
                  onChangeText={setOrderMax}
                  placeholder="Orden max"
                  keyboardType="numeric"
                  style={[styles.input, styles.inputHalf]}
                />
              </View>

              <View style={styles.row}>
                <TextInput
                  value={placesMin}
                  onChangeText={setPlacesMin}
                  placeholder="Plazas min"
                  keyboardType="numeric"
                  style={[styles.input, styles.inputHalf]}
                />
                <TextInput
                  value={placesMax}
                  onChangeText={setPlacesMax}
                  placeholder="Plazas max"
                  keyboardType="numeric"
                  style={[styles.input, styles.inputHalf]}
                />
              </View>

              <Text style={styles.hint}>Resultados: {filtered.length}</Text>
            </View>

            <View style={styles.section}>
              <Text style={styles.sectionTitle}>Mi percentil (estimado)</Text>
              <Text style={styles.hint}>
                Calcula tu posicion con un N estimado de aspirantes con numero de orden (puedes ajustar N cuando se publique el dato).
              </Text>
              <View style={styles.row}>
                <TextInput
                  value={myOrder}
                  onChangeText={setMyOrder}
                  placeholder="Mi numero de orden"
                  keyboardType="numeric"
                  style={[styles.input, styles.inputHalf]}
                />
                <TextInput
                  value={myN}
                  onChangeText={setMyN}
                  placeholder="N (convocatoria)"
                  keyboardType="numeric"
                  style={[styles.input, styles.inputHalf]}
                />
              </View>
              <Text style={styles.filterText}>
                {myPercentilesText || 'Introduce ambos valores para ver Top y Mejor que.'}
              </Text>
            </View>
          </ScrollView>
        }
      />

      <MultiSelectModal
        title="Especialidades"
        visible={activeModal === 'specialty'}
        options={specialties}
        selected={selectedSpecialties}
        onChange={setSelectedSpecialties}
        onClose={() => setActiveModal(null)}
        searchPlaceholder="Buscar especialidad"
      />
      <MultiSelectModal
        title="CCAA"
        visible={activeModal === 'ccaa'}
        options={ccaas}
        selected={selectedCcaas}
        onChange={setSelectedCcaas}
        onClose={() => setActiveModal(null)}
        searchPlaceholder="Buscar CCAA"
      />
      <MultiSelectModal
        title="Provincia"
        visible={activeModal === 'province'}
        options={provinces}
        selected={selectedProvinces}
        onChange={setSelectedProvinces}
        onClose={() => setActiveModal(null)}
        searchPlaceholder="Buscar provincia"
      />
      <MultiSelectModal
        title="Ciudad"
        visible={activeModal === 'city'}
        options={cities}
        selected={selectedCities}
        onChange={setSelectedCities}
        onClose={() => setActiveModal(null)}
        searchPlaceholder="Buscar ciudad"
      />
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: {
    flex: 1,
    backgroundColor: '#0b1120',
  },
  header: {
    padding: 16,
    gap: 12,
  },
  title: {
    color: '#e2e8f0',
    fontSize: 26,
    fontWeight: '700',
  },
  subtitle: {
    color: '#94a3b8',
  },
  section: {
    backgroundColor: '#0f172a',
    borderRadius: 12,
    padding: 12,
    gap: 10,
    borderWidth: 1,
    borderColor: '#1f2937',
  },
  sectionTitle: {
    color: '#e2e8f0',
    fontSize: 16,
    fontWeight: '600',
  },
  input: {
    backgroundColor: '#111827',
    borderRadius: 8,
    paddingHorizontal: 12,
    paddingVertical: 10,
    color: '#e2e8f0',
    borderWidth: 1,
    borderColor: '#1f2937',
  },
  inputHalf: {
    flex: 1,
  },
  row: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 10,
    alignItems: 'center',
  },
  primaryButton: {
    paddingHorizontal: 12,
    paddingVertical: 10,
    borderRadius: 8,
    backgroundColor: '#2563eb',
  },
  primaryText: {
    color: '#e2e8f0',
    fontWeight: '600',
  },
  secondaryButton: {
    paddingHorizontal: 12,
    paddingVertical: 10,
    borderRadius: 8,
    backgroundColor: '#1f2937',
  },
  secondaryText: {
    color: '#e2e8f0',
  },
  hint: {
    color: '#94a3b8',
    fontSize: 12,
  },
  errorText: {
    color: '#fca5a5',
    fontSize: 12,
  },
  chipRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
  },
  chip: {
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 999,
    backgroundColor: '#111827',
    borderWidth: 1,
    borderColor: '#1f2937',
  },
  chipActive: {
    backgroundColor: '#1d4ed8',
    borderColor: '#1d4ed8',
  },
  chipText: {
    color: '#cbd5f5',
    fontSize: 12,
  },
  chipTextActive: {
    color: '#e2e8f0',
    fontWeight: '600',
  },
  filterButton: {
    paddingHorizontal: 12,
    paddingVertical: 10,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: '#1f2937',
    backgroundColor: '#111827',
  },
  filterText: {
    color: '#e2e8f0',
  },
  card: {
    backgroundColor: '#0f172a',
    borderRadius: 12,
    padding: 12,
    marginHorizontal: 16,
    marginBottom: 10,
    borderWidth: 1,
    borderColor: '#1f2937',
  },
  cardTitle: {
    color: '#e2e8f0',
    fontWeight: '700',
    marginBottom: 6,
  },
  cardMeta: {
    color: '#94a3b8',
    fontSize: 12,
  },
});
