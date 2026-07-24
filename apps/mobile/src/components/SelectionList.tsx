import { Pressable, StyleSheet, Text, View } from 'react-native';

import { theme } from '../theme';

interface SelectionOption {
  readonly id: string;
  readonly label: string;
}

interface SelectionListProps {
  readonly label: string;
  readonly multiple?: boolean;
  readonly onChange: (selectedIds: readonly string[]) => void;
  readonly options: readonly SelectionOption[];
  readonly selectedIds: readonly string[];
}

export function SelectionList({
  label,
  multiple = false,
  onChange,
  options,
  selectedIds,
}: SelectionListProps) {
  const toggle = (id: string) => {
    if (!multiple) {
      onChange([id]);
      return;
    }
    onChange(
      selectedIds.includes(id)
        ? selectedIds.filter((selectedId) => selectedId !== id)
        : [...selectedIds, id],
    );
  };

  return (
    <View style={styles.container}>
      <Text style={styles.label}>{label}</Text>
      {options.length === 0 ? (
        <Text style={styles.empty}>No hay opciones disponibles.</Text>
      ) : (
        <View style={styles.options}>
          {options.map((option) => {
            const selected = selectedIds.includes(option.id);
            return (
              <Pressable
                accessibilityRole={multiple ? 'checkbox' : 'radio'}
                accessibilityState={{ checked: selected }}
                key={option.id}
                onPress={() => toggle(option.id)}
                style={({ pressed }) => [
                  styles.option,
                  selected ? styles.selected : null,
                  pressed ? styles.pressed : null,
                ]}
              >
                <Text style={selected ? styles.selectedText : styles.text}>
                  {option.label}
                </Text>
              </Pressable>
            );
          })}
        </View>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: { marginBottom: 18 },
  empty: { color: theme.colors.muted, fontSize: 14 },
  label: {
    color: theme.colors.text,
    fontSize: 14,
    fontWeight: '700',
    marginBottom: 8,
  },
  option: {
    borderColor: theme.colors.border,
    borderRadius: 12,
    borderWidth: 1,
    paddingHorizontal: 12,
    paddingVertical: 10,
  },
  options: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  pressed: { opacity: 0.8 },
  selected: { backgroundColor: theme.colors.accent },
  selectedText: { color: theme.colors.background, fontWeight: '800' },
  text: { color: theme.colors.text, fontWeight: '600' },
});
