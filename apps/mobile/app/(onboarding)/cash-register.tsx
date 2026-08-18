import Ionicons from '@expo/vector-icons/Ionicons';
import type {
  CashMovementRecord,
  CashRegisterSummaryResponse,
  CurrentCashRegisterResponse,
  InventoryResponse,
  ServicesResponse,
  TeamResponse,
} from '@barber-saas/api-client';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Redirect, useRouter } from 'expo-router';
import { useRef, useState } from 'react';
import {
  Animated,
  Alert,
  KeyboardAvoidingView,
  Modal,
  PanResponder,
  Platform,
  Pressable,
  StyleSheet,
  Text,
  TextInput,
  useWindowDimensions,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import {
  appStyles,
  appTheme,
  BottomNavigation,
  goldShadow,
  useNativeLayoutMetrics,
} from '../../src/components/BottomNavigation';
import { KeyboardAwareScrollView as ScrollView } from '../../src/components/KeyboardAwareScrollView';
import { requireApiClient } from '../../src/lib/api';
import { useAuth } from '../../src/providers/AuthProvider';

function movementLabel(type: CashMovementRecord['type']) {
  if (type === 'sale') return 'Venta';
  if (type === 'deposit') return 'Depósito';
  if (type === 'other_income') return 'Otro ingreso';
  if (type === 'expense') return 'Gasto';
  if (type === 'withdrawal') return 'Retiro';
  if (type === 'professional_advance') return 'Anticipo a colaborador';
  if (type === 'professional_advance_reversal') return 'Reverso de anticipo';
  return 'Pago de liquidación';
}

function movementIsIncome(type: CashMovementRecord['type']) {
  return (
    type === 'sale' ||
    type === 'deposit' ||
    type === 'other_income' ||
    type === 'professional_advance_reversal'
  );
}

export default function CashRegisterScreen() {
  const { session, user } = useAuth();
  const layout = useNativeLayoutMetrics(0.92);
  const { height: screenHeight, width: screenWidth } = useWindowDimensions();
  const router = useRouter();
  const queryClient = useQueryClient();
  const floatingSaleOffset = useRef(new Animated.ValueXY()).current;
  const floatingSaleOffsetRef = useRef({ x: 0, y: 0 });
  const floatingSaleBoundsRef = useRef({
    bottomInset: layout.bottomInset,
    height: screenHeight,
    topInset: layout.topInset,
    width: screenWidth,
  });
  floatingSaleBoundsRef.current = {
    bottomInset: layout.bottomInset,
    height: screenHeight,
    topInset: layout.topInset,
    width: screenWidth,
  };
  const floatingSalePanResponder = useRef(
    PanResponder.create({
      onMoveShouldSetPanResponder: (_, gesture) =>
        Math.abs(gesture.dx) > 4 || Math.abs(gesture.dy) > 4,
      onPanResponderMove: (_, gesture) => {
        const bounds = floatingSaleBoundsRef.current;
        const buttonSize = 58;
        const sideMargin = 16;
        const navigationHeight = 72;
        const navigationGap = 12;
        const baseX = bounds.width - 24 - buttonSize;
        const baseY =
          bounds.height - (bounds.bottomInset + 104) - buttonSize;
        const minimumX = sideMargin - baseX;
        const maximumX = bounds.width - sideMargin - buttonSize - baseX;
        const minimumY = bounds.topInset + sideMargin - baseY;
        const maximumY =
          bounds.height -
          bounds.bottomInset -
          navigationHeight -
          navigationGap -
          buttonSize -
          baseY;
        const x = Math.min(
          maximumX,
          Math.max(minimumX, floatingSaleOffsetRef.current.x + gesture.dx),
        );
        const y = Math.min(
          maximumY,
          Math.max(minimumY, floatingSaleOffsetRef.current.y + gesture.dy),
        );
        floatingSaleOffset.setValue({ x, y });
      },
      onPanResponderRelease: (_, gesture) => {
        const bounds = floatingSaleBoundsRef.current;
        const buttonSize = 58;
        const sideMargin = 16;
        const navigationHeight = 72;
        const navigationGap = 12;
        const baseX = bounds.width - 24 - buttonSize;
        const baseY =
          bounds.height - (bounds.bottomInset + 104) - buttonSize;
        floatingSaleOffsetRef.current = {
          x: Math.min(
            bounds.width - sideMargin - buttonSize - baseX,
            Math.max(sideMargin - baseX, floatingSaleOffsetRef.current.x + gesture.dx),
          ),
          y: Math.min(
            bounds.height -
              bounds.bottomInset -
              navigationHeight -
              navigationGap -
              buttonSize -
              baseY,
            Math.max(
              bounds.topInset + sideMargin - baseY,
              floatingSaleOffsetRef.current.y + gesture.dy,
            ),
          ),
        };
        floatingSaleOffset.setValue(floatingSaleOffsetRef.current);
      },
      onPanResponderTerminationRequest: () => false,
    }),
  ).current;
  const [isSheetOpen, setIsSheetOpen] = useState(false);
  const [sheetMode, setSheetMode] = useState<'close' | 'movement' | 'open'>(
    'open',
  );
  const [responsibleId, setResponsibleId] = useState<string | null>(null);
  const [openingAmount, setOpeningAmount] = useState('0');
  const [movementAmount, setMovementAmount] = useState('');
  const [movementDescription, setMovementDescription] = useState('');
  const [movementPayment, setMovementPayment] = useState<
    'card' | 'cash' | 'transfer' | 'other'
  >('cash');
  const [movementType, setMovementType] = useState<
    'deposit' | 'expense' | 'other_income' | 'sale' | 'withdrawal'
  >('sale');
  const [saleKind, setSaleKind] = useState<'free' | 'product' | 'service'>(
    'free',
  );
  const [movementServiceId, setMovementServiceId] = useState<string | null>(
    null,
  );
  const [movementProfessionalId, setMovementProfessionalId] = useState<
    string | null
  >(null);
  const [movementProductId, setMovementProductId] = useState<string | null>(
    null,
  );
  const [movementProductQuantity, setMovementProductQuantity] = useState('1');
  const [closingAmount, setClosingAmount] = useState('');
  const [closingNote, setClosingNote] = useState('');
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
  const servicesQuery = useQuery({
    enabled: Boolean(session),
    queryFn: () => requireApiClient().request<ServicesResponse>('/v1/services'),
    queryKey: ['services'],
  });
  const inventoryQuery = useQuery({
    enabled: Boolean(session),
    queryFn: () =>
      requireApiClient().request<InventoryResponse>('/v1/inventory'),
    queryKey: ['inventory'],
  });
  const summaryQuery = useQuery({
    enabled: Boolean(session),
    queryFn: () =>
      requireApiClient().request<CashRegisterSummaryResponse>(
        '/v1/cash-register/summary',
      ),
    queryKey: ['cash-register-summary'],
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
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: ['cash-register-current'] }),
        queryClient.invalidateQueries({ queryKey: ['cash-register-summary'] }),
        queryClient.invalidateQueries({ queryKey: ['cash-register-history'] }),
      ]);
    },
  });
  const registerMovement = useMutation({
    mutationFn: () => {
      const amount = Number(movementAmount.replace(',', '.'));
      if (!Number.isFinite(amount) || amount <= 0)
        throw new Error('Ingresa un monto válido.');
      if (movementDescription.trim().length < 2)
        throw new Error('Describe el movimiento.');
      if (
        movementType === 'sale' &&
        saleKind === 'service' &&
        (!movementServiceId || !movementProfessionalId)
      )
        throw new Error('Selecciona el servicio y el profesional.');
      const productQuantity = Number(movementProductQuantity);
      if (
        movementType === 'sale' &&
        saleKind === 'product' &&
        (!movementProductId ||
          !Number.isInteger(productQuantity) ||
          productQuantity < 1)
      )
        throw new Error('Selecciona el producto y una cantidad válida.');
      const selectedProduct = inventoryQuery.data?.products.find(
        (product) => product.id === movementProductId,
      );
      if (
        saleKind === 'product' &&
        selectedProduct?.stockTrackingEnabled &&
        productQuantity > selectedProduct.quantityOnHand
      )
        throw new Error(
          `Solo quedan ${selectedProduct.quantityOnHand} unidades disponibles.`,
        );
      return requireApiClient().request('/v1/cash-register/movements', {
        body: {
          amountCents: Math.round(amount * 100),
          description: movementDescription.trim(),
          paymentMethod: movementPayment,
          productId:
            movementType === 'sale' && saleKind === 'product'
              ? movementProductId
              : undefined,
          productQuantity:
            movementType === 'sale' && saleKind === 'product'
              ? productQuantity
              : undefined,
          professionalMembershipId:
            movementType === 'sale' && saleKind === 'service'
              ? movementProfessionalId
              : undefined,
          serviceId:
            movementType === 'sale' && saleKind === 'service'
              ? movementServiceId
              : undefined,
          type: movementType,
        },
        method: 'POST',
      });
    },
    onError: (error) =>
      Alert.alert(
        'No pudimos registrar el movimiento',
        error instanceof Error ? error.message : 'Inténtalo nuevamente.',
      ),
    onSuccess: async () => {
      setIsSheetOpen(false);
      setMovementAmount('');
      setMovementDescription('');
      setSaleKind('free');
      setMovementProductId(null);
      setMovementProductQuantity('1');
      setMovementProfessionalId(null);
      setMovementServiceId(null);
      await queryClient.invalidateQueries({
        queryKey: ['cash-register-summary'],
      });
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: ['business-summary'] }),
        queryClient.invalidateQueries({ queryKey: ['movement-report'] }),
        queryClient.invalidateQueries({ queryKey: ['inventory'] }),
        queryClient.invalidateQueries({ queryKey: ['inventory-movements'] }),
      ]);
    },
  });
  const closeCash = useMutation({
    mutationFn: () => {
      const amount = Number(closingAmount.replace(',', '.'));
      if (!Number.isFinite(amount) || amount < 0)
        throw new Error('Ingresa el efectivo contado válido.');
      return requireApiClient().request('/v1/cash-register/close', {
        body: {
          closingAmountCents: Math.round(amount * 100),
          note: closingNote.trim() || undefined,
        },
        method: 'POST',
      });
    },
    onError: (error) =>
      Alert.alert(
        'No pudimos cerrar la caja',
        error instanceof Error ? error.message : 'Inténtalo nuevamente.',
      ),
    onSuccess: async () => {
      setIsSheetOpen(false);
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: ['cash-register-current'] }),
        queryClient.invalidateQueries({ queryKey: ['cash-register-summary'] }),
        queryClient.invalidateQueries({ queryKey: ['cash-register-history'] }),
      ]);
    },
  });
  if (!session) return <Redirect href="/(auth)/login" />;
  const sessionData = cashQuery.data?.session;
  const totals = summaryQuery.data?.totals;
  const availableResponsibles = (teamQuery.data?.members ?? []).filter(
    (member) => member.user.id !== user?.id,
  );
  const selectedMovementService = servicesQuery.data?.services.find(
    (service) => service.id === movementServiceId,
  );
  const selectedMovementProduct = inventoryQuery.data?.products.find(
    (product) => product.id === movementProductId,
  );
  const teamMembers = teamQuery.data?.members ?? [];
  const isSoloOwner =
    teamMembers.length === 1 && teamMembers[0]?.role === 'owner';
  const commissionableProfessionals = teamMembers.filter(
    (member) =>
      (member.role === 'barber' || member.role === 'owner') &&
      (member.commissionPercentage !== null ||
        (isSoloOwner && member.role === 'owner')) &&
      selectedMovementService?.assignments.some(
        (assignment) => assignment.membershipId === member.id,
      ),
  );
  const formatMoney = (amountCents: number) =>
    `$${(amountCents / 100).toFixed(2)}`;
  return (
    <SafeAreaView edges={['top', 'left', 'right']} style={styles.screen}>
      <View style={styles.header}>
        <Text style={styles.title}>Caja</Text>
      </View>
      {sessionData ? (
        <ScrollView
          contentContainerStyle={[
            styles.openContent,
            // Reserva la altura del menú flotante y un margen táctil adicional
            // para que la última acción de Caja no quede cubierta.
            { paddingBottom: layout.bottomInset + 104 },
          ]}
          showsVerticalScrollIndicator={false}
          style={styles.openScroll}
        >
          <View style={styles.balanceCard}>
            <Text style={styles.balanceLabel}>Saldo en caja</Text>
            <Text style={styles.balanceAmount}>
              {formatMoney(
                totals?.expectedCash ?? sessionData.openingAmountCents,
              )}
            </Text>
            <View style={styles.balanceDivider} />
            <View style={styles.balanceFooter}>
              <View style={styles.balanceInformation}>
                <Text style={styles.balanceMetaLabel}>Fecha de apertura</Text>
                <Text style={styles.balanceMeta}>
                  {new Date(sessionData.openedAt).toLocaleString()}
                </Text>
              </View>
              <Pressable
                accessibilityLabel="Ver detalle de caja"
                onPress={() =>
                  router.push({
                    params: { sessionId: sessionData.id },
                    pathname: '/cash-register-detail',
                  })
                }
              >
                <Text style={styles.detailsLink}>Ver detalles</Text>
              </Pressable>
            </View>
          </View>
          <View style={styles.dayCard}>
            <Text style={styles.dayTitle}>
              {totals?.sales ? 'Tu día en movimiento' : 'El día apenas empieza'}
            </Text>
            <Text style={styles.dayLabel}>Ventas registradas</Text>
            <Text style={styles.dayAmount}>
              {formatMoney(totals?.sales ?? 0)}
            </Text>
            <Text style={styles.dayCopy}>
              {totals?.sales
                ? 'Sigue registrando cada cobro para mantener tu caja al día.'
                : 'Registra tu primera venta, ingreso o salida de dinero.'}
            </Text>
          </View>
          <Text style={styles.movementsTitle}>Movimientos recientes</Text>
          {(summaryQuery.data?.movements ?? []).slice(0, 3).map((movement) => (
            <View key={movement.id} style={styles.movementRow}>
              <View style={styles.movementIcon}>
                <Ionicons
                  color={
                    movement.reversedAt
                      ? '#6B7480'
                      : movementIsIncome(movement.type)
                        ? '#288B52'
                        : '#B54747'
                  }
                  name={
                    movementIsIncome(movement.type)
                      ? 'trending-up-outline'
                      : 'trending-down-outline'
                  }
                  size={20}
                />
              </View>
              <View style={styles.movementCopy}>
                <Text style={styles.movementName}>{movement.description}</Text>
                <Text style={styles.movementMeta}>
                  {movementLabel(movement.type)}
                  {movement.productId
                    ? ` · Producto x${movement.productQuantity ?? 1}`
                    : ''}
                  {movement.reversedAt ? ' · Revertida' : ''}
                </Text>
              </View>
              <Text
                style={[
                  styles.movementAmount,
                  movementIsIncome(movement.type) && !movement.reversedAt
                    ? styles.movementIncome
                    : styles.movementExpense,
                ]}
              >
                {movement.reversedAt
                  ? '↶ '
                  : movementIsIncome(movement.type)
                    ? '+'
                    : '-'}
                {formatMoney(movement.amountCents)}
              </Text>
            </View>
          ))}
          {!summaryQuery.data?.movements.length ? (
            <Text style={styles.noMovements}>
              No tienes movimientos todavía.
            </Text>
          ) : null}
          <View style={styles.sessionActions}>
            <Pressable
              onPress={() => {
                setClosingAmount(
                  ((totals?.expectedCash ?? 0) / 100).toFixed(2),
                );
                setSheetMode('close');
                setIsSheetOpen(true);
              }}
              style={styles.closeButton}
            >
              <Text style={styles.closeText}>Cerrar caja</Text>
            </Pressable>
          </View>
        </ScrollView>
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
            onPress={() => {
              setSheetMode('open');
              setIsSheetOpen(true);
            }}
            style={styles.primary}
          >
            <Ionicons color="#FFFFFF" name="lock-open-outline" size={20} />
            <Text style={styles.primaryText}>Abre tu caja</Text>
          </Pressable>
        </View>
      )}
      {sessionData ? (
        <Animated.View
          {...floatingSalePanResponder.panHandlers}
          style={[
            styles.floatingSaleButton,
            { bottom: layout.bottomInset + 104 },
            { transform: floatingSaleOffset.getTranslateTransform() },
          ]}
        >
          <Pressable
            accessibilityLabel="Registrar venta"
            accessibilityRole="button"
            onPress={() => {
              setMovementType('sale');
              setSaleKind('free');
              setMovementProductId(null);
              setMovementProfessionalId(null);
              setMovementServiceId(null);
              setSheetMode('movement');
              setIsSheetOpen(true);
            }}
            style={({ pressed }) => [
              styles.floatingSaleButtonContent,
              pressed && styles.floatingSaleButtonPressed,
            ]}
          >
            <Ionicons color="#FFFFFF" name="add" size={25} />
          </Pressable>
        </Animated.View>
      ) : null}
      <Modal
        animationType="slide"
        navigationBarTranslucent
        onRequestClose={() => setIsSheetOpen(false)}
        statusBarTranslucent
        transparent
        visible={isSheetOpen}
      >
        <KeyboardAvoidingView
          behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
          style={styles.modalKeyboard}
        >
        <View style={styles.overlay}>
          <Pressable
            onPress={() => setIsSheetOpen(false)}
            style={styles.backdrop}
          />
          <ScrollView
            contentContainerStyle={[
              styles.sheetContent,
              { paddingBottom: layout.bottomInset + 22 },
            ]}
            keyboardShouldPersistTaps="handled"
            style={[styles.sheet, { maxHeight: layout.sheetMaxHeight }]}
          >
            <View style={styles.handle} />
            {sheetMode === 'open' ? (
              <>
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
                  {availableResponsibles.map((member) => (
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
                      Ingresa el efectivo fisico disponible al iniciar la caja.
                      No incluyas ventas ni gastos del dia.
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
              </>
            ) : sheetMode === 'movement' ? (
              <>
                <Text style={styles.sheetTitle}>
                  {movementType === 'sale'
                    ? 'Registrar venta'
                    : movementType === 'deposit' ||
                        movementType === 'other_income'
                      ? 'Registrar ingreso'
                      : 'Registrar salida'}
                </Text>
                <Text style={styles.label}>Tipo</Text>
                <View style={styles.members}>
                  {(
                    [
                      'sale',
                      'deposit',
                      'other_income',
                      'expense',
                      'withdrawal',
                    ] as const
                  ).map((type) => (
                    <Pressable
                      key={type}
                      onPress={() => {
                        setMovementType(type);
                        if (type !== 'sale') {
                          setSaleKind('free');
                          setMovementProductId(null);
                          setMovementProfessionalId(null);
                          setMovementServiceId(null);
                        }
                      }}
                      style={[
                        styles.member,
                        movementType === type && styles.selected,
                      ]}
                    >
                      <Text
                        style={[
                          styles.memberText,
                          movementType === type && styles.selectedText,
                        ]}
                      >
                        {movementLabel(type)}
                      </Text>
                    </Pressable>
                  ))}
                </View>
                {movementType === 'sale' ? (
                  <>
                    <Text style={styles.label}>Clase de venta</Text>
                    <View style={styles.members}>
                      <Pressable
                        onPress={() => {
                          setSaleKind('free');
                          setMovementProductId(null);
                          setMovementProfessionalId(null);
                          setMovementServiceId(null);
                        }}
                        style={[
                          styles.member,
                          saleKind === 'free' && styles.selected,
                        ]}
                      >
                        <Text
                          style={[
                            styles.memberText,
                            saleKind === 'free' && styles.selectedText,
                          ]}
                        >
                          Venta libre
                        </Text>
                      </Pressable>
                      {!isSoloOwner ? (
                        <Pressable
                          onPress={() => {
                            setSaleKind('service');
                            setMovementProductId(null);
                          }}
                          style={[
                            styles.member,
                            saleKind === 'service' && styles.selected,
                          ]}
                        >
                          <Text
                            style={[
                              styles.memberText,
                              saleKind === 'service' && styles.selectedText,
                            ]}
                          >
                            Servicio comisionable
                          </Text>
                        </Pressable>
                      ) : null}
                      <Pressable
                        onPress={() => {
                          setSaleKind('product');
                          setMovementProfessionalId(null);
                          setMovementServiceId(null);
                        }}
                        style={[
                          styles.member,
                          saleKind === 'product' && styles.selected,
                        ]}
                      >
                        <Text
                          style={[
                            styles.memberText,
                            saleKind === 'product' && styles.selectedText,
                          ]}
                        >
                          Producto
                        </Text>
                      </Pressable>
                    </View>
                    {saleKind === 'service' ? (
                      <>
                        <Text style={styles.label}>Servicio</Text>
                        <View style={styles.members}>
                          {(servicesQuery.data?.services ?? []).map(
                            (service) => (
                              <Pressable
                                key={service.id}
                                onPress={() => {
                                  setMovementServiceId(service.id);
                                  setMovementProfessionalId(null);
                                  setMovementAmount(
                                    (service.priceCents / 100).toFixed(2),
                                  );
                                  setMovementDescription(service.name);
                                }}
                                style={[
                                  styles.member,
                                  movementServiceId === service.id &&
                                    styles.selected,
                                ]}
                              >
                                <Text
                                  style={[
                                    styles.memberText,
                                    movementServiceId === service.id &&
                                      styles.selectedText,
                                  ]}
                                >
                                  {service.name}
                                </Text>
                              </Pressable>
                            ),
                          )}
                        </View>
                        <Text style={styles.label}>Profesional</Text>
                        <View style={styles.members}>
                          {commissionableProfessionals.map((member) => (
                            <Pressable
                              key={member.id}
                              onPress={() =>
                                setMovementProfessionalId(member.id)
                              }
                              style={[
                                styles.member,
                                movementProfessionalId === member.id &&
                                  styles.selected,
                              ]}
                            >
                              <Text
                                style={[
                                  styles.memberText,
                                  movementProfessionalId === member.id &&
                                    styles.selectedText,
                                ]}
                              >
                                {member.user.fullName}
                              </Text>
                            </Pressable>
                          ))}
                          {movementServiceId &&
                          commissionableProfessionals.length === 0 ? (
                            <Text style={styles.inlineEmpty}>
                              Este servicio no tiene profesionales asignados.
                            </Text>
                          ) : null}
                        </View>
                      </>
                    ) : null}
                    {saleKind === 'product' ? (
                      <>
                        <Text style={styles.label}>Producto</Text>
                        <View style={styles.members}>
                          {(inventoryQuery.data?.products ?? []).map(
                            (product) => (
                              <Pressable
                                disabled={
                                  product.stockTrackingEnabled &&
                                  product.quantityOnHand < 1
                                }
                                key={product.id}
                                onPress={() => {
                                  setMovementProductId(product.id);
                                  setMovementProductQuantity('1');
                                  setMovementAmount(
                                    (product.salePriceCents / 100).toFixed(2),
                                  );
                                  setMovementDescription(product.name);
                                }}
                                style={[
                                  styles.member,
                                  movementProductId === product.id &&
                                    styles.selected,
                                ]}
                              >
                                <Text
                                  style={[
                                    styles.memberText,
                                    movementProductId === product.id &&
                                      styles.selectedText,
                                  ]}
                                >
                                  {product.name} ({product.quantityOnHand})
                                </Text>
                              </Pressable>
                            ),
                          )}
                          {!inventoryQuery.data?.products.length ? (
                            <Text style={styles.inlineEmpty}>
                              Crea productos con existencias desde Inventario.
                            </Text>
                          ) : null}
                        </View>
                        <Text style={styles.label}>Cantidad</Text>
                        <TextInput
                          accessibilityLabel="Cantidad de producto"
                          keyboardType="number-pad"
                          onChangeText={(value) => {
                            setMovementProductQuantity(value);
                            const quantity = Number(value);
                            if (
                              selectedMovementProduct &&
                              Number.isInteger(quantity) &&
                              quantity > 0
                            )
                              setMovementAmount(
                                (
                                  (selectedMovementProduct.salePriceCents *
                                    quantity) /
                                  100
                                ).toFixed(2),
                              );
                          }}
                          placeholder="1"
                          placeholderTextColor="#8B96A5"
                          style={styles.input}
                          value={movementProductQuantity}
                        />
                      </>
                    ) : null}
                  </>
                ) : null}
                <Text style={styles.label}>Descripción</Text>
                <TextInput
                  accessibilityLabel="Descripción del movimiento"
                  onChangeText={setMovementDescription}
                  placeholder="Ej. corte y barba"
                  placeholderTextColor="#8B96A5"
                  style={styles.input}
                  value={movementDescription}
                />
                <Text style={styles.label}>Monto</Text>
                <TextInput
                  accessibilityLabel="Monto del movimiento"
                  keyboardType="decimal-pad"
                  editable={saleKind !== 'product'}
                  onChangeText={setMovementAmount}
                  placeholder="0.00"
                  placeholderTextColor="#8B96A5"
                  style={styles.input}
                  value={movementAmount}
                />
                <Text style={styles.label}>Método de pago</Text>
                <View style={styles.members}>
                  {(['cash', 'card', 'transfer', 'other'] as const).map(
                    (method) => (
                      <Pressable
                        key={method}
                        onPress={() => setMovementPayment(method)}
                        style={[
                          styles.member,
                          movementPayment === method && styles.selected,
                        ]}
                      >
                        <Text
                          style={[
                            styles.memberText,
                            movementPayment === method && styles.selectedText,
                          ]}
                        >
                          {method === 'cash'
                            ? 'Efectivo'
                            : method === 'card'
                              ? 'Tarjeta'
                              : method === 'transfer'
                                ? 'Transferencia'
                                : 'Otro'}
                        </Text>
                      </Pressable>
                    ),
                  )}
                </View>
                <View style={styles.actions}>
                  <Pressable
                    onPress={() => setIsSheetOpen(false)}
                    style={styles.exit}
                  >
                    <Text style={styles.exitText}>Salir</Text>
                  </Pressable>
                  <Pressable
                    disabled={registerMovement.isPending}
                    onPress={() => registerMovement.mutate()}
                    style={styles.confirm}
                  >
                    <Text style={styles.primaryText}>
                      {registerMovement.isPending ? 'Guardando...' : 'Guardar'}
                    </Text>
                  </Pressable>
                </View>
              </>
            ) : (
              <>
                <Text style={styles.sheetTitle}>Cerrar caja</Text>
                <Text style={styles.copy}>
                  Efectivo esperado: {formatMoney(totals?.expectedCash ?? 0)}
                </Text>
                <Text style={styles.label}>Efectivo contado</Text>
                <TextInput
                  accessibilityLabel="Efectivo contado"
                  keyboardType="decimal-pad"
                  onChangeText={setClosingAmount}
                  placeholder="0.00"
                  placeholderTextColor="#8B96A5"
                  style={styles.input}
                  value={closingAmount}
                />
                <Text style={styles.label}>Nota del cierre (opcional)</Text>
                <TextInput
                  accessibilityLabel="Nota del cierre"
                  onChangeText={setClosingNote}
                  placeholder="Observaciones"
                  placeholderTextColor="#8B96A5"
                  style={styles.input}
                  value={closingNote}
                />
                <View style={styles.actions}>
                  <Pressable
                    onPress={() => setIsSheetOpen(false)}
                    style={styles.exit}
                  >
                    <Text style={styles.exitText}>Salir</Text>
                  </Pressable>
                  <Pressable
                    disabled={closeCash.isPending}
                    onPress={() => closeCash.mutate()}
                    style={styles.confirm}
                  >
                    <Text style={styles.primaryText}>
                      {closeCash.isPending ? 'Cerrando...' : 'Confirmar cierre'}
                    </Text>
                  </Pressable>
                </View>
              </>
            )}
          </ScrollView>
        </View>
        </KeyboardAvoidingView>
      </Modal>
      <BottomNavigation active="cash" />
    </SafeAreaView>
  );
}
const styles = StyleSheet.create({
  actions: { flexDirection: 'row', gap: 10, marginTop: 24 },
  balanceAmount: {
    color: '#288B52',
    fontSize: 38,
    fontWeight: '900',
    marginTop: 4,
  },
  balanceCard: {
    backgroundColor: appTheme.colors.surface,
    borderColor: appTheme.colors.border,
    borderRadius: 24,
    borderWidth: 1,
    padding: 22,
    ...goldShadow,
  },
  balanceDivider: { backgroundColor: '#E5E7EB', height: 1, marginVertical: 18 },
  balanceFooter: {
    alignItems: 'flex-end',
    flexDirection: 'row',
    justifyContent: 'space-between',
  },
  balanceInformation: { flex: 1, paddingRight: 12 },
  balanceLabel: { color: '#303743', fontSize: 16, fontWeight: '800' },
  balanceMeta: {
    color: '#111827',
    fontSize: 14,
    fontWeight: '800',
    marginTop: 3,
  },
  balanceMetaLabel: { color: '#737B87', fontSize: 13 },
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
    backgroundColor: appTheme.colors.accent,
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
  dayAmount: {
    color: '#288B52',
    fontSize: 30,
    fontWeight: '900',
    marginTop: 3,
  },
  dayCard: { backgroundColor: '#F1F4FA', borderRadius: 25, padding: 23 },
  dayCopy: { color: '#59697C', fontSize: 14, lineHeight: 20, marginTop: 14 },
  dayLabel: {
    color: '#59697C',
    fontSize: 14,
    fontWeight: '800',
    marginTop: 22,
  },
  dayTitle: { color: '#111827', fontSize: 19, fontWeight: '900' },
  detailsLink: {
    color: '#111827',
    fontSize: 14,
    fontWeight: '900',
    textDecorationLine: 'underline',
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
  floatingSaleButton: {
    borderRadius: 30,
    height: 58,
    right: 24,
    position: 'absolute',
    width: 58,
    zIndex: 1001,
    ...goldShadow,
  },
  floatingSaleButtonContent: {
    alignItems: 'center',
    backgroundColor: appTheme.colors.accent,
    borderRadius: 30,
    flex: 1,
    justifyContent: 'center',
  },
  floatingSaleButtonPressed: { opacity: 0.84, transform: [{ scale: 0.97 }] },
  handle: {
    alignSelf: 'center',
    backgroundColor: '#C8CDD4',
    borderRadius: 3,
    height: 5,
    width: 45,
  },
  header: {
    alignItems: 'center',
    flexDirection: 'row',
    justifyContent: 'space-between',
    paddingHorizontal: 24,
    paddingVertical: 18,
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
  inlineEmpty: { color: '#737B87', fontSize: 13, paddingVertical: 8 },
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
  movementAmount: { fontSize: 14, fontWeight: '900' },
  movementCopy: { flex: 1 },
  movementExpense: { color: '#B54747' },
  movementIcon: {
    alignItems: 'center',
    backgroundColor: '#F3F5F7',
    borderRadius: 15,
    height: 42,
    justifyContent: 'center',
    width: 42,
  },
  movementIncome: { color: '#288B52' },
  movementMeta: { color: '#737B87', fontSize: 12, marginTop: 2 },
  movementName: { color: '#111827', fontSize: 14, fontWeight: '800' },
  movementRow: {
    alignItems: 'center',
    borderBottomColor: '#E9EBEE',
    borderBottomWidth: 1,
    flexDirection: 'row',
    gap: 11,
    paddingVertical: 12,
  },
  movementsTitle: {
    color: '#111827',
    fontSize: 18,
    fontWeight: '900',
    marginTop: 8,
  },
  noMovements: {
    color: '#7A828E',
    fontSize: 15,
    paddingVertical: 24,
    textAlign: 'center',
  },
  openContent: { gap: 16, paddingBottom: 105, paddingHorizontal: 24 },
  openScroll: { flex: 1 },
  overlay: {
    backgroundColor: 'rgba(17,24,39,.4)',
    flex: 1,
    justifyContent: 'flex-end',
  },
  primary: {
    alignItems: 'center',
    backgroundColor: appTheme.colors.accent,
    borderRadius: 16,
    flexDirection: 'row',
    gap: 8,
    marginTop: 25,
    paddingHorizontal: 20,
    paddingVertical: 15,
  },
  primaryText: { color: '#FFFFFF', fontWeight: '900' },
  screen: appStyles.screen,
  modalKeyboard: { flex: 1 },
  sessionActions: { alignSelf: 'stretch', marginTop: 24 },
  closeButton: { alignItems: 'center', marginTop: 20, padding: 10 },
  closeText: { color: '#9F1D2F', fontWeight: '900' },
  selected: {
    backgroundColor: appTheme.colors.accent,
    borderColor: appTheme.colors.accent,
  },
  selectedText: { color: '#FFFFFF' },
  sheet: {
    backgroundColor: appTheme.colors.surfaceMuted,
    borderTopLeftRadius: appTheme.radii.sheet,
    borderTopRightRadius: appTheme.radii.sheet,
  },
  sheetContent: {
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
