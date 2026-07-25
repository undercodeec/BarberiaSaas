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

export interface CollaboratorDraft {
  readonly canPerformServices: boolean;
  readonly customRoleDescription: string;
  readonly customRoleName: string;
  readonly description: string;
  readonly name: string;
  readonly photoUri: string | null;
  readonly role: CollaboratorRole;
}

interface CollaboratorFormSheetProps {
  readonly onClose: () => void;
  readonly onSave: (collaborator: CollaboratorDraft) => void;
  readonly visible: boolean;
}

const ROLE_LABELS: Record<CollaboratorRole, string> = {
  administrator: 'Administrador',
  barber: 'Barbero',
  custom: 'Crear un nuevo tipo',
};

export function CollaboratorFormSheet({
  onClose,
  onSave,
  visible,
}: CollaboratorFormSheetProps) {
  const [photoUri, setPhotoUri] = useState<string | null>(null);
  const [name, setName] = useState('');
  const [description, setDescription] = useState('');
  const [role, setRole] = useState<CollaboratorRole | null>(null);
  const [roleMenuOpen, setRoleMenuOpen] = useState(false);
  const [customRoleName, setCustomRoleName] = useState('');
  const [customRoleDescription, setCustomRoleDescription] = useState('');
  const [canPerformServices, setCanPerformServices] = useState(false);
  const [photoError, setPhotoError] = useState<string | null>(null);
  const [submitted, setSubmitted] = useState(false);

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
    setPhotoError(null);
    setSubmitted(false);
  };

  const close = () => {
    reset();
    onClose();
  };

  const save = () => {
    setSubmitted(true);
    const normalizedName = name.trim();
    const normalizedCustomRoleName = customRoleName.trim();
    if (
      !normalizedName ||
      !role ||
      (role === 'custom' && !normalizedCustomRoleName)
    )
      return;

    onSave({
      canPerformServices:
        role === 'barber' || (role === 'custom' && canPerformServices),
      customRoleDescription: customRoleDescription.trim(),
      customRoleName: normalizedCustomRoleName,
      description: description.trim(),
      name: normalizedName,
      photoUri,
      role,
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
                    Añadir colaborador
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
                icon="checkmark-outline"
                label="Guardar colaborador"
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
  error: {
    color: '#bd2d2d',
    fontSize: 13,
    marginTop: 6,
  },
  field: {
    marginBottom: 16,
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
