import Ionicons from '@expo/vector-icons/Ionicons';
import type { ClientRecord, ClientsResponse } from '@barber-saas/api-client';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Redirect, useRouter } from 'expo-router';
import { useMemo, useState } from 'react';
import {
  Alert,
  Modal,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { requireApiClient } from '../../src/lib/api';
import { useAuth } from '../../src/providers/AuthProvider';

export default function NewBookingScreen() {
  const { session } = useAuth();
  const router = useRouter();
  const queryClient = useQueryClient();
  const [isCreateClientOpen, setIsCreateClientOpen] = useState(false);
  const [newClientName, setNewClientName] = useState('');
  const [newClientPhone, setNewClientPhone] = useState('');
  const [newClientLastName, setNewClientLastName] = useState('');
  const [newClientBirthDate, setNewClientBirthDate] = useState('');
  const [newClientAddress, setNewClientAddress] = useState('');
  const [newClientDocument, setNewClientDocument] = useState('');
  const [newClientEmail, setNewClientEmail] = useState('');
  const [showAdditionalFields, setShowAdditionalFields] = useState(false);
  const [search, setSearch] = useState('');
  const [selectedClientId, setSelectedClientId] = useState<string | null>(null);
  const clientsQuery = useQuery({
    enabled: Boolean(session),
    queryFn: () => requireApiClient().request<ClientsResponse>('/v1/clients'),
    queryKey: ['clients'],
  });
  const createClient = useMutation({
    mutationFn: () => {
      if (!newClientName.trim() || !newClientPhone.trim()) {
        throw new Error('Nombre y teléfono son obligatorios.');
      }
      return requireApiClient().request<{ client: ClientRecord }>(
        '/v1/clients',
        {
          body: {
            addressLine: newClientAddress.trim() || undefined,
            birthDate: newClientBirthDate.trim() || undefined,
            documentNumber: newClientDocument.trim() || undefined,
            email: newClientEmail.trim() || undefined,
            fullName: newClientName.trim(),
            lastName: newClientLastName.trim() || undefined,
            phone: newClientPhone.trim(),
          },
          method: 'POST',
        },
      );
    },
    onError: (error) =>
      Alert.alert(
        'No pudimos guardar el cliente',
        error instanceof Error ? error.message : 'Inténtalo nuevamente.',
      ),
    onSuccess: async ({ client }) => {
      setNewClientName('');
      setNewClientPhone('');
      setNewClientLastName('');
      setNewClientBirthDate('');
      setNewClientAddress('');
      setNewClientDocument('');
      setNewClientEmail('');
      setShowAdditionalFields(false);
      setIsCreateClientOpen(false);
      setSelectedClientId(client.id);
      await queryClient.invalidateQueries({ queryKey: ['clients'] });
    },
  });
  const clients = useMemo(() => {
    const query = search.trim().toLocaleLowerCase('es-EC');
    if (!query) return clientsQuery.data?.clients ?? [];
    return (clientsQuery.data?.clients ?? []).filter((client) =>
      [
        client.fullName,
        client.lastName ?? '',
        client.phone ?? '',
        client.email ?? '',
      ].some((value) => value.toLocaleLowerCase('es-EC').includes(query)),
    );
  }, [clientsQuery.data?.clients, search]);

  if (!session) return <Redirect href="/(auth)/login" />;

  const canContinue = selectedClientId !== null;
  const continueBooking = () => {
    const selected = clientsQuery.data?.clients.find(
      (client) => client.id === selectedClientId,
    );
    Alert.alert(
      'Cliente seleccionado',
      selected
        ? `${selected.fullName} continuará a los siguientes pasos.`
        : 'La reserva continuará sin cliente.',
    );
  };

  return (
    <SafeAreaView edges={['top', 'left', 'right']} style={styles.screen}>
      <View style={styles.header}>
        <Pressable
          accessibilityLabel="Salir"
          onPress={() => router.back()}
          style={styles.backButton}
        >
          <Ionicons color="#111827" name="close" size={24} />
        </Pressable>
        <Text style={styles.step}>PASO 1 DE 4</Text>
        <View style={styles.headerSpacer} />
      </View>
      <ScrollView
        contentContainerStyle={styles.content}
        keyboardShouldPersistTaps="handled"
      >
        <Text style={styles.title}>Elige a tu cliente</Text>
        <Text style={styles.copy}>
          Selecciona un cliente guardado para completar su reserva o continúa
          sin cliente.
        </Text>
        <Pressable
          accessibilityRole="button"
          onPress={() => setIsCreateClientOpen(true)}
          style={styles.addClientButton}
        >
          <Ionicons color="#FFFFFF" name="person-add-outline" size={20} />
          <Text style={styles.addClientLabel}>Añadir cliente</Text>
        </Pressable>
        <View style={styles.searchBox}>
          <Ionicons color="#6E7785" name="search-outline" size={21} />
          <TextInput
            accessibilityLabel="Buscar cliente"
            onChangeText={setSearch}
            placeholder="Buscar por nombre, teléfono o correo"
            placeholderTextColor="#8B96A5"
            style={styles.searchInput}
            value={search}
          />
        </View>
        <Pressable
          accessibilityRole="button"
          onPress={() => setSelectedClientId('without-client')}
          style={[
            styles.withoutClient,
            selectedClientId === 'without-client' && styles.selectedCard,
          ]}
        >
          <View style={styles.withoutIcon}>
            <Ionicons color="#111827" name="person-outline" size={22} />
          </View>
          <View style={styles.clientCopy}>
            <Text style={styles.clientName}>Continuar sin cliente</Text>
            <Text style={styles.clientMeta}>Podrás registrarlo después.</Text>
          </View>
          <SelectionIndicator
            selected={selectedClientId === 'without-client'}
          />
        </Pressable>
        <Text style={styles.listTitle}>Clientes guardados</Text>
        {clientsQuery.isLoading ? (
          <Text style={styles.muted}>Cargando clientes...</Text>
        ) : null}
        {clients.map((client) => (
          <ClientOption
            client={client}
            key={client.id}
            onPress={() => setSelectedClientId(client.id)}
            selected={selectedClientId === client.id}
          />
        ))}
        {!clientsQuery.isLoading && !clients.length ? (
          <Text style={styles.muted}>
            No hay clientes que coincidan con la búsqueda.
          </Text>
        ) : null}
      </ScrollView>
      <Modal
        animationType="slide"
        onRequestClose={() => setIsCreateClientOpen(false)}
        transparent
        visible={isCreateClientOpen}
      >
        <View style={styles.modalOverlay}>
          <Pressable
            onPress={() => setIsCreateClientOpen(false)}
            style={styles.modalBackdrop}
          />
          <View style={styles.clientSheet}>
            <View style={styles.handle} />
            <Text style={styles.sheetTitle}>Nuevo cliente</Text>
            <Text style={styles.sheetCopy}>
              Guárdalo y quedará seleccionado para esta reserva.
            </Text>
            <TextInput
              autoFocus
              accessibilityLabel="Nombre del cliente"
              onChangeText={setNewClientName}
              placeholder="Nombre completo"
              placeholderTextColor="#8B96A5"
              style={styles.field}
              value={newClientName}
            />
            <TextInput
              accessibilityLabel="Teléfono del cliente"
              keyboardType="phone-pad"
              onChangeText={setNewClientPhone}
              placeholder="Teléfono"
              placeholderTextColor="#8B96A5"
              style={styles.field}
              value={newClientPhone}
            />
            {!showAdditionalFields ? (
              <Pressable
                accessibilityRole="button"
                onPress={() => setShowAdditionalFields(true)}
                style={styles.additionalTrigger}
              >
                <Ionicons color="#111827" name="add-circle-outline" size={20} />
                <Text style={styles.additionalLabel}>
                  Agregar campos adicionales
                </Text>
                <Ionicons color="#6E7785" name="chevron-down" size={19} />
              </Pressable>
            ) : (
              <View style={styles.additionalFields}>
                <Text style={styles.additionalHeading}>
                  Informacion adicional
                </Text>
                <TextInput
                  accessibilityLabel="Apellidos del cliente"
                  onChangeText={setNewClientLastName}
                  placeholder="Apellidos"
                  placeholderTextColor="#8B96A5"
                  style={styles.field}
                  value={newClientLastName}
                />
                <TextInput
                  accessibilityLabel="Fecha de nacimiento"
                  onChangeText={setNewClientBirthDate}
                  placeholder="Fecha de nacimiento (AAAA-MM-DD)"
                  placeholderTextColor="#8B96A5"
                  style={styles.field}
                  value={newClientBirthDate}
                />
                <TextInput
                  accessibilityLabel="Direccion"
                  onChangeText={setNewClientAddress}
                  placeholder="Direccion"
                  placeholderTextColor="#8B96A5"
                  style={styles.field}
                  value={newClientAddress}
                />
                <TextInput
                  accessibilityLabel="Documento"
                  onChangeText={setNewClientDocument}
                  placeholder="Documento de identidad"
                  placeholderTextColor="#8B96A5"
                  style={styles.field}
                  value={newClientDocument}
                />
                <TextInput
                  accessibilityLabel="Correo electronico"
                  autoCapitalize="none"
                  keyboardType="email-address"
                  onChangeText={setNewClientEmail}
                  placeholder="Correo electronico"
                  placeholderTextColor="#8B96A5"
                  style={styles.field}
                  value={newClientEmail}
                />
              </View>
            )}
            <Pressable
              disabled={
                createClient.isPending ||
                !newClientName.trim() ||
                !newClientPhone.trim()
              }
              onPress={() => createClient.mutate()}
              style={[
                styles.sheetSaveButton,
                (!newClientName.trim() ||
                  !newClientPhone.trim() ||
                  createClient.isPending) &&
                  styles.nextButtonDisabled,
              ]}
            >
              <Text style={styles.nextLabel}>
                {createClient.isPending ? 'Guardando...' : 'Guardar cliente'}
              </Text>
            </Pressable>
          </View>
        </View>
      </Modal>
      <View style={styles.footer}>
        <View style={styles.progressTrack}>
          <View style={styles.progressValue} />
        </View>
        <View style={styles.footerActions}>
          <Pressable onPress={() => router.back()} style={styles.exitButton}>
            <Text style={styles.exitLabel}>Salir</Text>
          </Pressable>
          <Pressable
            disabled={!canContinue}
            onPress={continueBooking}
            style={[
              styles.nextButton,
              !canContinue && styles.nextButtonDisabled,
            ]}
          >
            <Text style={styles.nextLabel}>Siguiente</Text>
            <Ionicons color="#FFFFFF" name="arrow-forward" size={19} />
          </Pressable>
        </View>
      </View>
    </SafeAreaView>
  );
}

function ClientOption({
  client,
  onPress,
  selected,
}: {
  client: ClientRecord;
  onPress: () => void;
  selected: boolean;
}) {
  const name = `${client.fullName}${client.lastName ? ` ${client.lastName}` : ''}`;
  return (
    <Pressable
      accessibilityRole="radio"
      accessibilityState={{ selected }}
      onPress={onPress}
      style={[styles.clientCard, selected && styles.selectedCard]}
    >
      <View style={styles.avatar}>
        <Text style={styles.avatarLabel}>{name.slice(0, 1).toUpperCase()}</Text>
      </View>
      <View style={styles.clientCopy}>
        <Text style={styles.clientName}>{name}</Text>
        <Text style={styles.clientMeta}>{client.phone || 'Sin teléfono'}</Text>
        {client.email ? (
          <Text numberOfLines={1} style={styles.clientEmail}>
            {client.email}
          </Text>
        ) : null}
      </View>
      <SelectionIndicator selected={selected} />
    </Pressable>
  );
}

function SelectionIndicator({ selected }: { selected: boolean }) {
  return (
    <View style={[styles.selection, selected && styles.selectionActive]}>
      {selected ? (
        <Ionicons color="#FFFFFF" name="checkmark" size={15} />
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  additionalFields: { marginTop: 8 },
  additionalHeading: {
    color: '#111827',
    fontSize: 14,
    fontWeight: '800',
    marginTop: 12,
  },
  additionalLabel: {
    color: '#111827',
    flex: 1,
    fontSize: 15,
    fontWeight: '800',
  },
  additionalTrigger: {
    alignItems: 'center',
    flexDirection: 'row',
    gap: 9,
    marginTop: 17,
    paddingVertical: 5,
  },
  addClientButton: {
    alignItems: 'center',
    backgroundColor: '#111827',
    borderRadius: 16,
    flexDirection: 'row',
    gap: 9,
    justifyContent: 'center',
    marginTop: 24,
    minHeight: 54,
  },
  addClientLabel: { color: '#FFFFFF', fontSize: 15, fontWeight: '900' },
  avatar: {
    alignItems: 'center',
    backgroundColor: '#E5E7EB',
    borderRadius: 24,
    height: 48,
    justifyContent: 'center',
    width: 48,
  },
  avatarLabel: { color: '#111827', fontSize: 18, fontWeight: '900' },
  backButton: {
    alignItems: 'center',
    backgroundColor: '#FFFFFF',
    borderColor: '#E1E5EA',
    borderRadius: 17,
    borderWidth: 1,
    height: 44,
    justifyContent: 'center',
    width: 44,
  },
  clientSheet: {
    backgroundColor: '#FFFFFF',
    borderTopLeftRadius: 28,
    borderTopRightRadius: 28,
    paddingBottom: 34,
    paddingHorizontal: 22,
    paddingTop: 14,
  },
  field: {
    backgroundColor: '#F6F7F8',
    borderColor: '#D8DDE3',
    borderRadius: 15,
    borderWidth: 1,
    color: '#111827',
    fontSize: 16,
    marginTop: 13,
    paddingHorizontal: 15,
    paddingVertical: 15,
  },
  handle: {
    alignSelf: 'center',
    backgroundColor: '#C8CDD4',
    borderRadius: 3,
    height: 5,
    width: 45,
  },
  modalBackdrop: { bottom: 0, left: 0, position: 'absolute', right: 0, top: 0 },
  modalOverlay: {
    backgroundColor: 'rgba(17, 24, 39, 0.4)',
    flex: 1,
    justifyContent: 'flex-end',
  },
  clientCard: {
    alignItems: 'center',
    backgroundColor: '#FFFFFF',
    borderColor: '#E1E5EA',
    borderRadius: 19,
    borderWidth: 1,
    flexDirection: 'row',
    gap: 12,
    marginTop: 10,
    padding: 14,
  },
  clientCopy: { flex: 1 },
  clientEmail: { color: '#6E7785', fontSize: 12, marginTop: 3 },
  clientMeta: { color: '#6E7785', fontSize: 13, marginTop: 3 },
  clientName: { color: '#111827', fontSize: 15, fontWeight: '900' },
  content: { paddingBottom: 130, paddingHorizontal: 22, paddingTop: 25 },
  copy: { color: '#5D6672', fontSize: 15, lineHeight: 22, marginTop: 9 },
  exitButton: {
    alignItems: 'center',
    borderColor: '#C8CDD4',
    borderRadius: 16,
    borderWidth: 1,
    flex: 0.8,
    justifyContent: 'center',
    minHeight: 53,
  },
  exitLabel: { color: '#111827', fontSize: 15, fontWeight: '900' },
  footer: {
    backgroundColor: '#FFFFFF',
    borderTopColor: '#E1E5EA',
    borderTopWidth: 1,
    paddingBottom: 16,
    paddingHorizontal: 22,
    paddingTop: 12,
  },
  footerActions: { flexDirection: 'row', gap: 10, marginTop: 12 },
  header: {
    alignItems: 'center',
    flexDirection: 'row',
    justifyContent: 'space-between',
    paddingHorizontal: 22,
    paddingTop: 12,
  },
  headerSpacer: { height: 44, width: 44 },
  listTitle: {
    color: '#111827',
    fontSize: 16,
    fontWeight: '900',
    marginTop: 25,
  },
  muted: { color: '#6E7785', fontSize: 14, marginTop: 14 },
  nextButton: {
    alignItems: 'center',
    backgroundColor: '#111827',
    borderRadius: 16,
    flex: 1.2,
    flexDirection: 'row',
    gap: 8,
    justifyContent: 'center',
    minHeight: 53,
  },
  nextButtonDisabled: { opacity: 0.38 },
  nextLabel: { color: '#FFFFFF', fontSize: 15, fontWeight: '900' },
  progressTrack: {
    backgroundColor: '#E5E7EB',
    borderRadius: 3,
    height: 5,
    overflow: 'hidden',
  },
  progressValue: { backgroundColor: '#111827', height: '100%', width: '25%' },
  sheetCopy: { color: '#6E7785', fontSize: 14, lineHeight: 20, marginTop: 7 },
  sheetSaveButton: {
    alignItems: 'center',
    backgroundColor: '#111827',
    borderRadius: 16,
    justifyContent: 'center',
    marginTop: 21,
    minHeight: 54,
  },
  sheetTitle: {
    color: '#111827',
    fontSize: 22,
    fontWeight: '900',
    marginTop: 17,
  },
  screen: { backgroundColor: '#FBFCFF', flex: 1 },
  searchBox: {
    alignItems: 'center',
    backgroundColor: '#FFFFFF',
    borderColor: '#E1E5EA',
    borderRadius: 17,
    borderWidth: 1,
    flexDirection: 'row',
    gap: 9,
    marginTop: 18,
    paddingHorizontal: 15,
    minHeight: 55,
  },
  searchInput: { color: '#111827', flex: 1, fontSize: 15 },
  selectedCard: {
    backgroundColor: '#F3F4F6',
    borderColor: '#111827',
    borderWidth: 2,
  },
  selection: {
    alignItems: 'center',
    borderColor: '#AAB2BD',
    borderRadius: 14,
    borderWidth: 1.5,
    height: 27,
    justifyContent: 'center',
    width: 27,
  },
  selectionActive: { backgroundColor: '#111827', borderColor: '#111827' },
  step: {
    color: '#111827',
    fontSize: 12,
    fontWeight: '900',
    letterSpacing: 1.1,
  },
  title: {
    color: '#111827',
    fontSize: 29,
    fontWeight: '900',
    letterSpacing: -0.5,
  },
  withoutClient: {
    alignItems: 'center',
    backgroundColor: '#FFFFFF',
    borderColor: '#E1E5EA',
    borderRadius: 19,
    borderWidth: 1,
    flexDirection: 'row',
    gap: 12,
    marginTop: 17,
    padding: 14,
  },
  withoutIcon: {
    alignItems: 'center',
    backgroundColor: '#E5E7EB',
    borderRadius: 23,
    height: 46,
    justifyContent: 'center',
    width: 46,
  },
});
