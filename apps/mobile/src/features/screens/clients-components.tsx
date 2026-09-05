import { styles } from './clients.styles';
import Ionicons from '@expo/vector-icons/Ionicons';
import type { ClientLabelRecord, ClientRecord } from '@barber-saas/api-client';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { useMemo, useState } from 'react';
import {
  Alert,
  FlatList,
  KeyboardAvoidingView,
  Modal,
  Platform,
  Pressable,
  Text,
  TextInput,
  View,
} from 'react-native';
import { useNativeLayoutMetrics } from '../../components/BottomNavigation';
import { KeyboardAwareScrollView as ScrollView } from '../../components/KeyboardAwareScrollView';
import { requireApiClient } from '../../lib/api';
import { tenantQueryPrefix } from '../../lib/query-keys';

import {
  type ContactsDialogState,
  type ImportContactCandidate,
} from './clients-model';

export function ContactsDialog({
  dialog,
  onClose,
}: {
  readonly dialog: ContactsDialogState | null;
  readonly onClose: () => void;
}) {
  const actions = dialog?.actions?.length
    ? dialog.actions
    : [{ label: 'Entendido' }];
  return (
    <Modal
      animationType="fade"
      onRequestClose={onClose}
      statusBarTranslucent
      transparent
      visible={Boolean(dialog)}
    >
      <View accessibilityViewIsModal style={styles.dialogOverlay}>
        <Pressable
          accessibilityLabel="Cerrar aviso"
          accessibilityRole="button"
          onPress={onClose}
          style={styles.dialogBackdrop}
        />
        <View style={styles.dialogCard}>
          <View style={styles.dialogIcon}>
            <Ionicons color="#B47D17" name="information" size={26} />
          </View>
          <Text accessibilityRole="header" style={styles.dialogTitle}>
            {dialog?.title}
          </Text>
          <Text style={styles.dialogMessage}>{dialog?.message}</Text>
          <View style={styles.dialogActions}>
            {actions.map((action, index) => {
              const isDestructive = action.tone === 'destructive';
              const isPrimary = !isDestructive && index === actions.length - 1;
              return (
                <Pressable
                  accessibilityRole="button"
                  key={action.label}
                  onPress={() => {
                    onClose();
                    action.onPress?.();
                  }}
                  style={[
                    styles.dialogAction,
                    isDestructive
                      ? styles.dialogActionDestructive
                      : isPrimary
                        ? styles.dialogActionPrimary
                        : styles.dialogActionDefault,
                  ]}
                >
                  <Text
                    style={[
                      styles.dialogActionLabel,
                      isDestructive || isPrimary
                        ? styles.dialogActionLabelOnAccent
                        : styles.dialogActionLabelDefault,
                    ]}
                  >
                    {action.label}
                  </Text>
                </Pressable>
              );
            })}
          </View>
        </View>
      </View>
    </Modal>
  );
}
export function ContactImportSheet({
  contacts,
  importing,
  onClose,
  onConfirm,
  onToggleAll,
  onToggleContact,
  selectedContactIds,
  visible,
}: {
  readonly contacts: readonly ImportContactCandidate[];
  readonly importing: boolean;
  readonly onClose: () => void;
  readonly onConfirm: () => void;
  readonly onToggleAll: () => void;
  readonly onToggleContact: (contactId: string) => void;
  readonly selectedContactIds: readonly string[];
  readonly visible: boolean;
}) {
  const [search, setSearch] = useState('');
  const selectedIds = useMemo(
    () => new Set(selectedContactIds),
    [selectedContactIds],
  );
  const searchValue = search.trim().toLocaleLowerCase('es-EC');
  const visibleContacts = useMemo(
    () =>
      contacts.filter(
        (contact) =>
          !searchValue ||
          contact.fullName.toLocaleLowerCase('es-EC').includes(searchValue) ||
          contact.phone.includes(searchValue),
      ),
    [contacts, searchValue],
  );
  const areAllContactsSelected =
    contacts.length > 0 && selectedContactIds.length === contacts.length;

  return (
    <Modal
      animationType="slide"
      onRequestClose={onClose}
      statusBarTranslucent
      transparent
      visible={visible}
    >
      <KeyboardAvoidingView
        behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
        style={styles.modalKeyboard}
      >
        <View style={styles.importOverlay}>
          <Pressable
            accessibilityLabel="Cerrar importación de contactos"
            accessibilityRole="button"
            disabled={importing}
            onPress={onClose}
            style={styles.importBackdrop}
          />
          <View style={styles.importSheet}>
            <View style={styles.sheetDragArea}>
              <View style={styles.handle} />
            </View>
            <Text accessibilityRole="header" style={styles.importTitle}>
              Importar contactos
            </Text>
            <Text style={styles.importCopy}>
              Selecciona los contactos que quieres guardar. Solo enviaremos su
              nombre y teléfono a tu negocio en Nava; luego podrás eliminarlos
              desde Clientes.
            </Text>
            <View style={styles.importSearchBox}>
              <Ionicons color="#69717D" name="search-outline" size={20} />
              <TextInput
                accessibilityLabel="Buscar contacto para importar"
                onChangeText={setSearch}
                placeholder="Buscar contacto"
                placeholderTextColor="#7B838D"
                style={styles.importSearchInput}
                value={search}
              />
            </View>
            <Pressable
              accessibilityRole="button"
              accessibilityState={{ selected: areAllContactsSelected }}
              disabled={importing}
              onPress={onToggleAll}
              style={styles.importSelectAll}
            >
              <Ionicons
                color="#101C2D"
                name={
                  areAllContactsSelected
                    ? 'checkmark-circle'
                    : 'ellipse-outline'
                }
                size={21}
              />
              <Text style={styles.importSelectAllLabel}>
                {areAllContactsSelected
                  ? 'Deseleccionar todos'
                  : 'Seleccionar todos'}
              </Text>
              <Text style={styles.importSelectAllCount}>{contacts.length}</Text>
            </Pressable>
            <FlatList
              contentContainerStyle={styles.importList}
              data={visibleContacts}
              extraData={selectedContactIds}
              initialNumToRender={16}
              keyboardShouldPersistTaps="handled"
              keyExtractor={(contact) => contact.id}
              ListEmptyComponent={
                <Text style={styles.importEmpty}>No hay coincidencias.</Text>
              }
              maxToRenderPerBatch={16}
              renderItem={({ item: contact }) => {
                const isSelected = selectedIds.has(contact.id);
                return (
                  <Pressable
                    accessibilityRole="checkbox"
                    accessibilityState={{ checked: isSelected }}
                    disabled={importing}
                    onPress={() => onToggleContact(contact.id)}
                    style={[
                      styles.importContactRow,
                      isSelected && styles.importContactRowSelected,
                    ]}
                  >
                    <View style={styles.importContactAvatar}>
                      <Text style={styles.importContactAvatarLabel}>
                        {contact.fullName.slice(0, 1).toUpperCase()}
                      </Text>
                    </View>
                    <View style={styles.importContactCopy}>
                      <Text numberOfLines={1} style={styles.importContactName}>
                        {contact.fullName}
                      </Text>
                      <Text numberOfLines={1} style={styles.importContactPhone}>
                        {contact.phone}
                      </Text>
                    </View>
                    <Ionicons
                      color={isSelected ? '#B47D17' : '#69717D'}
                      name={isSelected ? 'checkmark-circle' : 'ellipse-outline'}
                      size={24}
                    />
                  </Pressable>
                );
              }}
              removeClippedSubviews={Platform.OS === 'android'}
              showsVerticalScrollIndicator={false}
              style={styles.importListScroll}
              windowSize={7}
            />
            <View style={styles.importActions}>
              <Pressable
                accessibilityRole="button"
                disabled={importing}
                onPress={onClose}
                style={styles.importCancelButton}
              >
                <Text style={styles.importCancelLabel}>Cancelar</Text>
              </Pressable>
              <Pressable
                accessibilityRole="button"
                disabled={importing || selectedContactIds.length === 0}
                onPress={onConfirm}
                style={[
                  styles.importConfirmButton,
                  (importing || selectedContactIds.length === 0) &&
                    styles.disabled,
                ]}
              >
                <Text style={styles.importConfirmLabel}>
                  {importing
                    ? 'Importando...'
                    : `Importar (${selectedContactIds.length})`}
                </Text>
              </Pressable>
            </View>
          </View>
        </View>
      </KeyboardAvoidingView>
    </Modal>
  );
}

export function ClientFormSheet({
  onClose,
  onCreated,
  onError,
  visible,
}: {
  readonly onClose: () => void;
  readonly onCreated?: (client: ClientRecord) => void | Promise<void>;
  readonly onError?: (title: string, message: string) => void;
  readonly visible: boolean;
}) {
  const queryClient = useQueryClient();
  const layout = useNativeLayoutMetrics();
  const [fullName, setFullName] = useState('');
  const [lastName, setLastName] = useState('');
  const [phone, setPhone] = useState('');
  const [birthDate, setBirthDate] = useState('');
  const [addressLine, setAddressLine] = useState('');
  const [documentNumber, setDocumentNumber] = useState('');
  const [email, setEmail] = useState('');
  const [showAdditionalFields, setShowAdditionalFields] = useState(false);
  const reset = () => {
    setFullName('');
    setLastName('');
    setPhone('');
    setBirthDate('');
    setAddressLine('');
    setDocumentNumber('');
    setEmail('');
    setShowAdditionalFields(false);
  };
  const createClient = useMutation({
    mutationFn: () => {
      if (!fullName.trim() || !phone.trim())
        throw new Error('Ingresa el nombre y teléfono del cliente.');
      return requireApiClient().request<{ client: ClientRecord }>(
        '/v1/clients',
        {
          body: {
            addressLine: addressLine.trim() || undefined,
            birthDate: birthDate.trim() || undefined,
            documentNumber: documentNumber.trim() || undefined,
            email: email.trim() || undefined,
            fullName: fullName.trim(),
            lastName: lastName.trim() || undefined,
            phone: phone.trim(),
          },
          method: 'POST',
        },
      );
    },
    onError: (error) => {
      const message =
        error instanceof Error ? error.message : 'Inténtalo nuevamente.';
      if (onError) {
        onError('No pudimos guardar el cliente', message);
        return;
      }
      Alert.alert('No pudimos guardar el cliente', message);
    },
    onSuccess: async ({ client }) => {
      await queryClient.invalidateQueries({
        queryKey: tenantQueryPrefix('clients-v2'),
      });
      await onCreated?.(client);
      reset();
      onClose();
    },
  });
  const close = () => {
    if (createClient.isPending) return;
    reset();
    onClose();
  };

  return (
    <Modal
      animationType="slide"
      navigationBarTranslucent
      onRequestClose={close}
      statusBarTranslucent
      transparent
      visible={visible}
    >
      <KeyboardAvoidingView
        behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
        style={styles.modalKeyboard}
      >
        <View style={styles.overlay}>
          <Pressable
            accessibilityLabel="Cerrar formulario"
            accessibilityRole="button"
            onPress={close}
            style={styles.backdrop}
          />
          <View
            style={[
              styles.sheet,
              {
                maxHeight: layout.sheetMaxHeight,
                paddingBottom: layout.bottomInset + 20,
              },
            ]}
          >
            <View style={styles.sheetDragArea}>
              <View style={styles.handle} />
            </View>
            <ScrollView
              keyboardShouldPersistTaps="handled"
              showsVerticalScrollIndicator={false}
            >
              <Text style={styles.sheetTitle}>Nuevo cliente</Text>
              <Text style={styles.sheetCopy}>
                Guarda sus datos para encontrarlo al crear una reserva.
              </Text>
              <TextInput
                autoFocus
                accessibilityLabel="Nombre del cliente"
                onChangeText={setFullName}
                placeholder="Nombre"
                placeholderTextColor="#7b838d"
                style={styles.field}
                value={fullName}
              />
              <TextInput
                accessibilityLabel="Apellido del cliente"
                onChangeText={setLastName}
                placeholder="Apellido (opcional)"
                placeholderTextColor="#7b838d"
                style={styles.field}
                value={lastName}
              />
              <TextInput
                accessibilityLabel="Teléfono del cliente"
                keyboardType="phone-pad"
                onChangeText={setPhone}
                placeholder="Teléfono"
                placeholderTextColor="#7b838d"
                style={styles.field}
                value={phone}
              />
              {!showAdditionalFields ? (
                <Pressable
                  accessibilityRole="button"
                  onPress={() => setShowAdditionalFields(true)}
                  style={styles.additionalTrigger}
                >
                  <Ionicons
                    color="#101c2d"
                    name="add-circle-outline"
                    size={20}
                  />
                  <Text style={styles.additionalLabel}>
                    Agregar campos adicionales
                  </Text>
                  <Ionicons color="#69717d" name="chevron-down" size={19} />
                </Pressable>
              ) : (
                <View style={styles.additionalFields}>
                  <Text style={styles.additionalHeading}>
                    Información adicional
                  </Text>
                  <TextInput
                    accessibilityLabel="Fecha de nacimiento"
                    onChangeText={setBirthDate}
                    placeholder="Fecha de nacimiento (AAAA-MM-DD)"
                    placeholderTextColor="#7b838d"
                    style={styles.field}
                    value={birthDate}
                  />
                  <TextInput
                    accessibilityLabel="Dirección"
                    onChangeText={setAddressLine}
                    placeholder="Dirección"
                    placeholderTextColor="#7b838d"
                    style={styles.field}
                    value={addressLine}
                  />
                  <TextInput
                    accessibilityLabel="Documento"
                    onChangeText={setDocumentNumber}
                    placeholder="Documento de identidad"
                    placeholderTextColor="#7b838d"
                    style={styles.field}
                    value={documentNumber}
                  />
                  <TextInput
                    accessibilityLabel="Email"
                    autoCapitalize="none"
                    keyboardType="email-address"
                    onChangeText={setEmail}
                    placeholder="Correo electrónico"
                    placeholderTextColor="#7b838d"
                    style={styles.field}
                    value={email}
                  />
                </View>
              )}
              <Pressable
                accessibilityRole="button"
                disabled={
                  createClient.isPending || !fullName.trim() || !phone.trim()
                }
                onPress={() => createClient.mutate()}
                style={[
                  styles.saveButton,
                  (!fullName.trim() ||
                    !phone.trim() ||
                    createClient.isPending) &&
                    styles.saveButtonDisabled,
                ]}
              >
                <Text style={styles.saveLabel}>
                  {createClient.isPending ? 'Guardando...' : 'Guardar cliente'}
                </Text>
              </Pressable>
            </ScrollView>
          </View>
        </View>
      </KeyboardAvoidingView>
    </Modal>
  );
}

export function LabelFilter({
  active,
  label,
  onPress,
}: {
  active: boolean;
  label: ClientLabelRecord;
  onPress: () => void;
}) {
  return (
    <Pressable
      accessibilityRole="button"
      onPress={onPress}
      style={[
        styles.filterChip,
        { borderColor: label.color },
        active && { backgroundColor: label.color },
      ]}
    >
      <Text
        style={[styles.filterChipText, active && styles.filterChipTextActive]}
      >
        {label.name}
      </Text>
    </Pressable>
  );
}
