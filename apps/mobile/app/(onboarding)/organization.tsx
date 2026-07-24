import { zodResolver } from '@hookform/resolvers/zod';
import {
  createSlug,
  type OrganizationOnboardingInput,
  organizationOnboardingSchema,
} from '@barber-saas/validation';
import { Redirect, useRouter } from 'expo-router';
import { Controller, useForm } from 'react-hook-form';

import { PrimaryButton } from '../../src/components/PrimaryButton';
import { Screen } from '../../src/components/Screen';
import { TextField } from '../../src/components/TextField';
import { useOnboardingStore } from '../../src/features/onboarding/store';
import { useAuth } from '../../src/providers/AuthProvider';

export default function OrganizationOnboardingScreen() {
  const router = useRouter();
  const { session } = useAuth();
  const savedOrganization = useOnboardingStore((state) => state.organization);
  const setOrganization = useOnboardingStore((state) => state.setOrganization);
  const { control, handleSubmit, formState, setValue } =
    useForm<OrganizationOnboardingInput>({
      defaultValues: savedOrganization ?? { name: '', slug: '' },
      resolver: zodResolver(organizationOnboardingSchema),
    });

  if (!session) return <Redirect href="/(auth)/login" />;

  const submit = handleSubmit((input) => {
    setOrganization(input);
    router.push('/(onboarding)/location');
  });

  return (
    <Screen
      description="Este nombre será visible para tu equipo y tus clientes."
      title="Crea tu barbería"
    >
      <Controller
        control={control}
        name="name"
        render={({ field, fieldState }) => (
          <TextField
            autoComplete="organization"
            error={fieldState.error?.message}
            label="Nombre de la barbería"
            onBlur={field.onBlur}
            onChangeText={(value) => {
              field.onChange(value);
              setValue('slug', createSlug(value), { shouldValidate: true });
            }}
            placeholder="Ej. Barbería Central"
            value={field.value}
          />
        )}
      />
      <Controller
        control={control}
        name="slug"
        render={({ field, fieldState }) => (
          <TextField
            autoCapitalize="none"
            error={fieldState.error?.message}
            label="Enlace público"
            onBlur={field.onBlur}
            onChangeText={(value) => field.onChange(createSlug(value))}
            placeholder="barberia-central"
            value={field.value}
          />
        )}
      />
      <PrimaryButton
        label="Continuar"
        loading={formState.isSubmitting}
        onPress={() => void submit()}
      />
      <PrimaryButton
        label="Tengo una invitación"
        onPress={() => router.push('/(onboarding)/accept-invitation')}
        variant="secondary"
      />
    </Screen>
  );
}
