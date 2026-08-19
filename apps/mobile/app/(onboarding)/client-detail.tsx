import Ionicons from '@expo/vector-icons/Ionicons';
import type {
  ClientDetailResponse,
  ClientNotesResponse,
} from '@barber-saas/api-client';
import * as ImagePicker from 'expo-image-picker';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Redirect, useLocalSearchParams, useRouter } from 'expo-router';
import { useEffect, useMemo, useRef, useState } from 'react';
import {
  Alert,
  Animated,
  Image,
  KeyboardAvoidingView,
  Linking,
  Modal,
  PanResponder,
  Platform,
  Pressable,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { requireApiClient } from '../../src/lib/api';
import { normalizeClientRecord } from '../../src/lib/client-record';
import { tenantQueryPrefix } from '../../src/lib/query-keys';
import { KeyboardAwareScrollView as ScrollView } from '../../src/components/KeyboardAwareScrollView';
import { useAuth } from '../../src/providers/AuthProvider';
import { useTenantScope } from '../../src/providers/TenantScopeProvider';
import {
  appTheme,
  goldButtonShadow,
  useNativeLayoutMetrics,
} from '../../src/components/BottomNavigation';

type Tab = 'comments' | 'history' | 'information' | 'notes';
type HistoryOrder = 'newest' | 'oldest';
type HistoryStatusFilter =
  'all' | 'active' | 'paid' | 'cancelled' | 'completed';

const emptyValue = (value: string | null | undefined) =>
  value || 'Sin registrar';

function formatDate(value: string | null) {
  if (!value) return 'Sin registrar';
  return new Intl.DateTimeFormat('es-EC', {
    day: 'numeric',
    month: 'short',
    year: 'numeric',
  }).format(new Date(value));
}

function formatMoney(cents: number) {
  return new Intl.NumberFormat('es-EC', {
    currency: 'USD',
    maximumFractionDigits: 0,
    style: 'currency',
  }).format(cents / 100);
}

function statusLabel(
  status: ClientDetailResponse['history'][number]['status'],
) {
  const labels = {
    cancelled: 'Cancelada',
    checked_in: 'En espera',
    completed: 'Completada',
    confirmed: 'Confirmada',
    in_progress: 'En curso',
    no_show: 'No asistió',
    scheduled: 'Agendada',
    waiting: 'En espera',
  } as const;
  return labels[status];
}

export default function ClientDetailScreen() {
  const tenant = useTenantScope();
  const { session } = useAuth();
  const layout = useNativeLayoutMetrics();
  const router = useRouter();
  const queryClient = useQueryClient();
  const { clientId } = useLocalSearchParams<{ clientId: string }>();
  const [activeTab, setActiveTab] = useState<Tab>('information');
  const [historyOrder, setHistoryOrder] = useState<HistoryOrder>('newest');
  const [historyStatus, setHistoryStatus] =
    useState<HistoryStatusFilter>('all');
  const [isEditing, setIsEditing] = useState(false);
  const [isOptionsOpen, setIsOptionsOpen] = useState(false);
  const [isLabelOpen, setIsLabelOpen] = useState(false);
  const [isNoteOpen, setIsNoteOpen] = useState(false);
  const [noteDescription, setNoteDescription] = useState('');
  const [notePhotoData, setNotePhotoData] = useState<string | null>(null);
  const noteSheetTranslateY = useRef(new Animated.Value(0)).current;
  const [labelName, setLabelName] = useState('');
  const [labelColor, setLabelColor] = useState('#101C2D');
  const [showAdditionalFields, setShowAdditionalFields] = useState(false);
  const [fullName, setFullName] = useState('');
  const [lastName, setLastName] = useState('');
  const [phone, setPhone] = useState('');
  const [email, setEmail] = useState('');
  const [birthDate, setBirthDate] = useState('');
  const [addressLine, setAddressLine] = useState('');
  const [documentNumber, setDocumentNumber] = useState('');
  const [notes, setNotes] = useState('');
  const detailQuery = useQuery({
    enabled: Boolean(session && clientId),
    queryFn: () =>
      requireApiClient().request<ClientDetailResponse>(
        `/v1/clients/${clientId}`,
      ),
    queryKey: tenant.key('client-detail', clientId),
    select: (response) => {
      const client = normalizeClientRecord(response.client);
      if (!client) throw new Error('El cliente recibido no es válido.');

      return {
        ...response,
        client,
        history: Array.isArray(response.history) ? response.history : [],
        metrics: {
          accumulatedCents:
            typeof response.metrics?.accumulatedCents === 'number'
              ? response.metrics.accumulatedCents
              : 0,
          appointmentsCount:
            typeof response.metrics?.appointmentsCount === 'number'
              ? response.metrics.appointmentsCount
              : 0,
          lastVisitAt:
            typeof response.metrics?.lastVisitAt === 'string'
              ? response.metrics.lastVisitAt
              : null,
        },
      };
    },
  });
  const client = detailQuery.data?.client;
  const visibleHistory = useMemo(() => {
    const history = Array.isArray(detailQuery.data?.history)
      ? detailQuery.data.history
      : [];
    return [...history]
      .filter((item) => {
        if (historyStatus === 'all') return true;
        if (historyStatus === 'paid') return item.paymentStatus === 'paid';
        if (historyStatus === 'cancelled') return item.status === 'cancelled';
        if (historyStatus === 'completed') return item.status === 'completed';
        return ['scheduled', 'confirmed', 'checked_in', 'in_progress'].includes(
          item.status,
        );
      })
      .sort((left, right) => {
        const difference =
          new Date(left.startsAt).getTime() -
          new Date(right.startsAt).getTime();
        return historyOrder === 'newest' ? -difference : difference;
      });
  }, [detailQuery.data, historyOrder, historyStatus]);
  const notesQuery = useQuery({
    enabled: Boolean(session && clientId),
    queryFn: () =>
      requireApiClient().request<ClientNotesResponse>(
        `/v1/clients/${clientId}/notes`,
      ),
    queryKey: tenant.key('client-notes', clientId),
  });

  useEffect(() => {
    if (!client) return;
    setFullName(client.fullName);
    setLastName(client.lastName ?? '');
    setPhone(client.phone ?? '');
    setEmail(client.email ?? '');
    setBirthDate(client.birthDate ?? '');
    setAddressLine(client.addressLine ?? '');
    setDocumentNumber(client.documentNumber ?? '');
    setNotes(client.notes ?? '');
  }, [client]);

  const updateClient = useMutation({
    mutationFn: () => {
      if (!fullName.trim() || !phone.trim()) {
        throw new Error('El nombre y teléfono son obligatorios.');
      }
      return requireApiClient().request(`/v1/clients/${clientId}`, {
        body: {
          addressLine: addressLine.trim() || undefined,
          birthDate: birthDate.trim() || undefined,
          documentNumber: documentNumber.trim() || undefined,
          email: email.trim() || undefined,
          fullName: fullName.trim(),
          lastName: lastName.trim() || undefined,
          notes: notes.trim() || undefined,
          phone: phone.trim(),
        },
        method: 'PATCH',
      });
    },
    onError: (error) =>
      Alert.alert(
        'No pudimos actualizar el cliente',
        error instanceof Error ? error.message : 'Inténtalo nuevamente.',
      ),
    onSuccess: async () => {
      setIsEditing(false);
      await Promise.all([
        queryClient.invalidateQueries({
          queryKey: tenantQueryPrefix('clients'),
        }),
        queryClient.invalidateQueries({
          queryKey: tenantQueryPrefix('client-detail'),
        }),
      ]);
    },
  });

  const closeNoteSheet = () => {
    Animated.timing(noteSheetTranslateY, {
      duration: 180,
      toValue: 600,
      useNativeDriver: true,
    }).start(() => {
      setIsNoteOpen(false);
      noteSheetTranslateY.setValue(0);
    });
  };

  const noteSheetPanResponder = useRef(
    PanResponder.create({
      onMoveShouldSetPanResponder: (_event, gesture) => gesture.dy > 8,
      onPanResponderMove: (_event, gesture) => {
        noteSheetTranslateY.setValue(Math.max(0, gesture.dy));
      },
      onPanResponderRelease: (_event, gesture) => {
        if (gesture.dy > 90) closeNoteSheet();
        else {
          Animated.spring(noteSheetTranslateY, {
            toValue: 0,
            useNativeDriver: true,
          }).start();
        }
      },
    }),
  ).current;

  const chooseNotePhoto = async (source: 'camera' | 'library') => {
    const permission =
      source === 'camera'
        ? await ImagePicker.requestCameraPermissionsAsync()
        : await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (!permission.granted) {
      Alert.alert(
        'Permiso necesario',
        'Autoriza el acceso para agregar una foto.',
      );
      return;
    }
    const result =
      source === 'camera'
        ? await ImagePicker.launchCameraAsync({ base64: true, quality: 0.7 })
        : await ImagePicker.launchImageLibraryAsync({
            base64: true,
            quality: 0.7,
          });
    if (result.canceled) return;
    const asset = result.assets[0];
    if (!asset?.base64) {
      Alert.alert('No pudimos leer la foto', 'Inténtalo con otra imagen.');
      return;
    }
    const bytes = asset.fileSize ?? Math.ceil((asset.base64.length * 3) / 4);
    if (bytes > 1_500_000 || asset.width > 1_600 || asset.height > 1_600) {
      Alert.alert(
        'Imagen demasiado grande',
        'Usa una foto de hasta 1.5 MB y 1600 × 1600 píxeles.',
      );
      return;
    }
    const mimeType =
      asset.mimeType === 'image/png' || asset.mimeType === 'image/webp'
        ? asset.mimeType
        : 'image/jpeg';
    setNotePhotoData(`data:${mimeType};base64,${asset.base64}`);
  };

  const createNote = useMutation({
    mutationFn: () => {
      if (!noteDescription.trim()) throw new Error('Ingresa una descripción.');
      return requireApiClient().request(`/v1/clients/${clientId}/notes`, {
        body: {
          description: noteDescription.trim(),
          photoData: notePhotoData ?? undefined,
        },
        method: 'POST',
      });
    },
    onError: (error) =>
      Alert.alert(
        'No pudimos guardar la nota',
        error instanceof Error ? error.message : 'Inténtalo nuevamente.',
      ),
    onSuccess: async () => {
      setNoteDescription('');
      setNotePhotoData(null);
      closeNoteSheet();
      await notesQuery.refetch();
    },
  });
  const createLabel = useMutation({
    mutationFn: () => {
      if (!labelName.trim())
        throw new Error('Ingresa el nombre de la etiqueta.');
      return requireApiClient().request('/v1/clients/labels', {
        body: { clientId, color: labelColor, name: labelName.trim() },
        method: 'POST',
      });
    },
    onError: (error) =>
      Alert.alert(
        'No pudimos guardar la etiqueta',
        error instanceof Error ? error.message : 'Inténtalo nuevamente.',
      ),
    onSuccess: async () => {
      setIsLabelOpen(false);
      setLabelName('');
      setLabelColor('#101C2D');
      await Promise.all([
        queryClient.invalidateQueries({
          queryKey: tenantQueryPrefix('clients'),
        }),
        queryClient.invalidateQueries({
          queryKey: tenantQueryPrefix('client-labels'),
        }),
        queryClient.invalidateQueries({
          queryKey: tenantQueryPrefix('client-detail'),
        }),
      ]);
    },
  });
  const deleteClient = useMutation({
    mutationFn: () =>
      requireApiClient().request<void>(`/v1/clients/${clientId}`, {
        method: 'DELETE',
      }),
    onError: (error) =>
      Alert.alert(
        'No pudimos eliminar el cliente',
        error instanceof Error ? error.message : 'Inténtalo nuevamente.',
      ),
    onSuccess: async () => {
      await queryClient.invalidateQueries({
        queryKey: tenantQueryPrefix('clients'),
      });
      router.replace('/clients');
    },
  });

  const confirmDelete = () => {
    setIsOptionsOpen(false);
    Alert.alert(
      'Eliminar cliente',
      'Esta acción eliminará el perfil del cliente de tu directorio.',
      [
        { style: 'cancel', text: 'Cancelar' },
        {
          onPress: () => deleteClient.mutate(),
          style: 'destructive',
          text: 'Eliminar',
        },
      ],
    );
  };

  const openContact = async (kind: 'call' | 'email' | 'whatsapp') => {
    const value = kind === 'email' ? client?.email : client?.phone;
    if (!value) {
      Alert.alert(
        'Dato no registrado',
        'Este cliente no tiene ese dato de contacto.',
      );
      return;
    }
    const digits = value.replace(/\D/gu, '');
    const url =
      kind === 'call'
        ? `tel:${value}`
        : kind === 'email'
          ? `mailto:${value}`
          : `https://wa.me/${digits}`;
    try {
      await Linking.openURL(url);
    } catch {
      Alert.alert(
        'No pudimos abrir la aplicación',
        'Inténtalo nuevamente desde tu teléfono.',
      );
    }
  };

  if (!session) return <Redirect href="/(auth)/login" />;

  if (detailQuery.isLoading) {
    return (
      <SafeAreaView style={styles.screen}>
        <View style={styles.loading}>
          <Text style={styles.secondary}>Cargando cliente...</Text>
        </View>
      </SafeAreaView>
    );
  }

  if (!detailQuery.data || !client || detailQuery.isError) {
    return (
      <SafeAreaView style={styles.screen}>
        <View style={styles.missing}>
          <Ionicons color="#101c2d" name="person-outline" size={42} />
          <Text style={styles.missingTitle}>Cliente no disponible</Text>
          <Pressable
            onPress={() =>
              router.canGoBack() ? router.back() : router.replace('/clients')
            }
            style={styles.backButton}
          >
            <Text style={styles.backLabel}>Volver a clientes</Text>
          </Pressable>
        </View>
      </SafeAreaView>
    );
  }

  const initials =
    `${client.fullName.charAt(0)}${client.lastName?.charAt(0) ?? ''}`.toUpperCase();
  const detail = detailQuery.data;
  const metrics = detail.metrics;
  const frequent = metrics.appointmentsCount >= 3;

  return (
    <SafeAreaView edges={['top', 'left', 'right']} style={styles.screen}>
      <View style={styles.header}>
        <Pressable
          accessibilityLabel="Volver"
          accessibilityRole="button"
          onPress={() =>
            router.canGoBack() ? router.back() : router.replace('/clients')
          }
          style={styles.headerButton}
        >
          <Ionicons color="#111827" name="chevron-back" size={25} />
        </Pressable>
        <Text
          accessibilityRole="header"
          numberOfLines={1}
          style={styles.headerTitle}
        >
          Detalle del cliente
        </Text>
        <View style={styles.headerActions}>
          <Pressable
            accessibilityLabel="Editar cliente"
            accessibilityRole="button"
            onPress={() => setIsEditing(true)}
            style={styles.editButton}
          >
            <Ionicons color="#101c2d" name="create-outline" size={21} />
          </Pressable>
          <Pressable
            accessibilityLabel="Más opciones"
            accessibilityRole="button"
            onPress={() => setIsOptionsOpen(true)}
            style={styles.moreButton}
          >
            <Ionicons color="#101c2d" name="ellipsis-horizontal" size={22} />
          </Pressable>
        </View>
      </View>
      <ScrollView
        contentContainerStyle={styles.content}
        showsVerticalScrollIndicator={false}
      >
        <View style={styles.profileCard}>
          <View style={styles.avatar}>
            <Text style={styles.avatarText}>{initials || '?'}</Text>
          </View>
          <View style={styles.profileCopy}>
            <Text style={styles.name}>
              {client.fullName}
              {client.lastName ? ` ${client.lastName}` : ''}
            </Text>
            <Text style={styles.phone}>{emptyValue(client.phone)}</Text>
            <View style={styles.badges}>
              <View style={styles.activeBadge}>
                <View style={styles.activeDot} />
                <Text style={styles.activeLabel}>Activo</Text>
              </View>
              {frequent ? (
                <View style={styles.frequentBadge}>
                  <Ionicons color="#101c2d" name="star" size={13} />
                  <Text style={styles.frequentLabel}>Frecuente</Text>
                </View>
              ) : null}
            </View>
          </View>
        </View>
        <View style={styles.metrics}>
          <View style={styles.metric}>
            <Text style={styles.metricValue}>{metrics.appointmentsCount}</Text>
            <Text style={styles.metricLabel}>Reservas</Text>
          </View>
          <View style={styles.metricDivider} />
          <View style={styles.metric}>
            <Text numberOfLines={1} style={styles.metricValue}>
              {formatMoney(metrics.accumulatedCents)}
            </Text>
            <Text style={styles.metricLabel}>Acumulado</Text>
          </View>
          <View style={styles.metricDivider} />
          <View style={styles.metric}>
            <Text numberOfLines={1} style={styles.metricDate}>
              {formatDate(metrics.lastVisitAt)}
            </Text>
            <Text style={styles.metricLabel}>Última visita</Text>
          </View>
        </View>
        <Text style={styles.sectionTitle}>Acciones rápidas</Text>
        <View style={styles.quickActions}>
          <Pressable
            accessibilityLabel="Llamar al cliente"
            accessibilityRole="button"
            onPress={() => void openContact('call')}
            style={styles.quickAction}
          >
            <View style={styles.quickIcon}>
              <Ionicons color="#101c2d" name="call-outline" size={23} />
            </View>
            <Text style={styles.quickLabel}>Llamar</Text>
          </Pressable>
          <Pressable
            accessibilityLabel="Abrir WhatsApp"
            accessibilityRole="button"
            onPress={() => void openContact('whatsapp')}
            style={styles.quickAction}
          >
            <View style={styles.quickIcon}>
              <Ionicons color="#25A866" name="logo-whatsapp" size={24} />
            </View>
            <Text style={styles.quickLabel}>WhatsApp</Text>
          </Pressable>
          <View
            accessibilityLabel="Notificaciones próximamente"
            style={styles.quickAction}
          >
            <View style={styles.quickIcon}>
              <Ionicons
                color="#101c2d"
                name="notifications-outline"
                size={24}
              />
            </View>
            <Text style={styles.quickLabel}>Notificar</Text>
          </View>
        </View>
        <View style={styles.tabs}>
          {(
            [
              ['information', 'Información'],
              ['notes', 'Notas'],
              ['history', 'Historial'],
              ['comments', 'Comentarios'],
            ] as const
          ).map(([tab, label]) => (
            <Pressable
              accessibilityRole="tab"
              key={tab}
              onPress={() => setActiveTab(tab)}
              style={[styles.tab, activeTab === tab && styles.tabActive]}
            >
              <Text
                style={[
                  styles.tabLabel,
                  activeTab === tab && styles.tabLabelActive,
                ]}
              >
                {label}
              </Text>
            </Pressable>
          ))}
        </View>
        {activeTab === 'information' ? (
          <View style={styles.detailsCard}>
            <InfoRow
              icon="call-outline"
              label="Teléfono"
              value={client.phone}
            />
            <InfoRow icon="mail-outline" label="Correo" value={client.email} />
            <InfoRow
              icon="calendar-outline"
              label="Fecha de nacimiento"
              value={client.birthDate ? formatDate(client.birthDate) : null}
            />
            <InfoRow
              icon="location-outline"
              label="Dirección"
              value={client.addressLine}
            />
            <InfoRow
              icon="card-outline"
              label="Documento"
              value={client.documentNumber}
            />
            <View style={styles.labelsRow}>
              <View style={styles.labelsCopy}>
                <Text style={styles.infoLabel}>Etiquetas</Text>
                <View style={styles.labelList}>
                  {client.labels.map((label) => (
                    <View
                      key={label.id}
                      style={[
                        styles.labelChip,
                        { backgroundColor: label.color },
                      ]}
                    >
                      <Text style={styles.labelChipText}>{label.name}</Text>
                    </View>
                  ))}
                  {!client.labels.length ? (
                    <Text style={styles.emptyLabel}>Sin etiquetas</Text>
                  ) : null}
                </View>
              </View>
              <Pressable
                accessibilityLabel="Agregar etiqueta"
                accessibilityRole="button"
                onPress={() => setIsLabelOpen(true)}
                style={styles.addLabelButton}
              >
                <Ionicons color="#101c2d" name="add" size={22} />
              </Pressable>
            </View>
          </View>
        ) : null}
        {activeTab === 'notes' ? (
          <View>
            <View style={styles.notesHeader}>
              <Text style={styles.sectionTitle}>Notas</Text>
              <Pressable
                accessibilityLabel="Agregar nota"
                accessibilityRole="button"
                onPress={() => setIsNoteOpen(true)}
                style={styles.addLabelButton}
              >
                <Ionicons color="#101c2d" name="add" size={22} />
              </Pressable>
            </View>
            {client.notes ? (
              <View style={styles.notesCard}>
                <Ionicons
                  color="#101c2d"
                  name="document-text-outline"
                  size={22}
                />
                <Text style={styles.notesText}>{client.notes}</Text>
              </View>
            ) : null}
            {notesQuery.data?.notes.length ? (
              <View style={styles.noteList}>
                {notesQuery.data.notes.map((note) => (
                  <View key={note.id} style={styles.notesCard}>
                    <Ionicons
                      color="#101c2d"
                      name="document-text-outline"
                      size={22}
                    />
                    <View style={styles.noteCopy}>
                      <Text style={styles.notesText}>{note.description}</Text>
                      {note.photoData ? (
                        <Image
                          source={{ uri: note.photoData }}
                          style={styles.notePhoto}
                        />
                      ) : null}
                      <Text style={styles.noteDate}>
                        {formatDate(note.createdAt)}
                      </Text>
                    </View>
                  </View>
                ))}
              </View>
            ) : !client.notes ? (
              <Text style={styles.secondary}>
                Aún no hay notas registradas.
              </Text>
            ) : null}
          </View>
        ) : null}
        {activeTab === 'history' ? (
          <View>
            <View style={styles.historyFilters}>
              <ScrollView
                horizontal
                showsHorizontalScrollIndicator={false}
                contentContainerStyle={styles.filterList}
              >
                {(
                  [
                    ['all', 'Todos'],
                    ['active', 'Actividad'],
                    ['paid', 'Pagado'],
                    ['cancelled', 'Cancelado'],
                    ['completed', 'Finalizado'],
                  ] as const
                ).map(([value, label]) => (
                  <Pressable
                    key={value}
                    onPress={() => setHistoryStatus(value)}
                    style={[
                      styles.filterChip,
                      historyStatus === value && styles.filterChipActive,
                    ]}
                  >
                    <Text
                      style={[
                        styles.filterChipText,
                        historyStatus === value && styles.filterChipTextActive,
                      ]}
                    >
                      {label}
                    </Text>
                  </Pressable>
                ))}
              </ScrollView>
              <Pressable
                onPress={() =>
                  setHistoryOrder(
                    historyOrder === 'newest' ? 'oldest' : 'newest',
                  )
                }
                style={styles.orderButton}
              >
                <Ionicons color="#101c2d" name="swap-vertical" size={18} />
                <Text style={styles.orderLabel}>
                  {historyOrder === 'newest' ? 'Más reciente' : 'Más antigua'}
                </Text>
              </Pressable>
            </View>
            {visibleHistory.length ? (
              <View style={styles.historyList}>
                {visibleHistory.map((item) => (
                  <View key={item.id} style={styles.historyCard}>
                    <View style={styles.historyDate}>
                      <Text style={styles.historyDay}>
                        {new Intl.DateTimeFormat('es-EC', {
                          day: '2-digit',
                        }).format(new Date(item.startsAt))}
                      </Text>
                      <Text style={styles.historyMonth}>
                        {new Intl.DateTimeFormat('es-EC', { month: 'short' })
                          .format(new Date(item.startsAt))
                          .replace('.', '')}
                      </Text>
                    </View>
                    <View style={styles.historyCopy}>
                      <Text style={styles.historyService}>
                        {item.serviceName}
                      </Text>
                      <Text style={styles.historyMeta}>
                        {item.collaboratorName} ·{' '}
                        {new Intl.DateTimeFormat('es-EC', {
                          hour: '2-digit',
                          minute: '2-digit',
                        }).format(new Date(item.startsAt))}
                      </Text>
                    </View>
                    <View>
                      <Text
                        style={[
                          styles.status,
                          item.status === 'completed' && styles.statusCompleted,
                        ]}
                      >
                        {statusLabel(item.status)}
                      </Text>
                      {item.paymentStatus === 'paid' ? (
                        <Text style={styles.paidLabel}>Pagado</Text>
                      ) : null}
                    </View>
                  </View>
                ))}
              </View>
            ) : (
              <View style={styles.emptyHistory}>
                <Ionicons color="#8B96A5" name="calendar-outline" size={28} />
                <Text style={styles.secondary}>
                  No hay reservas con este filtro.
                </Text>
              </View>
            )}
          </View>
        ) : null}
        {activeTab === 'comments' ? (
          <View style={styles.commentsEmpty}>
            <View style={styles.commentStars}>
              {[1, 2, 3, 4, 5].map((star) => (
                <Ionicons
                  color="#D0A84A"
                  key={star}
                  name="star-outline"
                  size={25}
                />
              ))}
            </View>
            <Text style={styles.commentsTitle}>Reseñas del cliente</Text>
            <Text style={styles.secondary}>
              Las reseñas aparecerán aquí cuando se integre su recopilación.
            </Text>
          </View>
        ) : null}
      </ScrollView>
      <Modal
        animationType="fade"
        navigationBarTranslucent
        onRequestClose={() => setIsOptionsOpen(false)}
        statusBarTranslucent
        transparent
        visible={isOptionsOpen}
      >
        <View style={styles.optionsOverlay}>
          <Pressable
            accessibilityLabel="Cerrar más opciones"
            onPress={() => setIsOptionsOpen(false)}
            style={styles.backdrop}
          />
          <View
            style={[
              styles.optionsSheet,
              { paddingBottom: layout.bottomInset + 14 },
            ]}
          >
            <View style={styles.handle} />
            <Text style={styles.optionsTitle}>Más opciones</Text>
            <Pressable
              onPress={() => {
                setIsOptionsOpen(false);
                router.push('/agenda');
              }}
              style={styles.optionRow}
            >
              <View style={styles.optionIcon}>
                <Ionicons color="#101c2d" name="calendar-outline" size={21} />
              </View>
              <Text style={styles.optionLabel}>Crear una cita</Text>
              <Ionicons color="#69717d" name="chevron-forward" size={20} />
            </Pressable>
            <Pressable
              onPress={() => {
                setIsOptionsOpen(false);
                Alert.alert(
                  'Próximamente',
                  'El bloqueo de clientes estará disponible próximamente.',
                );
              }}
              style={styles.optionRow}
            >
              <View style={styles.optionIcon}>
                <Ionicons color="#101c2d" name="ban-outline" size={21} />
              </View>
              <Text style={styles.optionLabel}>Bloquear cliente</Text>
              <Ionicons color="#69717d" name="chevron-forward" size={20} />
            </Pressable>
            <Pressable
              onPress={() => {
                setIsOptionsOpen(false);
                Alert.alert(
                  'Próximamente',
                  'La creación de ventas estará disponible próximamente.',
                );
              }}
              style={styles.optionRow}
            >
              <View style={styles.optionIcon}>
                <Ionicons color="#101c2d" name="receipt-outline" size={21} />
              </View>
              <Text style={styles.optionLabel}>Crear una venta</Text>
              <Ionicons color="#69717d" name="chevron-forward" size={20} />
            </Pressable>
            <Pressable
              onPress={confirmDelete}
              style={[styles.optionRow, styles.deleteOption]}
            >
              <View style={[styles.optionIcon, styles.deleteOptionIcon]}>
                <Ionicons color="#B42318" name="trash-outline" size={21} />
              </View>
              <Text style={styles.deleteOptionLabel}>Eliminar cliente</Text>
            </Pressable>
          </View>
        </View>
      </Modal>
      <Modal
        animationType="slide"
        navigationBarTranslucent
        onRequestClose={closeNoteSheet}
        statusBarTranslucent
        transparent
        visible={isNoteOpen}
      >
        <KeyboardAvoidingView
          behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
          style={styles.modalKeyboard}
        >
          <View style={styles.overlay}>
            <Pressable onPress={closeNoteSheet} style={styles.backdrop} />
            <Animated.View
              style={[
                styles.noteSheet,
                {
                  maxHeight: layout.sheetMaxHeight,
                  paddingBottom: layout.bottomInset + 20,
                  transform: [{ translateY: noteSheetTranslateY }],
                },
              ]}
            >
              <View
                {...noteSheetPanResponder.panHandlers}
                style={styles.noteDragArea}
              >
                <View style={styles.handle} />
              </View>
              <Text style={styles.sheetTitle}>Nueva nota</Text>
              <TextInput
                accessibilityLabel="Descripción de la nota"
                maxLength={500}
                multiline
                onChangeText={setNoteDescription}
                placeholder="Descripción"
                placeholderTextColor="#8B96A5"
                style={[styles.field, styles.notesField]}
                textAlignVertical="top"
                value={noteDescription}
              />
              {notePhotoData ? (
                <Image
                  source={{ uri: notePhotoData }}
                  style={styles.notePreview}
                />
              ) : null}
              <View style={styles.notePhotoActions}>
                <Pressable
                  onPress={() => void chooseNotePhoto('library')}
                  style={styles.photoAction}
                >
                  <Ionicons color="#101c2d" name="images-outline" size={20} />
                  <Text style={styles.photoActionLabel}>Cargar foto</Text>
                </Pressable>
                <Pressable
                  onPress={() => void chooseNotePhoto('camera')}
                  style={styles.photoAction}
                >
                  <Ionicons color="#101c2d" name="camera-outline" size={20} />
                  <Text style={styles.photoActionLabel}>Tomar foto</Text>
                </Pressable>
              </View>
              <Pressable
                disabled={createNote.isPending || !noteDescription.trim()}
                onPress={() => createNote.mutate()}
                style={[
                  styles.noteSaveButton,
                  (createNote.isPending || !noteDescription.trim()) &&
                    styles.disabled,
                ]}
              >
                <Text style={styles.saveLabel}>
                  {createNote.isPending ? 'Guardando...' : 'Guardar nota'}
                </Text>
              </Pressable>
            </Animated.View>
          </View>
        </KeyboardAvoidingView>
      </Modal>
      <Modal
        animationType="slide"
        navigationBarTranslucent
        onRequestClose={() => setIsLabelOpen(false)}
        statusBarTranslucent
        transparent
        visible={isLabelOpen}
      >
        <KeyboardAvoidingView
          behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
          style={styles.modalKeyboard}
        >
          <View style={styles.overlay}>
            <Pressable
              onPress={() => setIsLabelOpen(false)}
              style={styles.backdrop}
            />
            <View
              style={[
                styles.labelSheet,
                { paddingBottom: layout.bottomInset + 20 },
              ]}
            >
              <View style={styles.handle} />
              <Text style={styles.sheetTitle}>Nueva etiqueta</Text>
              <Text style={styles.sheetCopy}>
                Úsala para identificar y filtrar tus clientes.
              </Text>
              <TextInput
                autoFocus
                accessibilityLabel="Nombre de la etiqueta"
                maxLength={60}
                onChangeText={setLabelName}
                placeholder="Ej. Cliente frecuente"
                placeholderTextColor="#8B96A5"
                style={styles.field}
                value={labelName}
              />
              <Text style={styles.colorLabel}>Color</Text>
              <View style={styles.colorList}>
                {[
                  '#101C2D',
                  '#2563EB',
                  '#16A34A',
                  '#CA8A04',
                  '#DB2777',
                  '#7C3AED',
                ].map((color) => (
                  <Pressable
                    accessibilityLabel={`Seleccionar color ${color}`}
                    key={color}
                    onPress={() => setLabelColor(color)}
                    style={[
                      styles.colorOption,
                      { backgroundColor: color },
                      labelColor === color && styles.colorOptionSelected,
                    ]}
                  />
                ))}
              </View>
              <Pressable
                disabled={createLabel.isPending || !labelName.trim()}
                onPress={() => createLabel.mutate()}
                style={[
                  styles.saveButton,
                  (createLabel.isPending || !labelName.trim()) &&
                    styles.disabled,
                ]}
              >
                <Text style={styles.saveLabel}>
                  {createLabel.isPending ? 'Guardando...' : 'Guardar etiqueta'}
                </Text>
              </Pressable>
            </View>
          </View>
        </KeyboardAvoidingView>
      </Modal>
      <Modal
        animationType="slide"
        navigationBarTranslucent
        onRequestClose={() => setIsEditing(false)}
        statusBarTranslucent
        transparent
        visible={isEditing}
      >
        <KeyboardAvoidingView
          behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
          style={styles.modalKeyboard}
        >
          <View style={styles.overlay}>
            <Pressable
              onPress={() => setIsEditing(false)}
              style={styles.backdrop}
            />
            <ScrollView
              contentContainerStyle={[
                styles.sheetContent,
                { paddingBottom: layout.bottomInset + 20 },
              ]}
              keyboardShouldPersistTaps="handled"
              showsVerticalScrollIndicator={false}
              style={[styles.sheet, { maxHeight: layout.sheetMaxHeight }]}
            >
              <View style={styles.handle} />
              <Text style={styles.sheetTitle}>Editar cliente</Text>
              <Text style={styles.sheetCopy}>
                Actualiza su información de contacto.
              </Text>
              <TextInput
                accessibilityLabel="Nombre del cliente"
                onChangeText={setFullName}
                placeholder="Nombre completo"
                placeholderTextColor="#8B96A5"
                style={styles.field}
                value={fullName}
              />
              <TextInput
                accessibilityLabel="Teléfono del cliente"
                keyboardType="phone-pad"
                onChangeText={setPhone}
                placeholder="Teléfono"
                placeholderTextColor="#8B96A5"
                style={styles.field}
                value={phone}
              />
              <TextInput
                accessibilityLabel="Correo del cliente"
                autoCapitalize="none"
                keyboardType="email-address"
                onChangeText={setEmail}
                placeholder="Correo electrónico"
                placeholderTextColor="#8B96A5"
                style={styles.field}
                value={email}
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
                  <Text style={styles.additionalLabel}>Campos adicionales</Text>
                  <Ionicons color="#69717d" name="chevron-down" size={19} />
                </Pressable>
              ) : (
                <View style={styles.additionalFields}>
                  <Text style={styles.additionalHeading}>
                    Campos adicionales
                  </Text>
                  <TextInput
                    accessibilityLabel="Apellido del cliente"
                    onChangeText={setLastName}
                    placeholder="Apellido"
                    placeholderTextColor="#8B96A5"
                    style={styles.field}
                    value={lastName}
                  />
                  <TextInput
                    accessibilityLabel="Fecha de nacimiento"
                    onChangeText={setBirthDate}
                    placeholder="Fecha de nacimiento (AAAA-MM-DD)"
                    placeholderTextColor="#8B96A5"
                    style={styles.field}
                    value={birthDate}
                  />
                  <TextInput
                    accessibilityLabel="Dirección del cliente"
                    onChangeText={setAddressLine}
                    placeholder="Dirección"
                    placeholderTextColor="#8B96A5"
                    style={styles.field}
                    value={addressLine}
                  />
                  <TextInput
                    accessibilityLabel="Documento del cliente"
                    onChangeText={setDocumentNumber}
                    placeholder="Documento de identidad"
                    placeholderTextColor="#8B96A5"
                    style={styles.field}
                    value={documentNumber}
                  />
                  <TextInput
                    accessibilityLabel="Notas del cliente"
                    multiline
                    onChangeText={setNotes}
                    placeholder="Notas o preferencias"
                    placeholderTextColor="#8B96A5"
                    style={[styles.field, styles.notesField]}
                    textAlignVertical="top"
                    value={notes}
                  />
                </View>
              )}
              <View style={styles.sheetActions}>
                <Pressable
                  onPress={() => setIsEditing(false)}
                  style={styles.cancelButton}
                >
                  <Text style={styles.cancelLabel}>Cancelar</Text>
                </Pressable>
                <Pressable
                  disabled={updateClient.isPending}
                  onPress={() => updateClient.mutate()}
                  style={[
                    styles.saveButton,
                    updateClient.isPending && styles.disabled,
                  ]}
                >
                  <Text style={styles.saveLabel}>
                    {updateClient.isPending ? 'Guardando...' : 'Guardar'}
                  </Text>
                </Pressable>
              </View>
            </ScrollView>
          </View>
        </KeyboardAvoidingView>
      </Modal>
    </SafeAreaView>
  );
}

function InfoRow({
  icon,
  label,
  last = false,
  value,
}: {
  icon: keyof typeof Ionicons.glyphMap;
  label: string;
  last?: boolean;
  value: string | null;
}) {
  return (
    <View style={[styles.infoRow, last && styles.infoRowLast]}>
      <View style={styles.infoIcon}>
        <Ionicons color="#101c2d" name={icon} size={19} />
      </View>
      <View style={styles.infoCopy}>
        <Text style={styles.infoLabel}>{label}</Text>
        <Text style={[styles.infoValue, !value && styles.secondary]}>
          {emptyValue(value)}
        </Text>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  additionalFields: { marginTop: 4 },
  additionalHeading: {
    color: '#111827',
    fontSize: 14,
    fontWeight: '900',
    marginTop: 17,
  },
  additionalLabel: {
    color: '#111827',
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
  addLabelButton: {
    alignItems: 'center',
    backgroundColor: appTheme.colors.accentWash,
    borderRadius: appTheme.radii.control,
    height: 42,
    justifyContent: 'center',
    width: 42,
  },
  activeBadge: {
    alignItems: 'center',
    backgroundColor: '#E5F7ED',
    borderRadius: 12,
    flexDirection: 'row',
    gap: 5,
    paddingHorizontal: 8,
    paddingVertical: 4,
  },
  activeDot: {
    backgroundColor: '#22A861',
    borderRadius: 4,
    height: 7,
    width: 7,
  },
  activeLabel: { color: '#167644', fontSize: 12, fontWeight: '800' },
  avatar: {
    alignItems: 'center',
    backgroundColor: appTheme.colors.accent,
    borderColor: appTheme.colors.white,
    borderRadius: 42,
    borderWidth: 4,
    height: 84,
    justifyContent: 'center',
    shadowColor: appTheme.colors.accentDark,
    shadowOpacity: 0.18,
    shadowRadius: 12,
    width: 84,
  },
  avatarText: { color: appTheme.colors.white, fontSize: 29, fontWeight: '900' },
  backButton: {
    backgroundColor: appTheme.colors.accent,
    borderRadius: appTheme.radii.control,
    ...goldButtonShadow,
    marginTop: 18,
    paddingHorizontal: 20,
    paddingVertical: 13,
  },
  backLabel: { color: appTheme.colors.white, fontWeight: '900' },
  backdrop: { bottom: 0, left: 0, position: 'absolute', right: 0, top: 0 },
  badges: { flexDirection: 'row', flexWrap: 'wrap', gap: 7, marginTop: 10 },
  cancelButton: {
    alignItems: 'center',
    backgroundColor: appTheme.colors.surface,
    borderColor: appTheme.colors.border,
    borderRadius: appTheme.radii.control,
    borderWidth: 1,
    flex: 1,
    justifyContent: 'center',
    minHeight: 54,
  },
  cancelLabel: {
    color: appTheme.colors.accentDark,
    fontSize: 15,
    fontWeight: '900',
  },
  content: {
    paddingBottom: 42,
    paddingHorizontal: appTheme.spacing.page,
    paddingTop: 22,
  },
  detailsCard: {
    backgroundColor: appTheme.colors.surface,
    borderColor: appTheme.colors.border,
    borderRadius: appTheme.radii.card,
    borderWidth: 1,
    paddingHorizontal: 16,
    shadowColor: appTheme.colors.accentDark,
    shadowOpacity: 0.035,
    shadowRadius: 9,
  },
  colorLabel: {
    color: appTheme.colors.text,
    fontSize: 14,
    fontWeight: '900',
    marginTop: 20,
  },
  colorList: { flexDirection: 'row', gap: 12, marginTop: 12 },
  colorOption: { borderRadius: 18, height: 36, width: 36 },
  colorOptionSelected: { borderColor: appTheme.colors.accent, borderWidth: 3 },
  emptyLabel: {
    color: appTheme.colors.textMuted,
    fontSize: 13,
    fontWeight: '700',
  },
  labelChip: { borderRadius: 12, paddingHorizontal: 9, paddingVertical: 5 },
  labelChipText: {
    color: appTheme.colors.white,
    fontSize: 12,
    fontWeight: '900',
  },
  labelList: { flexDirection: 'row', flexWrap: 'wrap', gap: 7, marginTop: 6 },
  labelSheet: {
    backgroundColor: appTheme.colors.surfaceElevated,
    borderTopLeftRadius: appTheme.radii.sheet,
    borderTopRightRadius: appTheme.radii.sheet,
    paddingBottom: 36,
    paddingHorizontal: 24,
    paddingTop: 16,
  },
  labelsCopy: { flex: 1 },
  labelsRow: {
    alignItems: 'center',
    flexDirection: 'row',
    gap: 12,
    paddingVertical: 14,
  },
  disabled: { opacity: 0.62 },
  editButton: {
    alignItems: 'center',
    backgroundColor: appTheme.colors.accentWash,
    borderRadius: appTheme.radii.control,
    height: 46,
    justifyContent: 'center',
    width: 46,
  },
  emptyHistory: {
    alignItems: 'center',
    backgroundColor: appTheme.colors.surface,
    borderColor: appTheme.colors.border,
    borderRadius: appTheme.radii.card,
    borderWidth: 1,
    gap: 10,
    padding: 32,
  },
  field: {
    backgroundColor: appTheme.colors.surfaceMuted,
    borderColor: appTheme.colors.border,
    borderRadius: appTheme.radii.control,
    borderWidth: 1,
    color: appTheme.colors.text,
    fontSize: 16,
    marginTop: 12,
    paddingHorizontal: 15,
    paddingVertical: 15,
  },
  frequentBadge: {
    alignItems: 'center',
    backgroundColor: appTheme.colors.accentWash,
    borderRadius: 12,
    flexDirection: 'row',
    gap: 4,
    paddingHorizontal: 8,
    paddingVertical: 4,
  },
  frequentLabel: {
    color: appTheme.colors.accentDark,
    fontSize: 12,
    fontWeight: '800',
  },
  handle: {
    alignSelf: 'center',
    backgroundColor: appTheme.colors.border,
    borderRadius: 4,
    height: 5,
    marginBottom: 20,
    width: 45,
  },
  header: {
    alignItems: 'center',
    backgroundColor: appTheme.colors.background,
    borderBottomColor: appTheme.colors.border,
    borderBottomWidth: 1,
    flexDirection: 'row',
    justifyContent: 'space-between',
    paddingHorizontal: appTheme.spacing.page,
    paddingVertical: 13,
  },
  headerActions: { flexDirection: 'row', gap: 8, paddingRight: 64 },
  moreButton: {
    alignItems: 'center',
    backgroundColor: appTheme.colors.surface,
    borderColor: appTheme.colors.border,
    borderRadius: appTheme.radii.control,
    borderWidth: 1,
    height: 46,
    justifyContent: 'center',
    width: 46,
  },
  notesField: { minHeight: 92 },
  optionIcon: {
    alignItems: 'center',
    backgroundColor: appTheme.colors.accentWash,
    borderRadius: appTheme.radii.control,
    height: 44,
    justifyContent: 'center',
    width: 44,
  },
  optionLabel: {
    color: appTheme.colors.text,
    flex: 1,
    fontSize: 16,
    fontWeight: '800',
  },
  optionRow: {
    alignItems: 'center',
    borderBottomColor: appTheme.colors.border,
    borderBottomWidth: 1,
    flexDirection: 'row',
    gap: 12,
    minHeight: 68,
  },
  optionsOverlay: {
    backgroundColor: appTheme.colors.overlay,
    flex: 1,
    justifyContent: 'flex-end',
  },
  optionsSheet: {
    backgroundColor: appTheme.colors.surfaceElevated,
    borderTopLeftRadius: appTheme.radii.sheet,
    borderTopRightRadius: appTheme.radii.sheet,
    paddingBottom: 26,
    paddingHorizontal: 22,
    paddingTop: 13,
  },
  optionsTitle: {
    color: appTheme.colors.text,
    fontSize: 22,
    fontWeight: '900',
    marginBottom: 7,
  },
  deleteOption: { borderBottomWidth: 0, marginTop: 4 },
  deleteOptionIcon: { backgroundColor: '#FDECEA' },
  deleteOptionLabel: {
    color: '#B42318',
    flex: 1,
    fontSize: 16,
    fontWeight: '900',
  },
  headerButton: {
    alignItems: 'center',
    backgroundColor: appTheme.colors.surface,
    borderRadius: appTheme.radii.control,
    height: 46,
    justifyContent: 'center',
    width: 46,
  },
  headerTitle: {
    color: appTheme.colors.text,
    flex: 1,
    fontSize: 17,
    fontWeight: '900',
    marginHorizontal: 10,
  },
  commentStars: { flexDirection: 'row', gap: 5 },
  commentsEmpty: {
    alignItems: 'center',
    backgroundColor: appTheme.colors.surface,
    borderColor: appTheme.colors.border,
    borderRadius: appTheme.radii.card,
    borderWidth: 1,
    gap: 12,
    padding: 32,
  },
  commentsTitle: {
    color: appTheme.colors.text,
    fontSize: 17,
    fontWeight: '900',
  },
  filterChip: {
    borderColor: appTheme.colors.border,
    borderRadius: appTheme.radii.control,
    borderWidth: 1,
    paddingHorizontal: 11,
    paddingVertical: 7,
  },
  filterChipActive: {
    backgroundColor: appTheme.colors.accent,
    borderColor: appTheme.colors.accent,
  },
  filterChipText: {
    color: appTheme.colors.accentDark,
    fontSize: 12,
    fontWeight: '800',
  },
  filterChipTextActive: { color: appTheme.colors.white },
  filterList: { gap: 7, paddingRight: 12 },
  historyFilters: { gap: 10, marginBottom: 14 },
  orderButton: {
    alignItems: 'center',
    alignSelf: 'flex-start',
    backgroundColor: appTheme.colors.accentWash,
    borderRadius: appTheme.radii.control,
    flexDirection: 'row',
    gap: 6,
    paddingHorizontal: 11,
    paddingVertical: 8,
  },
  orderLabel: {
    color: appTheme.colors.accentDark,
    fontSize: 12,
    fontWeight: '900',
  },
  paidLabel: {
    color: '#167644',
    fontSize: 11,
    fontWeight: '900',
    marginTop: 4,
    textAlign: 'right',
  },
  historyCard: {
    alignItems: 'center',
    backgroundColor: appTheme.colors.surface,
    borderColor: appTheme.colors.border,
    borderRadius: appTheme.radii.card,
    borderWidth: 1,
    flexDirection: 'row',
    gap: 11,
    padding: 13,
  },
  historyCopy: { flex: 1 },
  historyDate: {
    alignItems: 'center',
    backgroundColor: appTheme.colors.accentWash,
    borderRadius: 13,
    justifyContent: 'center',
    minHeight: 49,
    width: 48,
  },
  historyDay: {
    color: appTheme.colors.accentDark,
    fontSize: 17,
    fontWeight: '900',
  },
  historyMeta: { color: appTheme.colors.textMuted, fontSize: 12, marginTop: 3 },
  historyMonth: {
    color: appTheme.colors.accentDark,
    fontSize: 11,
    fontWeight: '800',
    textTransform: 'uppercase',
  },
  historyService: {
    color: appTheme.colors.text,
    fontSize: 14,
    fontWeight: '900',
  },
  historyList: { gap: 10 },
  infoCopy: { flex: 1 },
  infoIcon: {
    alignItems: 'center',
    backgroundColor: appTheme.colors.accentWash,
    borderRadius: appTheme.radii.control,
    height: 42,
    justifyContent: 'center',
    width: 42,
  },
  infoLabel: {
    color: appTheme.colors.textMuted,
    fontSize: 12,
    fontWeight: '700',
  },
  infoRow: {
    alignItems: 'center',
    borderBottomColor: appTheme.colors.border,
    borderBottomWidth: 1,
    flexDirection: 'row',
    gap: 12,
    paddingVertical: 14,
  },
  infoRowLast: { borderBottomWidth: 0 },
  infoValue: {
    color: appTheme.colors.text,
    fontSize: 15,
    fontWeight: '700',
    marginTop: 2,
  },
  loading: { alignItems: 'center', flex: 1, justifyContent: 'center' },
  metric: { alignItems: 'center', flex: 1 },
  metricDate: { color: appTheme.colors.text, fontSize: 13, fontWeight: '900' },
  metricDivider: {
    backgroundColor: appTheme.colors.border,
    height: 35,
    width: 1,
  },
  metricLabel: { color: appTheme.colors.textMuted, fontSize: 11, marginTop: 5 },
  metricValue: { color: appTheme.colors.text, fontSize: 19, fontWeight: '900' },
  metrics: {
    alignItems: 'center',
    backgroundColor: appTheme.colors.surface,
    borderColor: appTheme.colors.border,
    borderRadius: appTheme.radii.card,
    borderWidth: 1,
    flexDirection: 'row',
    marginTop: 15,
    paddingVertical: 16,
    shadowColor: appTheme.colors.accentDark,
    shadowOpacity: 0.035,
    shadowRadius: 8,
  },
  missing: {
    alignItems: 'center',
    flex: 1,
    justifyContent: 'center',
    padding: 24,
  },
  missingTitle: {
    color: appTheme.colors.text,
    fontSize: 20,
    fontWeight: '900',
    marginTop: 12,
  },
  name: {
    color: appTheme.colors.text,
    fontSize: 22,
    fontWeight: '900',
    letterSpacing: -0.3,
  },
  noteCopy: { flex: 1 },
  noteDate: { color: appTheme.colors.textMuted, fontSize: 12, marginTop: 9 },
  noteDragArea: { paddingBottom: 10, paddingTop: 4 },
  noteList: { gap: 10, marginTop: 10 },
  notePhoto: { borderRadius: 14, height: 150, marginTop: 12, width: '100%' },
  notePhotoActions: { flexDirection: 'row', gap: 10, marginTop: 16 },
  notePreview: { borderRadius: 16, height: 180, marginTop: 14, width: '100%' },
  noteSaveButton: {
    alignItems: 'center',
    backgroundColor: appTheme.colors.accent,
    borderRadius: appTheme.radii.control,
    ...goldButtonShadow,
    marginTop: 20,
    minHeight: 54,
    justifyContent: 'center',
  },
  noteSheet: {
    backgroundColor: appTheme.colors.surfaceElevated,
    borderTopLeftRadius: appTheme.radii.sheet,
    borderTopRightRadius: appTheme.radii.sheet,
    paddingBottom: 34,
    paddingHorizontal: 22,
    paddingTop: 10,
  },
  notesHeader: {
    alignItems: 'center',
    flexDirection: 'row',
    justifyContent: 'space-between',
  },
  photoAction: {
    alignItems: 'center',
    backgroundColor: appTheme.colors.accentWash,
    borderRadius: appTheme.radii.control,
    flex: 1,
    flexDirection: 'row',
    gap: 8,
    justifyContent: 'center',
    minHeight: 50,
  },
  photoActionLabel: {
    color: appTheme.colors.accentDark,
    fontSize: 13,
    fontWeight: '900',
  },
  notesCard: {
    alignItems: 'flex-start',
    backgroundColor: appTheme.colors.surface,
    borderColor: appTheme.colors.border,
    borderRadius: appTheme.radii.card,
    borderWidth: 1,
    flexDirection: 'row',
    gap: 12,
    padding: 18,
  },
  notesText: {
    color: appTheme.colors.text,
    flex: 1,
    fontSize: 15,
    lineHeight: 22,
  },
  overlay: {
    backgroundColor: appTheme.colors.overlay,
    flex: 1,
    justifyContent: 'flex-end',
  },
  modalKeyboard: { flex: 1 },
  phone: { color: appTheme.colors.textMuted, fontSize: 14, marginTop: 4 },
  profileCard: {
    alignItems: 'center',
    backgroundColor: appTheme.colors.accentWash,
    borderColor: appTheme.colors.border,
    borderRadius: appTheme.radii.card,
    borderWidth: 1,
    flexDirection: 'row',
    gap: 15,
    padding: 17,
  },
  profileCopy: { flex: 1 },
  quickAction: { alignItems: 'center', flex: 1, gap: 7 },
  quickActions: { flexDirection: 'row', justifyContent: 'space-between' },
  quickIcon: {
    alignItems: 'center',
    backgroundColor: appTheme.colors.surface,
    borderColor: appTheme.colors.border,
    borderRadius: appTheme.radii.control,
    borderWidth: 1,
    height: 54,
    justifyContent: 'center',
    width: 54,
  },
  quickLabel: { color: appTheme.colors.text, fontSize: 12, fontWeight: '800' },
  saveButton: {
    alignItems: 'center',
    backgroundColor: appTheme.colors.accent,
    borderRadius: appTheme.radii.control,
    flex: 1.15,
    justifyContent: 'center',
    minHeight: 54,
    ...goldButtonShadow,
  },
  saveLabel: { color: appTheme.colors.white, fontSize: 15, fontWeight: '900' },
  screen: { backgroundColor: appTheme.colors.background, flex: 1 },
  secondary: { color: appTheme.colors.textMuted },
  sectionTitle: {
    color: appTheme.colors.text,
    fontSize: 16,
    fontWeight: '900',
    marginBottom: 14,
    marginTop: 27,
  },
  sheet: {
    backgroundColor: appTheme.colors.surfaceElevated,
    borderTopLeftRadius: appTheme.radii.sheet,
    borderTopRightRadius: appTheme.radii.sheet,
    paddingBottom: 28,
    paddingHorizontal: 22,
    paddingTop: 13,
  },
  sheetContent: { paddingBottom: 28 },
  sheetActions: { flexDirection: 'row', gap: 10, marginTop: 22 },
  sheetCopy: { color: appTheme.colors.textMuted, fontSize: 14, marginTop: 6 },
  sheetTitle: { color: appTheme.colors.text, fontSize: 22, fontWeight: '900' },
  status: {
    backgroundColor: '#FFF3DE',
    borderRadius: 9,
    color: '#A15C00',
    fontSize: 10,
    fontWeight: '800',
    overflow: 'hidden',
    paddingHorizontal: 7,
    paddingVertical: 4,
  },
  statusCompleted: { backgroundColor: '#E5F7ED', color: '#167644' },
  tab: { alignItems: 'center', flex: 1, paddingBottom: 11, paddingTop: 4 },
  tabActive: {
    borderBottomColor: appTheme.colors.accent,
    borderBottomWidth: 2.5,
  },
  tabLabel: {
    color: appTheme.colors.textMuted,
    fontSize: 13,
    fontWeight: '800',
  },
  tabLabelActive: { color: appTheme.colors.accentDark },
  tabs: {
    borderBottomColor: appTheme.colors.border,
    borderBottomWidth: 1,
    flexDirection: 'row',
    marginBottom: 16,
    marginTop: 31,
  },
});
