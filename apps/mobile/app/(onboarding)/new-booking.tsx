import Ionicons from '@expo/vector-icons/Ionicons';
import type { ClientRecord, ClientsResponse } from '@barber-saas/api-client';
import { useQuery } from '@tanstack/react-query';
import { Redirect, useRouter } from 'expo-router';
import { useMemo, useState } from 'react';
import {
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
import { ClientFormSheet } from './clients';

export default function NewBookingScreen() {
  const { session } = useAuth();
  const router = useRouter();
  const [isCreateClientOpen, setIsCreateClientOpen] = useState(false);
  const [search, setSearch] = useState('');
  const [selectedClientId, setSelectedClientId] = useState<string | null>(null);
  const clientsQuery = useQuery({
    enabled: Boolean(session),
    queryFn: () => requireApiClient().request<ClientsResponse>('/v1/clients'),
    queryKey: ['clients'],
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
    if (!selectedClientId) return;
    router.push({
      pathname: '/booking-details' as never,
      params: { clientId: selectedClientId },
    });
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
      <ClientFormSheet
        onClose={() => setIsCreateClientOpen(false)}
        onCreated={(client) => setSelectedClientId(client.id)}
        visible={isCreateClientOpen}
      />      <View style={styles.footer}>
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
