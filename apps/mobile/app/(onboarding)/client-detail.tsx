import Ionicons from '@expo/vector-icons/Ionicons';
import type { ClientDetailResponse } from '@barber-saas/api-client';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Redirect, useLocalSearchParams, useRouter } from 'expo-router';
import { useEffect, useState } from 'react';
import {
  Alert,
  Linking,
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

type Tab = 'information' | 'history' | 'notes';

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
  } as const;
  return labels[status];
}

export default function ClientDetailScreen() {
  const { session } = useAuth();
  const router = useRouter();
  const queryClient = useQueryClient();
  const { clientId } = useLocalSearchParams<{ clientId: string }>();
  const [activeTab, setActiveTab] = useState<Tab>('information');
  const [isEditing, setIsEditing] = useState(false);
  const [isOptionsOpen, setIsOptionsOpen] = useState(false);
  const [isLabelOpen, setIsLabelOpen] = useState(false);
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
    queryKey: ['client-detail', clientId],
  });
  const client = detailQuery.data?.client;

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
        queryClient.invalidateQueries({ queryKey: ['clients'] }),
        queryClient.invalidateQueries({
          queryKey: ['client-detail', clientId],
        }),
      ]);
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
        queryClient.invalidateQueries({ queryKey: ['clients'] }),
        queryClient.invalidateQueries({ queryKey: ['client-labels'] }),
        queryClient.invalidateQueries({
          queryKey: ['client-detail', clientId],
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
      await queryClient.invalidateQueries({ queryKey: ['clients'] });
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
          <Pressable onPress={() => router.back()} style={styles.backButton}>
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
          onPress={() => router.back()}
          style={styles.headerButton}
        >
          <Ionicons color="#111827" name="chevron-back" size={25} />
        </Pressable>
        <Text accessibilityRole="header" style={styles.headerTitle}>
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
          <View style={styles.notesCard}>
            <Ionicons color="#101c2d" name="document-text-outline" size={22} />
            <Text style={[styles.notesText, !client.notes && styles.secondary]}>
              {emptyValue(client.notes)}
            </Text>
          </View>
        ) : null}
        {activeTab === 'history' ? (
          detail.history.length ? (
            <View style={styles.historyList}>
              {detail.history.map((item) => (
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
                  <Text
                    style={[
                      styles.status,
                      item.status === 'completed' && styles.statusCompleted,
                    ]}
                  >
                    {statusLabel(item.status)}
                  </Text>
                </View>
              ))}
            </View>
          ) : (
            <View style={styles.emptyHistory}>
              <Ionicons color="#8B96A5" name="calendar-outline" size={28} />
              <Text style={styles.secondary}>
                Aún no hay reservas registradas.
              </Text>
            </View>
          )
        ) : null}
      </ScrollView>
      <Modal
        animationType="fade"
        onRequestClose={() => setIsOptionsOpen(false)}
        transparent
        visible={isOptionsOpen}
      >
        <View style={styles.optionsOverlay}>
          <Pressable
            accessibilityLabel="Cerrar más opciones"
            onPress={() => setIsOptionsOpen(false)}
            style={styles.backdrop}
          />
          <View style={styles.optionsSheet}>
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
        onRequestClose={() => setIsLabelOpen(false)}
        transparent
        visible={isLabelOpen}
      >
        <View style={styles.overlay}>
          <Pressable
            onPress={() => setIsLabelOpen(false)}
            style={styles.backdrop}
          />
          <View style={styles.labelSheet}>
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
                (createLabel.isPending || !labelName.trim()) && styles.disabled,
              ]}
            >
              <Text style={styles.saveLabel}>
                {createLabel.isPending ? 'Guardando...' : 'Guardar etiqueta'}
              </Text>
            </Pressable>
          </View>
        </View>
      </Modal>
      <Modal
        animationType="slide"
        onRequestClose={() => setIsEditing(false)}
        transparent
        visible={isEditing}
      >
        <View style={styles.overlay}>
          <Pressable
            onPress={() => setIsEditing(false)}
            style={styles.backdrop}
          />
          <ScrollView
            contentContainerStyle={styles.sheetContent}
            keyboardShouldPersistTaps="handled"
            showsVerticalScrollIndicator={false}
            style={styles.sheet}
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
                <Ionicons color="#101c2d" name="add-circle-outline" size={20} />
                <Text style={styles.additionalLabel}>Campos adicionales</Text>
                <Ionicons color="#69717d" name="chevron-down" size={19} />
              </Pressable>
            ) : (
              <View style={styles.additionalFields}>
                <Text style={styles.additionalHeading}>Campos adicionales</Text>
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
    backgroundColor: '#E1E2E4',
    borderRadius: 14,
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
    backgroundColor: '#101c2d',
    borderColor: '#FFFFFF',
    borderRadius: 42,
    borderWidth: 4,
    height: 84,
    justifyContent: 'center',
    shadowColor: '#101c2d',
    shadowOpacity: 0.18,
    shadowRadius: 12,
    width: 84,
  },
  avatarText: { color: '#FFFFFF', fontSize: 29, fontWeight: '900' },
  backButton: {
    backgroundColor: '#101c2d',
    borderRadius: 16,
    marginTop: 18,
    paddingHorizontal: 20,
    paddingVertical: 13,
  },
  backLabel: { color: '#FFFFFF', fontWeight: '900' },
  backdrop: { bottom: 0, left: 0, position: 'absolute', right: 0, top: 0 },
  badges: { flexDirection: 'row', flexWrap: 'wrap', gap: 7, marginTop: 10 },
  cancelButton: {
    alignItems: 'center',
    borderColor: '#CAD1DC',
    borderRadius: 16,
    borderWidth: 1,
    flex: 1,
    justifyContent: 'center',
    minHeight: 54,
  },
  cancelLabel: { color: '#111827', fontSize: 15, fontWeight: '900' },
  content: { paddingBottom: 42, paddingHorizontal: 20, paddingTop: 22 },
  detailsCard: {
    backgroundColor: '#FFFFFF',
    borderColor: '#E4E8EF',
    borderRadius: 22,
    borderWidth: 1,
    paddingHorizontal: 16,
    shadowColor: '#111827',
    shadowOpacity: 0.035,
    shadowRadius: 9,
  },
  colorLabel: {
    color: '#111827',
    fontSize: 14,
    fontWeight: '900',
    marginTop: 20,
  },
  colorList: { flexDirection: 'row', gap: 12, marginTop: 12 },
  colorOption: { borderRadius: 18, height: 36, width: 36 },
  colorOptionSelected: { borderColor: '#111827', borderWidth: 3 },
  emptyLabel: { color: '#6E7785', fontSize: 13, fontWeight: '700' },
  labelChip: { borderRadius: 12, paddingHorizontal: 9, paddingVertical: 5 },
  labelChipText: { color: '#FFFFFF', fontSize: 12, fontWeight: '900' },
  labelList: { flexDirection: 'row', flexWrap: 'wrap', gap: 7, marginTop: 6 },
  labelSheet: {
    backgroundColor: '#FFFFFF',
    borderTopLeftRadius: 30,
    borderTopRightRadius: 30,
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
    backgroundColor: '#e1e2e4',
    borderRadius: 17,
    height: 46,
    justifyContent: 'center',
    width: 46,
  },
  emptyHistory: {
    alignItems: 'center',
    backgroundColor: '#FFFFFF',
    borderColor: '#E4E8EF',
    borderRadius: 22,
    borderWidth: 1,
    gap: 10,
    padding: 32,
  },
  field: {
    backgroundColor: '#f8f8f7',
    borderColor: '#D9E0EB',
    borderRadius: 15,
    borderWidth: 1,
    color: '#111827',
    fontSize: 16,
    marginTop: 12,
    paddingHorizontal: 15,
    paddingVertical: 15,
  },
  frequentBadge: {
    alignItems: 'center',
    backgroundColor: '#eeeff1',
    borderRadius: 12,
    flexDirection: 'row',
    gap: 4,
    paddingHorizontal: 8,
    paddingVertical: 4,
  },
  frequentLabel: { color: '#101c2d', fontSize: 12, fontWeight: '800' },
  handle: {
    alignSelf: 'center',
    backgroundColor: '#C7CED9',
    borderRadius: 4,
    height: 5,
    marginBottom: 20,
    width: 45,
  },
  header: {
    alignItems: 'center',
    backgroundColor: '#f8f8f7',
    borderBottomColor: '#e4e5e7',
    borderBottomWidth: 1,
    flexDirection: 'row',
    justifyContent: 'space-between',
    paddingHorizontal: 20,
    paddingVertical: 13,
  },
  headerActions: { flexDirection: 'row', gap: 8 },
  moreButton: {
    alignItems: 'center',
    backgroundColor: '#FFFFFF',
    borderColor: '#d2d4d8',
    borderRadius: 17,
    borderWidth: 1,
    height: 46,
    justifyContent: 'center',
    width: 46,
  },
  notesField: { minHeight: 92 },
  optionIcon: {
    alignItems: 'center',
    backgroundColor: '#e1e2e4',
    borderRadius: 14,
    height: 44,
    justifyContent: 'center',
    width: 44,
  },
  optionLabel: { color: '#111827', flex: 1, fontSize: 16, fontWeight: '800' },
  optionRow: {
    alignItems: 'center',
    borderBottomColor: '#e4e5e7',
    borderBottomWidth: 1,
    flexDirection: 'row',
    gap: 12,
    minHeight: 68,
  },
  optionsOverlay: {
    backgroundColor: 'rgba(17, 24, 39, 0.4)',
    flex: 1,
    justifyContent: 'flex-end',
  },
  optionsSheet: {
    backgroundColor: '#FFFFFF',
    borderTopLeftRadius: 28,
    borderTopRightRadius: 28,
    paddingBottom: 26,
    paddingHorizontal: 22,
    paddingTop: 13,
  },
  optionsTitle: {
    color: '#111827',
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
    backgroundColor: '#FFFFFF',
    borderRadius: 17,
    height: 46,
    justifyContent: 'center',
    width: 46,
  },
  headerTitle: { color: '#111827', fontSize: 17, fontWeight: '900' },
  historyCard: {
    alignItems: 'center',
    backgroundColor: '#FFFFFF',
    borderColor: '#E4E8EF',
    borderRadius: 19,
    borderWidth: 1,
    flexDirection: 'row',
    gap: 11,
    padding: 13,
  },
  historyCopy: { flex: 1 },
  historyDate: {
    alignItems: 'center',
    backgroundColor: '#e1e2e4',
    borderRadius: 13,
    justifyContent: 'center',
    minHeight: 49,
    width: 48,
  },
  historyDay: { color: '#101c2d', fontSize: 17, fontWeight: '900' },
  historyMeta: { color: '#6E7785', fontSize: 12, marginTop: 3 },
  historyMonth: {
    color: '#101c2d',
    fontSize: 11,
    fontWeight: '800',
    textTransform: 'uppercase',
  },
  historyService: { color: '#111827', fontSize: 14, fontWeight: '900' },
  historyList: { gap: 10 },
  infoCopy: { flex: 1 },
  infoIcon: {
    alignItems: 'center',
    backgroundColor: '#e1e2e4',
    borderRadius: 13,
    height: 42,
    justifyContent: 'center',
    width: 42,
  },
  infoLabel: { color: '#6E7785', fontSize: 12, fontWeight: '700' },
  infoRow: {
    alignItems: 'center',
    borderBottomColor: '#EDF0F4',
    borderBottomWidth: 1,
    flexDirection: 'row',
    gap: 12,
    paddingVertical: 14,
  },
  infoRowLast: { borderBottomWidth: 0 },
  infoValue: {
    color: '#111827',
    fontSize: 15,
    fontWeight: '700',
    marginTop: 2,
  },
  loading: { alignItems: 'center', flex: 1, justifyContent: 'center' },
  metric: { alignItems: 'center', flex: 1 },
  metricDate: { color: '#111827', fontSize: 13, fontWeight: '900' },
  metricDivider: { backgroundColor: '#d2d4d8', height: 35, width: 1 },
  metricLabel: { color: '#6E7785', fontSize: 11, marginTop: 5 },
  metricValue: { color: '#111827', fontSize: 19, fontWeight: '900' },
  metrics: {
    alignItems: 'center',
    backgroundColor: '#FFFFFF',
    borderColor: '#E4E8EF',
    borderRadius: 20,
    borderWidth: 1,
    flexDirection: 'row',
    marginTop: 15,
    paddingVertical: 16,
    shadowColor: '#111827',
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
    color: '#111827',
    fontSize: 20,
    fontWeight: '900',
    marginTop: 12,
  },
  name: {
    color: '#111827',
    fontSize: 22,
    fontWeight: '900',
    letterSpacing: -0.3,
  },
  notesCard: {
    alignItems: 'flex-start',
    backgroundColor: '#FFFFFF',
    borderColor: '#E4E8EF',
    borderRadius: 22,
    borderWidth: 1,
    flexDirection: 'row',
    gap: 12,
    padding: 18,
  },
  notesText: { color: '#111827', flex: 1, fontSize: 15, lineHeight: 22 },
  overlay: {
    backgroundColor: 'rgba(17, 24, 39, 0.4)',
    flex: 1,
    justifyContent: 'flex-end',
  },
  phone: { color: '#586474', fontSize: 14, marginTop: 4 },
  profileCard: {
    alignItems: 'center',
    backgroundColor: '#eeeff1',
    borderColor: '#d2d4d8',
    borderRadius: 25,
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
    backgroundColor: '#FFFFFF',
    borderColor: '#d2d4d8',
    borderRadius: 20,
    borderWidth: 1,
    height: 54,
    justifyContent: 'center',
    width: 54,
  },
  quickLabel: { color: '#111827', fontSize: 12, fontWeight: '800' },
  saveButton: {
    alignItems: 'center',
    backgroundColor: '#101c2d',
    borderRadius: 16,
    flex: 1.15,
    justifyContent: 'center',
    minHeight: 54,
  },
  saveLabel: { color: '#FFFFFF', fontSize: 15, fontWeight: '900' },
  screen: { backgroundColor: '#f8f8f7', flex: 1 },
  secondary: { color: '#8B96A5' },
  sectionTitle: {
    color: '#111827',
    fontSize: 16,
    fontWeight: '900',
    marginBottom: 14,
    marginTop: 27,
  },
  sheet: {
    maxHeight: '88%',
    backgroundColor: '#FFFFFF',
    borderTopLeftRadius: 28,
    borderTopRightRadius: 28,
    paddingBottom: 28,
    paddingHorizontal: 22,
    paddingTop: 13,
  },
  sheetContent: { paddingBottom: 28 },
  sheetActions: { flexDirection: 'row', gap: 10, marginTop: 22 },
  sheetCopy: { color: '#6E7785', fontSize: 14, marginTop: 6 },
  sheetTitle: { color: '#111827', fontSize: 22, fontWeight: '900' },
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
  tabActive: { borderBottomColor: '#101c2d', borderBottomWidth: 2.5 },
  tabLabel: { color: '#7A8594', fontSize: 13, fontWeight: '800' },
  tabLabelActive: { color: '#101c2d' },
  tabs: {
    borderBottomColor: '#d2d4d8',
    borderBottomWidth: 1,
    flexDirection: 'row',
    marginBottom: 16,
    marginTop: 31,
  },
});
