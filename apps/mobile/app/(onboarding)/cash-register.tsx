import Ionicons from '@expo/vector-icons/Ionicons';
import type {
  CurrentCashRegisterResponse,
  TeamResponse,
} from '@barber-saas/api-client';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Redirect, useRouter } from 'expo-router';
import { useState } from 'react';
import {
  Alert,
  Modal,
  Pressable,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { BottomNavigation } from '../../src/components/BottomNavigation';
import { requireApiClient } from '../../src/lib/api';
import { useAuth } from '../../src/providers/AuthProvider';

export default function CashRegisterScreen() {
  const { session, user } = useAuth();
  const router = useRouter();
  const queryClient = useQueryClient();
  const [isSheetOpen, setIsSheetOpen] = useState(false);
  const [responsibleId, setResponsibleId] = useState<string | null>(null);
  const [openingAmount, setOpeningAmount] = useState('0');
  const [isBaseInfoVisible, setIsBaseInfoVisible] = useState(false);
  const cashQuery = useQuery({
    enabled: Boolean(session),
    queryFn: () =>
      requireApiClient().request<CurrentCashRegisterResponse>(
        '/v1/cash-register/current',
      ),
    queryKey: ['cash-register-current'],
  });
  const teamQuery = useQuery({
    enabled: Boolean(session),
    queryFn: () => requireApiClient().request<TeamResponse>('/v1/team'),
    queryKey: ['team'],
  });
  const openCash = useMutation({
    mutationFn: () => {
      const amount = Number(openingAmount.replace(',', '.'));
      if (!Number.isFinite(amount) || amount < 0)
        throw new Error('Ingresa un dinero base valido.');
      return requireApiClient().request<CurrentCashRegisterResponse>(
        '/v1/cash-register/open',
        {
          body: {
            openingAmountCents: Math.round(amount * 100),
            responsibleMembershipId: responsibleId ?? undefined,
          },
          method: 'POST',
        },
      );
    },
    onError: (error) =>
      Alert.alert(
        'No pudimos abrir la caja',
        error instanceof Error ? error.message : 'Intentalo nuevamente.',
      ),
    onSuccess: async () => {
      setIsSheetOpen(false);
      await queryClient.invalidateQueries({
        queryKey: ['cash-register-current'],
      });
    },
  });
  if (!session) return <Redirect href="/(auth)/login" />;
  const sessionData = cashQuery.data?.session;
  return (
    <SafeAreaView edges={['top', 'left', 'right']} style={styles.screen}>
      <View style={styles.header}>
        <Pressable
          accessibilityLabel="Volver"
          onPress={() => router.replace('/agenda')}
          style={styles.back}
        >
          <Ionicons color="#111827" name="chevron-back" size={24} />
        </Pressable>
        <Text style={styles.title}>Caja</Text>
        <View style={styles.back} />
      </View>
      {sessionData ? (
        <View style={styles.empty}>
          <Ionicons color="#111827" name="cash-outline" size={58} />
          <Text style={styles.state}>Caja abierta</Text>
          <Text style={styles.copy}>
            Responsable: {sessionData.responsibleName}
          </Text>
          <Text style={styles.copy}>
            Base: ${(sessionData.openingAmountCents / 100).toFixed(2)}
          </Text>
        </View>
      ) : (
        <View style={styles.empty}>
          <View style={styles.icon}>
            <Ionicons color="#111827" name="cash-outline" size={54} />
          </View>
          <Text style={styles.state}>Caja cerrada</Text>
          <Text style={styles.copy}>
            Abre una caja para registrar ventas y gastos diarios.
          </Text>
          <Pressable
            onPress={() => setIsSheetOpen(true)}
            style={styles.primary}
          >
            <Ionicons color="#FFFFFF" name="lock-open-outline" size={20} />
            <Text style={styles.primaryText}>Abre tu caja</Text>
          </Pressable>
        </View>
      )}
      <Modal
        animationType="slide"
        onRequestClose={() => setIsSheetOpen(false)}
        transparent
        visible={isSheetOpen}
      >
        <View style={styles.overlay}>
          <Pressable
            onPress={() => setIsSheetOpen(false)}
            style={styles.backdrop}
          />
          <View style={styles.sheet}>
            <View style={styles.handle} />
            <Text style={styles.sheetTitle}>Abrir caja</Text>
            <Text style={styles.label}>Responsable</Text>
            <View style={styles.members}>
              <Pressable
                onPress={() => setResponsibleId(null)}
                style={[styles.member, !responsibleId && styles.selected]}
              >
                <Text
                  style={[
                    styles.memberText,
                    !responsibleId && styles.selectedText,
                  ]}
                >
                  {user?.fullName ?? 'Yo'}
                </Text>
              </Pressable>
              {(teamQuery.data?.members ?? []).map((member) => (
                <Pressable
                  key={member.id}
                  onPress={() => setResponsibleId(member.id)}
                  style={[
                    styles.member,
                    responsibleId === member.id && styles.selected,
                  ]}
                >
                  <Text
                    style={[
                      styles.memberText,
                      responsibleId === member.id && styles.selectedText,
                    ]}
                  >
                    {member.user.fullName}
                  </Text>
                </Pressable>
              ))}
            </View>
            <View style={styles.moneyLabel}>
              <Text style={styles.label}>Dinero base</Text>
              <Pressable
                accessibilityLabel="Informacion sobre dinero base"
                onPress={() => setIsBaseInfoVisible((visible) => !visible)}
                style={styles.infoButton}
              >
                <Text style={styles.infoButtonLabel}>!</Text>
              </Pressable>
            </View>
            {isBaseInfoVisible ? (
              <View style={styles.baseInfoBox}>
                <Ionicons
                  color="#5D6672"
                  name="information-circle-outline"
                  size={18}
                />
                <Text style={styles.baseInfo}>
                  Ingresa el efectivo fisico disponible al iniciar la caja. No
                  incluyas ventas ni gastos del dia.
                </Text>
              </View>
            ) : null}
            <TextInput
              accessibilityLabel="Dinero base"
              keyboardType="decimal-pad"
              onChangeText={setOpeningAmount}
              placeholder="0.00"
              placeholderTextColor="#8B96A5"
              style={styles.input}
              value={openingAmount}
            />
            <View style={styles.actions}>
              <Pressable
                onPress={() => setIsSheetOpen(false)}
                style={styles.exit}
              >
                <Text style={styles.exitText}>Salir</Text>
              </Pressable>
              <Pressable
                disabled={openCash.isPending}
                onPress={() => openCash.mutate()}
                style={styles.confirm}
              >
                <Text style={styles.primaryText}>
                  {openCash.isPending ? 'Abriendo...' : 'Abrir caja'}
                </Text>
              </Pressable>
            </View>
          </View>
        </View>
      </Modal>
      <BottomNavigation active="cash" />
    </SafeAreaView>
  );
}
const styles = StyleSheet.create({
  actions: { flexDirection: 'row', gap: 10, marginTop: 24 },
  baseInfo: { color: '#5D6672', flex: 1, fontSize: 13, lineHeight: 19 },
  baseInfoBox: {
    alignItems: 'flex-start',
    backgroundColor: '#F1F3F5',
    borderRadius: 12,
    flexDirection: 'row',
    gap: 8,
    marginTop: 9,
    padding: 11,
  },
  back: {
    alignItems: 'center',
    height: 44,
    justifyContent: 'center',
    width: 44,
  },
  backdrop: { bottom: 0, left: 0, position: 'absolute', right: 0, top: 0 },
  confirm: {
    alignItems: 'center',
    backgroundColor: '#111827',
    borderRadius: 15,
    flex: 1,
    justifyContent: 'center',
    minHeight: 52,
  },
  copy: {
    color: '#6E7785',
    fontSize: 15,
    lineHeight: 22,
    marginTop: 9,
    textAlign: 'center',
  },
  empty: {
    alignItems: 'center',
    flex: 1,
    justifyContent: 'center',
    paddingHorizontal: 42,
  },
  exit: {
    alignItems: 'center',
    borderColor: '#C8CDD4',
    borderRadius: 15,
    borderWidth: 1,
    flex: 0.8,
    justifyContent: 'center',
    minHeight: 52,
  },
  exitText: { color: '#111827', fontWeight: '900' },
  handle: {
    alignSelf: 'center',
    backgroundColor: '#C8CDD4',
    borderRadius: 3,
    height: 5,
    width: 45,
  },
  header: {
    alignItems: 'center',
    borderBottomColor: '#E1E5EA',
    borderBottomWidth: 1,
    flexDirection: 'row',
    justifyContent: 'space-between',
    padding: 18,
  },
  infoButton: {
    alignItems: 'center',
    backgroundColor: '#111827',
    borderRadius: 10,
    height: 20,
    justifyContent: 'center',
    width: 20,
  },
  infoButtonLabel: { color: '#FFFFFF', fontSize: 13, fontWeight: '900' },
  icon: {
    alignItems: 'center',
    backgroundColor: '#E5E7EB',
    borderRadius: 58,
    height: 116,
    justifyContent: 'center',
    width: 116,
  },
  input: {
    backgroundColor: '#F6F7F8',
    borderColor: '#D8DDE3',
    borderRadius: 15,
    borderWidth: 1,
    color: '#111827',
    fontSize: 17,
    marginTop: 9,
    padding: 15,
  },
  label: { color: '#111827', fontSize: 14, fontWeight: '800', marginTop: 22 },
  member: {
    borderColor: '#D8DDE3',
    borderRadius: 14,
    borderWidth: 1,
    paddingHorizontal: 13,
    paddingVertical: 10,
  },
  memberText: { color: '#111827', fontSize: 14, fontWeight: '800' },
  members: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginTop: 10 },
  moneyLabel: {
    alignItems: 'center',
    flexDirection: 'row',
    justifyContent: 'space-between',
  },
  overlay: {
    backgroundColor: 'rgba(17,24,39,.4)',
    flex: 1,
    justifyContent: 'flex-end',
  },
  primary: {
    alignItems: 'center',
    backgroundColor: '#111827',
    borderRadius: 16,
    flexDirection: 'row',
    gap: 8,
    marginTop: 25,
    paddingHorizontal: 20,
    paddingVertical: 15,
  },
  primaryText: { color: '#FFFFFF', fontWeight: '900' },
  screen: { backgroundColor: '#FBFCFF', flex: 1 },
  selected: { backgroundColor: '#111827', borderColor: '#111827' },
  selectedText: { color: '#FFFFFF' },
  sheet: {
    backgroundColor: '#FFFFFF',
    borderTopLeftRadius: 28,
    borderTopRightRadius: 28,
    paddingBottom: 34,
    paddingHorizontal: 22,
    paddingTop: 14,
  },
  sheetTitle: {
    color: '#111827',
    fontSize: 23,
    fontWeight: '900',
    marginTop: 17,
  },
  state: { color: '#111827', fontSize: 24, fontWeight: '900', marginTop: 21 },
  title: { color: '#111827', fontSize: 22, fontWeight: '900' },
});
