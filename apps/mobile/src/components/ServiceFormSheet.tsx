import Ionicons from '@expo/vector-icons/Ionicons';
import { useState } from 'react';
import {
  KeyboardAvoidingView,
  Modal,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { NavaButton } from './NavaButton';

export interface ServiceDraft {
  readonly description: string;
  readonly durationMinutes: number;
  readonly name: string;
  readonly price: number;
}

interface ServiceFormSheetProps {
  readonly onClose: () => void;
  readonly onSave: (service: ServiceDraft) => void;
  readonly visible: boolean;
}

function isPositiveNumber(value: string) {
  const parsed = Number(value.replace(',', '.'));
  return Number.isFinite(parsed) && parsed > 0;
}

export function ServiceFormSheet({
  onClose,
  onSave,
  visible,
}: ServiceFormSheetProps) {
  const [name, setName] = useState('');
  const [description, setDescription] = useState('');
  const [duration, setDuration] = useState('');
  const [price, setPrice] = useState('');
  const [submitted, setSubmitted] = useState(false);

  const reset = () => {
    setName('');
    setDescription('');
    setDuration('');
    setPrice('');
    setSubmitted(false);
  };

  const close = () => {
    reset();
    onClose();
  };

  const save = () => {
    setSubmitted(true);
    const normalizedName = name.trim();
    if (
      !normalizedName ||
      !isPositiveNumber(duration) ||
      !isPositiveNumber(price)
    )
      return;

    onSave({
      description: description.trim(),
      durationMinutes: Math.round(Number(duration.replace(',', '.'))),
      name: normalizedName,
      price: Number(price.replace(',', '.')),
    });
    reset();
  };

  return (
    <Modal
      animationType="fade"
      onRequestClose={close}
      statusBarTranslucent
      transparent
      visible={visible}
    >
      <View style={styles.layer}>
        <Pressable
          accessibilityLabel="Cerrar formulario de servicio"
          accessibilityRole="button"
          onPress={close}
          style={styles.backdrop}
        />

        <KeyboardAvoidingView
          behavior={Platform.OS === 'ios' ? 'padding' : undefined}
          pointerEvents="box-none"
          style={styles.keyboardArea}
        >
          <SafeAreaView edges={['bottom']} style={styles.sheet}>
            <View style={styles.handle} />
            <ScrollView
              contentContainerStyle={styles.content}
              keyboardShouldPersistTaps="handled"
              showsVerticalScrollIndicator={false}
            >
              <View style={styles.header}>
                <View style={styles.headerCopy}>
                  <Text accessibilityRole="header" style={styles.title}>
                    Añadir servicio
                  </Text>
                  <Text style={styles.subtitle}>
                    Define lo que ofrecerás a tus clientes.
                  </Text>
                </View>
                <Pressable
                  accessibilityLabel="Cerrar"
                  accessibilityRole="button"
                  onPress={close}
                  style={styles.closeButton}
                >
                  <Ionicons color="#667080" name="close" size={24} />
                </Pressable>
              </View>

              <View style={styles.field}>
                <Text style={styles.label}>
                  Nombre del servicio <Text style={styles.required}>*</Text>
                </Text>
                <View
                  style={[
                    styles.inputShell,
                    submitted && !name.trim() ? styles.inputError : null,
                  ]}
                >
                  <Ionicons color="#667080" name="cut-outline" size={21} />
                  <TextInput
                    onChangeText={setName}
                    placeholder="Ej. Corte clásico"
                    placeholderTextColor="#98a0ab"
                    style={styles.input}
                    value={name}
                  />
                </View>
                {submitted && !name.trim() ? (
                  <Text accessibilityRole="alert" style={styles.error}>
                    El nombre del servicio es obligatorio.
                  </Text>
                ) : null}
              </View>

              <View style={styles.field}>
                <Text style={styles.label}>Descripción</Text>
                <TextInput
                  multiline
                  onChangeText={setDescription}
                  placeholder="Describe brevemente el servicio"
                  placeholderTextColor="#98a0ab"
                  style={[styles.inputShell, styles.textArea]}
                  textAlignVertical="top"
                  value={description}
                />
              </View>

              <View style={styles.fieldRow}>
                <View style={styles.rowField}>
                  <Text style={styles.label}>
                    Duración <Text style={styles.required}>*</Text>
                  </Text>
                  <View
                    style={[
                      styles.inputShell,
                      submitted && !isPositiveNumber(duration)
                        ? styles.inputError
                        : null,
                    ]}
                  >
                    <Ionicons color="#667080" name="time-outline" size={21} />
                    <TextInput
                      accessibilityLabel="Duración en minutos"
                      keyboardType="number-pad"
                      onChangeText={setDuration}
                      placeholder="30 min"
                      placeholderTextColor="#98a0ab"
                      style={styles.input}
                      value={duration}
                    />
                  </View>
                  {submitted && !isPositiveNumber(duration) ? (
                    <Text accessibilityRole="alert" style={styles.error}>
                      Ingresa una duración válida.
                    </Text>
                  ) : null}
                </View>

                <View style={styles.rowField}>
                  <Text style={styles.label}>
                    Precio <Text style={styles.required}>*</Text>
                  </Text>
                  <View
                    style={[
                      styles.inputShell,
                      submitted && !isPositiveNumber(price)
                        ? styles.inputError
                        : null,
                    ]}
                  >
                    <Text style={styles.currency}>$</Text>
                    <TextInput
                      accessibilityLabel="Precio del servicio"
                      keyboardType="decimal-pad"
                      onChangeText={setPrice}
                      placeholder="15.00"
                      placeholderTextColor="#98a0ab"
                      style={styles.input}
                      value={price}
                    />
                  </View>
                  {submitted && !isPositiveNumber(price) ? (
                    <Text accessibilityRole="alert" style={styles.error}>
                      Ingresa un precio válido.
                    </Text>
                  ) : null}
                </View>
              </View>

              <NavaButton
                icon="checkmark-outline"
                label="Guardar servicio"
                onPress={save}
                style={styles.saveButton}
                variant="primary"
              />
            </ScrollView>
          </SafeAreaView>
        </KeyboardAvoidingView>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  backdrop: {
    ...StyleSheet.absoluteFill,
    backgroundColor: 'rgba(5, 10, 16, 0.62)',
  },
  closeButton: {
    alignItems: 'center',
    backgroundColor: '#f1f3f5',
    borderRadius: 18,
    height: 36,
    justifyContent: 'center',
    width: 36,
  },
  content: {
    paddingBottom: 18,
    paddingHorizontal: 22,
  },
  currency: {
    color: '#667080',
    fontSize: 18,
    fontWeight: '800',
  },
  error: {
    color: '#bd2d2d',
    fontSize: 13,
    marginTop: 6,
  },
  field: {
    marginBottom: 17,
  },
  fieldRow: {
    flexDirection: 'row',
    gap: 12,
  },
  handle: {
    alignSelf: 'center',
    backgroundColor: '#dfe2e5',
    borderRadius: 99,
    height: 6,
    marginBottom: 18,
    marginTop: 12,
    width: 62,
  },
  header: {
    alignItems: 'flex-start',
    flexDirection: 'row',
    gap: 14,
    justifyContent: 'space-between',
    marginBottom: 24,
  },
  headerCopy: {
    flex: 1,
  },
  input: {
    color: '#101c2d',
    flex: 1,
    fontSize: 16,
    minHeight: 54,
  },
  inputError: {
    borderColor: '#bd2d2d',
  },
  inputShell: {
    alignItems: 'center',
    backgroundColor: '#f7f8fa',
    borderColor: '#d9dde3',
    borderRadius: 15,
    borderWidth: 1,
    flexDirection: 'row',
    gap: 11,
    minHeight: 56,
    paddingHorizontal: 15,
  },
  keyboardArea: {
    flex: 1,
    justifyContent: 'flex-end',
  },
  label: {
    color: '#101c2d',
    fontSize: 14,
    fontWeight: '800',
    marginBottom: 8,
  },
  layer: {
    flex: 1,
    justifyContent: 'flex-end',
  },
  required: {
    color: '#bd2d2d',
  },
  rowField: {
    flex: 1,
    marginBottom: 17,
  },
  saveButton: {
    flexBasis: 'auto',
    flexGrow: 0,
    height: 66,
    marginTop: 12,
    width: '100%',
  },
  sheet: {
    backgroundColor: '#fff',
    borderTopLeftRadius: 30,
    borderTopRightRadius: 30,
    maxHeight: '88%',
    overflow: 'hidden',
  },
  subtitle: {
    color: '#667080',
    fontSize: 15,
    lineHeight: 22,
    marginTop: 6,
  },
  textArea: {
    color: '#101c2d',
    fontSize: 16,
    minHeight: 92,
    paddingHorizontal: 15,
    paddingVertical: 14,
  },
  title: {
    color: '#101c2d',
    fontSize: 27,
    fontWeight: '900',
    letterSpacing: -0.7,
  },
});
