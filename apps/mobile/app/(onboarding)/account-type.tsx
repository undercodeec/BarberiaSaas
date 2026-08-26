import Ionicons from '@expo/vector-icons/Ionicons';
import type { OnboardingAccountDetailsResponse } from '@barber-saas/api-client';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Redirect, useRouter } from 'expo-router';
import { Alert, Pressable, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { InlineMessage } from '../../src/components/InlineMessage';
import {
  appStyles,
  appTheme,
  goldButtonShadow,
} from '../../src/components/BottomNavigation';
import { requireApiClient } from '../../src/lib/api';
import { accountQueryKey, accountQueryPrefix } from '../../src/lib/query-keys';
import { useAuth } from '../../src/providers/AuthProvider';

type AccountType = 'business' | 'professional';

const OPTIONS: ReadonlyArray<{
  description: string;
  icon: 'person-outline' | 'storefront-outline';
  title: string;
  value: AccountType;
}> = [
  {
    description: 'Una experiencia simplificada para trabajar sin equipo.',
    icon: 'person-outline',
    title: 'Solo yo',
    value: 'professional',
  },
  {
    description: 'Gestión de colaboradores, roles y operación del negocio.',
    icon: 'storefront-outline',
    title: 'Tengo un negocio',
    value: 'business',
  },
];

export default function AccountTypeScreen() {
  const router = useRouter();
  const queryClient = useQueryClient();
  const { session, user } = useAuth();
  const accountQuery = useQuery({
    enabled: Boolean(session),
    queryFn: () =>
      requireApiClient().request<OnboardingAccountDetailsResponse>(
        '/v1/onboarding/account-details',
      ),
    queryKey: accountQueryKey(user?.id, 'onboarding-account-details'),
  });
  const mutation = useMutation({
    mutationFn: (accountType: AccountType) =>
      requireApiClient().request<{ readonly accountType: AccountType }>(
        '/v1/onboarding/account-type',
        { body: { accountType }, method: 'PATCH' },
      ),
    onSuccess: async ({ accountType }) => {
      await queryClient.invalidateQueries({
        queryKey: accountQueryPrefix('onboarding-account-details'),
      });
      Alert.alert(
        'Tipo de cuenta actualizado',
        accountType === 'business'
          ? 'Ahora verás las herramientas para administrar un negocio y su equipo.'
          : 'Ahora verás una experiencia simplificada para trabajar de forma individual.',
      );
    },
  });
  if (!session) return <Redirect href="/(auth)/login" />;

  const choose = (next: AccountType) => {
    if (next === accountQuery.data?.accountType || mutation.isPending) return;
    Alert.alert(
      'Cambiar tipo de cuenta',
      next === 'professional'
        ? 'Solo podrás cambiar a “Solo yo” si no tienes colaboradores activos, invitaciones pendientes ni varias sucursales.'
        : 'Tus datos actuales se conservarán y se habilitará la experiencia de negocio.',
      [
        { style: 'cancel', text: 'Cancelar' },
        { onPress: () => mutation.mutate(next), text: 'Confirmar' },
      ],
    );
  };

  return (
    <SafeAreaView style={styles.screen}>
      <View style={styles.header}>
        <Pressable
          accessibilityLabel="Volver"
          accessibilityRole="button"
          onPress={() =>
            router.canGoBack()
              ? router.back()
              : router.replace('/advanced-settings')
          }
          style={styles.backButton}
        >
          <Ionicons color="#101c2d" name="arrow-back" size={25} />
        </Pressable>
        <View style={styles.headerCopy}>
          <Text accessibilityRole="header" style={styles.title}>
            Tipo de cuenta
          </Text>
          <Text style={styles.subtitle}>
            Adapta la experiencia a tu operación
          </Text>
        </View>
      </View>
      <View style={styles.content}>
        <View style={styles.notice}>
          <Ionicons
            color="#101c2d"
            name="information-circle-outline"
            size={23}
          />
          <Text style={styles.noticeCopy}>
            Cambiar el tipo de cuenta no elimina citas, clientes, servicios ni
            historial. Los permisos siguen dependiendo del rol de cada usuario.
          </Text>
        </View>
        {mutation.error ? (
          <InlineMessage
            message={
              mutation.error instanceof Error
                ? mutation.error.message
                : 'No fue posible cambiar el tipo de cuenta.'
            }
          />
        ) : null}
        {OPTIONS.map((option) => {
          const selected = accountQuery.data?.accountType === option.value;
          return (
            <Pressable
              accessibilityRole="radio"
              accessibilityState={{ checked: selected }}
              key={option.value}
              onPress={() => choose(option.value)}
              style={({ pressed }) => [
                styles.option,
                selected ? styles.optionSelected : null,
                pressed ? styles.pressed : null,
              ]}
            >
              <View
                style={[styles.iconBox, selected && styles.iconBoxSelected]}
              >
                <Ionicons
                  color={selected ? appTheme.colors.accentDark : '#101c2d'}
                  name={option.icon}
                  size={27}
                />
              </View>
              <View style={styles.headerCopy}>
                <Text style={styles.optionTitle}>{option.title}</Text>
                <Text style={styles.optionCopy}>{option.description}</Text>
              </View>
              <Ionicons
                color={selected ? '#287247' : appTheme.colors.textMuted}
                name={selected ? 'checkmark-circle' : 'ellipse-outline'}
                size={25}
              />
            </Pressable>
          );
        })}
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  backButton: {
    alignItems: 'center',
    backgroundColor: appTheme.colors.surface,
    borderRadius: 22,
    transform: [{ translateY: -3 }],
    ...goldButtonShadow,
    height: 44,
    justifyContent: 'center',
    width: 44,
  },
  content: {
    alignSelf: 'center',
    gap: 14,
    maxWidth: 720,
    padding: 20,
    width: '100%',
  },
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
  iconBox: {
    alignItems: 'center',
    backgroundColor: appTheme.colors.surfaceMuted,
    borderRadius: 18,
    height: 60,
    justifyContent: 'center',
    width: 60,
  },
  iconBoxSelected: { backgroundColor: appTheme.colors.accentWash },
  notice: {
    alignItems: 'flex-start',
    backgroundColor: appTheme.colors.surface,
    borderRadius: 18,
    flexDirection: 'row',
    gap: 10,
    padding: 15,
    transform: [{ translateY: -3 }],
    ...goldButtonShadow,
  },
  noticeCopy: {
    color: appTheme.colors.textMuted,
    flex: 1,
    fontSize: 13,
    lineHeight: 19,
  },
  option: {
    alignItems: 'center',
    backgroundColor: appTheme.colors.surface,
    borderRadius: 20,
    borderColor: 'transparent',
    borderWidth: 1,
    flexDirection: 'row',
    gap: 13,
    minHeight: 92,
    padding: 16,
    transform: [{ translateY: -3 }],
    ...goldButtonShadow,
  },
  optionCopy: {
    color: appTheme.colors.textMuted,
    fontSize: 13,
    lineHeight: 18,
    marginTop: 4,
  },
  optionSelected: {
    backgroundColor: appTheme.colors.accentWash,
    borderColor: appTheme.colors.accentDark,
  },
  optionTitle: { color: appTheme.colors.text, fontSize: 17, fontWeight: '900' },
  pressed: { opacity: 0.72, transform: [{ scale: 0.99 }] },
  screen: appStyles.screen,
  subtitle: { color: appTheme.colors.textMuted, fontSize: 13, marginTop: 2 },
  title: { color: appTheme.colors.text, fontSize: 25, fontWeight: '900' },
});
