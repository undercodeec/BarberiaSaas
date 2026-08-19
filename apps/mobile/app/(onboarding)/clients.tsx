import Ionicons from '@expo/vector-icons/Ionicons';
import {
  Contact,
  ContactField,
  getPermissionsAsync,
  requestPermissionsAsync,
} from 'expo-contacts';
import type {
  ClientLabelRecord,
  ClientLabelsResponse,
  ClientRecord,
  ClientsResponse,
  CurrentOrganizationResponse,
} from '@barber-saas/api-client';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Redirect, useRouter } from 'expo-router';
import { useCallback, useMemo, useRef, useState } from 'react';
import {
  Alert,
  FlatList,
  KeyboardAvoidingView,
  Linking,
  Modal,
  Platform,
  Pressable,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import * as FileSystem from 'expo-file-system/legacy';
import * as Sharing from 'expo-sharing';
import * as XLSX from 'xlsx';

import {
  appStyles,
  appTheme,
  BottomNavigation,
  goldShadow,
  useNativeLayoutMetrics,
} from '../../src/components/BottomNavigation';
import { KeyboardAwareScrollView as ScrollView } from '../../src/components/KeyboardAwareScrollView';
import { requireApiClient } from '../../src/lib/api';
import { normalizeClientsResponse } from '../../src/lib/client-record';
import { phoneNumberToE164 } from '../../src/lib/phone-number';
import { useAuth } from '../../src/providers/AuthProvider';

const CONTACT_IMPORT_FIELDS = [
  ContactField.FULL_NAME,
  ContactField.PHONES,
] as const;

type ContactsDialogAction = {
  readonly label: string;
  readonly onPress?: () => void;
  readonly tone?: 'default' | 'destructive';
};

type ContactsDialogState = {
  readonly actions?: readonly ContactsDialogAction[];
  readonly message: string;
  readonly title: string;
};

type ImportContactCandidate = {
  readonly fullName: string;
  readonly id: string;
  readonly phone: string;
};

export default function ClientsScreen() {
  const { session } = useAuth();
  const layout = useNativeLayoutMetrics();
  const router = useRouter();
  const queryClient = useQueryClient();
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
  const organizationQuery = useQuery({
    enabled: Boolean(session),
    queryFn: () =>
      requireApiClient().request<CurrentOrganizationResponse>(
        '/v1/organizations/current',
      ),
    queryKey: ['current-organization'],
  });
  const importContacts = useCallback(async () => {
    if (Platform.OS === 'web') {
      openDialog(
        'Importación disponible en el teléfono',
        'Por privacidad, los contactos solo se pueden sincronizar desde Android o iPhone.',
      );
      return;
    }
    try {
      const currentPermission = await getPermissionsAsync();
      const permission =
        currentPermission.status === 'granted'
          ? currentPermission
          : await requestPermissionsAsync();

      if (permission.status !== 'granted') {
        if (!permission.canAskAgain) {
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
          { label: 'Abrir ajustes', onPress: () => void Linking.openSettings() },
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
      setImportCandidates(importable);
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
  }, [openDialog, organizationQuery]);
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
        Array.from(
          { length: Math.min(4, selectedImportContacts.length) },
          () => importContact(),
        ),
      );
      await queryClient.invalidateQueries({ queryKey: ['clients'] });
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
  }, [openDialog, queryClient, selectedImportContacts]);
  const clientsQuery = useQuery({
    enabled: Boolean(session),
    queryFn: () => requireApiClient().request<ClientsResponse>('/v1/clients'),
    queryKey: ['clients'],
    select: normalizeClientsResponse,
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
  const selectedClients = useMemo(() => {
    const selectedIds = new Set(selectedClientIds);
    return (clientsQuery.data?.clients ?? []).filter((client) =>
      selectedIds.has(client.id),
    );
  }, [clientsQuery.data?.clients, selectedClientIds]);
  const isSelectingClients = selectedClients.length > 0;
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

  const exportSelectedClients = useCallback(async () => {
    if (!selectedClients.length) return;
    try {
      const worksheet = XLSX.utils.json_to_sheet(
        selectedClients.map((client) => ({
          Apellido: client.lastName ?? '',
          Correo: client.email ?? '',
          Dirección: client.addressLine ?? '',
          Documento: client.documentNumber ?? '',
          Nombre: client.fullName,
          Notas: client.notes ?? '',
          Teléfono: client.phone ?? '',
        })),
        {
          header: [
            'Nombre',
            'Apellido',
            'Teléfono',
            'Correo',
            'Dirección',
            'Documento',
            'Notas',
          ],
        },
      );
      worksheet['!cols'] = [
        { wch: 24 },
        { wch: 20 },
        { wch: 18 },
        { wch: 30 },
        { wch: 34 },
        { wch: 18 },
        { wch: 40 },
      ];
      const workbook = XLSX.utils.book_new();
      XLSX.utils.book_append_sheet(workbook, worksheet, 'Clientes');
      const filename = `clientes-nava-${new Date().toISOString().slice(0, 10)}.xlsx`;

      if (Platform.OS === 'web') {
        XLSX.writeFile(workbook, filename, { bookType: 'xlsx' });
        return;
      }

      const directory = FileSystem.cacheDirectory;
      if (!directory) throw new Error('No pudimos preparar el archivo Excel.');
      const fileUri = `${directory}${filename}`;
      const contents = XLSX.write(workbook, {
        bookType: 'xlsx',
        compression: true,
        type: 'base64',
      });
      await FileSystem.writeAsStringAsync(fileUri, contents, {
        encoding: FileSystem.EncodingType.Base64,
      });
      if (!(await Sharing.isAvailableAsync())) {
        throw new Error('No hay una aplicación disponible para compartir archivos.');
      }
      await Sharing.shareAsync(fileUri, {
        dialogTitle: 'Exportar clientes de Nava',
        mimeType:
          'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
      });
    } catch (error) {
      openDialog(
        'No pudimos exportar los clientes',
        error instanceof Error ? error.message : 'Inténtalo nuevamente.',
      );
    }
  }, [openDialog, selectedClients]);

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
            queryClient.setQueryData<ClientsResponse>(['clients'], (current) =>
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
        Array.from(
          { length: Math.min(4, clientsToDelete.length) },
          () => deleteClient(),
        ),
      );
      setSelectedClientIds([...failedClientIds]);
      await queryClient.invalidateQueries({ queryKey: ['clients'] });
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
      await queryClient.invalidateQueries({ queryKey: ['clients'] });
    } finally {
      setIsDeletingSelected(false);
      setDeletionProgress(null);
    }
  }, [openDialog, queryClient, selectedClients]);

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
            <Pressable
              accessibilityLabel="Exportar clientes seleccionados"
              accessibilityRole="button"
              onPress={() => void exportSelectedClients()}
              style={styles.selectionAction}
            >
              <Ionicons color="#101c2d" name="share-outline" size={22} />
            </Pressable>
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
        ) : (
          <Pressable
            accessibilityLabel="Sincronizar contactos del teléfono"
            accessibilityRole="button"
            disabled={isImporting}
            onPress={() => void importContacts()}
            style={[styles.iconButton, isImporting && { opacity: 0.55 }]}
          >
            <Ionicons color="#101c2d" name="sync-outline" size={23} />
          </Pressable>
        )}
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
            {deletionProgress.completed} de {deletionProgress.total}{' '}
            contactos procesados
          </Text>
        </View>
      ) : null}

      <ScrollView
        contentContainerStyle={[
          styles.content,
          { paddingBottom: layout.bottomInset + 84 },
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
        {visibleClients.length ? (
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
                  onLongPress={() => {
                    didLongPressClient.current = true;
                    toggleClientSelection(client.id);
                  }}
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
        style={[styles.floatingAdd, { bottom: layout.bottomInset + 84 }]}
      >
        <Ionicons color="#ffffff" name="add" size={29} />
      </Pressable>

      <BottomNavigation active="clients" />
      <ClientFormSheet
        onClose={() => setIsCreateOpen(false)}
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
      <ContactsDialog dialog={dialog} onClose={() => setDialog(null)} />
    </SafeAreaView>
  );
}

function ContactsDialog({
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

function ContactImportSheet({
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
                  (importing || selectedContactIds.length === 0) && styles.disabled,
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
  clientRowSelected: {
    backgroundColor: '#FFF7E5',
    borderColor: appTheme.colors.accent,
    borderWidth: 2,
  },
  content: { paddingBottom: 128, paddingHorizontal: 24, paddingTop: 28 },
  deletionProgress: {
    backgroundColor: '#FFF7E5',
    borderColor: '#E3B553',
    borderRadius: 16,
    borderWidth: 1,
    marginHorizontal: 24,
    marginTop: 12,
    padding: 14,
  },
  deletionProgressCopy: {
    color: '#5D6672',
    fontSize: 12,
    fontWeight: '700',
    marginTop: 8,
  },
  deletionProgressFill: {
    backgroundColor: appTheme.colors.accent,
    borderRadius: 4,
    height: '100%',
  },
  deletionProgressHeader: {
    alignItems: 'center',
    flexDirection: 'row',
    justifyContent: 'space-between',
  },
  deletionProgressLabel: { color: '#101C2D', fontSize: 14, fontWeight: '900' },
  deletionProgressTrack: {
    backgroundColor: '#E7DDC9',
    borderRadius: 4,
    height: 8,
    marginTop: 10,
    overflow: 'hidden',
  },
  deletionProgressValue: { color: '#8D620C', fontSize: 14, fontWeight: '900' },
  disabled: { opacity: 0.55 },
  dialogAction: {
    alignItems: 'center',
    borderRadius: 15,
    flex: 1,
    justifyContent: 'center',
    minHeight: 48,
    paddingHorizontal: 12,
  },
  dialogActionDefault: { backgroundColor: '#F2F3F4' },
  dialogActionDestructive: { backgroundColor: '#B42318' },
  dialogActionPrimary: { backgroundColor: appTheme.colors.accent },
  dialogActionLabel: { fontSize: 14, fontWeight: '900' },
  dialogActionLabelDefault: { color: '#101C2D' },
  dialogActionLabelOnAccent: { color: '#FFFFFF' },
  dialogActions: { flexDirection: 'row', gap: 10, marginTop: 24 },
  dialogBackdrop: {
    backgroundColor: 'rgba(16, 28, 45, 0.52)',
    bottom: 0,
    left: 0,
    position: 'absolute',
    right: 0,
    top: 0,
    zIndex: 0,
  },
  dialogCard: {
    backgroundColor: '#FFFFFF',
    borderColor: '#E4E1DA',
    borderRadius: 26,
    borderWidth: 1,
    marginHorizontal: 24,
    maxWidth: 420,
    padding: 22,
    width: '88%',
    zIndex: 1,
  },
  dialogIcon: {
    alignItems: 'center',
    backgroundColor: '#FFF1CC',
    borderRadius: 18,
    height: 48,
    justifyContent: 'center',
    width: 48,
  },
  dialogMessage: {
    color: '#5D6672',
    fontSize: 14,
    lineHeight: 21,
    marginTop: 9,
  },
  dialogOverlay: { alignItems: 'center', flex: 1, justifyContent: 'center' },
  dialogTitle: { color: '#101C2D', fontSize: 21, fontWeight: '900', marginTop: 16 },
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
  importActions: { flexDirection: 'row', gap: 10, marginTop: 14 },
  importBackdrop: {
    bottom: 0,
    left: 0,
    position: 'absolute',
    right: 0,
    top: 0,
    zIndex: 0,
  },
  importCancelButton: {
    alignItems: 'center',
    backgroundColor: '#F2F3F4',
    borderRadius: 15,
    flex: 0.8,
    justifyContent: 'center',
    minHeight: 50,
  },
  importCancelLabel: { color: '#101C2D', fontSize: 14, fontWeight: '900' },
  importConfirmButton: {
    alignItems: 'center',
    backgroundColor: appTheme.colors.accent,
    borderRadius: 15,
    flex: 1.2,
    justifyContent: 'center',
    minHeight: 50,
  },
  importConfirmLabel: { color: '#FFFFFF', fontSize: 14, fontWeight: '900' },
  importContactAvatar: {
    alignItems: 'center',
    backgroundColor: '#E8EAED',
    borderRadius: 19,
    height: 38,
    justifyContent: 'center',
    width: 38,
  },
  importContactAvatarLabel: { color: '#101C2D', fontSize: 15, fontWeight: '900' },
  importContactCopy: { flex: 1 },
  importContactName: { color: '#101C2D', fontSize: 14, fontWeight: '900' },
  importContactPhone: { color: '#69717D', fontSize: 12, marginTop: 2 },
  importContactRow: {
    alignItems: 'center',
    backgroundColor: '#FFFFFF',
    borderColor: '#E4E5E7',
    borderRadius: 15,
    borderWidth: 1,
    flexDirection: 'row',
    gap: 10,
    padding: 11,
  },
  importContactRowSelected: { backgroundColor: '#FFF7E5', borderColor: '#C79532' },
  importCopy: { color: '#5D6672', fontSize: 14, lineHeight: 20, marginTop: 7 },
  importEmpty: {
    color: '#69717D',
    fontSize: 14,
    fontWeight: '700',
    paddingVertical: 28,
    textAlign: 'center',
  },
  importList: { gap: 8, paddingBottom: 4 },
  importListScroll: { marginTop: 5, maxHeight: 340 },
  importOverlay: {
    backgroundColor: 'rgba(16, 28, 45, 0.48)',
    flex: 1,
    justifyContent: 'flex-end',
  },
  importSearchBox: {
    alignItems: 'center',
    backgroundColor: '#F2F3F4',
    borderColor: '#E4E5E7',
    borderRadius: 14,
    borderWidth: 1,
    flexDirection: 'row',
    gap: 8,
    marginTop: 16,
    paddingHorizontal: 12,
  },
  importSearchInput: { color: '#101C2D', flex: 1, fontSize: 14, paddingVertical: 13 },
  importSelectAll: {
    alignItems: 'center',
    alignSelf: 'flex-start',
    flexDirection: 'row',
    gap: 8,
    paddingVertical: 11,
  },
  importSelectAllCount: {
    backgroundColor: '#E8EAED',
    borderRadius: 10,
    color: '#5D6672',
    fontSize: 11,
    fontWeight: '900',
    minWidth: 22,
    paddingHorizontal: 6,
    paddingVertical: 3,
    textAlign: 'center',
  },
  importSelectAllLabel: { color: '#101C2D', fontSize: 13, fontWeight: '900' },
  importSheet: {
    backgroundColor: appTheme.colors.surfaceMuted,
    borderTopLeftRadius: appTheme.radii.sheet,
    borderTopRightRadius: appTheme.radii.sheet,
    elevation: 2,
    maxHeight: '88%',
    paddingBottom: 26,
    paddingHorizontal: 24,
    zIndex: 1,
  },
  importTitle: { color: '#101C2D', fontSize: 23, fontWeight: '900', marginTop: 10 },
  iconButton: {
    alignItems: 'center',
    backgroundColor: '#ffffff',
    borderRadius: 18,
    height: 50,
    justifyContent: 'center',
    marginRight: 64,
    width: 50,
  },
  selectionAction: {
    alignItems: 'center',
    backgroundColor: '#ffffff',
    borderRadius: 16,
    height: 44,
    justifyContent: 'center',
    width: 44,
  },
  selectionActions: { flexDirection: 'row', gap: 8 },
  list: { marginTop: 23 },
  overlay: {
    backgroundColor: 'rgba(16, 28, 45, 0.48)',
    flex: 1,
    justifyContent: 'flex-end',
  },
  modalKeyboard: { flex: 1 },
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
  selectAllButton: {
    alignItems: 'center',
    alignSelf: 'flex-start',
    flexDirection: 'row',
    gap: 8,
    marginTop: 12,
    paddingHorizontal: 2,
    paddingVertical: 7,
  },
  selectAllCount: {
    backgroundColor: '#E8EAED',
    borderRadius: 11,
    color: '#5D6672',
    fontSize: 12,
    fontWeight: '900',
    marginLeft: 2,
    minWidth: 23,
    overflow: 'hidden',
    paddingHorizontal: 7,
    paddingVertical: 3,
    textAlign: 'center',
  },
  selectAllLabel: { color: '#101C2D', fontSize: 14, fontWeight: '900' },
  sheet: {
    backgroundColor: appTheme.colors.surfaceMuted,
    borderTopLeftRadius: appTheme.radii.sheet,
    borderTopRightRadius: appTheme.radii.sheet,
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
