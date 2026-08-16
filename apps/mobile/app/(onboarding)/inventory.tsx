import Ionicons from '@expo/vector-icons/Ionicons';
import * as ImagePicker from 'expo-image-picker';
import type {
  InventoryProduct,
  InventoryResponse,
  ProductOrderRecord,
  ProductOrdersResponse,
  StockMovementHistoryResponse,
} from '@barber-saas/api-client';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Redirect, useLocalSearchParams, useRouter } from 'expo-router';
import { useMemo, useState } from 'react';
import {
  Alert,
  Image,
  KeyboardAvoidingView,
  Modal,
  Platform,
  Pressable,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import {
  appTheme,
  goldButtonShadow,
  useNativeLayoutMetrics,
} from '../../src/components/BottomNavigation';
import { KeyboardAwareScrollView as ScrollView } from '../../src/components/KeyboardAwareScrollView';
import { requireApiClient } from '../../src/lib/api';
import { useAuth } from '../../src/providers/AuthProvider';

const MAX_IMAGE_BYTES = 1_500_000;
const MAX_IMAGE_DIMENSION = 1_600;

type SheetMode = 'adjustment' | 'product';
type AdjustmentType =
  'adjustment_in' | 'adjustment_out' | 'loss' | 'purchase' | 'return';

function cents(value: string, label: string) {
  const parsed = Number(value.replace(',', '.'));
  if (!Number.isFinite(parsed) || parsed < 0)
    throw new Error(`Ingresa ${label} válido.`);
  return Math.round(parsed * 100);
}

function units(value: string, label: string) {
  const parsed = Number(value);
  if (!Number.isInteger(parsed) || parsed < 0)
    throw new Error(`Ingresa ${label} válido.`);
  return parsed;
}

function movementLabel(type: string) {
  if (type === 'opening') return 'Existencia inicial';
  if (type === 'purchase') return 'Compra';
  if (type === 'sale') return 'Venta';
  if (type === 'return') return 'Devolución';
  if (type === 'loss') return 'Pérdida';
  return 'Ajuste';
}

export default function InventoryScreen() {
  const { session } = useAuth();
  const layout = useNativeLayoutMetrics();
  const router = useRouter();
  const queryClient = useQueryClient();
  const params = useLocalSearchParams<{ filter?: string }>();
  const [locationId, setLocationId] = useState<string | null>(null);
  const [lowStockOnly, setLowStockOnly] = useState(
    params.filter === 'low-stock',
  );
  const [tab, setTab] = useState<'orders' | 'products' | 'movements'>(
    'products',
  );
  const [sheetMode, setSheetMode] = useState<SheetMode>('product');
  const [isSheetOpen, setIsSheetOpen] = useState(false);
  const [editingProduct, setEditingProduct] = useState<InventoryProduct | null>(
    null,
  );
  const [selectedProduct, setSelectedProduct] =
    useState<InventoryProduct | null>(null);
  const [name, setName] = useState('');
  const [imageData, setImageData] = useState<string | null>(null);
  const [sku, setSku] = useState('');
  const [cost, setCost] = useState('0');
  const [price, setPrice] = useState('');
  const [minimumStock, setMinimumStock] = useState('0');
  const [initialStock, setInitialStock] = useState('0');
  const [adjustmentQuantity, setAdjustmentQuantity] = useState('');
  const [adjustmentNotes, setAdjustmentNotes] = useState('');
  const [adjustmentType, setAdjustmentType] =
    useState<AdjustmentType>('purchase');

  const inventorySearch = useMemo(() => {
    const search = new URLSearchParams();
    if (locationId) search.set('locationId', locationId);
    if (lowStockOnly) search.set('lowStockOnly', 'true');
    return search.toString();
  }, [locationId, lowStockOnly]);
  const inventoryQuery = useQuery({
    enabled: Boolean(session),
    queryFn: () =>
      requireApiClient().request<InventoryResponse>(
        `/v1/inventory${inventorySearch ? `?${inventorySearch}` : ''}`,
      ),
    queryKey: ['inventory', inventorySearch],
  });
  const resolvedLocationId =
    locationId ?? inventoryQuery.data?.locationId ?? null;
  const movementQuery = useQuery({
    enabled: Boolean(session && tab === 'movements' && resolvedLocationId),
    queryFn: () =>
      requireApiClient().request<StockMovementHistoryResponse>(
        `/v1/inventory/movements?locationId=${resolvedLocationId}`,
      ),
    queryKey: ['inventory-movements', resolvedLocationId],
  });

  const saveProduct = useMutation({
    mutationFn: () => {
      if (name.trim().length < 2)
        throw new Error('Ingresa el nombre del producto.');
      const body = {
        costCents: cents(cost, 'un costo'),
        imageData,
        minimumStock: units(minimumStock, 'un stock mínimo'),
        name: name.trim(),
        salePriceCents: cents(price, 'un precio'),
        sku: sku.trim() || undefined,
        stockTrackingEnabled: true,
        ...(editingProduct
          ? {
              initialStock: units(initialStock, 'una existencia inicial'),
              locationId: resolvedLocationId ?? undefined,
            }
          : {
              initialStock: units(initialStock, 'una existencia inicial'),
              locationId: resolvedLocationId ?? undefined,
            }),
      };
      return requireApiClient().request(
        editingProduct
          ? `/v1/inventory/products/${editingProduct.id}`
          : '/v1/inventory/products',
        {
          body,
          method: editingProduct ? 'PATCH' : 'POST',
        },
      );
    },
    onError: (error) =>
      Alert.alert(
        'No pudimos guardar el producto',
        error instanceof Error ? error.message : 'Inténtalo nuevamente.',
      ),
    onSuccess: async () => {
      setIsSheetOpen(false);
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: ['inventory'] }),
        queryClient.invalidateQueries({ queryKey: ['inventory-movements'] }),
      ]);
    },
  });
  const adjustStock = useMutation({
    mutationFn: () => {
      if (!selectedProduct || !resolvedLocationId)
        throw new Error('Selecciona un producto y una sucursal.');
      const quantity = units(adjustmentQuantity, 'una cantidad');
      if (quantity < 1) throw new Error('La cantidad debe ser mayor a cero.');
      if (adjustmentNotes.trim().length < 2)
        throw new Error('Describe el motivo del movimiento.');
      const isOutput =
        adjustmentType === 'loss' || adjustmentType === 'adjustment_out';
      return requireApiClient().request('/v1/inventory/adjustments', {
        body: {
          locationId: resolvedLocationId,
          notes: adjustmentNotes.trim(),
          productId: selectedProduct.id,
          quantityDelta: isOutput ? -quantity : quantity,
          type: adjustmentType.startsWith('adjustment')
            ? 'adjustment'
            : adjustmentType,
          unitCostCents:
            adjustmentType === 'purchase' ? cents(cost, 'un costo') : undefined,
        },
        method: 'POST',
      });
    },
    onError: (error) =>
      Alert.alert(
        'No pudimos ajustar las existencias',
        error instanceof Error ? error.message : 'Inténtalo nuevamente.',
      ),
    onSuccess: async () => {
      setIsSheetOpen(false);
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: ['inventory'] }),
        queryClient.invalidateQueries({ queryKey: ['inventory-movements'] }),
      ]);
    },
  });
  const reverseSale = useMutation({
    mutationFn: (cashMovementId: string) =>
      requireApiClient().request(
        `/v1/inventory/product-sales/${cashMovementId}/reverse`,
        {
          body: { reason: 'Reversión solicitada desde Inventario' },
          method: 'POST',
        },
      ),
    onError: (error) =>
      Alert.alert(
        'No pudimos revertir la venta',
        error instanceof Error ? error.message : 'Inténtalo nuevamente.',
      ),
    onSuccess: async () => {
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: ['inventory'] }),
        queryClient.invalidateQueries({ queryKey: ['inventory-movements'] }),
        queryClient.invalidateQueries({ queryKey: ['cash-register-summary'] }),
        queryClient.invalidateQueries({ queryKey: ['business-summary'] }),
        queryClient.invalidateQueries({ queryKey: ['movement-report'] }),
      ]);
    },
  });
  const ordersQuery = useQuery({
    enabled: Boolean(session && tab === 'orders'),
    queryFn: () =>
      requireApiClient().request<ProductOrdersResponse>(
        `/v1/product-orders${resolvedLocationId ? `?locationId=${resolvedLocationId}` : ''}`,
      ),
    queryKey: ['product-orders', resolvedLocationId],
  });
  const deleteProduct = useMutation({
    mutationFn: (productId: string) =>
      requireApiClient().request(`/v1/inventory/products/${productId}`, {
        body: { isActive: false },
        method: 'PATCH',
      }),
    onError: (error) =>
      Alert.alert(
        'No pudimos eliminar el producto',
        error instanceof Error ? error.message : 'Inténtalo nuevamente.',
      ),
    onSuccess: async () => {
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: ['inventory'] }),
        queryClient.invalidateQueries({ queryKey: ['inventory-movements'] }),
      ]);
    },
  });
  const processOrder = useMutation({
    mutationFn: ({
      action,
      order,
    }: {
      action: 'cancel' | 'confirm-payment' | 'fulfill' | 'ready';
      order: ProductOrderRecord;
    }) =>
      requireApiClient().request(
        `/v1/product-orders/${order.id}/${action}`,
        action === 'confirm-payment'
          ? {
              body: {
                paymentMethod:
                  order.paymentMethod === 'pickup'
                    ? 'cash'
                    : order.paymentMethod,
              },
              method: 'POST',
            }
          : { method: 'POST' },
      ),
    onError: (error) =>
      Alert.alert(
        'No pudimos actualizar el pedido',
        error instanceof Error ? error.message : 'Inténtalo nuevamente.',
      ),
    onSuccess: async () => {
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: ['product-orders'] }),
        queryClient.invalidateQueries({ queryKey: ['inventory'] }),
        queryClient.invalidateQueries({ queryKey: ['inventory-movements'] }),
        queryClient.invalidateQueries({ queryKey: ['cash-register-summary'] }),
      ]);
    },
  });

  if (!session) return <Redirect href="/(auth)/login" />;

  const chooseProductPhoto = async () => {
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
    setImageData(`data:${mimeType};base64,${asset.base64}`);
  };

  const money = (value: number) =>
    new Intl.NumberFormat('es-EC', {
      currency: inventoryQuery.data?.currencyCode ?? 'USD',
      style: 'currency',
    }).format(value / 100);
  const resetProductForm = (product?: InventoryProduct) => {
    setEditingProduct(product ?? null);
    setName(product?.name ?? '');
    setImageData(product?.imageData ?? null);
    setSku(product?.sku ?? '');
    setCost(((product?.costCents ?? 0) / 100).toFixed(2));
    setPrice(product ? (product.salePriceCents / 100).toFixed(2) : '');
    setMinimumStock(String(product?.minimumStock ?? 0));
    setInitialStock(String(product?.quantityOnHand ?? 0));
    setSheetMode('product');
    setIsSheetOpen(true);
  };
  const openAdjustment = (product: InventoryProduct) => {
    setSelectedProduct(product);
    setAdjustmentQuantity('');
    setAdjustmentNotes('');
    setAdjustmentType('purchase');
    setCost((product.costCents / 100).toFixed(2));
    setSheetMode('adjustment');
    setIsSheetOpen(true);
  };

  return (
    <SafeAreaView edges={['top', 'left', 'right']} style={styles.screen}>
      <View style={styles.header}>
        <Pressable
          accessibilityLabel="Volver"
          onPress={() =>
            router.canGoBack() ? router.back() : router.replace('/dashboard')
          }
          style={styles.headerButton}
        >
          <Ionicons color="#111827" name="arrow-back" size={24} />
        </Pressable>
        <View style={styles.headerCopy}>
          <Text accessibilityRole="header" style={styles.title}>
            Inventario
          </Text>
          <Text style={styles.subtitle}>
            Productos y existencias auditables
          </Text>
        </View>
      </View>
      <View style={styles.tabs}>
        <TabButton
          active={tab === 'products'}
          label="Productos"
          onPress={() => setTab('products')}
        />
        <TabButton
          active={tab === 'movements'}
          label="Movimientos"
          onPress={() => setTab('movements')}
        />
        <TabButton
          active={tab === 'orders'}
          label="Pedidos"
          onPress={() => setTab('orders')}
        />
      </View>
      <ScrollView contentContainerStyle={styles.content}>
        {(inventoryQuery.data?.accessibleLocations.length ?? 0) > 1 ? (
          <ScrollView horizontal showsHorizontalScrollIndicator={false}>
            <View style={styles.chips}>
              {inventoryQuery.data?.accessibleLocations.map((location) => (
                <Chip
                  active={resolvedLocationId === location.id}
                  key={location.id}
                  label={location.name}
                  onPress={() => setLocationId(location.id)}
                />
              ))}
            </View>
          </ScrollView>
        ) : null}
        {tab === 'products' ? (
          <>
            <View style={styles.summaryGrid}>
              <SummaryCard
                label="Unidades"
                value={String(inventoryQuery.data?.summary.totalUnits ?? 0)}
              />
              <SummaryCard
                alert={Boolean(inventoryQuery.data?.summary.lowStockProducts)}
                label="Stock bajo"
                value={String(
                  inventoryQuery.data?.summary.lowStockProducts ?? 0,
                )}
              />
              <SummaryCard
                label="Costo inventario"
                value={money(
                  inventoryQuery.data?.summary.inventoryCostCents ?? 0,
                )}
              />
            </View>
            <Pressable
              onPress={() => setLowStockOnly((value) => !value)}
              style={[
                styles.filterButton,
                lowStockOnly && styles.filterButtonActive,
              ]}
            >
              <Ionicons
                color={lowStockOnly ? '#FFFFFF' : '#805E21'}
                name="warning-outline"
                size={18}
              />
              <Text
                style={[
                  styles.filterText,
                  lowStockOnly && styles.filterTextActive,
                ]}
              >
                {lowStockOnly ? 'Mostrando stock bajo' : 'Ver alertas de stock'}
              </Text>
            </Pressable>
            {inventoryQuery.isLoading ? (
              <Text style={styles.muted}>Cargando productos…</Text>
            ) : null}
            {inventoryQuery.error ? (
              <Pressable onPress={() => void inventoryQuery.refetch()}>
                <Text style={styles.error}>
                  No pudimos cargar el inventario.
                </Text>
              </Pressable>
            ) : null}
            <View style={styles.list}>
              {inventoryQuery.data?.products.map((product) => (
                <View key={product.id} style={styles.productCard}>
                  <View
                    style={[
                      styles.productIcon,
                      product.isLowStock && styles.productIconAlert,
                    ]}
                  >
                    {product.imageData ? (
                      <Image
                        source={{ uri: product.imageData }}
                        style={styles.productImage}
                      />
                    ) : (
                      <Ionicons
                        color={product.isLowStock ? '#B54747' : '#805E21'}
                        name="cube-outline"
                        size={25}
                      />
                    )}
                  </View>
                  <View style={styles.productCopy}>
                    <Text style={styles.productName}>{product.name}</Text>
                    <Text style={styles.muted}>
                      {product.sku ? `${product.sku} · ` : ''}
                      {money(product.salePriceCents)}
                    </Text>
                    <Text
                      style={[
                        styles.stock,
                        product.isLowStock && styles.stockAlert,
                      ]}
                    >
                      {product.quantityOnHand} unidades · mínimo{' '}
                      {product.minimumStock}
                    </Text>
                  </View>
                  <View style={styles.productActions}>
                    <Pressable
                      accessibilityLabel={`Ajustar ${product.name}`}
                      onPress={() => openAdjustment(product)}
                      style={styles.smallButton}
                    >
                      <Ionicons
                        color="#805E21"
                        name="swap-vertical"
                        size={19}
                      />
                    </Pressable>
                    <Pressable
                      accessibilityLabel={`Editar ${product.name}`}
                      onPress={() => resetProductForm(product)}
                      style={styles.smallButton}
                    >
                      <Ionicons color="#805E21" name="pencil" size={18} />
                    </Pressable>
                    <Pressable
                      accessibilityLabel={`Eliminar ${product.name}`}
                      disabled={deleteProduct.isPending}
                      onPress={() =>
                        Alert.alert(
                          'Eliminar producto',
                          `¿Quieres eliminar ${product.name}? Dejará de estar disponible, pero su historial se conservará.`,
                          [
                            { style: 'cancel', text: 'Cancelar' },
                            {
                              onPress: () => deleteProduct.mutate(product.id),
                              style: 'destructive',
                              text: 'Eliminar',
                            },
                          ],
                        )
                      }
                      style={[styles.smallButton, styles.deleteSmallButton]}
                    >
                      <Ionicons
                        color="#B54747"
                        name="trash-outline"
                        size={18}
                      />
                    </Pressable>
                  </View>
                </View>
              ))}
            </View>
            {!inventoryQuery.isLoading &&
            !inventoryQuery.data?.products.length ? (
              <View style={styles.empty}>
                <Ionicons color="#9AA3AF" name="cube-outline" size={42} />
                <Text style={styles.emptyTitle}>
                  {lowStockOnly
                    ? 'No hay alertas de stock'
                    : 'Aún no tienes productos'}
                </Text>
                <Text style={styles.muted}>
                  {lowStockOnly
                    ? 'Todas las existencias están sobre su mínimo.'
                    : 'Crea el primer producto para empezar a controlar stock.'}
                </Text>
              </View>
            ) : null}
          </>
        ) : tab === 'movements' ? (
          <View style={styles.list}>
            {movementQuery.data?.rows.map((movement) => (
              <View key={movement.id} style={styles.movementCard}>
                <View>
                  <Text style={styles.productName}>{movement.productName}</Text>
                  <Text style={styles.muted}>
                    {movementLabel(movement.type)} ·{' '}
                    {new Date(movement.createdAt).toLocaleString('es-EC')}
                  </Text>
                  {movement.notes ? (
                    <Text style={styles.movementNotes}>{movement.notes}</Text>
                  ) : null}
                  {movement.type === 'sale' &&
                  movement.cashMovementId &&
                  !movement.cashMovementReversedAt ? (
                    <Pressable
                      onPress={() =>
                        Alert.alert(
                          'Revertir venta',
                          'La venta dejará de sumar en Caja y las unidades volverán al inventario.',
                          [
                            { style: 'cancel', text: 'Cancelar' },
                            {
                              onPress: () =>
                                reverseSale.mutate(movement.cashMovementId!),
                              style: 'destructive',
                              text: 'Revertir',
                            },
                          ],
                        )
                      }
                      style={styles.reverseButton}
                    >
                      <Text style={styles.reverseText}>Revertir venta</Text>
                    </Pressable>
                  ) : null}
                  {movement.type === 'sale' &&
                  movement.cashMovementReversedAt ? (
                    <Text style={styles.reversedText}>Venta revertida</Text>
                  ) : null}
                </View>
                <View style={styles.movementValue}>
                  <Text
                    style={
                      movement.direction === 'in'
                        ? styles.movementIn
                        : styles.movementOut
                    }
                  >
                    {movement.direction === 'in' ? '+' : '-'}
                    {movement.quantity}
                  </Text>
                  <Text style={styles.muted}>
                    saldo {movement.resultingQuantity}
                  </Text>
                </View>
              </View>
            ))}
            {movementQuery.isLoading ? (
              <Text style={styles.muted}>Cargando movimientos…</Text>
            ) : null}
            {!movementQuery.isLoading && !movementQuery.data?.rows.length ? (
              <Text style={styles.muted}>No hay movimientos registrados.</Text>
            ) : null}
          </View>
        ) : (
          <View style={styles.list}>
            {ordersQuery.isLoading ? (
              <Text style={styles.muted}>Cargando pedidos…</Text>
            ) : null}
            {ordersQuery.data?.orders.map((order) => (
              <View key={order.id} style={styles.movementCard}>
                <View style={styles.productCopy}>
                  <Text style={styles.productName}>{order.customerName}</Text>
                  <Text style={styles.muted}>
                    #{order.id.slice(0, 8).toUpperCase()} ·{' '}
                    {order.customerPhone}
                  </Text>
                  <Text style={styles.movementNotes}>
                    {order.items
                      .map((item) => `${item.productName} ×${item.quantity}`)
                      .join(', ')}
                  </Text>
                  <Text style={styles.muted}>
                    {order.paymentMethod === 'pickup'
                      ? 'Pago al retirar'
                      : order.paymentMethod === 'transfer'
                        ? 'Transferencia'
                        : 'Tarjeta'}{' '}
                    · {order.status.replaceAll('_', ' ')}
                  </Text>
                  {['pending_payment', 'reserved'].includes(order.status) ? (
                    <View style={styles.orderActions}>
                      <Pressable
                        onPress={() =>
                          processOrder.mutate({
                            action: 'confirm-payment',
                            order,
                          })
                        }
                        style={styles.reverseButton}
                      >
                        <Text style={styles.reverseText}>Confirmar pago</Text>
                      </Pressable>
                      <Pressable
                        onPress={() =>
                          processOrder.mutate({ action: 'cancel', order })
                        }
                        style={styles.orderCancelButton}
                      >
                        <Text style={styles.orderCancelText}>Cancelar</Text>
                      </Pressable>
                    </View>
                  ) : null}
                  {order.status === 'paid' ? (
                    <Pressable
                      onPress={() =>
                        processOrder.mutate({ action: 'ready', order })
                      }
                      style={styles.reverseButton}
                    >
                      <Text style={styles.reverseText}>
                        Marcar listo para retiro
                      </Text>
                    </Pressable>
                  ) : null}
                  {order.status === 'ready_for_pickup' ? (
                    <Pressable
                      onPress={() =>
                        processOrder.mutate({ action: 'fulfill', order })
                      }
                      style={styles.reverseButton}
                    >
                      <Text style={styles.reverseText}>Entregar pedido</Text>
                    </Pressable>
                  ) : null}
                </View>
                <Text style={styles.orderTotal}>{money(order.totalCents)}</Text>
              </View>
            ))}
            {!ordersQuery.isLoading && !ordersQuery.data?.orders.length ? (
              <Text style={styles.muted}>
                No hay pedidos para esta sucursal.
              </Text>
            ) : null}
          </View>
        )}
      </ScrollView>
      {tab === 'products' ? (
        <Pressable
          accessibilityLabel="Agregar producto"
          accessibilityRole="button"
          onPress={() => resetProductForm()}
          style={({ pressed }) => [
            styles.floatingAddButton,
            { bottom: layout.bottomInset + 12 },
            pressed && styles.pressed,
          ]}
        >
          <Ionicons color="#FFFFFF" name="add" size={30} />
        </Pressable>
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
                { paddingBottom: layout.bottomInset + 24 },
              ]}
              keyboardShouldPersistTaps="handled"
              style={[styles.sheet, { maxHeight: layout.sheetMaxHeight }]}
            >
              <View style={styles.handle} />
              {sheetMode === 'product' ? (
                <>
                  <Text style={styles.sheetTitle}>
                    {editingProduct ? 'Editar producto' : 'Nuevo producto'}
                  </Text>
                  <Pressable
                    accessibilityLabel="Elegir foto del producto"
                    onPress={() => void chooseProductPhoto()}
                    style={styles.photoPicker}
                  >
                    {imageData ? (
                      <Image
                        source={{ uri: imageData }}
                        style={styles.photoPickerImage}
                      />
                    ) : (
                      <>
                        <Ionicons
                          color="#805E21"
                          name="image-outline"
                          size={25}
                        />
                        <Text style={styles.photoPickerLabel}>
                          Agregar foto del producto
                        </Text>
                      </>
                    )}
                  </Pressable>
                  {imageData ? (
                    <Pressable
                      onPress={() => setImageData(null)}
                      style={styles.removePhoto}
                    >
                      <Text style={styles.removePhotoLabel}>Quitar foto</Text>
                    </Pressable>
                  ) : null}
                  <Field label="Nombre" onChange={setName} value={name} />
                  <Field label="SKU (opcional)" onChange={setSku} value={sku} />
                  <Field
                    keyboardType="decimal-pad"
                    label="Costo"
                    onChange={setCost}
                    value={cost}
                  />
                  <Field
                    keyboardType="decimal-pad"
                    label="Precio de venta"
                    onChange={setPrice}
                    value={price}
                  />
                  <Field
                    keyboardType="number-pad"
                    label="Stock mínimo"
                    onChange={setMinimumStock}
                    value={minimumStock}
                  />
                  <Field
                    keyboardType="number-pad"
                    label="Existencia inicial"
                    onChange={setInitialStock}
                    value={initialStock}
                  />
                  <SheetActions
                    isPending={saveProduct.isPending}
                    onCancel={() => setIsSheetOpen(false)}
                    onConfirm={() => saveProduct.mutate()}
                  />
                </>
              ) : (
                <>
                  <Text style={styles.sheetTitle}>Ajustar existencias</Text>
                  <Text style={styles.sheetSubtitle}>
                    {selectedProduct?.name} · actual{' '}
                    {selectedProduct?.quantityOnHand ?? 0}
                  </Text>
                  <Text style={styles.label}>Tipo de movimiento</Text>
                  <View style={styles.chips}>
                    {(
                      [
                        ['purchase', 'Compra'],
                        ['return', 'Devolución'],
                        ['loss', 'Pérdida'],
                        ['adjustment_in', 'Ajuste +'],
                        ['adjustment_out', 'Ajuste -'],
                      ] as const
                    ).map(([value, label]) => (
                      <Chip
                        active={adjustmentType === value}
                        key={value}
                        label={label}
                        onPress={() => setAdjustmentType(value)}
                      />
                    ))}
                  </View>
                  <Field
                    keyboardType="number-pad"
                    label="Cantidad"
                    onChange={setAdjustmentQuantity}
                    value={adjustmentQuantity}
                  />
                  {adjustmentType === 'purchase' ? (
                    <Field
                      keyboardType="decimal-pad"
                      label="Costo unitario"
                      onChange={setCost}
                      value={cost}
                    />
                  ) : null}
                  <Field
                    label="Motivo"
                    onChange={setAdjustmentNotes}
                    value={adjustmentNotes}
                  />
                  <SheetActions
                    isPending={adjustStock.isPending}
                    onCancel={() => setIsSheetOpen(false)}
                    onConfirm={() => adjustStock.mutate()}
                  />
                </>
              )}
            </ScrollView>
          </View>
        </KeyboardAvoidingView>
      </Modal>
    </SafeAreaView>
  );
}

function TabButton({
  active,
  label,
  onPress,
}: {
  readonly active: boolean;
  readonly label: string;
  readonly onPress: () => void;
}) {
  return (
    <Pressable
      onPress={onPress}
      style={[styles.tab, active && styles.tabActive]}
    >
      <Text style={[styles.tabText, active && styles.tabTextActive]}>
        {label}
      </Text>
    </Pressable>
  );
}

function Chip({
  active,
  label,
  onPress,
}: {
  readonly active: boolean;
  readonly label: string;
  readonly onPress: () => void;
}) {
  return (
    <Pressable
      onPress={onPress}
      style={[styles.chip, active && styles.chipActive]}
    >
      <Text style={[styles.chipText, active && styles.chipTextActive]}>
        {label}
      </Text>
    </Pressable>
  );
}

function SummaryCard({
  alert,
  label,
  value,
}: {
  readonly alert?: boolean;
  readonly label: string;
  readonly value: string;
}) {
  return (
    <View style={[styles.summaryCard, alert && styles.summaryCardAlert]}>
      <Text style={[styles.summaryValue, alert && styles.stockAlert]}>
        {value}
      </Text>
      <Text style={styles.muted}>{label}</Text>
    </View>
  );
}

function Field({
  keyboardType,
  label,
  onChange,
  placeholder,
  value,
}: {
  readonly keyboardType?: 'decimal-pad' | 'number-pad';
  readonly label: string;
  readonly onChange: (value: string) => void;
  readonly placeholder?: string;
  readonly value: string;
}) {
  return (
    <>
      <Text style={styles.label}>{label}</Text>
      <TextInput
        accessibilityLabel={label}
        keyboardType={keyboardType}
        onChangeText={onChange}
        placeholder={placeholder}
        placeholderTextColor="#8B96A5"
        style={styles.input}
        value={value}
      />
    </>
  );
}

function SheetActions({
  isPending,
  onCancel,
  onConfirm,
}: {
  readonly isPending: boolean;
  readonly onCancel: () => void;
  readonly onConfirm: () => void;
}) {
  return (
    <View style={styles.sheetActions}>
      <Pressable onPress={onCancel} style={styles.cancelButton}>
        <Text style={styles.cancelText}>Cancelar</Text>
      </Pressable>
      <Pressable
        disabled={isPending}
        onPress={onConfirm}
        style={styles.confirmButton}
      >
        <Text style={styles.confirmText}>
          {isPending ? 'Guardando…' : 'Guardar'}
        </Text>
      </Pressable>
    </View>
  );
}

const styles = StyleSheet.create({
  backdrop: StyleSheet.absoluteFill,
  cancelButton: {
    alignItems: 'center',
    borderColor: '#D7DBE0',
    borderRadius: 16,
    borderWidth: 1,
    flex: 1,
    paddingVertical: 15,
  },
  cancelText: { color: '#46505C', fontSize: 15, fontWeight: '800' },
  chip: {
    backgroundColor: '#FFFFFF',
    borderColor: '#E3D7BF',
    borderRadius: 99,
    borderWidth: 1,
    paddingHorizontal: 14,
    paddingVertical: 9,
  },
  chipActive: { backgroundColor: '#805E21', borderColor: '#805E21' },
  chipText: { color: '#805E21', fontSize: 13, fontWeight: '800' },
  chipTextActive: { color: '#FFFFFF' },
  chips: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  confirmButton: {
    alignItems: 'center',
    backgroundColor: '#805E21',
    borderRadius: 16,
    flex: 1,
    paddingVertical: 15,
  },
  confirmText: { color: '#FFFFFF', fontSize: 15, fontWeight: '900' },
  content: {
    alignSelf: 'center',
    gap: 16,
    maxWidth: 760,
    paddingBottom: 60,
    paddingHorizontal: 20,
    paddingTop: 18,
    width: '100%',
  },
  empty: { alignItems: 'center', gap: 8, paddingVertical: 48 },
  emptyTitle: { color: '#18202B', fontSize: 18, fontWeight: '800' },
  error: { color: '#B54747', fontSize: 14, fontWeight: '700' },
  filterButton: {
    alignItems: 'center',
    alignSelf: 'flex-start',
    backgroundColor: '#FFF9ED',
    borderRadius: 14,
    flexDirection: 'row',
    gap: 8,
    paddingHorizontal: 14,
    paddingVertical: 11,
  },
  filterButtonActive: { backgroundColor: '#805E21' },
  filterText: { color: '#805E21', fontSize: 13, fontWeight: '800' },
  filterTextActive: { color: '#FFFFFF' },
  floatingAddButton: {
    alignItems: 'center',
    backgroundColor: appTheme.colors.accent,
    borderRadius: 30,
    bottom: 24,
    height: 60,
    justifyContent: 'center',
    position: 'absolute',
    right: 22,
    width: 60,
    zIndex: 10,
    ...goldButtonShadow,
  },
  handle: {
    alignSelf: 'center',
    backgroundColor: '#D2D7DD',
    borderRadius: 99,
    height: 5,
    marginBottom: 16,
    width: 46,
  },
  header: {
    alignItems: 'center',
    backgroundColor: '#FFFFFF',
    borderBottomColor: '#ECEFF2',
    borderBottomWidth: 1,
    flexDirection: 'row',
    paddingHorizontal: 20,
    paddingVertical: 15,
  },
  headerButton: {
    alignItems: 'center',
    backgroundColor: '#FFFFFF',
    borderRadius: 22,
    height: 44,
    justifyContent: 'center',
    width: 44,
    ...goldButtonShadow,
  },
  headerCopy: { flex: 1, marginHorizontal: 12 },
  input: {
    backgroundColor: '#F7F8FA',
    borderColor: '#E2E5E9',
    borderRadius: 15,
    borderWidth: 1,
    color: '#18202B',
    fontSize: 16,
    marginTop: 7,
    paddingHorizontal: 15,
    paddingVertical: 13,
  },
  label: {
    color: '#46505C',
    fontSize: 13,
    fontWeight: '800',
    marginTop: 15,
  },
  list: { gap: 12 },
  movementCard: {
    alignItems: 'flex-start',
    backgroundColor: '#FFFFFF',
    borderRadius: 18,
    flexDirection: 'row',
    justifyContent: 'space-between',
    padding: 16,
  },
  movementIn: { color: '#288B52', fontSize: 17, fontWeight: '900' },
  movementNotes: { color: '#46505C', fontSize: 13, marginTop: 6 },
  movementOut: { color: '#B54747', fontSize: 17, fontWeight: '900' },
  movementValue: { alignItems: 'flex-end', marginLeft: 12 },
  muted: { color: '#6B7480', fontSize: 13, lineHeight: 19 },
  overlay: {
    backgroundColor: 'rgba(17,24,39,0.35)',
    flex: 1,
    justifyContent: 'flex-end',
  },
  photoPicker: {
    alignItems: 'center',
    backgroundColor: '#F7F8FA',
    borderColor: '#E2E5E9',
    borderRadius: 15,
    borderWidth: 1,
    height: 112,
    justifyContent: 'center',
    marginTop: 16,
    overflow: 'hidden',
  },
  orderActions: { flexDirection: 'row', gap: 18 },
  orderCancelButton: { alignSelf: 'flex-start', marginTop: 8 },
  orderCancelText: { color: '#805E21', fontSize: 13, fontWeight: '800' },
  orderTotal: { color: '#18202B', fontSize: 16, fontWeight: '900' },
  deleteSmallButton: { backgroundColor: '#FDECEC' },
  photoPickerImage: { height: '100%', width: '100%' },
  photoPickerLabel: {
    color: '#805E21',
    fontSize: 13,
    fontWeight: '800',
    marginTop: 7,
  },
  productActions: { gap: 8 },
  productCard: {
    alignItems: 'center',
    backgroundColor: '#FFFFFF',
    borderRadius: 20,
    flexDirection: 'row',
    padding: 15,
  },
  productCopy: { flex: 1, marginHorizontal: 12 },
  productIcon: {
    alignItems: 'center',
    backgroundColor: '#FFF7E7',
    borderRadius: 16,
    height: 50,
    justifyContent: 'center',
    width: 50,
  },
  productIconAlert: { backgroundColor: '#FDECEC' },
  productImage: { height: '100%', width: '100%' },
  productName: { color: '#18202B', fontSize: 16, fontWeight: '800' },
  pressed: { opacity: 0.74, transform: [{ scale: 0.98 }] },
  removePhoto: { alignSelf: 'flex-start', marginTop: 8 },
  removePhotoLabel: { color: '#B54747', fontSize: 13, fontWeight: '800' },
  reverseButton: { alignSelf: 'flex-start', marginTop: 8 },
  reverseText: { color: '#B54747', fontSize: 13, fontWeight: '800' },
  reversedText: {
    color: '#697386',
    fontSize: 12,
    fontWeight: '700',
    marginTop: 8,
  },
  screen: { backgroundColor: '#F5F6F8', flex: 1 },
  modalKeyboard: { flex: 1 },
  sheet: {
    backgroundColor: '#FFFFFF',
    borderTopLeftRadius: 28,
    borderTopRightRadius: 28,
  },
  sheetActions: { flexDirection: 'row', gap: 12, marginTop: 24 },
  sheetContent: { padding: 22, paddingBottom: 36 },
  sheetSubtitle: { color: '#6B7480', fontSize: 14, marginTop: 5 },
  sheetTitle: { color: '#18202B', fontSize: 23, fontWeight: '900' },
  smallButton: {
    alignItems: 'center',
    backgroundColor: '#FFF9ED',
    borderRadius: 12,
    height: 36,
    justifyContent: 'center',
    width: 36,
  },
  stock: { color: '#288B52', fontSize: 13, fontWeight: '700', marginTop: 4 },
  stockAlert: { color: '#B54747' },
  subtitle: { color: '#6B7480', fontSize: 12, marginTop: 2 },
  summaryCard: {
    backgroundColor: '#FFFFFF',
    borderRadius: 17,
    flex: 1,
    minWidth: 100,
    padding: 14,
  },
  summaryCardAlert: { backgroundColor: '#FFF1F1' },
  summaryGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 10 },
  summaryValue: { color: '#18202B', fontSize: 19, fontWeight: '900' },
  tab: {
    alignItems: 'center',
    borderBottomColor: 'transparent',
    borderBottomWidth: 3,
    flex: 1,
    paddingVertical: 12,
  },
  tabActive: { borderBottomColor: '#805E21' },
  tabText: { color: '#6B7480', fontSize: 14, fontWeight: '700' },
  tabTextActive: { color: '#805E21', fontWeight: '900' },
  tabs: { backgroundColor: '#FFFFFF', flexDirection: 'row' },
  title: { color: appTheme.colors.text, fontSize: 22, fontWeight: '900' },
});
