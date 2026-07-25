import Ionicons from '@expo/vector-icons/Ionicons';
import * as ImagePicker from 'expo-image-picker';
import { useState } from 'react';
import {
  Image,
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

type CollaboratorRole = 'administrator' | 'barber' | 'custom';

export const AGENDA_COLORS = [
  '#EF4444',
  '#F97316',
  '#F59E0B',
  '#EAB308',
  '#84CC16',
  '#22C55E',
  '#10B981',
  '#14B8A6',
  '#06B6D4',
  '#0EA5E9',
  '#3B82F6',
  '#2563EB',
  '#4F46E5',
  '#6366F1',
  '#8B5CF6',
  '#A855F7',
  '#C026D3',
  '#DB2777',
  '#E11D48',
  '#F43F5E',
  '#7F1D1D',
  '#9A3412',
  '#92400E',
  '#854D0E',
  '#3F6212',
  '#166534',
  '#065F46',
  '#115E59',
  '#155E75',
  '#075985',
  '#2464E8',
  '#1E40AF',
  '#3730A3',
  '#5B21B6',
  '#6B21A8',
  '#86198F',
  '#9D174D',
  '#BE123C',
  '#475569',
  '#111827',
] as const;

export interface CollaboratorDraft {
  readonly agendaColor: string;
  readonly canPerformServices: boolean;
  readonly customRoleDescription: string;
  readonly customRoleName: string;
  readonly description: string;
  readonly identification: string;
  readonly name: string;
  readonly phone: string;
  readonly photoUri: string | null;
  readonly role: CollaboratorRole;
}

interface CollaboratorFormSheetProps {
  readonly initialValue?: CollaboratorDraft | null;
  readonly onClose: () => void;
  readonly onDelete?: (() => Promise<void>) | undefined;
  readonly onSave: (collaborator: CollaboratorDraft) => Promise<void> | void;
  readonly visible: boolean;
}

const ROLE_LABELS: Record<CollaboratorRole, string> = {
  administrator: 'Administrador',
  barber: 'Barbero',
  custom: 'Crear un nuevo tipo',
};

export function CollaboratorFormSheet({
  initialValue = null,
  onClose,
  onDelete,
  onSave,
  visible,
}: CollaboratorFormSheetProps) {
  const [photoUri, setPhotoUri] = useState<string | null>(
    initialValue?.photoUri ?? null,
  );
  const [name, setName] = useState(initialValue?.name ?? '');
  const [description, setDescription] = useState(
    initialValue?.description ?? '',
  );
  const [role, setRole] = useState<CollaboratorRole | null>(
    initialValue?.role ?? null,
  );
  const [roleMenuOpen, setRoleMenuOpen] = useState(false);
  const [customRoleName, setCustomRoleName] = useState(
    initialValue?.customRoleName ?? '',
  );
  const [customRoleDescription, setCustomRoleDescription] = useState(
    initialValue?.customRoleDescription ?? '',
  );
  const [canPerformServices, setCanPerformServices] = useState(
    initialValue?.canPerformServices ?? false,
  );
  const [identification, setIdentification] = useState(
    initialValue?.identification ?? '',
  );
  const [phone, setPhone] = useState(initialValue?.phone ?? '');
  const [agendaColor, setAgendaColor] = useState<string>(
    initialValue?.agendaColor ?? '#2464E8',
  );
  const [additionalOpen, setAdditionalOpen] = useState(
    Boolean(initialValue?.identification || initialValue?.phone),
  );
  const [photoError, setPhotoError] = useState<string | null>(null);
  const [formError, setFormError] = useState<string | null>(null);
  const [submitted, setSubmitted] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [isDeleting, setIsDeleting] = useState(false);

  const isEditing = Boolean(initialValue);

  const selectPhoto = async () => {
    setPhotoError(null);
    const permission = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (!permission.granted) {
      setPhotoError('Permite el acceso a tus fotos para elegir una imagen.');
      return;
    }

    const result = await ImagePicker.launchImageLibraryAsync({
      allowsEditing: true,
      aspect: [1, 1],
      mediaTypes: ['images'],
      quality: 0.8,
    });

    if (!result.canceled) setPhotoUri(result.assets[0]?.uri ?? null);
  };

  const reset = () => {
    setPhotoUri(null);
    setName('');
    setDescription('');
    setRole(null);
    setRoleMenuOpen(false);
    setCustomRoleName('');
    setCustomRoleDescription('');
    setCanPerformServices(false);
    setIdentification('');
    setPhone('');
    setAgendaColor('#2464E8');
    setAdditionalOpen(false);
    setPhotoError(null);
    setFormError(null);
    setSubmitted(false);
  };

  const close = () => {
    reset();
    onClose();
  };

  const save = async () => {
    setSubmitted(true);
    const normalizedName = name.trim();
    const normalizedCustomRoleName = customRoleName.trim();
    if (
      !normalizedName ||
      !role ||
      (role === 'custom' && !normalizedCustomRoleName)
    )
      return;

    setIsSaving(true);
    setFormError(null);
    try {
      await onSave({
        agendaColor,
        canPerformServices:
          role === 'barber' || (role === 'custom' && canPerformServices),
        customRoleDescription: customRoleDescription.trim(),
        customRoleName: normalizedCustomRoleName,
        description: description.trim(),
        identification: identification.trim(),
        name: normalizedName,
        phone: phone.trim(),
        photoUri,
        role,
      });
      reset();
    } catch (error) {
      setFormError(
        error instanceof Error
          ? error.message
          : 'No fue posible guardar el colaborador.',
      );
    } finally {
      setIsSaving(false);
    }
  };

  const remove = async () => {
    if (!onDelete) return;
    setIsDeleting(true);
    setFormError(null);
    try {
      await onDelete();
      reset();
    } catch (error) {
      setFormError(
        error instanceof Error
          ? error.message
          : 'No fue posible eliminar el colaborador.',
      );
    } finally {
      setIsDeleting(false);
    }
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
          accessibilityLabel="Cerrar formulario de colaborador"
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
                <View>
                  <Text accessibilityRole="header" style={styles.title}>
                    {isEditing ? 'Editar colaborador' : 'Añadir colaborador'}
                  </Text>
                  <Text style={styles.subtitle}>
                    Completa la información de tu colaborador.
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

              {formError ? (
                <Text accessibilityRole="alert" style={styles.formError}>
                  {formError}
                </Text>
              ) : null}

              <Pressable
                accessibilityLabel="Seleccionar foto de perfil"
                accessibilityRole="button"
                onPress={() => void selectPhoto()}
                style={styles.photoField}
              >
                <View style={styles.avatar}>
                  {photoUri ? (
                    <Image
                      source={{ uri: photoUri }}
                      style={styles.avatarImage}
                    />
                  ) : (
                    <Ionicons color="#667080" name="camera-outline" size={30} />
                  )}
                </View>
                <View style={styles.photoCopy}>
                  <Text style={styles.photoTitle}>Foto de perfil</Text>
                  <Text style={styles.photoHint}>
                    {photoUri ? 'Cambiar fotografía' : 'Seleccionar fotografía'}
                  </Text>
                </View>
                <Ionicons color="#2464e8" name="chevron-forward" size={21} />
              </Pressable>
              {photoError ? (
                <Text accessibilityRole="alert" style={styles.error}>
                  {photoError}
                </Text>
              ) : null}

              <View style={styles.field}>
                <Text style={styles.label}>
                  Nombre <Text style={styles.required}>*</Text>
                </Text>
                <TextInput
                  autoComplete="name"
                  onChangeText={setName}
                  placeholder="Nombre del colaborador"
                  placeholderTextColor="#98a0ab"
                  style={[
                    styles.input,
                    submitted && !name.trim() ? styles.inputError : null,
                  ]}
                  value={name}
                />
                {submitted && !name.trim() ? (
                  <Text accessibilityRole="alert" style={styles.error}>
                    El nombre es obligatorio.
                  </Text>
                ) : null}
              </View>

              <View style={styles.field}>
                <Text style={styles.label}>Descripción</Text>
                <TextInput
                  multiline
                  onChangeText={setDescription}
                  placeholder="Experiencia, especialidad o información adicional"
                  placeholderTextColor="#98a0ab"
                  style={[styles.input, styles.textArea]}
                  textAlignVertical="top"
                  value={description}
                />
              </View>

              <View style={styles.field}>
                <Text style={styles.label}>
                  Tipo de colaborador <Text style={styles.required}>*</Text>
                </Text>
                <Pressable
                  accessibilityLabel={
                    role ? ROLE_LABELS[role] : 'Selecciona un tipo'
                  }
                  accessibilityRole="button"
                  onPress={() => setRoleMenuOpen((current) => !current)}
                  style={[
                    styles.select,
                    submitted && !role ? styles.inputError : null,
                  ]}
                >
                  <Ionicons color="#667080" name="people-outline" size={21} />
                  <Text
                    style={[
                      styles.selectText,
                      !role ? styles.placeholder : null,
                    ]}
                  >
                    {role ? ROLE_LABELS[role] : 'Selecciona un tipo'}
                  </Text>
                  <Ionicons
                    color="#667080"
                    name={roleMenuOpen ? 'chevron-up' : 'chevron-down'}
                    size={20}
                  />
                </Pressable>

                {roleMenuOpen ? (
                  <View style={styles.roleMenu}>
                    {(Object.keys(ROLE_LABELS) as CollaboratorRole[]).map(
                      (option) => (
                        <Pressable
                          key={option}
                          accessibilityLabel={ROLE_LABELS[option]}
                          accessibilityRole="button"
                          onPress={() => {
                            setRole(option);
                            setRoleMenuOpen(false);
                            if (option === 'barber')
                              setCanPerformServices(true);
                            if (option === 'administrator')
                              setCanPerformServices(false);
                          }}
                          style={styles.roleOption}
                        >
                          <Text style={styles.roleOptionText}>
                            {ROLE_LABELS[option]}
                          </Text>
                          {role === option ? (
                            <Ionicons
                              color="#2464e8"
                              name="checkmark-circle"
                              size={21}
                            />
                          ) : null}
                        </Pressable>
                      ),
                    )}
                  </View>
                ) : null}

                {submitted && !role ? (
                  <Text accessibilityRole="alert" style={styles.error}>
                    Selecciona un tipo de colaborador.
                  </Text>
                ) : null}
              </View>

              <Pressable
                accessibilityLabel="Configuración adicional"
                accessibilityRole="button"
                onPress={() => setAdditionalOpen((current) => !current)}
                style={styles.additionalToggle}
              >
                <Text style={styles.additionalToggleLabel}>
                  Configuración adicional
                </Text>
                <Ionicons
                  color="#101c2d"
                  name={additionalOpen ? 'chevron-up' : 'chevron-down'}
                  size={21}
                />
              </Pressable>

              {additionalOpen ? (
                <View style={styles.additionalContent}>
                  <View style={styles.field}>
                    <Text style={styles.label}>Identificación</Text>
                    <TextInput
                      onChangeText={setIdentification}
                      placeholder="Cédula, DNI o pasaporte"
                      placeholderTextColor="#98a0ab"
                      style={styles.input}
                      value={identification}
                    />
                  </View>

                  <View style={styles.field}>
                    <Text style={styles.label}>Teléfono</Text>
                    <TextInput
                      keyboardType="phone-pad"
                      onChangeText={setPhone}
                      placeholder="+593 99 000 0000"
                      placeholderTextColor="#98a0ab"
                      style={styles.input}
                      value={phone}
                    />
                  </View>

                  <View style={styles.field}>
                    <Text style={styles.label}>Color en la agenda</Text>
                    <View style={styles.colorGrid}>
                      {AGENDA_COLORS.map((color) => (
                        <Pressable
                          key={color}
                          accessibilityLabel={`Seleccionar color ${color}`}
                          accessibilityRole="button"
                          onPress={() => setAgendaColor(color)}
                          style={[
                            styles.colorOption,
                            { backgroundColor: color },
                            agendaColor === color ? styles.colorSelected : null,
                          ]}
                        >
                          {agendaColor === color ? (
                            <Ionicons
                              color="#ffffff"
                              name="checkmark"
                              size={16}
                            />
                          ) : null}
                        </Pressable>
                      ))}
                    </View>
                  </View>

                  {isEditing && onDelete ? (
                    <Pressable
                      accessibilityLabel="Eliminar colaborador"
                      accessibilityRole="button"
                      disabled={isDeleting || isSaving}
                      onPress={() => void remove()}
                      style={({ pressed }) => [
                        styles.deleteButton,
                        pressed ? styles.deleteButtonPressed : null,
                        isDeleting || isSaving ? styles.disabled : null,
                      ]}
                    >
                      <Ionicons
                        color="#bd2d2d"
                        name="trash-outline"
                        size={20}
                      />
                      <Text style={styles.deleteButtonLabel}>
                        {isDeleting ? 'Eliminando…' : 'Eliminar colaborador'}
                      </Text>
                    </Pressable>
                  ) : null}
                </View>
              ) : null}

              {role === 'custom' ? (
                <View style={styles.customRole}>
                  <Text style={styles.customRoleTitle}>
                    Nuevo tipo de colaborador
                  </Text>

                  <View style={styles.field}>
                    <Text style={styles.label}>
                      Nombre del tipo <Text style={styles.required}>*</Text>
                    </Text>
                    <TextInput
                      onChangeText={setCustomRoleName}
                      placeholder="Ej. Estilista"
                      placeholderTextColor="#98a0ab"
                      style={[
                        styles.input,
                        submitted && !customRoleName.trim()
                          ? styles.inputError
                          : null,
                      ]}
                      value={customRoleName}
                    />
                    {submitted && !customRoleName.trim() ? (
                      <Text accessibilityRole="alert" style={styles.error}>
                        El nombre del tipo es obligatorio.
                      </Text>
                    ) : null}
                  </View>

                  <View style={styles.field}>
                    <Text style={styles.label}>Descripción del tipo</Text>
                    <TextInput
                      multiline
                      onChangeText={setCustomRoleDescription}
                      placeholder="Describe las funciones de este tipo"
                      placeholderTextColor="#98a0ab"
                      style={[styles.input, styles.textAreaSmall]}
                      textAlignVertical="top"
                      value={customRoleDescription}
                    />
                  </View>

                  <Pressable
                    accessibilityLabel="Puede realizar servicios"
                    accessibilityRole="checkbox"
                    accessibilityState={{ checked: canPerformServices }}
                    onPress={() => setCanPerformServices((current) => !current)}
                    style={styles.checkboxRow}
                  >
                    <Ionicons
                      color="#101c2d"
                      name={canPerformServices ? 'checkbox' : 'square-outline'}
                      size={25}
                    />
                    <Text style={styles.checkboxLabel}>
                      Puede realizar servicios
                    </Text>
                  </Pressable>
                </View>
              ) : null}

              <NavaButton
                disabled={isSaving || isDeleting}
                icon="checkmark-outline"
                label="Guardar colaborador"
                loading={isSaving}
                onPress={() => void save()}
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
  additionalContent: {
    backgroundColor: '#f7f8fa',
    borderColor: '#e2e5e9',
    borderRadius: 20,
    borderWidth: 1,
    marginBottom: 16,
    padding: 16,
  },
  additionalToggle: {
    alignItems: 'center',
    borderBottomColor: '#e6e8eb',
    borderTopColor: '#e6e8eb',
    borderTopWidth: 1,
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginBottom: 16,
    minHeight: 52,
  },
  additionalToggleLabel: {
    color: '#101c2d',
    fontSize: 15,
    fontWeight: '800',
  },
  avatar: {
    alignItems: 'center',
    backgroundColor: '#edf1f5',
    borderRadius: 31,
    height: 62,
    justifyContent: 'center',
    overflow: 'hidden',
    width: 62,
  },
  avatarImage: {
    height: '100%',
    width: '100%',
  },
  backdrop: {
    ...StyleSheet.absoluteFill,
    backgroundColor: 'rgba(5, 10, 16, 0.62)',
  },
  checkboxLabel: {
    color: '#101c2d',
    flex: 1,
    fontSize: 15,
    fontWeight: '700',
  },
  checkboxRow: {
    alignItems: 'center',
    flexDirection: 'row',
    gap: 10,
    paddingVertical: 5,
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
  customRole: {
    backgroundColor: '#f7f8fa',
    borderColor: '#e2e5e9',
    borderRadius: 20,
    borderWidth: 1,
    marginBottom: 4,
    padding: 16,
  },
  customRoleTitle: {
    color: '#101c2d',
    fontSize: 17,
    fontWeight: '900',
    marginBottom: 16,
  },
  colorGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 10,
  },
  colorOption: {
    alignItems: 'center',
    borderColor: 'rgba(16, 28, 45, 0.18)',
    borderRadius: 16,
    borderWidth: 1,
    height: 32,
    justifyContent: 'center',
    width: 32,
  },
  colorSelected: {
    borderColor: '#101c2d',
    borderWidth: 3,
    transform: [{ scale: 1.12 }],
  },
  deleteButton: {
    alignItems: 'center',
    borderColor: '#efb6b3',
    borderRadius: 18,
    borderWidth: 1,
    flexDirection: 'row',
    gap: 9,
    justifyContent: 'center',
    marginTop: 4,
    minHeight: 52,
  },
  deleteButtonLabel: {
    color: '#bd2d2d',
    fontSize: 15,
    fontWeight: '800',
  },
  deleteButtonPressed: {
    backgroundColor: '#fff0ee',
  },
  disabled: {
    opacity: 0.55,
  },
  error: {
    color: '#bd2d2d',
    fontSize: 13,
    marginTop: 6,
  },
  field: {
    marginBottom: 16,
  },
  formError: {
    backgroundColor: '#fff0ee',
    borderRadius: 12,
    color: '#a72d27',
    marginBottom: 16,
    padding: 12,
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
    marginBottom: 22,
  },
  input: {
    backgroundColor: '#f7f8fa',
    borderColor: '#d9dde3',
    borderRadius: 15,
    borderWidth: 1,
    color: '#101c2d',
    fontSize: 16,
    minHeight: 56,
    paddingHorizontal: 15,
    paddingVertical: 13,
  },
  inputError: {
    borderColor: '#bd2d2d',
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
  photoCopy: {
    flex: 1,
  },
  photoField: {
    alignItems: 'center',
    borderBottomColor: '#e6e8eb',
    borderBottomWidth: 1,
    flexDirection: 'row',
    gap: 13,
    marginBottom: 19,
    paddingBottom: 18,
  },
  photoHint: {
    color: '#2464e8',
    fontSize: 13,
    fontWeight: '700',
    marginTop: 4,
  },
  photoTitle: {
    color: '#101c2d',
    fontSize: 15,
    fontWeight: '800',
  },
  placeholder: {
    color: '#98a0ab',
  },
  required: {
    color: '#bd2d2d',
  },
  roleMenu: {
    backgroundColor: '#fff',
    borderColor: '#d9dde3',
    borderRadius: 15,
    borderWidth: 1,
    marginTop: 8,
    overflow: 'hidden',
  },
  roleOption: {
    alignItems: 'center',
    borderBottomColor: '#eceef1',
    borderBottomWidth: 1,
    flexDirection: 'row',
    justifyContent: 'space-between',
    minHeight: 52,
    paddingHorizontal: 15,
  },
  roleOptionText: {
    color: '#101c2d',
    fontSize: 15,
    fontWeight: '700',
  },
  saveButton: {
    flexBasis: 'auto',
    flexGrow: 0,
    height: 66,
    marginTop: 18,
    width: '100%',
  },
  select: {
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
  selectText: {
    color: '#101c2d',
    flex: 1,
    fontSize: 16,
  },
  sheet: {
    backgroundColor: '#fff',
    borderTopLeftRadius: 30,
    borderTopRightRadius: 30,
    maxHeight: '91%',
    overflow: 'hidden',
  },
  subtitle: {
    color: '#667080',
    fontSize: 15,
    lineHeight: 22,
    marginTop: 6,
  },
  textArea: {
    minHeight: 92,
  },
  textAreaSmall: {
    minHeight: 78,
  },
  title: {
    color: '#101c2d',
    fontSize: 27,
    fontWeight: '900',
    letterSpacing: -0.7,
  },
});
