import Ionicons from '@expo/vector-icons/Ionicons';
import type {
  GoogleMapsLocationCandidate,
  ManagedLocation,
  ManagedLocationsResponse,
} from '@barber-saas/api-client';
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

import { BusinessLocationSheet } from '../../src/components/BusinessLocationSheet';
import {
  appStyles,
  appTheme,
  goldButtonShadow,
} from '../../src/components/BottomNavigation';
import { InlineMessage } from '../../src/components/InlineMessage';
import { requireApiClient } from '../../src/lib/api';
import { useAuth } from '../../src/providers/AuthProvider';

type LocationForm = {
  addressLine: string;
  city: string;
  countryCode: string;
  currencyCode: string;
  name: string;
  phone: string;
  slug: string;
  timezone: string;
};

function slugFrom(value: string) {
  return value
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/gu, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/gu, '-')
    .replace(/^-+|-+$/gu, '')
    .slice(0, 80);
}

function formFor(location?: ManagedLocation): LocationForm {
  return {
    addressLine: location?.addressLine ?? '',
    city: location?.city ?? '',
    countryCode: location?.countryCode ?? 'EC',
    currencyCode: location?.currencyCode ?? 'USD',
    name: location?.name ?? '',
    phone: location?.phone ?? '',
    slug: location?.slug ?? '',
    timezone: location?.timezone ?? 'America/Guayaquil',
  };
}

export default function LocationManagementScreen() {
  const { session } = useAuth();
  const router = useRouter();
  const queryClient = useQueryClient();
  const [editing, setEditing] = useState<ManagedLocation | null>(null);
  const [form, setForm] = useState<LocationForm>(() => formFor());
  const [isFormOpen, setIsFormOpen] = useState(false);
  const [mapLocation, setMapLocation] = useState<ManagedLocation | null>(null);
  const locationsQuery = useQuery({
    enabled: Boolean(session),
    queryFn: () =>
      requireApiClient().request<ManagedLocationsResponse>('/v1/locations'),
    queryKey: ['managed-locations'],
  });
  const saveLocation = useMutation({
    mutationFn: () => {
      if (form.name.trim().length < 2)
        throw new Error('Ingresa el nombre de la sucursal.');
      if (form.phone.trim().length < 7)
        throw new Error('Ingresa un teléfono válido.');
      if (form.slug.trim().length < 3)
        throw new Error('El enlace debe tener al menos 3 caracteres.');
      const body = {
        addressLine: form.addressLine.trim() || undefined,
        city: form.city.trim() || undefined,
        countryCode: form.countryCode.trim().toUpperCase(),
        currencyCode: form.currencyCode.trim().toUpperCase(),
        name: form.name.trim(),
        phone: form.phone.trim(),
        slug: form.slug.trim().toLowerCase(),
        timezone: form.timezone.trim(),
      };
      return requireApiClient().request(
        editing ? `/v1/locations/${editing.id}` : '/v1/locations',
        { body, method: editing ? 'PATCH' : 'POST' },
      );
    },
    onError: (error) =>
      Alert.alert(
        'No pudimos guardar la sucursal',
        error instanceof Error ? error.message : 'Inténtalo nuevamente.',
      ),
    onSuccess: async () => {
      setIsFormOpen(false);
      await queryClient.invalidateQueries({ queryKey: ['managed-locations'] });
    },
  });

  const saveMapLocation = useMutation({
    mutationFn: ({
      location,
      map,
    }: {
      location: ManagedLocation;
      map: GoogleMapsLocationCandidate;
    }) =>
      requireApiClient().request(`/v1/locations/${location.id}`, {
        body: {
          addressLine: map.formattedAddress.slice(0, 240),
          city: map.city ?? location.city ?? undefined,
          countryCode: map.countryCode ?? location.countryCode,
          formattedAddress: map.formattedAddress,
          googlePlaceId: map.placeId || null,
          latitude: map.latitude,
          longitude: map.longitude,
        },
        method: 'PATCH',
      }),
    onSuccess: async () => {
      setMapLocation(null);
      await queryClient.invalidateQueries({ queryKey: ['managed-locations'] });
    },
  });

  const planCopy = useMemo(() => {
    const data = locationsQuery.data;
    if (!data) return 'Consultando límite del plan…';
    return `${data.used} de ${data.limit} sucursal${data.limit === 1 ? '' : 'es'} usadas`;
  }, [locationsQuery.data]);

  const openCreate = () => {
    if (!locationsQuery.data?.canAdd) {
      Alert.alert(
        'Límite de sucursales',
        `Tu plan actual permite ${locationsQuery.data?.limit ?? 1} sucursal${locationsQuery.data?.limit === 1 ? '' : 'es'}.`,
      );
      return;
    }
    setEditing(null);
    setForm(formFor());
    setIsFormOpen(true);
  };

  const openEdit = (location: ManagedLocation) => {
    setEditing(location);
    setForm(formFor(location));
    setIsFormOpen(true);
  };

  if (!session) return <Redirect href="/(auth)/login" />;

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
            Sucursales
          </Text>
          <Text style={styles.subtitle}>Administra tus puntos de atención</Text>
        </View>
      </View>

      <ScrollView contentContainerStyle={styles.content}>
        {locationsQuery.error ? (
          <InlineMessage
            message={
              locationsQuery.error instanceof Error
                ? locationsQuery.error.message
                : 'No pudimos cargar las sucursales.'
            }
          />
        ) : null}
        <View style={styles.limitCard}>
          <View style={styles.limitIcon}>
            <Ionicons color={appTheme.colors.accentDark} name="business" size={24} />
          </View>
          <View style={styles.limitCopy}>
            <Text style={styles.limitTitle}>Capacidad de tu plan</Text>
            <Text style={styles.limitValue}>{planCopy}</Text>
          </View>
          <Text style={styles.planLabel}>
            {locationsQuery.data?.canAdd ? 'Disponible' : 'Límite alcanzado'}
          </Text>
        </View>

        <Pressable
          accessibilityRole="button"
          disabled={!locationsQuery.data?.canAdd}
          onPress={openCreate}
          style={({ pressed }) => [
            styles.addButton,
            !locationsQuery.data?.canAdd && styles.buttonDisabled,
            pressed && styles.pressed,
          ]}
        >
          <View style={styles.addIcon}>
            <Ionicons color="#FFFFFF" name="add" size={18} />
          </View>
          <Text style={styles.addLabel}>Agregar sucursal</Text>
        </Pressable>

        <View style={styles.list}>
          {locationsQuery.data?.locations.map((location, index) => (
            <View key={location.id} style={styles.locationCard}>
              <View style={styles.locationTopRow}>
                <View style={styles.locationIcon}>
                  <Ionicons
                    color={appTheme.colors.accentDark}
                    name={index === 0 ? 'star' : 'business-outline'}
                    size={21}
                  />
                </View>
                <View style={styles.locationCopy}>
                  <View style={styles.locationNameRow}>
                    <Text style={styles.locationName}>{location.name}</Text>
                    {index === 0 ? (
                      <Text style={styles.primaryBadge}>Principal</Text>
                    ) : null}
                  </View>
                  <Text style={styles.locationAddress}>
                    {location.formattedAddress ||
                      location.addressLine ||
                      location.city ||
                      'Ubicación pendiente'}
                  </Text>
                </View>
              </View>
              <View style={styles.locationMeta}>
                <Text style={styles.slugText}>/{location.slug}</Text>
                <Text style={styles.metaText}>{location.phone}</Text>
              </View>
              <View style={styles.actions}>
                <Pressable
                  accessibilityLabel={`Editar ${location.name}`}
                  accessibilityRole="button"
                  onPress={() => openEdit(location)}
                  style={styles.secondaryButton}
                >
                  <Ionicons color={appTheme.colors.accentDark} name="pencil" size={17} />
                  <Text style={styles.secondaryLabel}>Editar</Text>
                </Pressable>
                <Pressable
                  accessibilityLabel={`Actualizar mapa de ${location.name}`}
                  accessibilityRole="button"
                  onPress={() => setMapLocation(location)}
                  style={styles.secondaryButton}
                >
                  <Ionicons color={appTheme.colors.accentDark} name="map-outline" size={17} />
                  <Text style={styles.secondaryLabel}>Mapa</Text>
                </Pressable>
              </View>
            </View>
          ))}
        </View>
      </ScrollView>

      <Modal
        animationType="slide"
        onRequestClose={() => setIsFormOpen(false)}
        transparent
        visible={isFormOpen}
      >
        <View style={styles.modalOverlay}>
          <Pressable onPress={() => setIsFormOpen(false)} style={styles.modalBackdrop} />
          <View style={styles.formSheet}>
            <View style={styles.formHandle} />
            <Text style={styles.formTitle}>
              {editing ? 'Editar sucursal' : 'Nueva sucursal'}
            </Text>
            <ScrollView contentContainerStyle={styles.formContent} keyboardShouldPersistTaps="handled">
              <Field
                label="Nombre de la sucursal"
                onChangeText={(name) =>
                  setForm((current) => ({
                    ...current,
                    name,
                    slug: editing ? current.slug : slugFrom(name),
                  }))
                }
                value={form.name}
              />
              <Field label="Enlace público" onChangeText={(slug) => setForm((current) => ({ ...current, slug: slugFrom(slug) }))} prefix="/" value={form.slug} />
              <Field keyboardType="phone-pad" label="Teléfono y WhatsApp" onChangeText={(phone) => setForm((current) => ({ ...current, phone }))} value={form.phone} />
              <Field label="Dirección escrita" onChangeText={(addressLine) => setForm((current) => ({ ...current, addressLine }))} value={form.addressLine} />
              <Field label="Ciudad" onChangeText={(city) => setForm((current) => ({ ...current, city }))} value={form.city} />
              <View style={styles.rowFields}>
                <View style={styles.halfField}>
                  <Field autoCapitalize="characters" label="País" maxLength={2} onChangeText={(countryCode) => setForm((current) => ({ ...current, countryCode }))} value={form.countryCode} />
                </View>
                <View style={styles.halfField}>
                  <Field autoCapitalize="characters" label="Moneda" maxLength={3} onChangeText={(currencyCode) => setForm((current) => ({ ...current, currencyCode }))} value={form.currencyCode} />
                </View>
              </View>
              <Field label="Zona horaria" onChangeText={(timezone) => setForm((current) => ({ ...current, timezone }))} value={form.timezone} />
              <Text style={styles.formHint}>
                Después de crearla, usa “Mapa” para seleccionar su ubicación exacta y mostrarla a tus clientes.
              </Text>
              <View style={styles.formActions}>
                <Pressable onPress={() => setIsFormOpen(false)} style={styles.cancelButton}>
                  <Text style={styles.cancelLabel}>Cancelar</Text>
                </Pressable>
                <Pressable
                  disabled={saveLocation.isPending}
                  onPress={() => saveLocation.mutate()}
                  style={[styles.saveButton, saveLocation.isPending && styles.buttonDisabled]}
                >
                  <Text style={styles.saveLabel}>
                    {saveLocation.isPending ? 'Guardando…' : 'Guardar sucursal'}
                  </Text>
                </Pressable>
              </View>
            </ScrollView>
          </View>
        </View>
      </Modal>

      {mapLocation ? (
        <BusinessLocationSheet
          countryCode={mapLocation.countryCode}
          initialLocation={mapLocation}
          onComplete={() => setMapLocation(null)}
          onDismiss={() => setMapLocation(null)}
          onSubmit={async (map) => {
            await saveMapLocation.mutateAsync({ location: mapLocation, map });
          }}
          visible
        />
      ) : null}
    </SafeAreaView>
  );
}

function Field({
  autoCapitalize,
  keyboardType,
  label,
  maxLength,
  onChangeText,
  prefix,
  value,
}: {
  readonly autoCapitalize?: 'characters' | 'none' | 'sentences' | 'words';
  readonly keyboardType?: 'default' | 'phone-pad';
  readonly label: string;
  readonly maxLength?: number;
  readonly onChangeText: (value: string) => void;
  readonly prefix?: string;
  readonly value: string;
}) {
  return (
    <View style={styles.field}>
      <Text style={styles.fieldLabel}>{label}</Text>
      <View style={styles.inputWrap}>
        {prefix ? <Text style={styles.inputPrefix}>{prefix}</Text> : null}
        <TextInput
          autoCapitalize={autoCapitalize}
          keyboardType={keyboardType}
          maxLength={maxLength}
          onChangeText={onChangeText}
          style={styles.input}
          value={value}
        />
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  actions: { flexDirection: 'row', gap: 10, marginTop: 16 },
  addButton: { alignItems: 'center', backgroundColor: appTheme.colors.surface, borderRadius: 17, flexDirection: 'row', gap: 10, justifyContent: 'center', minHeight: 52, ...goldButtonShadow },
  addIcon: { alignItems: 'center', backgroundColor: appTheme.colors.accentDark, borderRadius: 12, height: 24, justifyContent: 'center', width: 24 },
  addLabel: { color: appTheme.colors.accentDark, fontSize: 15, fontWeight: '900' },
  backButton: { alignItems: 'center', backgroundColor: appTheme.colors.surface, borderRadius: 22, height: 44, justifyContent: 'center', transform: [{ translateY: -3 }], width: 44, ...goldButtonShadow },
  buttonDisabled: { opacity: 0.5 },
  cancelButton: { alignItems: 'center', borderColor: appTheme.colors.border, borderRadius: 14, borderWidth: 1, flex: 1, justifyContent: 'center', minHeight: 50 },
  cancelLabel: { color: appTheme.colors.text, fontSize: 14, fontWeight: '800' },
  content: { alignSelf: 'center', gap: 16, maxWidth: 720, paddingBottom: 42, paddingHorizontal: 20, paddingTop: 18, width: '100%' },
  field: { gap: 7 },
  fieldLabel: { color: appTheme.colors.text, fontSize: 13, fontWeight: '800' },
  formActions: { flexDirection: 'row', gap: 10, marginTop: 8 },
  formContent: { gap: 14, paddingBottom: 24 },
  formHandle: { alignSelf: 'center', backgroundColor: appTheme.colors.border, borderRadius: 9, height: 5, marginBottom: 16, width: 42 },
  formHint: { color: appTheme.colors.textMuted, fontSize: 12, lineHeight: 18 },
  formSheet: { backgroundColor: appTheme.colors.surface, borderTopLeftRadius: 30, borderTopRightRadius: 30, maxHeight: '90%', padding: 20 },
  formTitle: { color: appTheme.colors.text, fontSize: 25, fontWeight: '900', marginBottom: 18 },
  halfField: { flex: 1 },
  header: { alignItems: 'center', flexDirection: 'row', gap: 12, paddingHorizontal: 20, paddingTop: 9 },
  headerCopy: { flex: 1 },
  input: { color: appTheme.colors.text, flex: 1, fontSize: 15, minHeight: 46, paddingHorizontal: 13 },
  inputPrefix: { color: appTheme.colors.textMuted, fontSize: 15, fontWeight: '700', paddingLeft: 13 },
  inputWrap: { alignItems: 'center', backgroundColor: appTheme.colors.background, borderColor: appTheme.colors.border, borderRadius: 13, borderWidth: 1, flexDirection: 'row' },
  limitCard: { alignItems: 'center', backgroundColor: appTheme.colors.surface, borderRadius: 20, flexDirection: 'row', gap: 12, padding: 16, ...goldButtonShadow },
  limitCopy: { flex: 1 },
  limitIcon: { alignItems: 'center', backgroundColor: appTheme.colors.accentWash, borderRadius: 16, height: 48, justifyContent: 'center', width: 48 },
  limitTitle: { color: appTheme.colors.textMuted, fontSize: 12, fontWeight: '800' },
  limitValue: { color: appTheme.colors.text, fontSize: 17, fontWeight: '900', marginTop: 3 },
  list: { gap: 14 },
  locationAddress: { color: appTheme.colors.textMuted, fontSize: 13, lineHeight: 19, marginTop: 4 },
  locationCard: { backgroundColor: appTheme.colors.surface, borderRadius: 20, padding: 16, ...goldButtonShadow },
  locationCopy: { flex: 1 },
  locationIcon: { alignItems: 'center', backgroundColor: appTheme.colors.accentWash, borderRadius: 15, height: 46, justifyContent: 'center', width: 46 },
  locationMeta: { flexDirection: 'row', justifyContent: 'space-between', marginTop: 13 },
  locationName: { color: appTheme.colors.text, flexShrink: 1, fontSize: 17, fontWeight: '900' },
  locationNameRow: { alignItems: 'center', flexDirection: 'row', gap: 8 },
  locationTopRow: { alignItems: 'flex-start', flexDirection: 'row', gap: 11 },
  metaText: { color: appTheme.colors.textMuted, fontSize: 12 },
  modalBackdrop: { backgroundColor: 'rgba(0,0,0,0.35)', flex: 1 },
  modalOverlay: { flex: 1, justifyContent: 'flex-end' },
  planLabel: { color: appTheme.colors.accentDark, fontSize: 10, fontWeight: '900', textAlign: 'right', width: 74 },
  pressed: { opacity: 0.75 },
  primaryBadge: { backgroundColor: appTheme.colors.accentWash, borderRadius: 99, color: appTheme.colors.accentDark, fontSize: 10, fontWeight: '900', overflow: 'hidden', paddingHorizontal: 8, paddingVertical: 4 },
  rowFields: { flexDirection: 'row', gap: 10 },
  saveButton: { alignItems: 'center', backgroundColor: appTheme.colors.accentDark, borderRadius: 14, flex: 1, justifyContent: 'center', minHeight: 50 },
  saveLabel: { color: '#FFFFFF', fontSize: 14, fontWeight: '900' },
  screen: appStyles.screen,
  secondaryButton: { alignItems: 'center', backgroundColor: appTheme.colors.accentWash, borderRadius: 12, flexDirection: 'row', flex: 1, gap: 7, justifyContent: 'center', minHeight: 40 },
  secondaryLabel: { color: appTheme.colors.accentDark, fontSize: 13, fontWeight: '800' },
  slugText: { color: appTheme.colors.accentDark, fontSize: 12, fontWeight: '800' },
  subtitle: { color: appTheme.colors.textMuted, fontSize: 13, marginTop: 2 },
  title: { color: appTheme.colors.text, fontSize: 26, fontWeight: '900' },
});
