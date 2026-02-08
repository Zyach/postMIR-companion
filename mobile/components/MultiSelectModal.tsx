import React, { useMemo, useState } from 'react';
import {
  FlatList,
  Modal,
  Pressable,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';

type Props = {
  title: string;
  visible: boolean;
  options: string[];
  selected: string[];
  onChange: (next: string[]) => void;
  onClose: () => void;
  searchPlaceholder?: string;
};

export default function MultiSelectModal({
  title,
  visible,
  options,
  selected,
  onChange,
  onClose,
  searchPlaceholder,
}: Props) {
  const [query, setQuery] = useState('');

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return options;
    return options.filter((o) => o.toLowerCase().includes(q));
  }, [options, query]);

  const selectedSet = useMemo(() => new Set(selected), [selected]);

  const toggle = (value: string) => {
    if (selectedSet.has(value)) {
      onChange(selected.filter((s) => s !== value));
      return;
    }
    onChange([...selected, value]);
  };

  const selectAll = () => onChange([...options]);
  const clearAll = () => onChange([]);

  return (
    <Modal visible={visible} animationType="slide" onRequestClose={onClose}>
      <View style={styles.container}>
        <View style={styles.header}>
          <Text style={styles.title}>{title}</Text>
          <Pressable onPress={onClose} style={styles.closeButton}>
          <Text style={styles.closeText}>Cerrar</Text>
          </Pressable>
        </View>

        <TextInput
          value={query}
          onChangeText={setQuery}
          placeholder={searchPlaceholder || 'Buscar'}
          style={styles.search}
        />

        <View style={styles.actions}>
          <Pressable onPress={selectAll} style={styles.actionButton}>
            <Text style={styles.actionText}>Seleccionar todo</Text>
          </Pressable>
          <Pressable onPress={clearAll} style={styles.actionButton}>
            <Text style={styles.actionText}>Limpiar</Text>
          </Pressable>
        </View>

        <FlatList
          data={filtered}
          keyExtractor={(item) => item}
          renderItem={({ item }) => {
            const active = selectedSet.has(item);
            return (
              <Pressable
                onPress={() => toggle(item)}
                style={[styles.option, active && styles.optionActive]}>
                <Text style={[styles.optionText, active && styles.optionTextActive]}>
                  {active ? '✓ ' : ''}
                  {item}
                </Text>
              </Pressable>
            );
          }}
        />
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    padding: 16,
    backgroundColor: '#0f172a',
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 12,
  },
  title: {
    color: '#e2e8f0',
    fontSize: 18,
    fontWeight: '600',
  },
  closeButton: {
    paddingHorizontal: 12,
    paddingVertical: 8,
    backgroundColor: '#1f2937',
    borderRadius: 8,
  },
  closeText: {
    color: '#e2e8f0',
  },
  search: {
    backgroundColor: '#111827',
    borderRadius: 10,
    paddingHorizontal: 12,
    paddingVertical: 10,
    color: '#e2e8f0',
    borderWidth: 1,
    borderColor: '#1f2937',
    marginBottom: 10,
  },
  actions: {
    flexDirection: 'row',
    gap: 10,
    marginBottom: 10,
  },
  actionButton: {
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 8,
    backgroundColor: '#1f2937',
  },
  actionText: {
    color: '#e2e8f0',
    fontSize: 12,
  },
  option: {
    paddingVertical: 10,
    paddingHorizontal: 12,
    borderBottomWidth: 1,
    borderBottomColor: '#1f2937',
  },
  optionActive: {
    backgroundColor: '#0b2a4d',
  },
  optionText: {
    color: '#cbd5f5',
  },
  optionTextActive: {
    color: '#93c5fd',
    fontWeight: '600',
  },
});
