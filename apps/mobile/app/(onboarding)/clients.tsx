import Ionicons from '@expo/vector-icons/Ionicons';
import * as Contacts from 'expo-contacts';
import type {
  ClientLabelRecord,
  ClientLabelsResponse,
  ClientRecord,
  ClientsResponse,
} from '@barber-saas/api-client';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Redirect, useRouter } from 'expo-router';
import { useCallback, useMemo, useState } from 'react';
import {
  Alert,
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

import {
  appStyles,
  appTheme,
  BottomNavigation,
  goldShadow,
} from '../../src/components/BottomNavigation';
import { requireApiClient } from '../../src/lib/api';
import { useAuth } from '../../src/providers/AuthProvider';

export default function ClientsScreen() {
  const { session } = useAuth();
  const router = useRouter();
  const queryClient = useQueryClient();
  const [search, setSearch] = useState('');
  const [activeLabelId, setActiveLabelId] = useState<string | null>(null);
  const [isCreateOpen, setIsCreateOpen] = useState(false);
  const [isImporting, setIsImporting] = useState(false);
  const importContacts = useCallback(async () => {
    if (Platform.OS === 'web') {
      Alert.alert(
        'Importaci?n disponible en el tel?fono',
        'Por privacidad, los contactos solo se pueden sincronizar desde Android o iPhone.',
      );
      return;
    }
    const permission = await Contacts.requestPermissionsAsync();
    if (permission.status !== 'granted') {
      Alert.alert(
        'Permiso necesario',
        'Autoriza el acceso a contactos para importarlos a tu agenda.',
      );
      return;
    }
    setIsImporting(true);
    try {
      const result = await Contacts.getContactsAsync({
        fields: [
          Contacts.Fields.Name,
          Contacts.Fields.PhoneNumbers,
          Contacts.Fields.Emails,
        ],
      });
      const existingClients =
        await requireApiClient().request<ClientsResponse>('/v1/clients');
      const knownPhones = new Set(
        existingClients.clients
          .map((client) => client.phone?.replace(/\D/gu, ''))
          .filter((phone): phone is string => Boolean(phone)),
      );
      const importable = result.data.filter((contact) => {
        const phone = contact.phoneNumbers?.[0]?.number?.replace(/\D/gu, '');
        return (
          Boolean(contact.name || contact.firstName) &&
          Boolean(phone) &&
          !knownPhones.has(phone as string)
        );
      });
      for (const contact of importable) {
        const fullName = (contact.firstName || contact.name || '').trim();
        knownPhones.add(
          (contact.phoneNumbers?.[0]?.number ?? '').replace(/\D/gu, ''),
        );
        await requireApiClient().request('/v1/clients', {
          body: {
            email: contact.emails?.[0]?.email || undefined,
            fullName,
            lastName: contact.lastName || undefined,
            phone: contact.phoneNumbers?.[0]?.number || '',
          },
          method: 'POST',
        });
      }
      await queryClient.invalidateQueries({ queryKey: ['clients'] });
      Alert.alert(
        'Contactos importados',
        importable.length
          ? 'Tus contactos ya est?n disponibles en Nava.'
          : 'No encontramos contactos con nombre y tel?fono para importar.',
      );
    } catch (error) {
      Alert.alert(
        'No pudimos importar los contactos',
        error instanceof Error ? error.message : 'Int?ntalo nuevamente.',
      );
    } finally {
      setIsImporting(false);
    }
  }, [queryClient]);
  const clientsQuery = useQuery({
    enabled: Boolean(session),
    queryFn: () => requireApiClient().request<ClientsResponse>('/v1/clients'),
    queryKey: ['clients'],
  });
  const labelsQuery = useQuery({
    enabled: Boolean(session),
    queryFn: () =>
      requireApiClient().request<ClientLabelsResponse>('/v1/clients/labels'),
    queryKey: ['client-labels'],
  });
  const visibleClients = useMemo(() => {
    const value = search.trim().toLocaleLowerCase('es-EC');
    return (clientsQuery.data?.clients ?? []).filter((client) => {
      const matchesLabel =
        !activeLabelId ||
        client.labels.some((label) => label.id === activeLabelId);
      const matchesSearch =
        !value ||
        [client.fullName, client.phone ?? ''].some((item) =>
          item.toLocaleLowerCase('es-EC').includes(value),
        );
      return matchesLabel && matchesSearch;
    });
  }, [activeLabelId, clientsQuery.data?.clients, search]);
  if (!session) return <Redirect href="/(auth)/login" />;

  return (
    <SafeAreaView edges={['top', 'left', 'right']} style={styles.screen}>
      <View style={styles.header}>
        <Text accessibilityRole="header" style={styles.headerTitle}>
          Clientes
        </Text>
        <Pressable
          accessibilityLabel="Sincronizar contactos del teléfono"
          accessibilityRole="button"
          disabled={isImporting}
          onPress={() => void importContacts()}
          style={[styles.iconButton, isImporting && { opacity: 0.55 }]}
        >
          <Ionicons color="#101c2d" name="sync-outline" size={23} />
        </Pressable>
      </View>

      <ScrollView
        contentContainerStyle={styles.content}
        keyboardShouldPersistTaps="handled"
      >
        <Text style={styles.step}>DIRECTORIO</Text>
        <Text style={styles.title}>Gestiona tus clientes</Text>
        <Text style={styles.subtitle}>
          Encuentra sus datos o registra uno nuevo para tus proximas reservas.
        </Text>
        <View style={styles.searchBox}>
          <Ionicons color="#69717d" name="search-outline" size={23} />
          <TextInput
            accessibilityLabel="Buscar cliente"
            onChangeText={setSearch}
            placeholder="Buscar por nombre o tel?fono"
            placeholderTextColor="#7b838d"
            style={styles.searchInput}
            value={search}
          />
        </View>
        {labelsQuery.data?.labels.length ? (
          <View style={styles.filterSection}>
            <Text style={styles.filterTitle}>Filtrar por etiqueta</Text>
            <ScrollView
              horizontal
              showsHorizontalScrollIndicator={false}
              contentContainerStyle={styles.filterList}
            >
              <LabelFilter
                active={!activeLabelId}
                label={{ color: '#101c2d', id: 'all', name: 'Todos' }}
                onPress={() => setActiveLabelId(null)}
              />
              {labelsQuery.data.labels.map((label) => (
                <LabelFilter
                  active={activeLabelId === label.id}
                  key={label.id}
                  label={label}
                  onPress={() => setActiveLabelId(label.id)}
                />
              ))}
            </ScrollView>
          </View>
        ) : null}
        {visibleClients.length ? (
          <View style={styles.list}>
            {visibleClients.map((client) => (
              <Pressable
                accessibilityHint="Abre la ficha y edición del cliente"
                accessibilityLabel={`Ver cliente ${client.fullName}`}
                accessibilityRole="button"
                key={client.id}
                onPress={() =>
                  router.push({
                    pathname: '/client-detail',
                    params: { clientId: client.id },
                  })
                }
                style={styles.clientRow}
              >
                <View style={styles.avatar}>
                  <Text style={styles.avatarLabel}>
                    {client.fullName.slice(0, 1).toUpperCase()}
                  </Text>
                </View>
                <View style={styles.clientCopy}>
                  <Text style={styles.clientName}>
                    {client.fullName}
                    {client.lastName ? ' ' + client.lastName : ''}
                  </Text>
                  <Text style={styles.clientPhone}>
                    {client.phone || 'Sin tel?fono registrado'}
                  </Text>
                  {client.labels.length ? (
                    <View style={styles.clientLabels}>
                      {client.labels.slice(0, 2).map((label) => (
                        <View
                          key={label.id}
                          style={[
                            styles.clientLabel,
                            { backgroundColor: label.color },
                          ]}
                        >
                          <Text style={styles.clientLabelText}>
                            {label.name}
                          </Text>
                        </View>
                      ))}
                    </View>
                  ) : null}
                </View>
                <Ionicons color="#69717d" name="chevron-forward" size={20} />
              </Pressable>
            ))}
          </View>
        ) : (
          <View style={styles.empty}>
            <View style={styles.emptyIcon}>
              <Ionicons color="#101c2d" name="person-add-outline" size={62} />
            </View>
            <Text style={styles.emptyTitle}>
              {search
                ? 'No encontramos coincidencias'
                : 'Tu lista aun esta vacia'}
            </Text>
            <Text style={styles.emptyCopy}>
              {search
                ? 'Prueba con otro nombre o tel?fono.'
                : 'Agrega tu primer cliente para guardar sus datos y agilizar las pr?ximas reservas.'}
            </Text>
            {!search ? (
              <Pressable
                accessibilityRole="button"
                disabled={isImporting}
                onPress={() => void importContacts()}
              >
                <Text style={styles.emptyAction}>
                  {isImporting
                    ? 'Importando contactos...'
                    : 'Importar contactos'}
                </Text>
              </Pressable>
            ) : null}
          </View>
        )}
      </ScrollView>

      <Pressable
        accessibilityLabel="Agregar cliente"
        accessibilityRole="button"
        onPress={() => setIsCreateOpen(true)}
        style={styles.floatingAdd}
      >
        <Ionicons color="#ffffff" name="add" size={29} />
      </Pressable>

      <BottomNavigation active="clients" />
      <ClientFormSheet
        onClose={() => setIsCreateOpen(false)}
        visible={isCreateOpen}
      />
    </SafeAreaView>
  );
}

export function ClientFormSheet({
  onClose,
  onCreated,
  visible,
}: {
  readonly onClose: () => void;
  readonly onCreated?: (client: ClientRecord) => void | Promise<void>;
  readonly visible: boolean;
}) {
  const queryClient = useQueryClient();
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
      return requireApiClient().request<{ client: ClientRecord }>('/v1/clients', {
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
      });
    },
    onError: (error) =>
      Alert.alert(
        'No pudimos guardar el cliente',
        error instanceof Error ? error.message : 'Inténtalo nuevamente.',
      ),
    onSuccess: async ({ client }) => {
      await queryClient.invalidateQueries({ queryKey: ['clients'] });
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
    <Modal animationType="slide" onRequestClose={close} transparent visible={visible}>
      <View style={styles.overlay}>
        <Pressable
          accessibilityLabel="Cerrar formulario"
          accessibilityRole="button"
          onPress={close}
          style={styles.backdrop}
        />
        <View style={styles.sheet}>
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
                <Ionicons color="#101c2d" name="add-circle-outline" size={20} />
                <Text style={styles.additionalLabel}>Agregar campos adicionales</Text>
                <Ionicons color="#69717d" name="chevron-down" size={19} />
              </Pressable>
            ) : (
              <View style={styles.additionalFields}>
                <Text style={styles.additionalHeading}>Información adicional</Text>
                <TextInput accessibilityLabel="Fecha de nacimiento" onChangeText={setBirthDate} placeholder="Fecha de nacimiento (AAAA-MM-DD)" placeholderTextColor="#7b838d" style={styles.field} value={birthDate} />
                <TextInput accessibilityLabel="Dirección" onChangeText={setAddressLine} placeholder="Dirección" placeholderTextColor="#7b838d" style={styles.field} value={addressLine} />
                <TextInput accessibilityLabel="Documento" onChangeText={setDocumentNumber} placeholder="Documento de identidad" placeholderTextColor="#7b838d" style={styles.field} value={documentNumber} />
                <TextInput accessibilityLabel="Email" autoCapitalize="none" keyboardType="email-address" onChangeText={setEmail} placeholder="Correo electrónico" placeholderTextColor="#7b838d" style={styles.field} value={email} />
              </View>
            )}
            <Pressable
              accessibilityRole="button"
              disabled={createClient.isPending || !fullName.trim() || !phone.trim()}
              onPress={() => createClient.mutate()}
              style={[styles.saveButton, (!fullName.trim() || !phone.trim() || createClient.isPending) && styles.saveButtonDisabled]}
            >
              <Text style={styles.saveLabel}>
                {createClient.isPending ? 'Guardando...' : 'Guardar cliente'}
              </Text>
            </Pressable>
          </ScrollView>
        </View>
      </View>
    </Modal>
  );
}

function LabelFilter({
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
const styles = StyleSheet.create({
  additionalFields: { marginTop: 5 },
  additionalHeading: {
    color: '#101c2d',
    fontSize: 14,
    fontWeight: '900',
    marginTop: 14,
  },
  additionalLabel: {
    color: '#101c2d',
    flex: 1,
    fontSize: 14,
    fontWeight: '800',
  },
  additionalTrigger: {
    alignItems: 'center',
    flexDirection: 'row',
    gap: 8,
    marginTop: 18,
    paddingVertical: 7,
  },
  backdrop: { bottom: 0, left: 0, position: 'absolute', right: 0, top: 0 },
  addButton: {
    alignItems: 'center',
    backgroundColor: appTheme.colors.accent,
    borderRadius: 19,
    height: 58,
    justifyContent: 'center',
    shadowColor: appTheme.colors.accentDark,
    shadowOffset: { height: 8, width: 0 },
    shadowOpacity: 0.22,
    shadowRadius: 13,
    width: 58,
  },
  floatingAdd: {
    alignItems: 'center',
    backgroundColor: appTheme.colors.accent,
    borderRadius: 19,
    bottom: 96,
    height: 58,
    justifyContent: 'center',
    position: 'absolute',
    right: 24,
    shadowColor: appTheme.colors.accentDark,
    shadowOffset: { height: 8, width: 0 },
    shadowOpacity: 0.22,
    shadowRadius: 13,
    width: 58,
    zIndex: 2,
  },
  headerSpacer: { height: 50, width: 50 },
  avatar: {
    alignItems: 'center',
    backgroundColor: '#e2e4e7',
    borderRadius: 22,
    height: 44,
    justifyContent: 'center',
    width: 44,
  },
  avatarLabel: { color: '#101c2d', fontSize: 17, fontWeight: '900' },
  clientCopy: { flex: 1 },
  clientLabel: { borderRadius: 9, paddingHorizontal: 7, paddingVertical: 3 },
  clientLabelText: { color: '#ffffff', fontSize: 10, fontWeight: '900' },
  clientLabels: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 5,
    marginTop: 7,
  },
  clientName: { color: '#101c2d', fontSize: 16, fontWeight: '900' },
  clientPhone: { color: '#69717d', fontSize: 13, marginTop: 3 },
  clientRow: {
    alignItems: 'center',
    backgroundColor: appTheme.colors.surface,
    borderColor: appTheme.colors.border,
    borderRadius: 20,
    borderWidth: 1,
    flexDirection: 'row',
    gap: 12,
    marginBottom: 10,
    padding: 14,
    ...goldShadow,
  },
  content: { paddingBottom: 128, paddingHorizontal: 24, paddingTop: 28 },
  empty: { alignItems: 'center', marginHorizontal: 20, marginTop: 76 },
  emptyAction: {
    color: '#101c2d',
    fontSize: 16,
    fontWeight: '900',
    marginTop: 24,
  },
  emptyCopy: {
    color: '#5d6672',
    fontSize: 15,
    lineHeight: 22,
    marginTop: 10,
    textAlign: 'center',
  },
  emptyIcon: {
    alignItems: 'center',
    backgroundColor: '#e4e7eb',
    borderRadius: 72,
    height: 144,
    justifyContent: 'center',
    width: 144,
  },
  emptyTitle: {
    color: '#101c2d',
    fontSize: 22,
    fontWeight: '900',
    marginTop: 21,
  },
  filterChip: {
    borderRadius: 16,
    borderWidth: 1,
    paddingHorizontal: 12,
    paddingVertical: 7,
  },
  filterChipText: { color: '#101c2d', fontSize: 13, fontWeight: '800' },
  filterChipTextActive: { color: '#ffffff' },
  filterList: { gap: 8, paddingRight: 24 },
  filterSection: { marginTop: 18 },
  filterTitle: {
    color: '#5d6672',
    fontSize: 13,
    fontWeight: '800',
    marginBottom: 9,
  },
  field: {
    backgroundColor: '#f2f3f4',
    borderColor: '#d8dadd',
    borderRadius: 16,
    borderWidth: 1,
    color: '#101c2d',
    fontSize: 16,
    marginTop: 12,
    paddingHorizontal: 16,
    paddingVertical: 15,
  },
  handle: {
    alignSelf: 'center',
    backgroundColor: '#c5c8cd',
    borderRadius: 3,
    height: 5,
    width: 46,
  },
  header: {
    alignItems: 'center',
    borderBottomColor: '#e4e5e7',
    borderBottomWidth: 1,
    flexDirection: 'row',
    justifyContent: 'space-between',
    paddingHorizontal: 24,
    paddingVertical: 16,
  },
  headerTitle: { color: '#101c2d', fontSize: 22, fontWeight: '900' },
  iconButton: {
    alignItems: 'center',
    backgroundColor: '#ffffff',
    borderRadius: 18,
    height: 50,
    justifyContent: 'center',
    width: 50,
  },
  list: { marginTop: 23 },
  overlay: {
    backgroundColor: 'rgba(16, 28, 45, 0.48)',
    flex: 1,
    justifyContent: 'flex-end',
  },
  saveButton: {
    alignItems: 'center',
    backgroundColor: appTheme.colors.accent,
    borderRadius: 17,
    marginTop: 22,
    paddingVertical: 17,
  },
  saveButtonDisabled: { opacity: 0.45 },
  saveLabel: { color: '#ffffff', fontSize: 16, fontWeight: '900' },
  screen: appStyles.screen,
  searchBox: {
    alignItems: 'center',
    backgroundColor: appTheme.colors.surface,
    borderColor: appTheme.colors.border,
    borderRadius: 22,
    borderWidth: 1,
    flexDirection: 'row',
    gap: 10,
    marginTop: 28,
    paddingHorizontal: 17,
    height: 67,
    ...goldShadow,
  },
  searchInput: { color: '#101c2d', flex: 1, fontSize: 16 },
  sheet: {
    backgroundColor: appTheme.colors.surfaceMuted,
    borderTopLeftRadius: appTheme.radii.sheet,
    borderTopRightRadius: appTheme.radii.sheet,
    maxHeight: '88%',
    paddingHorizontal: 24,
    paddingBottom: 38,
  },
  sheetDragArea: { paddingTop: 16, paddingBottom: 4 },
  sheetCopy: { color: '#5d6672', fontSize: 15, lineHeight: 21, marginTop: 8 },
  sheetTitle: {
    color: '#101c2d',
    fontSize: 24,
    fontWeight: '900',
    marginTop: 18,
  },
  step: {
    color: '#101c2d',
    fontSize: 12,
    fontWeight: '900',
    letterSpacing: 1.2,
  },
  subtitle: { color: '#5d6672', fontSize: 16, lineHeight: 23, marginTop: 9 },
  title: {
    color: appTheme.colors.text,
    fontSize: 30,
    fontWeight: '900',
    letterSpacing: -0.8,
    marginTop: 9,
  },
});
