import { styles } from '../../src/features/screens/clients.styles';
import Ionicons from '@expo/vector-icons/Ionicons';
import {
  Contact,
  getPermissionsAsync,
  requestPermissionsAsync,
} from 'expo-contacts';
import type {
  ClientLabelsResponse,
  ClientExportResponse,
  ClientRecord,
  ClientsResponse,
  SubscriptionResponse,
} from '@barber-saas/api-client';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import {
  Redirect,
  useFocusEffect,
  useLocalSearchParams,
  useRouter,
} from 'expo-router';
/* eslint-disable react-hooks/refs -- React Native Animated and PanResponder expose stable imperative values used by the floating control. */
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  Animated,
  Linking,
  PanResponder,
  Platform,
  Pressable,
  Text,
  TextInput,
  useWindowDimensions,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { clampFloatingControl } from '../../src/features/screens/floating-control';

import {
  BottomNavigation,
  useNativeLayoutMetrics,
} from '../../src/components/BottomNavigation';
import { KeyboardAwareScrollView as ScrollView } from '../../src/components/KeyboardAwareScrollView';
import { useCurrentOrganization } from '../../src/features/organization/useCurrentOrganization';
import { requireApiClient } from '../../src/lib/api';
import { clientAccessForRole } from '../../src/lib/client-access';
import { normalizeClientsResponse } from '../../src/lib/client-record';
import { phoneNumberToE164 } from '../../src/lib/phone-number';
import { ensurePermissionAccess } from '../../src/lib/permission-access';
import { tenantQueryPrefix } from '../../src/lib/query-keys';
import { shareTemporaryExport } from '../../src/lib/temporary-export';
import { useAuth } from '../../src/providers/AuthProvider';
import { useTenantScope } from '../../src/providers/TenantScopeProvider';
import { GuideAnchor } from '../../src/features/guides/GuideAnchor';
import { useGuides } from '../../src/features/guides/GuideProvider';

import {
  CONTACT_IMPORT_FIELDS,
  type ContactsDialogAction,
  type ContactsDialogState,
  type ImportContactCandidate,
} from '../../src/features/screens/clients-model';
import {
  ClientFormSheet,
  ContactImportSheet,
  ContactsDialog,
  LabelFilter,
} from '../../src/features/screens/clients-components';
export { ClientFormSheet } from '../../src/features/screens/clients-components';

export default function ClientsScreen() {
  const { session } = useAuth();
  const { guide, guideRun, replay } = useLocalSearchParams<{
    guide?: string;
    guideRun?: string;
    replay?: string;
  }>();
  const { completeGuide, startGuide } = useGuides();
  const tenant = useTenantScope();
  const layout = useNativeLayoutMetrics();
  const { height: screenHeight, width: screenWidth } = useWindowDimensions();
  const router = useRouter();
  const queryClient = useQueryClient();
  const startedRouteGuideRef = useRef<string | null>(null);
  useEffect(() => {
    if (guide !== 'add-client') {
      startedRouteGuideRef.current = null;
      return;
    }
    const routeGuideKey = `${guide}:${replay ?? '0'}:${guideRun ?? 'default'}`;
    if (startedRouteGuideRef.current === routeGuideKey) return;
    if (startGuide('add-client', { force: replay === '1' }))
      startedRouteGuideRef.current = routeGuideKey;
  }, [guide, guideRun, replay, startGuide]);
  const floatingClientOffset = useRef(new Animated.ValueXY()).current;
  const floatingClientOffsetRef = useRef({ x: 0, y: 0 });
  const floatingClientPressRef = useRef<() => void>(() => undefined);
  const floatingClientDraggedRef = useRef(false);
  const floatingClientBoundsRef = useRef({
    bottomInset: layout.bottomInset,
    height: screenHeight,
    topInset: layout.topInset,
    width: screenWidth,
  });
  floatingClientBoundsRef.current = {
    bottomInset: layout.bottomInset,
    height: screenHeight,
    topInset: layout.topInset,
    width: screenWidth,
  };
  const floatingClientPanResponder = useRef(
    PanResponder.create({
      onStartShouldSetPanResponder: () => true,
      onStartShouldSetPanResponderCapture: () => true,
      onMoveShouldSetPanResponderCapture: (_, gesture) =>
        Math.abs(gesture.dx) > 4 || Math.abs(gesture.dy) > 4,
      onMoveShouldSetPanResponder: (_, gesture) =>
        Math.abs(gesture.dx) > 4 || Math.abs(gesture.dy) > 4,
      onPanResponderMove: (_, gesture) => {
        if (Math.abs(gesture.dx) > 4 || Math.abs(gesture.dy) > 4)
          floatingClientDraggedRef.current = true;
        const bounds = floatingClientBoundsRef.current;
        floatingClientOffset.setValue(
          clampFloatingControl(
            {
              x: floatingClientOffsetRef.current.x + gesture.dx,
              y: floatingClientOffsetRef.current.y + gesture.dy,
            },
            {
              ...bounds,
              baseX: bounds.width - 24 - 58,
              baseY: bounds.height - (bounds.bottomInset + 84) - 58,
              buttonHeight: 58,
              buttonWidth: 58,
            },
          ),
        );
      },
      onPanResponderGrant: () => {
        floatingClientDraggedRef.current = false;
      },
      onPanResponderRelease: (_, gesture) => {
        if (!floatingClientDraggedRef.current) {
          floatingClientOffset.setValue(floatingClientOffsetRef.current);
          floatingClientPressRef.current();
          return;
        }
        const bounds = floatingClientBoundsRef.current;
        floatingClientOffsetRef.current = clampFloatingControl(
          {
            x: floatingClientOffsetRef.current.x + gesture.dx,
            y: floatingClientOffsetRef.current.y + gesture.dy,
          },
          {
            ...bounds,
            baseX: bounds.width - 24 - 58,
            baseY: bounds.height - (bounds.bottomInset + 84) - 58,
            buttonHeight: 58,
            buttonWidth: 58,
          },
        );
        floatingClientOffset.setValue(floatingClientOffsetRef.current);
      },
      onPanResponderTerminate: () => {
        floatingClientOffset.setValue(floatingClientOffsetRef.current);
      },
      onPanResponderTerminationRequest: () => false,
    }),
  ).current;
  const [search, setSearch] = useState('');
  const [activeLabelId, setActiveLabelId] = useState<string | null>(null);
  const [isCreateOpen, setIsCreateOpen] = useState(false);
  const [isImporting, setIsImporting] = useState(false);
  const [isContactImportOpen, setIsContactImportOpen] = useState(false);
  const [importCandidates, setImportCandidates] = useState<
    readonly ImportContactCandidate[]
  >([]);
  const [selectedImportContactIds, setSelectedImportContactIds] = useState<
    string[]
  >([]);
  const [isDeletingSelected, setIsDeletingSelected] = useState(false);
  const [deletionProgress, setDeletionProgress] = useState<{
    readonly completed: number;
    readonly total: number;
  } | null>(null);
  const [selectedClientIds, setSelectedClientIds] = useState<string[]>([]);
  const didLongPressClient = useRef(false);
  const [dialog, setDialog] = useState<ContactsDialogState | null>(null);
  const openDialog = useCallback(
    (
      title: string,
      message: string,
      actions?: readonly ContactsDialogAction[],
    ) => setDialog(actions ? { actions, message, title } : { message, title }),
    [],
  );
  const organizationQuery = useCurrentOrganization();
  const clientAccess = clientAccessForRole(
    organizationQuery.data?.membership.role,
  );
  const subscriptionQuery = useQuery({
    enabled: Boolean(session && clientAccess.canManage),
    queryFn: () =>
      requireApiClient().request<SubscriptionResponse>('/v1/subscription'),
    queryKey: tenant.key('subscription'),
  });
  const clientLimit = subscriptionQuery.data?.usage.clientLimit ?? null;
  const remainingClientSlots =
    clientLimit === null
      ? null
      : Math.max(0, clientLimit - (subscriptionQuery.data?.usage.clients ?? 0));
  const isClientLimitReached = remainingClientSlots === 0;
  const importContacts = useCallback(async () => {
    if (!clientAccess.canManage) return;
    if (isClientLimitReached) {
      openDialog(
        'Límite de clientes alcanzado',
        `Nava Free permite hasta ${clientLimit ?? 100} clientes activos. Tus clientes actuales se conservan; actualiza tu plan para importar nuevos contactos.`,
      );
      return;
    }
    if (Platform.OS === 'web') {
      openDialog(
        'Importación disponible en el teléfono',
        'Por privacidad, los contactos solo se pueden sincronizar desde Android o iPhone.',
      );
      return;
    }
    try {
      const permission = await ensurePermissionAccess(
        getPermissionsAsync,
        requestPermissionsAsync,
      );

      if (permission !== 'granted') {
        if (permission === 'blocked') {
          openDialog(
            'Permiso de contactos desactivado',
            'Activa Contactos para Nava desde los ajustes del teléfono.',
            [
              { label: 'Ahora no' },
              {
                label: 'Abrir ajustes',
                onPress: () => void Linking.openSettings(),
              },
            ],
          );
        } else {
          openDialog(
            'Permiso necesario',
            'Toca Importar contactos nuevamente y permite el acceso cuando aparezca la ventana del teléfono.',
          );
        }
        return;
      }
    } catch {
      openDialog(
        'No pudimos solicitar el permiso',
        'Revisa el permiso de Contactos para Nava en los ajustes del teléfono.',
        [
          { label: 'Cerrar' },
          {
            label: 'Abrir ajustes',
            onPress: () => void Linking.openSettings(),
          },
        ],
      );
      return;
    }
    setIsImporting(true);
    try {
      const contacts = await Contact.getAllDetails(CONTACT_IMPORT_FIELDS);
      if (!contacts.length) {
        openDialog(
          'Contactos importados',
          'No encontramos contactos en tu teléfono para importar.',
        );
        return;
      }
      const existingClients = normalizeClientsResponse(
        await requireApiClient().request<ClientsResponse>('/v1/clients'),
      );
      const currentOrganization =
        organizationQuery.data ?? (await organizationQuery.refetch()).data;
      const countryCode = currentOrganization?.location?.countryCode;
      if (!countryCode) {
        openDialog(
          'Ubicación necesaria',
          'Configura el país de la sucursal antes de importar contactos.',
        );
        return;
      }
      const knownPhones = new Set(
        existingClients.clients
          .map((client) => phoneNumberToE164(client.phone, countryCode))
          .filter((phone): phone is string => Boolean(phone)),
      );
      const importable = contacts.flatMap((contact) => {
        const fullName = contact.fullName?.trim();
        const phone = contact.phones
          .map((item) => phoneNumberToE164(item.number, countryCode))
          .find((item): item is string => Boolean(item));
        if (!fullName || !phone || knownPhones.has(phone)) {
          return [];
        }
        knownPhones.add(phone);
        return [{ fullName, id: contact.id, phone }];
      });
      if (!importable.length) {
        openDialog(
          'Contactos disponibles',
          'No encontramos contactos nuevos con nombre y teléfono para importar.',
        );
        return;
      }
      setImportCandidates(
        remainingClientSlots === null
          ? importable
          : importable.slice(0, remainingClientSlots),
      );
      setSelectedImportContactIds([]);
      setIsContactImportOpen(true);
    } catch (error) {
      openDialog(
        'No pudimos importar los contactos',
        error instanceof Error ? error.message : 'Inténtalo nuevamente.',
      );
    } finally {
      setIsImporting(false);
    }
  }, [
    clientLimit,
    clientAccess.canManage,
    isClientLimitReached,
    openDialog,
    organizationQuery,
    remainingClientSlots,
  ]);
  const selectedImportContacts = useMemo(() => {
    const selectedIds = new Set(selectedImportContactIds);
    return importCandidates.filter((contact) => selectedIds.has(contact.id));
  }, [importCandidates, selectedImportContactIds]);
  const toggleImportContact = useCallback((contactId: string) => {
    setSelectedImportContactIds((current) =>
      current.includes(contactId)
        ? current.filter((id) => id !== contactId)
        : [...current, contactId],
    );
  }, []);
  const toggleAllImportContacts = useCallback(() => {
    setSelectedImportContactIds((current) =>
      current.length === importCandidates.length
        ? []
        : importCandidates.map((contact) => contact.id),
    );
  }, [importCandidates]);
  const importSelectedContacts = useCallback(async () => {
    if (!selectedImportContacts.length) return;
    let nextContactIndex = 0;
    let importedCount = 0;
    const failureMessages: string[] = [];
    setIsImporting(true);
    try {
      const importContact = async () => {
        while (true) {
          const contact = selectedImportContacts[nextContactIndex];
          nextContactIndex += 1;
          if (!contact) return;
          try {
            await requireApiClient().request<{ readonly client: ClientRecord }>(
              '/v1/clients',
              {
                body: { fullName: contact.fullName, phone: contact.phone },
                method: 'POST',
              },
            );
            importedCount += 1;
          } catch (error) {
            failureMessages.push(
              `${contact.fullName}: ${
                error instanceof Error ? error.message : 'Error desconocido.'
              }`,
            );
          }
        }
      };
      await Promise.all(
        Array.from({ length: Math.min(4, selectedImportContacts.length) }, () =>
          importContact(),
        ),
      );
      await queryClient.invalidateQueries({
        queryKey: tenantQueryPrefix('clients'),
      });
      await queryClient.invalidateQueries({
        queryKey: tenant.key('subscription'),
      });
      setIsContactImportOpen(false);
      setImportCandidates([]);
      setSelectedImportContactIds([]);
      openDialog(
        failureMessages.length ? 'Importación parcial' : 'Contactos importados',
        failureMessages.length
          ? `${importedCount} importados. ${failureMessages.length} no pudieron importarse.\n\n${failureMessages
              .slice(0, 2)
              .join('\n')}`
          : `${importedCount} contacto${
              importedCount === 1 ? '' : 's'
            } importado${importedCount === 1 ? '' : 's'} correctamente.`,
      );
    } finally {
      setIsImporting(false);
    }
  }, [openDialog, queryClient, selectedImportContacts, tenant]);
  const clientsQuery = useQuery({
    enabled: Boolean(session),
    queryFn: () => requireApiClient().request<ClientsResponse>('/v1/clients'),
    queryKey: tenant.key('clients'),
    refetchInterval: 30_000,
    select: normalizeClientsResponse,
  });
  const refetchClients = clientsQuery.refetch;
  useFocusEffect(
    useCallback(() => {
      void refetchClients();
    }, [refetchClients]),
  );
  const labelsQuery = useQuery({
    enabled: Boolean(session && clientAccess.canManageLabels),
    queryFn: () =>
      requireApiClient().request<ClientLabelsResponse>('/v1/clients/labels'),
    queryKey: tenant.key('client-labels'),
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
  const selectedClients = useMemo(() => {
    const selectedIds = new Set(selectedClientIds);
    return (clientsQuery.data?.clients ?? []).filter((client) =>
      selectedIds.has(client.id),
    );
  }, [clientsQuery.data?.clients, selectedClientIds]);
  const isSelectingClients =
    clientAccess.canManage && selectedClients.length > 0;
  const areAllVisibleClientsSelected =
    visibleClients.length > 0 &&
    visibleClients.every((client) => selectedClientIds.includes(client.id));
  const deletionPercentage = deletionProgress
    ? Math.round((deletionProgress.completed / deletionProgress.total) * 100)
    : 0;

  const toggleClientSelection = useCallback((clientId: string) => {
    setSelectedClientIds((current) =>
      current.includes(clientId)
        ? current.filter((id) => id !== clientId)
        : [...current, clientId],
    );
  }, []);

  const toggleVisibleClientSelection = useCallback(() => {
    const visibleIds = visibleClients.map((client) => client.id);
    setSelectedClientIds((current) => {
      const selectedIds = new Set(current);
      if (visibleIds.every((clientId) => selectedIds.has(clientId))) {
        visibleIds.forEach((clientId) => selectedIds.delete(clientId));
      } else {
        visibleIds.forEach((clientId) => selectedIds.add(clientId));
      }
      return [...selectedIds];
    });
  }, [visibleClients]);

  const performClientExport = useCallback(
    async (includeSensitiveDetails: boolean) => {
      if (!selectedClients.length) return;
      try {
        const exported = await requireApiClient().request<ClientExportResponse>(
          '/v1/clients/export',
          {
            body: {
              clientIds: selectedClients.map(({ id }) => id),
              detailLevel: includeSensitiveDetails ? 'complete' : 'minimum',
            },
            method: 'POST',
          },
        );
        await shareTemporaryExport({
          contents: exported.contents,
          filename: exported.filename,
          mimeType: exported.mimeType,
        });
      } catch (error) {
        openDialog(
          'No pudimos exportar los clientes',
          error instanceof Error ? error.message : 'Inténtalo nuevamente.',
        );
      }
    },
    [openDialog, selectedClients],
  );

  const exportSelectedClients = useCallback(() => {
    if (!selectedClients.length) return;
    openDialog(
      'Exportación con datos personales',
      'El archivo puede contener información sensible. Compártelo solo con personas y aplicaciones autorizadas.',
      [
        { label: 'Cancelar' },
        {
          label: 'Datos mínimos',
          onPress: () => void performClientExport(false),
        },
        {
          label: 'Archivo completo',
          onPress: () => void performClientExport(true),
        },
      ],
    );
  }, [openDialog, performClientExport, selectedClients.length]);

  const deleteSelectedClients = useCallback(async () => {
    if (!selectedClients.length) return;
    const clientsToDelete = [...selectedClients];
    const deletedClientIds = new Set<string>();
    const failedClientIds = new Set<string>();
    const failureMessages: string[] = [];
    let completed = 0;
    setIsDeletingSelected(true);
    setDeletionProgress({ completed, total: clientsToDelete.length });
    try {
      let nextClientIndex = 0;
      const deleteClient = async () => {
        while (true) {
          const client = clientsToDelete[nextClientIndex];
          nextClientIndex += 1;
          if (!client) return;
          try {
            await requireApiClient().request<void>(`/v1/clients/${client.id}`, {
              method: 'DELETE',
            });
            deletedClientIds.add(client.id);
            queryClient.setQueryData<ClientsResponse>(
              tenant.key('clients'),
              (current) =>
                current
                  ? {
                      ...current,
                      clients: current.clients.filter(
                        (currentClient) => currentClient.id !== client.id,
                      ),
                    }
                  : current,
            );
          } catch (error) {
            failedClientIds.add(client.id);
            failureMessages.push(
              `${client.fullName}: ${
                error instanceof Error ? error.message : 'Error desconocido.'
              }`,
            );
          } finally {
            completed += 1;
            setDeletionProgress({ completed, total: clientsToDelete.length });
          }
        }
      };
      await Promise.all(
        Array.from({ length: Math.min(4, clientsToDelete.length) }, () =>
          deleteClient(),
        ),
      );
      setSelectedClientIds([...failedClientIds]);
      await queryClient.invalidateQueries({
        queryKey: tenantQueryPrefix('clients'),
      });
      if (failureMessages.length) {
        openDialog(
          'Algunos contactos no se eliminaron',
          `${failureMessages.length} de ${clientsToDelete.length} no pudieron eliminarse.\n\n${failureMessages
            .slice(0, 2)
            .join('\n')}`,
        );
      } else {
        openDialog(
          'Contactos eliminados',
          `${deletedClientIds.size} contacto${
            deletedClientIds.size === 1 ? '' : 's'
          } eliminado${deletedClientIds.size === 1 ? '' : 's'}.`,
        );
      }
    } catch (error) {
      openDialog(
        'No pudimos eliminar todos los clientes',
        error instanceof Error ? error.message : 'Inténtalo nuevamente.',
      );
      await queryClient.invalidateQueries({
        queryKey: tenantQueryPrefix('clients'),
      });
    } finally {
      setIsDeletingSelected(false);
      setDeletionProgress(null);
    }
  }, [openDialog, queryClient, selectedClients, tenant]);

  const confirmDeleteSelectedClients = useCallback(() => {
    if (!selectedClients.length) return;
    openDialog(
      'Eliminar clientes',
      `Eliminarás ${selectedClients.length} cliente${
        selectedClients.length === 1 ? '' : 's'
      } del directorio.`,
      [
        { label: 'Cancelar' },
        {
          label: 'Eliminar',
          onPress: () => void deleteSelectedClients(),
          tone: 'destructive',
        },
      ],
    );
  }, [deleteSelectedClients, openDialog, selectedClients.length]);
  floatingClientPressRef.current = () => {
    if (!isClientLimitReached) setIsCreateOpen(true);
  };

  if (!session) return <Redirect href="/(auth)/login" />;

  return (
    <SafeAreaView edges={['top', 'left', 'right']} style={styles.screen}>
      <View style={styles.header}>
        <Text accessibilityRole="header" style={styles.headerTitle}>
          {isSelectingClients
            ? `${selectedClients.length} seleccionado${
                selectedClients.length === 1 ? '' : 's'
              }`
            : 'Clientes'}
        </Text>
        {isSelectingClients ? (
          <View style={styles.selectionActions}>
            {clientAccess.canExport ? (
              <Pressable
                accessibilityLabel="Exportar clientes seleccionados"
                accessibilityRole="button"
                onPress={() => void exportSelectedClients()}
                style={styles.selectionAction}
              >
                <Ionicons color="#101c2d" name="share-outline" size={22} />
              </Pressable>
            ) : null}
            <Pressable
              accessibilityLabel="Eliminar clientes seleccionados"
              accessibilityRole="button"
              disabled={isDeletingSelected}
              onPress={confirmDeleteSelectedClients}
              style={[
                styles.selectionAction,
                isDeletingSelected && styles.disabled,
              ]}
            >
              <Ionicons color="#B42318" name="trash-outline" size={22} />
            </Pressable>
            <Pressable
              accessibilityLabel="Cancelar selección"
              accessibilityRole="button"
              onPress={() => setSelectedClientIds([])}
              style={styles.selectionAction}
            >
              <Ionicons color="#101c2d" name="close" size={24} />
            </Pressable>
          </View>
        ) : clientAccess.canManage ? (
          <Pressable
            accessibilityLabel="Sincronizar contactos del teléfono"
            accessibilityRole="button"
            disabled={isImporting || isClientLimitReached}
            onPress={() => void importContacts()}
            style={[
              styles.iconButton,
              (isImporting || isClientLimitReached) && { opacity: 0.42 },
            ]}
          >
            <Ionicons color="#101c2d" name="sync-outline" size={23} />
          </Pressable>
        ) : null}
      </View>

      {isDeletingSelected && deletionProgress ? (
        <View
          accessibilityLiveRegion="polite"
          accessibilityRole="progressbar"
          accessibilityValue={{
            max: 100,
            min: 0,
            now: deletionPercentage,
          }}
          style={styles.deletionProgress}
        >
          <View style={styles.deletionProgressHeader}>
            <Text style={styles.deletionProgressLabel}>
              Eliminando contactos
            </Text>
            <Text style={styles.deletionProgressValue}>
              {deletionPercentage}%
            </Text>
          </View>
          <View style={styles.deletionProgressTrack}>
            <View
              style={[
                styles.deletionProgressFill,
                { width: `${deletionPercentage}%` },
              ]}
            />
          </View>
          <Text style={styles.deletionProgressCopy}>
            {deletionProgress.completed} de {deletionProgress.total} contactos
            procesados
          </Text>
        </View>
      ) : null}

      <ScrollView
        contentContainerStyle={[
          styles.content,
          { paddingBottom: layout.bottomNavigationContentPadding },
        ]}
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
            placeholder="Buscar por nombre o teléfono"
            placeholderTextColor="#7b838d"
            style={styles.searchInput}
            value={search}
          />
        </View>
        {visibleClients.length && clientAccess.canManage ? (
          <Pressable
            accessibilityLabel={
              areAllVisibleClientsSelected
                ? 'Deseleccionar todos los contactos visibles'
                : 'Seleccionar todos los contactos visibles'
            }
            accessibilityRole="button"
            accessibilityState={{
              disabled: isDeletingSelected,
              selected: areAllVisibleClientsSelected,
            }}
            disabled={isDeletingSelected}
            onPress={toggleVisibleClientSelection}
            style={[
              styles.selectAllButton,
              isDeletingSelected && styles.disabled,
            ]}
          >
            <Ionicons
              color="#101c2d"
              name={
                areAllVisibleClientsSelected
                  ? 'checkmark-circle'
                  : 'ellipse-outline'
              }
              size={21}
            />
            <Text style={styles.selectAllLabel}>
              {areAllVisibleClientsSelected
                ? 'Deseleccionar todos'
                : 'Seleccionar todos'}
            </Text>
            <Text style={styles.selectAllCount}>{visibleClients.length}</Text>
          </Pressable>
        ) : null}
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
            {visibleClients.map((client) => {
              const isSelected = selectedClientIds.includes(client.id);
              return (
                <Pressable
                  accessibilityHint="Abre la ficha y edición del cliente"
                  accessibilityLabel={`Ver cliente ${client.fullName}`}
                  accessibilityRole="button"
                  key={client.id}
                  accessibilityState={{
                    disabled: isDeletingSelected,
                    selected: isSelected,
                  }}
                  delayLongPress={350}
                  disabled={isDeletingSelected}
                  onLongPress={
                    clientAccess.canManage
                      ? () => {
                          didLongPressClient.current = true;
                          toggleClientSelection(client.id);
                        }
                      : undefined
                  }
                  onPress={() => {
                    if (didLongPressClient.current) {
                      didLongPressClient.current = false;
                      return;
                    }
                    if (isSelectingClients) {
                      toggleClientSelection(client.id);
                      return;
                    }
                    router.push({
                      pathname: '/client-detail',
                      params: { clientId: client.id },
                    });
                  }}
                  style={[
                    styles.clientRow,
                    isSelected && styles.clientRowSelected,
                  ]}
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
                      {client.phone || 'Sin teléfono registrado'}
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
                  {isSelectingClients ? (
                    <Ionicons
                      color={isSelected ? '#101c2d' : '#69717d'}
                      name={isSelected ? 'checkmark-circle' : 'ellipse-outline'}
                      size={24}
                    />
                  ) : (
                    <Ionicons
                      color="#69717d"
                      name="chevron-forward"
                      size={20}
                    />
                  )}
                </Pressable>
              );
            })}
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
                ? 'Prueba con otro nombre o teléfono.'
                : 'Agrega tu primer cliente para guardar sus datos y agilizar las próximas reservas.'}
            </Text>
            {!search && clientAccess.canManage ? (
              <Pressable
                accessibilityRole="button"
                disabled={isImporting || isClientLimitReached}
                onPress={() => void importContacts()}
              >
                <Text style={styles.emptyAction}>
                  {isClientLimitReached
                    ? 'Límite de Nava Free alcanzado'
                    : isImporting
                      ? 'Importando contactos...'
                      : 'Importar contactos'}
                </Text>
              </Pressable>
            ) : null}
          </View>
        )}
      </ScrollView>

      {clientAccess.canManage ? (
        <Animated.View
          {...floatingClientPanResponder.panHandlers}
          style={[
            styles.floatingAdd,
            { bottom: layout.bottomNavigationContentPadding },
            { transform: floatingClientOffset.getTranslateTransform() },
          ]}
        >
          <GuideAnchor id="clients-add-client">
            <Pressable
              accessibilityLabel="Agregar cliente"
              accessibilityRole="button"
              accessibilityState={{ disabled: isClientLimitReached }}
              disabled={isClientLimitReached}
              onPress={() => floatingClientPressRef.current()}
              style={[
                styles.floatingAddContent,
                isClientLimitReached && { opacity: 0.42 },
              ]}
            >
              <Ionicons color="#ffffff" name="add" size={29} />
            </Pressable>
          </GuideAnchor>
        </Animated.View>
      ) : null}

      <BottomNavigation active="clients" />
      {clientAccess.canManage ? (
        <>
          <ClientFormSheet
            onClose={() => setIsCreateOpen(false)}
            onCreated={async () => {
              completeGuide('add-client');
              await queryClient.invalidateQueries({
                queryKey: tenant.key('subscription'),
              });
            }}
            visible={isCreateOpen}
            onError={(title, message) => openDialog(title, message)}
          />
          <ContactImportSheet
            contacts={importCandidates}
            importing={isImporting}
            onClose={() => {
              if (isImporting) return;
              setIsContactImportOpen(false);
              setImportCandidates([]);
              setSelectedImportContactIds([]);
            }}
            onConfirm={() => void importSelectedContacts()}
            onToggleAll={toggleAllImportContacts}
            onToggleContact={toggleImportContact}
            selectedContactIds={selectedImportContactIds}
            visible={isContactImportOpen}
          />
        </>
      ) : null}
      <ContactsDialog dialog={dialog} onClose={() => setDialog(null)} />
    </SafeAreaView>
  );
}
