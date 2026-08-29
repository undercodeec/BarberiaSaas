import Ionicons from '@expo/vector-icons/Ionicons';
import type { ClientRecord, ClientsResponse } from '@barber-saas/api-client';
import { useQuery } from '@tanstack/react-query';
import { Redirect, useRouter } from 'expo-router';
import { useMemo, useState } from 'react';
import { Pressable, StyleSheet, Text, TextInput, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { requireApiClient } from '../../src/lib/api';
import { clientAccessForRole } from '../../src/lib/client-access';
import { KeyboardAwareScrollView as ScrollView } from '../../src/components/KeyboardAwareScrollView';
import { useCurrentOrganization } from '../../src/features/organization/useCurrentOrganization';
import { useAuth } from '../../src/providers/AuthProvider';
import { useTenantScope } from '../../src/providers/TenantScopeProvider';
import {
  appTheme,
  goldButtonShadow,
  useNativeLayoutMetrics,
} from '../../src/components/BottomNavigation';
import { ClientFormSheet } from './clients';

export default function NewBookingScreen() {
  const { session } = useAuth();
  const tenant = useTenantScope();
  const layout = useNativeLayoutMetrics();
  const router = useRouter();
  const organizationQuery = useCurrentOrganization();
  const clientAccess = clientAccessForRole(
    organizationQuery.data?.membership.role,
  );
  const [isCreateClientOpen, setIsCreateClientOpen] = useState(false);
  const [search, setSearch] = useState('');
  const [selectedClientId, setSelectedClientId] = useState<string | null>(null);
  const clientsQuery = useQuery({
    enabled: Boolean(session),
    queryFn: () => requireApiClient().request<ClientsResponse>('/v1/clients'),
    queryKey: tenant.key('clients'),
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
          onPress={() =>
            router.canGoBack() ? router.back() : router.replace('/dashboard')
          }
          style={styles.backButton}
        >
          <Ionicons color={appTheme.colors.icon} name="close" size={24} />
        </Pressable>
        <Text style={styles.step}>PASO 1 DE 4</Text>
        <View style={styles.headerSpacer} />
      </View>
      <ScrollView
        contentContainerStyle={[
          styles.content,
          { paddingBottom: 130 + layout.bottomInset },
        ]}
        keyboardShouldPersistTaps="handled"
      >
        <Text style={styles.title}>Elige a tu cliente</Text>
        <Text style={styles.copy}>
          Selecciona un cliente guardado para completar su reserva o continúa
          sin cliente.
        </Text>
        {clientAccess.canManage ? (
          <Pressable
            accessibilityRole="button"
            onPress={() => setIsCreateClientOpen(true)}
            style={styles.addClientButton}
          >
            <Ionicons
              color={appTheme.colors.white}
              name="person-add-outline"
              size={20}
            />
            <Text style={styles.addClientLabel}>Añadir cliente</Text>
          </Pressable>
        ) : null}
        <View style={styles.searchBox}>
          <Ionicons
            color={appTheme.colors.textMuted}
            name="search-outline"
            size={21}
          />
          <TextInput
            accessibilityLabel="Buscar cliente"
            onChangeText={setSearch}
            placeholder={
              clientAccess.canManage
                ? 'Buscar por nombre, teléfono o correo'
                : 'Buscar por nombre'
            }
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
            <Ionicons
              color={appTheme.colors.icon}
              name="person-outline"
              size={22}
            />
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
      {clientAccess.canManage ? (
        <ClientFormSheet
          onClose={() => setIsCreateClientOpen(false)}
          onCreated={(client) => setSelectedClientId(client.id)}
          visible={isCreateClientOpen}
        />
      ) : null}
      <View
        style={[styles.footer, { paddingBottom: layout.bottomActionPadding }]}
      >
        <View style={styles.progressTrack}>
          <View style={styles.progressValue} />
        </View>
        <View style={styles.footerActions}>
          <Pressable
            onPress={() =>
              router.canGoBack() ? router.back() : router.replace('/dashboard')
            }
            style={styles.exitButton}
          >
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
            <Ionicons
              color={appTheme.colors.white}
              name="arrow-forward"
              size={19}
            />
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
        <Ionicons color={appTheme.colors.white} name="checkmark" size={15} />
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  additionalFields: { marginTop: 8 },
  additionalHeading: {
    color: appTheme.colors.text,
    fontSize: 14,
    fontWeight: '800',
    marginTop: 12,
  },
  additionalLabel: {
    color: appTheme.colors.text,
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
    backgroundColor: appTheme.colors.accent,
    borderRadius: appTheme.radii.control,
    flexDirection: 'row',
    gap: 9,
    justifyContent: 'center',
    marginTop: 24,
    minHeight: 54,
    ...goldButtonShadow,
  },
  addClientLabel: {
    color: appTheme.colors.white,
    fontSize: 15,
    fontWeight: '900',
  },
  avatar: {
    alignItems: 'center',
    backgroundColor: appTheme.colors.accentWash,
    borderRadius: 24,
    height: 48,
    justifyContent: 'center',
    width: 48,
  },
  avatarLabel: {
    color: appTheme.colors.accentActive,
    fontSize: 18,
    fontWeight: '900',
  },
  backButton: {
    alignItems: 'center',
    backgroundColor: appTheme.colors.surface,
    borderColor: appTheme.colors.border,
    borderRadius: appTheme.radii.control,
    borderWidth: 1,
    height: 44,
    justifyContent: 'center',
    width: 44,
  },
  clientSheet: {
    backgroundColor: appTheme.colors.surfaceElevated,
    borderTopLeftRadius: appTheme.radii.sheet,
    borderTopRightRadius: appTheme.radii.sheet,
    paddingBottom: 34,
    paddingHorizontal: 22,
    paddingTop: 14,
  },
  field: {
    backgroundColor: appTheme.colors.surfaceMuted,
    borderColor: appTheme.colors.border,
    borderRadius: appTheme.radii.control,
    borderWidth: 1,
    color: appTheme.colors.text,
    fontSize: 16,
    marginTop: 13,
    paddingHorizontal: 15,
    paddingVertical: 15,
  },
  handle: {
    alignSelf: 'center',
    backgroundColor: appTheme.colors.border,
    borderRadius: 3,
    height: 5,
    width: 45,
  },
  modalBackdrop: { bottom: 0, left: 0, position: 'absolute', right: 0, top: 0 },
  modalOverlay: {
    backgroundColor: appTheme.colors.overlay,
    flex: 1,
    justifyContent: 'flex-end',
  },
  clientCard: {
    alignItems: 'center',
    backgroundColor: appTheme.colors.surface,
    borderColor: appTheme.colors.border,
    borderRadius: appTheme.radii.card,
    borderWidth: 1,
    flexDirection: 'row',
    gap: 12,
    marginTop: 10,
    padding: 14,
  },
  clientCopy: { flex: 1 },
  clientEmail: { color: appTheme.colors.textMuted, fontSize: 12, marginTop: 3 },
  clientMeta: { color: appTheme.colors.textMuted, fontSize: 13, marginTop: 3 },
  clientName: { color: appTheme.colors.text, fontSize: 15, fontWeight: '900' },
  content: {
    paddingBottom: 130,
    paddingHorizontal: appTheme.spacing.page,
    paddingTop: 25,
  },
  copy: {
    color: appTheme.colors.textMuted,
    fontSize: 15,
    lineHeight: 22,
    marginTop: 9,
  },
  exitButton: {
    alignItems: 'center',
    backgroundColor: appTheme.colors.surface,
    borderColor: appTheme.colors.border,
    borderRadius: appTheme.radii.control,
    borderWidth: 1,
    flex: 0.8,
    justifyContent: 'center',
    minHeight: 53,
  },
  exitLabel: {
    color: appTheme.colors.accentDark,
    fontSize: 15,
    fontWeight: '900',
  },
  footer: {
    backgroundColor: appTheme.colors.surfaceElevated,
    borderTopColor: appTheme.colors.border,
    borderTopWidth: 1,
    paddingBottom: 16,
    paddingHorizontal: appTheme.spacing.page,
    paddingTop: 12,
  },
  footerActions: { flexDirection: 'row', gap: 10, marginTop: 12 },
  header: {
    alignItems: 'center',
    flexDirection: 'row',
    justifyContent: 'space-between',
    paddingHorizontal: appTheme.spacing.page,
    paddingTop: 12,
  },
  headerSpacer: { height: 44, width: 44 },
  listTitle: {
    color: appTheme.colors.text,
    fontSize: 16,
    fontWeight: '900',
    marginTop: 25,
  },
  muted: { color: appTheme.colors.textMuted, fontSize: 14, marginTop: 14 },
  nextButton: {
    alignItems: 'center',
    backgroundColor: appTheme.colors.accent,
    borderRadius: appTheme.radii.control,
    flex: 1.2,
    flexDirection: 'row',
    gap: 8,
    justifyContent: 'center',
    minHeight: 53,
    ...goldButtonShadow,
  },
  nextButtonDisabled: { opacity: 0.38 },
  nextLabel: { color: appTheme.colors.white, fontSize: 15, fontWeight: '900' },
  progressTrack: {
    backgroundColor: appTheme.colors.border,
    borderRadius: 3,
    height: 5,
    overflow: 'hidden',
  },
  progressValue: {
    backgroundColor: appTheme.colors.accent,
    height: '100%',
    width: '25%',
  },
  sheetCopy: {
    color: appTheme.colors.textMuted,
    fontSize: 14,
    lineHeight: 20,
    marginTop: 7,
  },
  sheetSaveButton: {
    alignItems: 'center',
    backgroundColor: appTheme.colors.accent,
    borderRadius: appTheme.radii.control,
    justifyContent: 'center',
    marginTop: 21,
    minHeight: 54,
    ...goldButtonShadow,
  },
  sheetTitle: {
    color: appTheme.colors.text,
    fontSize: 22,
    fontWeight: '900',
    marginTop: 17,
  },
  screen: { backgroundColor: appTheme.colors.background, flex: 1 },
  searchBox: {
    alignItems: 'center',
    backgroundColor: appTheme.colors.surface,
    borderColor: appTheme.colors.border,
    borderRadius: appTheme.radii.control,
    borderWidth: 1,
    flexDirection: 'row',
    gap: 9,
    marginTop: 18,
    paddingHorizontal: 15,
    minHeight: 55,
  },
  searchInput: { color: appTheme.colors.text, flex: 1, fontSize: 15 },
  selectedCard: {
    backgroundColor: appTheme.colors.accentWash,
    borderColor: appTheme.colors.accent,
    borderWidth: 2,
  },
  selection: {
    alignItems: 'center',
    borderColor: appTheme.colors.accentLight,
    borderRadius: 14,
    borderWidth: 1.5,
    height: 27,
    justifyContent: 'center',
    width: 27,
  },
  selectionActive: {
    backgroundColor: appTheme.colors.accent,
    borderColor: appTheme.colors.accent,
  },
  step: {
    color: appTheme.colors.accentDark,
    fontSize: 12,
    fontWeight: '900',
    letterSpacing: 1.1,
  },
  title: {
    color: appTheme.colors.text,
    fontSize: 29,
    fontWeight: '900',
    letterSpacing: -0.5,
  },
  withoutClient: {
    alignItems: 'center',
    backgroundColor: appTheme.colors.surface,
    borderColor: appTheme.colors.border,
    borderRadius: appTheme.radii.card,
    borderWidth: 1,
    flexDirection: 'row',
    gap: 12,
    marginTop: 17,
    padding: 14,
  },
  withoutIcon: {
    alignItems: 'center',
    backgroundColor: appTheme.colors.accentWash,
    borderRadius: 23,
    height: 46,
    justifyContent: 'center',
    width: 46,
  },
});
