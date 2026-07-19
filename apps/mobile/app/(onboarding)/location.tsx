import { zodResolver } from '@hookform/resolvers/zod';
import {
  createSlug,
  type LocationOnboardingInput,
  locationOnboardingSchema,
} from '@barber-saas/validation';
import { Redirect, useRouter } from 'expo-router';
import { Controller, useForm } from 'react-hook-form';

import { PrimaryButton } from '../../src/components/PrimaryButton';
import { Screen } from '../../src/components/Screen';
import { TextField } from '../../src/components/TextField';
import { useOnboardingStore } from '../../src/features/onboarding/store';
import { useAuth } from '../../src/providers/AuthProvider';

const defaultLocation: LocationOnboardingInput = {
  addressLine: '',
  city: '',
  countryCode: 'EC',
  currencyCode: 'USD',
  email: '',
  name: 'Principal',
  phone: '',
  slug: 'principal',
  timezone: 'America/Guayaquil',
  whatsappPhone: '',
};

export default function LocationOnboardingScreen() {
  const router = useRouter();
  const { session } = useAuth();
  const organization = useOnboardingStore((state) => state.organization);
  const savedLocation = useOnboardingStore((state) => state.location);
  const setLocation = useOnboardingStore((state) => state.setLocation);
  const { control, handleSubmit, formState, setValue } =
    useForm<LocationOnboardingInput>({
      defaultValues: savedLocation ?? defaultLocation,
      resolver: zodResolver(locationOnboardingSchema),
    });

  if (!session) return <Redirect href="/(auth)/login" />;
  if (!organization) return <Redirect href="/(onboarding)/organization" />;

  const submit = handleSubmit((input) => {
    setLocation(input);
    router.push('/(onboarding)/summary');
  });

  return (
    <Screen
      description="Configura el primer local. Podrás editarlo después."
      title="Primera sucursal"
    >
      <Controller
        control={control}
        name="name"
        render={({ field, fieldState }) => (
          <TextField
            error={fieldState.error?.message}
            label="Nombre de la sucursal"
            onBlur={field.onBlur}
            onChangeText={(value) => {
              field.onChange(value);
              setValue('slug', createSlug(value), { shouldValidate: true });
            }}
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
            label="Identificador del local"
            onBlur={field.onBlur}
            onChangeText={(value) => field.onChange(createSlug(value))}
            value={field.value}
          />
        )}
      />
      <Controller
        control={control}
        name="phone"
        render={({ field, fieldState }) => (
          <TextField
            error={fieldState.error?.message}
            keyboardType="phone-pad"
            label="Teléfono"
            onBlur={field.onBlur}
            onChangeText={field.onChange}
            placeholder="+593 99 000 0000"
            value={field.value}
          />
        )}
      />
      <Controller
        control={control}
        name="whatsappPhone"
        render={({ field, fieldState }) => (
          <TextField
            error={fieldState.error?.message}
            keyboardType="phone-pad"
            label="WhatsApp"
            onBlur={field.onBlur}
            onChangeText={field.onChange}
            placeholder="+593 99 000 0000"
            value={field.value}
          />
        )}
      />
      <Controller
        control={control}
        name="email"
        render={({ field, fieldState }) => (
          <TextField
            autoCapitalize="none"
            error={fieldState.error?.message}
            keyboardType="email-address"
            label="Correo del local (opcional)"
            onBlur={field.onBlur}
            onChangeText={field.onChange}
            value={field.value ?? ''}
          />
        )}
      />
      <Controller
        control={control}
        name="city"
        render={({ field, fieldState }) => (
          <TextField
            error={fieldState.error?.message}
            label="Ciudad"
            onBlur={field.onBlur}
            onChangeText={field.onChange}
            value={field.value ?? ''}
          />
        )}
      />
      <Controller
        control={control}
        name="addressLine"
        render={({ field, fieldState }) => (
          <TextField
            error={fieldState.error?.message}
            label="Dirección (opcional)"
            onBlur={field.onBlur}
            onChangeText={field.onChange}
            value={field.value ?? ''}
          />
        )}
      />
      <Controller
        control={control}
        name="timezone"
        render={({ field, fieldState }) => (
          <TextField
            autoCapitalize="none"
            error={fieldState.error?.message}
            label="Zona horaria IANA"
            onBlur={field.onBlur}
            onChangeText={field.onChange}
            value={field.value}
          />
        )}
      />
      <Controller
        control={control}
        name="currencyCode"
        render={({ field, fieldState }) => (
          <TextField
            autoCapitalize="characters"
            error={fieldState.error?.message}
            label="Moneda ISO"
            maxLength={3}
            onBlur={field.onBlur}
            onChangeText={(value) => field.onChange(value.toUpperCase())}
            value={field.value}
          />
        )}
      />
      <PrimaryButton
        label="Revisar configuración"
        loading={formState.isSubmitting}
        onPress={() => void submit()}
      />
    </Screen>
  );
}
