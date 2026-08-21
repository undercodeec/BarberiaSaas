import Ionicons from '@expo/vector-icons/Ionicons';
import { Redirect, useRouter } from 'expo-router';
import { useMemo, useState } from 'react';
import { Pressable, StyleSheet, Text, TextInput, View } from 'react-native';

import { SafeAreaView } from 'react-native-safe-area-context';

import {
  appStyles,
  appTheme,
  goldShadow,
} from '../../src/components/BottomNavigation';
import { KeyboardAwareScrollView as ScrollView } from '../../src/components/KeyboardAwareScrollView';

import { useAuth } from '../../src/providers/AuthProvider';

type WaitlistTab = 'pending' | 'accepted' | 'rejected';

const tabs: ReadonlyArray<{
  readonly label: string;
  readonly value: WaitlistTab;
}> = [
  { label: 'Pendientes', value: 'pending' },
  { label: 'Aceptados', value: 'accepted' },
  { label: 'Rechazados', value: 'rejected' },
];

const emptyCopy: Record<WaitlistTab, string> = {
  accepted: 'Las solicitudes aceptadas apareceran aqui.',
  pending: 'No hay solicitudes pendientes por revisar.',
  rejected: 'Las solicitudes rechazadas apareceran aqui.',
};

export default function WaitlistScreen() {
  const { session } = useAuth();
  const router = useRouter();
  const [activeTab, setActiveTab] = useState<WaitlistTab>('pending');
  const [search, setSearch] = useState('');
  const activeLabel = useMemo(
    () => tabs.find((tab) => tab.value === activeTab)?.label ?? 'Pendientes',
    [activeTab],
  );

  if (!session) return <Redirect href="/(auth)/login" />;

  return (
    <SafeAreaView edges={['top', 'left', 'right']} style={styles.screen}>
      <View style={styles.header}>
        <Pressable
          accessibilityLabel="Volver a agenda"
          accessibilityRole="button"
          onPress={() =>
            router.canGoBack() ? router.back() : router.replace('/dashboard')
          }
          style={styles.backButton}
        >
          <Ionicons
            color={appTheme.colors.accentDark}
            name="chevron-back"
            size={23}
          />
        </Pressable>
        <View style={styles.headerCopy}>
          <Text accessibilityRole="header" style={styles.title}>
            Lista de espera
          </Text>
          <Text style={styles.subtitle}>
            Solicitudes de reserva de tus clientes
          </Text>
        </View>
      </View>

      <ScrollView
        contentContainerStyle={styles.content}
        keyboardShouldPersistTaps="handled"
      >
        <Text style={styles.searchLabel}>Buscar solicitud</Text>
        <View style={styles.searchBox}>
          <Ionicons
            color={appTheme.colors.accentDark}
            name="search-outline"
            size={21}
          />
          <TextInput
            accessibilityLabel="Buscar en lista de espera"
            onChangeText={setSearch}
            placeholder="Buscar cliente"
            placeholderTextColor={appTheme.colors.textMuted}
            style={styles.searchInput}
            value={search}
          />
        </View>

        <View accessibilityRole="tablist" style={styles.tabs}>
          {tabs.map((tab) => {
            const selected = activeTab === tab.value;
            return (
              <Pressable
                accessibilityRole="tab"
                accessibilityState={{ selected }}
                key={tab.value}
                onPress={() => setActiveTab(tab.value)}
                style={[styles.tab, selected && styles.tabActive]}
              >
                <Text
                  style={[styles.tabLabel, selected && styles.tabLabelActive]}
                >
                  {tab.label}
                </Text>
              </Pressable>
            );
          })}
        </View>

        <View style={styles.emptyState}>
          <View style={styles.emptyIcon}>
            <Ionicons
              color={appTheme.colors.accentDark}
              name="people-outline"
              size={35}
            />
          </View>
          <Text style={styles.emptyTitle}>{activeLabel}</Text>
          <Text style={styles.emptyCopy}>{emptyCopy[activeTab]}</Text>
          {search.trim() ? (
            <Text style={styles.searchHint}>
              La busqueda se aplicara cuando existan solicitudes.
            </Text>
          ) : null}
        </View>
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  backButton: {
    alignItems: 'center',
    backgroundColor: appTheme.colors.accentWash,
    borderColor: appTheme.colors.accentLight,
    borderRadius: appTheme.radii.control,
    borderWidth: 1,
    height: 46,
    justifyContent: 'center',
    width: 46,
    ...goldShadow,
  },
  content: { padding: appTheme.spacing.page, paddingBottom: 42 },
  emptyCopy: {
    color: appTheme.colors.textMuted,
    fontSize: 15,
    lineHeight: 22,
    marginTop: 8,
    textAlign: 'center',
  },
  emptyIcon: {
    alignItems: 'center',
    backgroundColor: appTheme.colors.accentWash,
    borderRadius: 45,
    height: 90,
    justifyContent: 'center',
    width: 90,
  },
  emptyState: {
    alignItems: 'center',
    backgroundColor: appTheme.colors.surface,
    borderColor: appTheme.colors.border,
    borderRadius: appTheme.radii.card,
    borderWidth: 1,
    marginTop: 34,
    paddingHorizontal: 30,
    paddingVertical: 34,
    ...goldShadow,
  },
  emptyTitle: {
    color: appTheme.colors.accentDark,
    fontSize: 20,
    fontWeight: '900',
    marginTop: 18,
  },
  header: {
    alignItems: 'center',
    backgroundColor: appTheme.colors.background,
    flexDirection: 'row',
    gap: 13,
    paddingHorizontal: appTheme.spacing.page,
    paddingVertical: 18,
  },
  headerCopy: { flex: 1 },
  screen: appStyles.screen,
  searchBox: {
    alignItems: 'center',
    backgroundColor: appTheme.colors.surface,
    borderColor: appTheme.colors.border,
    borderRadius: 17,
    borderWidth: 1,
    flexDirection: 'row',
    gap: 9,
    marginTop: 9,
    minHeight: 55,
    paddingHorizontal: 15,
  },
  searchHint: {
    color: appTheme.colors.textMuted,
    fontSize: 13,
    marginTop: 15,
    textAlign: 'center',
  },
  searchInput: { color: appTheme.colors.text, flex: 1, fontSize: 15 },
  searchLabel: {
    color: appTheme.colors.accentDark,
    fontSize: 14,
    fontWeight: '900',
  },
  subtitle: { color: appTheme.colors.textMuted, fontSize: 13, marginTop: 3 },
  tab: {
    alignItems: 'center',
    borderRadius: appTheme.radii.control,
    flex: 1,
    justifyContent: 'center',
    minHeight: 46,
  },
  tabActive: { backgroundColor: appTheme.colors.accent },
  tabLabel: {
    color: appTheme.colors.textMuted,
    fontSize: 13,
    fontWeight: '800',
  },
  tabLabelActive: { color: appTheme.colors.white },
  tabs: {
    backgroundColor: appTheme.colors.surface,
    borderColor: appTheme.colors.border,
    borderRadius: appTheme.radii.control,
    borderWidth: 1,
    flexDirection: 'row',
    gap: 4,
    marginTop: 26,
    padding: 5,
    ...goldShadow,
  },
  title: {
    color: appTheme.colors.accentDark,
    fontSize: 24,
    fontWeight: '900',
  },
});
