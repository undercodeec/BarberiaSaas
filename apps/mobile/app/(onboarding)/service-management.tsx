import Ionicons from '@expo/vector-icons/Ionicons';
import type { ServiceRecord, ServicesResponse } from '@barber-saas/api-client';
import * as ImagePicker from 'expo-image-picker';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Redirect, useLocalSearchParams, useRouter } from 'expo-router';
import { useEffect, useMemo, useState } from 'react';
import {
  Alert,
  Image,
  Pressable,
  StyleSheet,
  Text,
  TextInput,
  Switch,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { InlineMessage } from '../../src/components/InlineMessage';
import { KeyboardAwareScrollView as ScrollView } from '../../src/components/KeyboardAwareScrollView';
import { useCurrentOrganization } from '../../src/features/organization/useCurrentOrganization';
import {
  appStyles,
  appTheme,
  goldButtonShadow,
} from '../../src/components/BottomNavigation';
import { requireApiClient } from '../../src/lib/api';
import { tenantQueryPrefix } from '../../src/lib/query-keys';
import { useAuth } from '../../src/providers/AuthProvider';
import { useTenantScope } from '../../src/providers/TenantScopeProvider';
import { GuideAnchor } from '../../src/features/guides/GuideAnchor';
import { useGuides } from '../../src/features/guides/GuideProvider';

const MAX_IMAGE_BYTES = 1_500_000;
const MAX_IMAGE_DIMENSION = 1_600;

const COLORS = {
  border: appTheme.colors.border,
  muted: appTheme.colors.textMuted,
  screen: appTheme.colors.background,
  surface: appTheme.colors.surface,
  text: appTheme.colors.text,
} as const;

export default function ServiceManagementScreen() {
  const router = useRouter();
  const queryClient = useQueryClient();
  const { session } = useAuth();
  const { guide, replay } = useLocalSearchParams<{
    guide?: string;
    replay?: string;
  }>();
  const { completeGuide, startGuide } = useGuides();
  const tenant = useTenantScope();
  const organizationQuery = useCurrentOrganization();
  const current = organizationQuery.data;
  const [categoryName, setCategoryName] = useState('');
  const [selectedCategoryId, setSelectedCategoryId] = useState<string | null>(
    null,
  );
  const [serviceName, setServiceName] = useState('');
  const [serviceDescription, setServiceDescription] = useState('');
  const [serviceImageData, setServiceImageData] = useState<string | null>(null);
  const [durationMinutes, setDurationMinutes] = useState('30');
  const [price, setPrice] = useState('');
  const [onlineBooking, setOnlineBooking] = useState(true);
  const [editingService, setEditingService] = useState<ServiceRecord | null>(
    null,
  );
  const [successMessage, setSuccessMessage] = useState<string | null>(null);

  useEffect(() => {
    if (guide !== 'add-service') return;
    startGuide('add-service', { force: replay === '1' });
  }, [guide, replay, startGuide]);

  const servicesQuery = useQuery({
    enabled: Boolean(session && current),
    queryFn: () => requireApiClient().request<ServicesResponse>('/v1/services'),
    queryKey: tenant.key('services'),
  });
  const categoriesById = useMemo(
    () =>
      new Map(
        (servicesQuery.data?.categories ?? []).map((category) => [
          category.id,
          category.name,
        ]),
      ),
    [servicesQuery.data?.categories],
  );

  const categoryMutation = useMutation({
    mutationFn: () =>
      requireApiClient().request('/v1/service-categories', {
        body: { name: categoryName.trim() },
        method: 'POST',
      }),
    onSuccess: async () => {
      setCategoryName('');
      setSuccessMessage('Categoría creada correctamente.');
      await queryClient.invalidateQueries({
        queryKey: tenantQueryPrefix('services'),
      });
    },
  });

  const serviceMutation = useMutation({
    mutationFn: async () => {
      const payload = {
        categoryId: selectedCategoryId,
        description: serviceDescription.trim() || null,
        durationMinutes: Number(durationMinutes),
        imageData: serviceImageData,
        name: serviceName.trim(),
        onlineBooking,
        priceCents: Math.round(Number(price) * 100),
      };
      if (editingService) {
        return requireApiClient().request<{
          readonly service: { readonly id: string };
        }>(`/v1/services/${editingService.id}`, {
          body: payload,
          method: 'PATCH',
        });
      }
      const created = await requireApiClient().request<{
        readonly service: { readonly id: string };
      }>('/v1/services', {
        body: payload,
        method: 'POST',
      });
      if (current?.location?.id && current.membership.id) {
        await requireApiClient().request('/v1/services/assignments', {
          body: {
            locationId: current.location.id,
            membershipId: current.membership.id,
            serviceId: created.service.id,
          },
          method: 'POST',
        });
      }
      return created;
    },
    onSuccess: async () => {
      const wasEditing = Boolean(editingService);
      setEditingService(null);
      setServiceName('');
      setServiceDescription('');
      setServiceImageData(null);
      setDurationMinutes('30');
      setPrice('');
      setOnlineBooking(true);
      setSelectedCategoryId(null);
      setSuccessMessage(
        wasEditing
          ? 'Servicio actualizado correctamente.'
          : 'Servicio creado y habilitado correctamente.',
      );
      if (!wasEditing) completeGuide('add-service');
      await queryClient.invalidateQueries({
        queryKey: tenantQueryPrefix('services'),
      });
    },
  });

  const archiveMutation = useMutation({
    mutationFn: (serviceId: string) =>
      requireApiClient().request(`/v1/services/${serviceId}`, {
        method: 'DELETE',
      }),
    onSuccess: async () => {
      setEditingService(null);
      setServiceName('');
      setServiceDescription('');
      setServiceImageData(null);
      setDurationMinutes('30');
      setPrice('');
      setOnlineBooking(true);
      setSelectedCategoryId(null);
      setSuccessMessage('Servicio eliminado del catálogo activo.');
      await queryClient.invalidateQueries({
        queryKey: tenantQueryPrefix('services'),
      });
    },
  });

  const editService = (service: ServiceRecord) => {
    setEditingService(service);
    setServiceName(service.name);
    setServiceDescription(service.description ?? '');
    setServiceImageData(service.imageData);
    setDurationMinutes(String(service.durationMinutes));
    setPrice((service.priceCents / 100).toFixed(2));
    setOnlineBooking(service.onlineBooking);
    setSelectedCategoryId(service.categoryId);
    setSuccessMessage(null);
  };

  const cancelEditing = () => {
    setEditingService(null);
    setServiceName('');
    setServiceDescription('');
    setServiceImageData(null);
    setDurationMinutes('30');
    setPrice('');
    setOnlineBooking(true);
    setSelectedCategoryId(null);
  };

  if (!session) return <Redirect href="/(auth)/login" />;

  const chooseServicePhoto = async () => {
    const permission = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (!permission.granted) {
      Alert.alert(
        'Permiso necesario',
        'Autoriza el acceso para elegir una foto.',
      );
      return;
    }
    const result = await ImagePicker.launchImageLibraryAsync({
      allowsEditing: true,
      aspect: [1, 1],
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
    if (
      bytes > MAX_IMAGE_BYTES ||
      asset.width > MAX_IMAGE_DIMENSION ||
      asset.height > MAX_IMAGE_DIMENSION
    ) {
      Alert.alert(
        'Imagen demasiado grande',
        'Máximo: 1.5 MB y 1600 × 1600 píxeles.',
      );
      return;
    }
    const mimeType = asset.mimeType?.startsWith('image/')
      ? asset.mimeType
      : 'image/jpeg';
    setServiceImageData(`data:${mimeType};base64,${asset.base64}`);
  };

  const requestError =
    categoryMutation.error ?? serviceMutation.error ?? archiveMutation.error;
  const canCreateService =
    serviceName.trim().length >= 2 &&
    Number(durationMinutes) >= 5 &&
    Number(price) >= 0 &&
    price.trim().length > 0;

  return (
    <SafeAreaView style={styles.screen}>
      <View style={styles.header}>
        <Pressable
          accessibilityLabel="Volver"
          accessibilityRole="button"
          onPress={() =>
            router.canGoBack()
              ? router.back()
              : router.replace('/business-settings')
          }
          style={styles.backButton}
        >
          <Ionicons
            color={appTheme.colors.accentDark}
            name="arrow-back"
            size={25}
          />
        </Pressable>
        <View style={styles.headerCopy}>
          <Text accessibilityRole="header" style={styles.title}>
            Gestión de servicios
          </Text>
          <Text style={styles.subtitle}>
            Organiza lo que tus clientes pueden reservar
          </Text>
        </View>
      </View>

      <ScrollView
        contentContainerStyle={styles.content}
        keyboardShouldPersistTaps="handled"
        showsVerticalScrollIndicator={false}
      >
        {successMessage ? (
          <InlineMessage message={successMessage} tone="success" />
        ) : null}
        {requestError ? (
          <InlineMessage
            message={
              requestError instanceof Error
                ? requestError.message
                : 'No pudimos guardar los cambios.'
            }
          />
        ) : null}

        <View style={styles.summary}>
          <View>
            <Text style={styles.summaryValue}>
              {servicesQuery.data?.services.length ?? 0}
            </Text>
            <Text style={styles.summaryLabel}>Servicios activos</Text>
          </View>
          <View style={styles.summaryDivider} />
          <View>
            <Text style={styles.summaryValue}>
              {servicesQuery.data?.categories.length ?? 0}
            </Text>
            <Text style={styles.summaryLabel}>Categorías</Text>
          </View>
        </View>

        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Categorías</Text>
          <Text style={styles.sectionDescription}>
            Agrupa los servicios para mantener el catálogo ordenado.
          </Text>
          <View style={styles.inlineForm}>
            <TextInput
              onChangeText={setCategoryName}
              placeholder="Ej. Barbería"
              placeholderTextColor="#98a0ab"
              style={styles.inlineInput}
              value={categoryName}
            />
            <Pressable
              accessibilityLabel="Crear categoría"
              accessibilityRole="button"
              disabled={categoryName.trim().length < 2}
              onPress={() => categoryMutation.mutate()}
              style={({ pressed }) => [
                styles.addButton,
                (pressed || categoryName.trim().length < 2) &&
                  styles.buttonMuted,
              ]}
            >
              <Ionicons
                color={appTheme.colors.accentDark}
                name="add"
                size={24}
              />
            </Pressable>
          </View>
          <View style={styles.chips}>
            <Pressable
              onPress={() => setSelectedCategoryId(null)}
              style={[
                styles.chip,
                selectedCategoryId === null && styles.chipSelected,
              ]}
            >
              <Text
                style={[
                  styles.chipLabel,
                  selectedCategoryId === null && styles.chipLabelSelected,
                ]}
              >
                Sin categoría
              </Text>
            </Pressable>
            {(servicesQuery.data?.categories ?? []).map((category) => (
              <Pressable
                key={category.id}
                onPress={() => setSelectedCategoryId(category.id)}
                style={[
                  styles.chip,
                  selectedCategoryId === category.id && styles.chipSelected,
                ]}
              >
                <Text
                  style={[
                    styles.chipLabel,
                    selectedCategoryId === category.id &&
                      styles.chipLabelSelected,
                  ]}
                >
                  {category.name}
                </Text>
              </Pressable>
            ))}
          </View>
        </View>

        <View style={styles.section}>
          <Text style={styles.sectionTitle}>
            {editingService ? 'Editar servicio' : 'Nuevo servicio'}
          </Text>
          <Pressable
            accessibilityLabel="Elegir foto del servicio"
            onPress={() => void chooseServicePhoto()}
            style={styles.photoPicker}
          >
            {serviceImageData ? (
              <Image
                source={{ uri: serviceImageData }}
                style={styles.photoPickerImage}
              />
            ) : (
              <>
                <Ionicons
                  color={appTheme.colors.accentDark}
                  name="image-outline"
                  size={25}
                />
                <Text style={styles.photoPickerLabel}>
                  Agregar foto del servicio
                </Text>
              </>
            )}
          </Pressable>
          {serviceImageData ? (
            <Pressable
              onPress={() => setServiceImageData(null)}
              style={styles.removePhoto}
            >
              <Text style={styles.removePhotoLabel}>Quitar foto</Text>
            </Pressable>
          ) : null}
          <Text style={styles.fieldLabel}>Nombre</Text>
          <TextInput
            onChangeText={setServiceName}
            placeholder="Ej. Corte clásico"
            placeholderTextColor="#98a0ab"
            style={styles.input}
            value={serviceName}
          />
          <Text style={styles.fieldLabel}>Descripción</Text>
          <TextInput
            maxLength={500}
            multiline
            onChangeText={setServiceDescription}
            placeholder="Información opcional para tus clientes"
            placeholderTextColor="#98a0ab"
            style={[styles.input, styles.descriptionInput]}
            value={serviceDescription}
          />
          <View style={styles.fieldRow}>
            <View style={styles.fieldColumn}>
              <Text style={styles.fieldLabel}>Duración (min)</Text>
              <TextInput
                keyboardType="number-pad"
                onChangeText={setDurationMinutes}
                style={styles.input}
                value={durationMinutes}
              />
            </View>
            <View style={styles.fieldColumn}>
              <Text style={styles.fieldLabel}>Precio</Text>
              <TextInput
                keyboardType="decimal-pad"
                onChangeText={setPrice}
                placeholder="0.00"
                placeholderTextColor="#98a0ab"
                style={styles.input}
                value={price}
              />
            </View>
          </View>
          <View style={styles.switchRow}>
            <View style={styles.serviceCopy}>
              <Text style={styles.switchTitle}>Reservas en línea</Text>
              <Text style={styles.switchDescription}>
                Permite que los clientes elijan este servicio públicamente.
              </Text>
            </View>
            <Switch onValueChange={setOnlineBooking} value={onlineBooking} />
          </View>
          <GuideAnchor id="services-create-service">
            <Pressable
              accessibilityLabel={
                editingService
                  ? 'Guardar cambios del servicio'
                  : 'Crear servicio'
              }
              accessibilityRole="button"
              disabled={!canCreateService || serviceMutation.isPending}
              onPress={() => serviceMutation.mutate()}
              style={[
                styles.primaryButton,
                (!canCreateService || serviceMutation.isPending) &&
                  styles.buttonMuted,
              ]}
            >
              <Ionicons
                color={appTheme.colors.accentDark}
                name={
                  editingService ? 'checkmark-outline' : 'add-circle-outline'
                }
                size={21}
              />
              <Text style={styles.primaryButtonLabel}>
                {serviceMutation.isPending
                  ? 'Guardando…'
                  : editingService
                    ? 'Guardar cambios'
                    : 'Crear servicio'}
              </Text>
            </Pressable>
          </GuideAnchor>
          {editingService ? (
            <View style={styles.editActions}>
              <Pressable
                accessibilityRole="button"
                onPress={cancelEditing}
                style={styles.secondaryAction}
              >
                <Text style={styles.secondaryActionLabel}>Cancelar</Text>
              </Pressable>
              <Pressable
                accessibilityRole="button"
                disabled={archiveMutation.isPending}
                onPress={() =>
                  Alert.alert(
                    'Eliminar servicio',
                    'Se retirará del catálogo y de las reservas nuevas. Las citas históricas conservarán su información.',
                    [
                      { style: 'cancel', text: 'Volver' },
                      {
                        onPress: () =>
                          archiveMutation.mutate(editingService.id),
                        style: 'destructive',
                        text: 'Eliminar',
                      },
                    ],
                  )
                }
                style={styles.dangerAction}
              >
                <Ionicons color="#b42318" name="trash-outline" size={19} />
                <Text style={styles.dangerActionLabel}>Eliminar</Text>
              </Pressable>
            </View>
          ) : null}
        </View>

        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Servicios disponibles</Text>
          {servicesQuery.isLoading ? (
            <Text style={styles.empty}>Cargando servicios…</Text>
          ) : null}
          {servicesQuery.data?.services.map((service) => (
            <Pressable
              accessibilityHint="Abre la edición del servicio"
              accessibilityRole="button"
              key={service.id}
              onPress={() => editService(service)}
              style={({ pressed }) => [
                styles.serviceCard,
                pressed ? styles.cardPressed : null,
              ]}
            >
              <View style={styles.serviceIcon}>
                {service.imageData ? (
                  <Image
                    source={{ uri: service.imageData }}
                    style={styles.serviceImage}
                  />
                ) : (
                  <Ionicons
                    color={appTheme.colors.accentDark}
                    name="cut-outline"
                    size={23}
                  />
                )}
              </View>
              <View style={styles.serviceCopy}>
                <Text style={styles.serviceName}>{service.name}</Text>
                <Text style={styles.serviceMeta}>
                  {categoriesById.get(service.categoryId ?? '') ??
                    'Sin categoría'}{' '}
                  · {service.durationMinutes} min · $
                  {(service.priceCents / 100).toFixed(2)}
                </Text>
              </View>
              <Ionicons
                color={appTheme.colors.accentDark}
                name="create-outline"
                size={22}
              />
            </Pressable>
          ))}
          {!servicesQuery.isLoading &&
          servicesQuery.data?.services.length === 0 ? (
            <Text style={styles.empty}>Todavía no has creado servicios.</Text>
          ) : null}
        </View>
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  addButton: {
    alignItems: 'center',
    backgroundColor: appTheme.colors.surface,
    borderRadius: 15,
    height: 54,
    justifyContent: 'center',
    width: 54,
    transform: [{ translateY: -3 }],
    ...goldButtonShadow,
  },
  backButton: {
    backgroundColor: appTheme.colors.surface,
    alignItems: 'center',
    borderRadius: 22,
    height: 44,
    justifyContent: 'center',
    width: 44,
    transform: [{ translateY: -3 }],
    ...goldButtonShadow,
  },
  buttonMuted: { opacity: 0.45 },
  cardPressed: { opacity: 0.72, transform: [{ scale: 0.99 }] },
  chip: {
    backgroundColor: appTheme.colors.surface,
    borderRadius: 99,
    borderWidth: 0,
    paddingHorizontal: 13,
    paddingVertical: 9,
  },
  chipLabel: { color: COLORS.text, fontSize: 13, fontWeight: '700' },
  chipLabelSelected: { color: appTheme.colors.text, fontWeight: '900' },
  chipSelected: {
    backgroundColor: appTheme.colors.accentWash,
    borderColor: appTheme.colors.accentWash,
  },
  chips: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginTop: 14 },
  content: {
    alignSelf: 'center',
    gap: 16,
    maxWidth: 720,
    paddingBottom: 38,
    paddingHorizontal: 20,
    paddingTop: 12,
    width: '100%',
  },
  dangerAction: {
    alignItems: 'center',
    borderColor: '#f1b8b3',
    borderRadius: 14,
    borderWidth: 1,
    flexDirection: 'row',
    gap: 7,
    justifyContent: 'center',
    minHeight: 46,
    paddingHorizontal: 14,
  },
  dangerActionLabel: {
    color: appTheme.colors.danger,
    fontSize: 14,
    fontWeight: '800',
  },
  descriptionInput: {
    height: 92,
    paddingTop: 14,
    textAlignVertical: 'top',
  },
  editActions: {
    flexDirection: 'row',
    gap: 10,
    justifyContent: 'flex-end',
    marginTop: 12,
  },
  empty: { color: COLORS.muted, fontSize: 14, paddingVertical: 18 },
  fieldColumn: { flex: 1 },
  fieldLabel: {
    color: COLORS.text,
    fontSize: 13,
    fontWeight: '800',
    marginBottom: 7,
    marginTop: 14,
  },
  fieldRow: { flexDirection: 'row', gap: 12 },
  header: {
    alignItems: 'center',
    alignSelf: 'center',
    flexDirection: 'row',
    gap: 10,
    maxWidth: 720,
    minHeight: 72,
    paddingHorizontal: 18,
    width: '100%',
  },
  headerCopy: { flex: 1 },
  inlineForm: { flexDirection: 'row', gap: 10, marginTop: 14 },
  inlineInput: {
    backgroundColor: appTheme.colors.surface,
    borderColor: COLORS.border,
    borderRadius: 15,
    borderWidth: 1,
    color: COLORS.text,
    flex: 1,
    fontSize: 15,
    height: 54,
    paddingHorizontal: 14,
  },
  input: {
    backgroundColor: appTheme.colors.surface,
    borderColor: COLORS.border,
    borderRadius: 15,
    borderWidth: 1,
    color: COLORS.text,
    fontSize: 15,
    height: 54,
    paddingHorizontal: 14,
  },
  photoPicker: {
    alignItems: 'center',
    backgroundColor: appTheme.colors.surfaceMuted,
    borderRadius: 15,
    height: 112,
    justifyContent: 'center',
    marginTop: 16,
    overflow: 'hidden',
  },
  photoPickerImage: { height: '100%', width: '100%' },
  photoPickerLabel: {
    color: appTheme.colors.accentDark,
    fontSize: 13,
    fontWeight: '800',
    marginTop: 7,
  },
  removePhoto: { alignSelf: 'flex-start', marginTop: 8 },
  removePhotoLabel: {
    color: appTheme.colors.danger,
    fontSize: 13,
    fontWeight: '800',
  },
  primaryButton: {
    alignItems: 'center',
    alignSelf: 'flex-start',
    backgroundColor: appTheme.colors.surface,
    borderRadius: 14,
    flexDirection: 'row',
    gap: 8,
    justifyContent: 'center',
    marginTop: 18,
    minHeight: 48,
    paddingHorizontal: 16,
    transform: [{ translateY: -3 }],
    ...goldButtonShadow,
  },
  primaryButtonLabel: {
    color: appTheme.colors.accentDark,
    fontSize: 14,
    fontWeight: '900',
  },
  secondaryAction: {
    backgroundColor: appTheme.colors.surface,
    alignItems: 'center',
    borderRadius: 14,
    borderWidth: 0,
    justifyContent: 'center',
    minHeight: 46,
    paddingHorizontal: 17,
    transform: [{ translateY: -3 }],
    ...goldButtonShadow,
  },
  secondaryActionLabel: {
    color: COLORS.text,
    fontSize: 14,
    fontWeight: '800',
  },
  screen: appStyles.screen,
  section: {
    backgroundColor: appTheme.colors.surface,
    borderRadius: 21,
    borderWidth: 0,
    padding: 17,
    transform: [{ translateY: -3 }],
    ...goldButtonShadow,
  },
  sectionDescription: {
    color: COLORS.muted,
    fontSize: 14,
    lineHeight: 20,
    marginTop: 5,
  },
  sectionTitle: { color: COLORS.text, fontSize: 20, fontWeight: '900' },
  serviceCard: {
    alignItems: 'center',
    backgroundColor: appTheme.colors.surface,
    borderRadius: 17,
    borderWidth: 0,
    flexDirection: 'row',
    gap: 12,
    marginTop: 12,
    minHeight: 72,
    padding: 12,
    transform: [{ translateY: -3 }],
    ...goldButtonShadow,
  },
  serviceCopy: { flex: 1 },
  serviceImage: { height: '100%', width: '100%' },
  serviceIcon: {
    alignItems: 'center',
    backgroundColor: appTheme.colors.surfaceMuted,
    borderRadius: 14,
    height: 46,
    justifyContent: 'center',
    width: 46,
  },
  serviceMeta: {
    color: COLORS.muted,
    fontSize: 13,
    lineHeight: 18,
    marginTop: 4,
  },
  serviceName: { color: COLORS.text, fontSize: 16, fontWeight: '800' },
  subtitle: { color: COLORS.muted, fontSize: 13, marginTop: 2 },
  switchDescription: {
    color: COLORS.muted,
    fontSize: 12,
    lineHeight: 17,
    marginTop: 3,
  },
  switchRow: {
    alignItems: 'center',
    flexDirection: 'row',
    gap: 12,
    marginTop: 16,
  },
  switchTitle: { color: COLORS.text, fontSize: 14, fontWeight: '800' },
  summary: {
    alignItems: 'center',
    backgroundColor: appTheme.colors.surface,
    borderRadius: 20,
    flexDirection: 'row',
    justifyContent: 'space-around',
    minHeight: 92,
    padding: 16,
    transform: [{ translateY: -3 }],
    ...goldButtonShadow,
  },
  summaryDivider: {
    backgroundColor: appTheme.colors.border,
    height: 48,
    width: 1,
  },
  summaryLabel: {
    color: appTheme.colors.textMuted,
    fontSize: 12,
    marginTop: 3,
  },
  summaryValue: {
    color: appTheme.colors.text,
    fontSize: 25,
    fontWeight: '900',
  },
  title: {
    color: COLORS.text,
    fontSize: 24,
    fontWeight: '900',
    letterSpacing: -0.45,
  },
});
