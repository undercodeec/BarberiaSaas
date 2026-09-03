import Ionicons from '@expo/vector-icons/Ionicons';
import type { BookingSettingsResponse } from '@barber-saas/api-client';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Redirect, useRouter } from 'expo-router';
import { useState } from 'react';
import {
  Alert,
  Pressable,
  StyleSheet,
  Switch,
  Text,
  TextInput,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import {
  appStyles,
  appTheme,
  goldButtonShadow,
  useNativeLayoutMetrics,
} from '../../src/components/BottomNavigation';
import { KeyboardAwareScrollView as ScrollView } from '../../src/components/KeyboardAwareScrollView';
import { requireApiClient } from '../../src/lib/api';
import { tenantQueryPrefix } from '../../src/lib/query-keys';
import { useAuth } from '../../src/providers/AuthProvider';
import { useTenantScope } from '../../src/providers/TenantScopeProvider';

const reminderOptions = [
  [1440, '24 h'],
  [720, '12 h'],
  [360, '6 h'],
  [180, '3 h'],
  [60, '1 h'],
] as const;
const leadOptions = [
  [0, 'Hasta iniciar'],
  [60, '1 h'],
  [120, '2 h'],
  [240, '4 h'],
  [1440, '24 h'],
] as const;

export default function BookingSettingsScreen() {
  const { session } = useAuth();
  const tenant = useTenantScope();
  const layout = useNativeLayoutMetrics();
  const router = useRouter();
  const queryClient = useQueryClient();
  const settingsQuery = useQuery({
    enabled: Boolean(session),
    queryFn: () =>
      requireApiClient().request<BookingSettingsResponse>(
        '/v1/booking-settings',
      ),
    queryKey: tenant.key('booking-settings'),
  });
  const [draft, setDraft] = useState<BookingSettingsResponse | null>(null);
  const current = draft ?? settingsQuery.data ?? null;
  const saveSettings = useMutation({
    mutationFn: () =>
      requireApiClient().request<BookingSettingsResponse>(
        '/v1/booking-settings',
        {
          body: {
            cancellationLeadMinutes: current!.cancellationLeadMinutes,
            confirmationDeadlineMinutes: current!.confirmationDeadlineMinutes,
            confirmationEnabled: current!.confirmationEnabled,
            policyText: current!.policyText,
            reminderMinutes: current!.reminderMinutes,
            rescheduleLeadMinutes: current!.rescheduleLeadMinutes,
            servicePaymentConfirmationEnabled:
              current!.servicePaymentConfirmationEnabled,
            unconfirmedAction: current!.unconfirmedAction,
          },
          method: 'PUT',
        },
      ),
    onError: (error) =>
      Alert.alert(
        'No pudimos guardar',
        error instanceof Error ? error.message : 'Inténtalo nuevamente.',
      ),
    onSuccess: async (settings) => {
      setDraft(settings);
      await queryClient.invalidateQueries({
        queryKey: tenantQueryPrefix('booking-settings'),
      });
      Alert.alert(
        'Configuración guardada',
        'Las nuevas reservas usarán estas reglas.',
      );
    },
  });

  if (!session) return <Redirect href="/(auth)/login" />;

  return (
    <SafeAreaView edges={['top', 'left', 'right']} style={styles.screen}>
      <View style={styles.header}>
        <Pressable
          onPress={() =>
            router.canGoBack()
              ? router.back()
              : router.replace('/business-settings')
          }
          style={styles.back}
        >
          <Ionicons color="#111827" name="arrow-back" size={23} />
        </Pressable>
        <View style={styles.headerCopy}>
          <Text style={styles.headerTitle}>Política de reservas</Text>
          <Text style={styles.headerSubtitle}>
            Confirmación, cancelación y reprogramación
          </Text>
        </View>
        <View style={styles.spacer} />
      </View>
      <ScrollView
        contentContainerStyle={[
          styles.content,
          { paddingBottom: 130 + layout.bottomInset },
        ]}
      >
        {!current ? (
          <Text style={styles.empty}>
            {settingsQuery.isError
              ? 'No pudimos cargar la configuración.'
              : 'Cargando configuración...'}
          </Text>
        ) : (
          <>
            <View style={styles.toggleCard}>
              <View style={styles.toggleCopy}>
                <Text style={styles.cardTitle}>Solicitar reconfirmación</Text>
                <Text style={styles.cardDescription}>
                  Envía un recordatorio antes de la cita.
                </Text>
              </View>
              <Switch
                onValueChange={(confirmationEnabled) =>
                  setDraft({ ...current, confirmationEnabled })
                }
                trackColor={{
                  false: appTheme.colors.border,
                  true: appTheme.colors.text,
                }}
                value={current.confirmationEnabled}
              />
            </View>

            <View style={styles.toggleCard}>
              <View style={styles.toggleCopy}>
                <Text style={styles.cardTitle}>
                  Confirmar cobro al terminar el servicio
                </Text>
                <Text style={styles.cardDescription}>
                  Cuando un barbero complete una cita, owner o admin deberá
                  confirmar el pago antes de que entre a Caja.
                </Text>
              </View>
              <Switch
                onValueChange={(servicePaymentConfirmationEnabled) =>
                  setDraft({
                    ...current,
                    servicePaymentConfirmationEnabled,
                  })
                }
                trackColor={{
                  false: appTheme.colors.border,
                  true: appTheme.colors.text,
                }}
                value={current.servicePaymentConfirmationEnabled}
              />
            </View>

            {current.confirmationEnabled ? (
              <>
                <OptionSection
                  onChange={(reminderMinutes) =>
                    setDraft({ ...current, reminderMinutes })
                  }
                  options={reminderOptions}
                  title="Enviar recordatorio"
                  value={current.reminderMinutes}
                />
                <OptionSection
                  onChange={(confirmationDeadlineMinutes) =>
                    setDraft({ ...current, confirmationDeadlineMinutes })
                  }
                  options={leadOptions}
                  title="Límite para confirmar"
                  value={current.confirmationDeadlineMinutes}
                />
                <Text style={styles.sectionTitle}>Si no confirma</Text>
                <View style={styles.optionRow}>
                  {[
                    ['keep', 'Mantener cita'],
                    ['cancel', 'Cancelar y liberar'],
                  ].map(([value, label]) => (
                    <Pressable
                      key={value}
                      onPress={() =>
                        setDraft({
                          ...current,
                          unconfirmedAction: value as 'cancel' | 'keep',
                        })
                      }
                      style={[
                        styles.option,
                        current.unconfirmedAction === value &&
                          styles.optionSelected,
                      ]}
                    >
                      <Text
                        style={[
                          styles.optionText,
                          current.unconfirmedAction === value &&
                            styles.optionTextSelected,
                        ]}
                      >
                        {label}
                      </Text>
                    </Pressable>
                  ))}
                </View>
              </>
            ) : null}

            <OptionSection
              onChange={(cancellationLeadMinutes) =>
                setDraft({ ...current, cancellationLeadMinutes })
              }
              options={leadOptions}
              title="El cliente puede cancelar hasta"
              value={current.cancellationLeadMinutes}
            />
            <OptionSection
              onChange={(rescheduleLeadMinutes) =>
                setDraft({ ...current, rescheduleLeadMinutes })
              }
              options={leadOptions}
              title="El cliente puede reprogramar hasta"
              value={current.rescheduleLeadMinutes}
            />

            <Text style={styles.sectionTitle}>Política visible al cliente</Text>
            <TextInput
              multiline
              onChangeText={(policyText) =>
                setDraft({ ...current, policyText })
              }
              placeholder="Explica las condiciones de reserva."
              placeholderTextColor="#8B94A2"
              style={styles.policyInput}
              textAlignVertical="top"
              value={current.policyText}
            />
            <Text style={styles.version}>
              Versión actual: {current.policyVersion}. Al cambiar el texto se
              crea una nueva versión para conservar qué aceptó cada cliente.
            </Text>
          </>
        )}
      </ScrollView>
      {current ? (
        <View
          style={[styles.footer, { paddingBottom: layout.bottomActionPadding }]}
        >
          <Pressable
            disabled={
              saveSettings.isPending || current.policyText.trim().length < 20
            }
            onPress={() => saveSettings.mutate()}
            style={[
              styles.save,
              (saveSettings.isPending ||
                current.policyText.trim().length < 20) &&
                styles.disabled,
            ]}
          >
            <Text style={styles.saveText}>
              {saveSettings.isPending ? 'Guardando...' : 'Guardar cambios'}
            </Text>
          </Pressable>
        </View>
      ) : null}
    </SafeAreaView>
  );
}

function OptionSection({
  onChange,
  options,
  title,
  value,
}: {
  onChange: (value: number) => void;
  options: ReadonlyArray<readonly [number, string]>;
  title: string;
  value: number;
}) {
  return (
    <>
      <Text style={styles.sectionTitle}>{title}</Text>
      <View style={styles.optionRow}>
        {options.map(([optionValue, label]) => (
          <Pressable
            key={optionValue}
            onPress={() => onChange(optionValue)}
            style={[
              styles.option,
              value === optionValue && styles.optionSelected,
            ]}
          >
            <Text
              style={[
                styles.optionText,
                value === optionValue && styles.optionTextSelected,
              ]}
            >
              {label}
            </Text>
          </Pressable>
        ))}
      </View>
    </>
  );
}

const styles = StyleSheet.create({
  back: {
    alignItems: 'center',
    backgroundColor: appTheme.colors.surface,
    borderRadius: 20,
    borderWidth: 0,
    height: 44,
    justifyContent: 'center',
    width: 44,
    transform: [{ translateY: -3 }],
    ...goldButtonShadow,
  },
  cardDescription: {
    color: appTheme.colors.textMuted,
    fontSize: 13,
    marginTop: 4,
  },
  cardTitle: { color: appTheme.colors.text, fontSize: 15, fontWeight: '900' },
  content: { padding: 20, paddingBottom: 130 },
  disabled: { opacity: 0.35 },
  empty: { color: appTheme.colors.textMuted, padding: 24, textAlign: 'center' },
  footer: {
    backgroundColor: appTheme.colors.surface,
    borderTopColor: appTheme.colors.border,
    borderTopWidth: 1,
    bottom: 0,
    left: 0,
    padding: 16,
    position: 'absolute',
    right: 0,
  },
  header: {
    alignItems: 'center',
    backgroundColor: appTheme.colors.surface,
    borderBottomColor: appTheme.colors.surfaceMuted,
    borderBottomWidth: 1,
    flexDirection: 'row',
    padding: 14,
  },
  headerCopy: { flex: 1 },
  headerSubtitle: {
    color: appTheme.colors.textMuted,
    fontSize: 11,
    marginTop: 2,
    textAlign: 'center',
  },
  headerTitle: {
    color: appTheme.colors.text,
    fontSize: 16,
    fontWeight: '900',
    textAlign: 'center',
  },
  option: {
    backgroundColor: appTheme.colors.surface,
    borderColor: appTheme.colors.border,
    borderRadius: 999,
    borderWidth: 1,
    paddingHorizontal: 13,
    paddingVertical: 10,
  },
  optionRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  optionSelected: {
    backgroundColor: appTheme.colors.accentWash,
    borderColor: appTheme.colors.accentWash,
  },
  optionText: { color: appTheme.colors.text, fontSize: 12, fontWeight: '800' },
  optionTextSelected: { color: appTheme.colors.text },
  policyInput: {
    backgroundColor: appTheme.colors.surface,
    borderColor: appTheme.colors.border,
    borderRadius: 16,
    borderWidth: 1,
    color: appTheme.colors.text,
    fontSize: 14,
    lineHeight: 21,
    minHeight: 130,
    padding: 14,
  },
  save: {
    alignItems: 'center',
    backgroundColor: appTheme.colors.surface,
    borderRadius: 16,
    justifyContent: 'center',
    minHeight: 54,
    transform: [{ translateY: -3 }],
    ...goldButtonShadow,
  },
  saveText: {
    color: appTheme.colors.accentDark,
    fontSize: 16,
    fontWeight: '900',
  },
  screen: appStyles.screen,
  sectionTitle: {
    color: appTheme.colors.text,
    fontSize: 14,
    fontWeight: '900',
    marginBottom: 10,
    marginTop: 24,
  },
  spacer: { width: 44 },
  toggleCard: {
    alignItems: 'center',
    backgroundColor: appTheme.colors.surface,
    borderRadius: 18,
    borderWidth: 0,
    flexDirection: 'row',
    padding: 16,
    transform: [{ translateY: -3 }],
    ...goldButtonShadow,
  },
  toggleCopy: { flex: 1, paddingRight: 12 },
  version: {
    color: appTheme.colors.textMuted,
    fontSize: 11,
    lineHeight: 17,
    marginTop: 8,
  },
});
