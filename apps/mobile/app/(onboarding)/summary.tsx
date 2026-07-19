import { completeOnboardingSchema } from '@barber-saas/validation';
import { useQueryClient } from '@tanstack/react-query';
import { Redirect, useRouter } from 'expo-router';
import { StyleSheet, Text, View } from 'react-native';
import { useState } from 'react';

import { InlineMessage } from '../../src/components/InlineMessage';
import { PrimaryButton } from '../../src/components/PrimaryButton';
import { Screen } from '../../src/components/Screen';
import { completeOnboarding } from '../../src/features/onboarding/completeOnboarding';
import { useOnboardingStore } from '../../src/features/onboarding/store';
import { useAuth } from '../../src/providers/AuthProvider';
import { theme } from '../../src/theme';

export default function OnboardingSummaryScreen() {
  const router = useRouter();
  const queryClient = useQueryClient();
  const { session } = useAuth();
  const location = useOnboardingStore((state) => state.location);
  const organization = useOnboardingStore((state) => state.organization);
  const reset = useOnboardingStore((state) => state.reset);
  const [error, setError] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);

  if (!session) return <Redirect href="/(auth)/login" />;
  if (!organization) return <Redirect href="/(onboarding)/organization" />;
  if (!location) return <Redirect href="/(onboarding)/location" />;

  const submit = async () => {
    setError(null);
    const result = completeOnboardingSchema.safeParse({
      ...organization,
      location,
    });
    if (!result.success)
      return setError('Revisa la información antes de crear la barbería.');
    setIsSubmitting(true);
    try {
      await completeOnboarding(result.data);
      reset();
      await queryClient.invalidateQueries({
        queryKey: ['current-organization'],
      });
      router.replace('/(app)');
    } catch (caughtError) {
      setError(
        caughtError instanceof Error
          ? caughtError.message
          : 'No fue posible completar el onboarding.',
      );
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <Screen
      description="Confirma que los datos sean correctos."
      title="Resumen"
    >
      {error ? <InlineMessage message={error} /> : null}
      <View style={styles.card}>
        <Text style={styles.label}>Barbería</Text>
        <Text style={styles.value}>{organization.name}</Text>
        <Text style={styles.detail}>/{organization.slug}</Text>
      </View>
      <View style={styles.card}>
        <Text style={styles.label}>Sucursal</Text>
        <Text style={styles.value}>{location.name}</Text>
        <Text style={styles.detail}>
          {location.city || 'Ciudad no indicada'} · {location.timezone}
        </Text>
        <Text style={styles.detail}>
          {location.currencyCode} · {location.phone}
        </Text>
      </View>
      <PrimaryButton
        label="Crear barbería"
        loading={isSubmitting}
        onPress={() => void submit()}
      />
      <PrimaryButton
        label="Editar sucursal"
        onPress={() => router.back()}
        variant="secondary"
      />
    </Screen>
  );
}

const styles = StyleSheet.create({
  card: {
    backgroundColor: theme.colors.surface,
    borderColor: theme.colors.border,
    borderRadius: 18,
    borderWidth: 1,
    marginBottom: 16,
    padding: 18,
  },
  detail: { color: theme.colors.muted, fontSize: 14, marginTop: 5 },
  label: {
    color: theme.colors.accent,
    fontSize: 12,
    fontWeight: '800',
    letterSpacing: 1,
    textTransform: 'uppercase',
  },
  value: {
    color: theme.colors.text,
    fontSize: 21,
    fontWeight: '800',
    marginTop: 8,
  },
});
