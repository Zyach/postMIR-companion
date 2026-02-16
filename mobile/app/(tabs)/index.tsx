import React from 'react';
import {
  ActivityIndicator,
  Pressable,
  SafeAreaView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import { StatusBar } from 'expo-status-bar';

import MultiSelectModal from '@/components/MultiSelectModal';
import { PlaceList } from '@/components/PlaceList';
import { ORDER_PRESETS, SortKey, YEAR_OPTIONS, useDataset } from '@/hooks/use-dataset';
import { useUpdates } from '@/hooks/use-updates';

const API_URL = 'https://postmir.binpar.cloud/api/graphql';
const UPDATE_MANIFEST_URL =
  'https://github.com/Zyach/postMIR-companion/releases/latest/download/latest.json';

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

async function getSavedSearches(token: string) {
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

const SORT_OPTIONS: { key: SortKey; label: string }[] = [
  { key: 'order_selected_year', label: 'Cierre (ano)' },
  { key: 'total_places', label: 'Plazas' },
  { key: 'center', label: 'Centro' },
  { key: 'city', label: 'Ciudad' },
  { key: 'province', label: 'Provincia' },
  { key: 'specialty', label: 'Especialidad' },
];

export default function HomeScreen() {
  const {
    email,
    password,
    token,
    loading,
    exporting,
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
  } = useDataset({
    login,
    getSavedSearches,
    getSavedSearchById,
    getPlacesTree,
  });

  const {
    currentBuildVersionCode,
    currentAppVersion,
    canInstallUpdate,
    updateManifest,
    updateAvailable,
    updateError,
    updateBusy,
    updateProgress,
    handleCheckUpdate,
    handleDownloadAndInstallUpdate,
  } = useUpdates(UPDATE_MANIFEST_URL);

  const [activeModal, setActiveModal] = React.useState<'specialty' | 'ccaa' | 'province' | 'city' | null>(null);

  const listHeader = (
    <View style={styles.header}>
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
          <Pressable onPress={() => handleExportCsv(filtered)} style={styles.secondaryButton}>
            <Text style={styles.secondaryText}>Exportar CSV</Text>
          </Pressable>
          <Pressable onPress={() => handleExportJson(filtered)} style={styles.secondaryButton}>
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

          {updateManifest && updateAvailable && canInstallUpdate && (
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
            {!canInstallUpdate && (
              <Text style={styles.hint}>
                La instalacion automatica del APK solo esta disponible en Android (iOS: solo comprobacion).
              </Text>
            )}
            {!!updateManifest.notes && <Text style={styles.hint}>{updateManifest.notes}</Text>}
          </>
        )}

        {updateProgress !== null && (
          <Text style={styles.hint}>Descargando: {Math.round(updateProgress * 100)}%</Text>
        )}

        {!!updateError && <Text style={styles.errorText}>{updateError}</Text>}
        {canInstallUpdate && (
          <Text style={styles.hint}>Requiere permitir &quot;Instalar apps desconocidas&quot;.</Text>
        )}
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

      <View style={styles.section}>
        <Text style={styles.sectionTitle}>Filtro avanzado</Text>
        <View style={styles.row}>
          <View style={{ flex: 1 }}>
            <Text style={styles.filterText}>Filtrar provincia (texto)</Text>
            <TextInput
              value={orderMin}
              onChangeText={setOrderMin}
              style={styles.input}
            />
          </View>
        </View>
      </View>
    </View>
  );

  return (
    <SafeAreaView style={styles.safe}>
      <StatusBar style="light" hidden />
      <PlaceList
        data={filtered}
        yearFilter={yearFilter}
        styles={styles}
        listHeaderComponent={listHeader}
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
