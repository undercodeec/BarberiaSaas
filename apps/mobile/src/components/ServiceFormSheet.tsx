import Ionicons from '@expo/vector-icons/Ionicons';
import * as ImagePicker from 'expo-image-picker';
import { useEffect, useRef, useState } from 'react';
import { Image, Keyboard, KeyboardAvoidingView, LayoutAnimation, Modal, Platform, Pressable, ScrollView as NativeScrollView, StyleSheet, Text, TextInput, useWindowDimensions, View, type GestureResponderEvent, type TextInputProps } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { appTheme, goldButtonShadow } from './BottomNavigation';
import { KeyboardAwareScrollView as ScrollView } from './KeyboardAwareScrollView';
import { NavaButton } from './NavaButton';

export interface ServiceDraft {
  readonly agendaColor: string;
  readonly category: ServiceCategory | null;
  readonly description: string;
  readonly downPaymentPercentage: number;
  readonly durationMinutes: number;
  readonly imageUri: string | null;
  readonly name: string;
  readonly onlineBooking: boolean;
  readonly price: number;
  readonly priceType: PriceType;
  readonly showServiceTime: boolean;
  readonly tax: ServiceTax | null;
}

type PriceType = 'fixed' | 'from' | 'free' | 'hidden';

interface ServiceCategory {
  readonly description: string;
  readonly name: string;
}

interface ServiceTax {
  readonly addAtCheckout: boolean;
  readonly addAtPurchaseEnd: boolean;
  readonly name: string;
  readonly percentage: number;
}

const PRICE_TYPES: Record<PriceType, string> = {
  fixed: 'Precio fijo',
  from: 'Precio a partir de',
  free: 'Gratis',
  hidden: 'No mostrar',
};

const AGENDA_COLORS = ['#EF4444', '#F97316', '#F59E0B', '#EAB308', '#84CC16', '#22C55E', '#10B981', '#14B8A6', '#06B6D4', '#0EA5E9', '#3B82F6', '#2563EB', '#4F46E5', '#6366F1', '#8B5CF6', '#A855F7', '#C026D3', '#DB2777', '#E11D48', '#F43F5E', '#7F1D1D', '#9A3412', '#92400E', '#854D0E', '#3F6212', '#166534', '#065F46', '#115E59', '#155E75', '#075985', '#2464E8', '#1E40AF', '#3730A3', '#5B21B6', '#6B21A8', '#86198F', '#9D174D', '#BE123C', '#475569', '#111827'] as const;

interface ServiceFormSheetProps {
  readonly initialValue?: ServiceDraft | null;
  readonly onClose: () => void;
  readonly onSave: (service: ServiceDraft) => Promise<void>;
  readonly visible: boolean;
}

function isPositiveNumber(value: string) {
  const parsed = Number(value.replace(',', '.'));
  return Number.isFinite(parsed) && parsed > 0;
}

export function ServiceFormSheet({ initialValue = null, onClose, onSave, visible }: ServiceFormSheetProps) {
  const { height } = useWindowDimensions();
  const insets = useSafeAreaInsets();
  const formScrollRef = useRef<NativeScrollView>(null);
  const [keyboardVisible, setKeyboardVisible] = useState(false);
  const sheetMaxHeight = Math.min(Math.max(320, height - insets.top - 12), Math.round(height * 0.9));
  const [name, setName] = useState(initialValue?.name ?? '');
  const [description, setDescription] = useState(initialValue?.description ?? '');
  const [duration, setDuration] = useState(initialValue ? String(initialValue.durationMinutes) : '');
  const [price, setPrice] = useState(initialValue ? String(initialValue.price) : '');
  const [priceType, setPriceType] = useState<PriceType>(initialValue?.priceType ?? 'fixed');
  const [priceMenuOpen, setPriceMenuOpen] = useState(false);
  const [additionalOpen, setAdditionalOpen] = useState(false);
  const [onlineBooking, setOnlineBooking] = useState(initialValue?.onlineBooking ?? true);
  const [showServiceTime, setShowServiceTime] = useState(initialValue?.showServiceTime ?? true);
  const [category, setCategory] = useState<ServiceCategory | null>(initialValue?.category ?? null);
  const [tax, setTax] = useState<ServiceTax | null>(initialValue?.tax ?? null);
  const [categoryModalOpen, setCategoryModalOpen] = useState(false);
  const [taxModalOpen, setTaxModalOpen] = useState(false);
  const [imageUri, setImageUri] = useState<string | null>(initialValue?.imageUri ?? null);
  const [imageError, setImageError] = useState<string | null>(null);
  const [agendaColor, setAgendaColor] = useState(initialValue?.agendaColor ?? '#111827');
  const [downPaymentPercentage, setDownPaymentPercentage] = useState(initialValue?.downPaymentPercentage ?? 20);
  const [saveError, setSaveError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [submitted, setSubmitted] = useState(false);

  const reset = () => {
    setName('');
    setDescription('');
    setDuration('');
    setPrice('');
    setPriceType('fixed');
    setPriceMenuOpen(false);
    setAdditionalOpen(false);
    setOnlineBooking(true);
    setShowServiceTime(true);
    setCategory(null);
    setTax(null);
    setImageUri(null);
    setImageError(null);
    setAgendaColor('#111827');
    setDownPaymentPercentage(20);
    setSaveError(null);
    setSubmitted(false);
  };

  const close = () => {
    reset();
    onClose();
  };

  const save = async () => {
    setSubmitted(true);
    setSaveError(null);
    const normalizedName = name.trim();
    const needsPrice = priceType === 'fixed' || priceType === 'from';
    if (!normalizedName || !isPositiveNumber(duration) || (needsPrice && !isPositiveNumber(price))) return;

    try {
      setSaving(true);
      await onSave({
        agendaColor,
        category,
        description: description.trim(),
        downPaymentPercentage,
        durationMinutes: Math.round(Number(duration.replace(',', '.'))),
        imageUri,
        name: normalizedName,
        onlineBooking,
        price: needsPrice ? Number(price.replace(',', '.')) : 0,
        priceType,
        showServiceTime,
        tax,
      });
      reset();
    } catch (error) {
      setSaveError(error instanceof Error ? error.message : 'No fue posible guardar el servicio. Int\u00e9ntalo nuevamente.');
    } finally {
      setSaving(false);
    }
  };

  const selectImage = async () => {
    setImageError(null);
    const permission = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (!permission.granted) {
      setImageError('Permite el acceso a tus fotos para elegir una imagen.');
      return;
    }
    const result = await ImagePicker.launchImageLibraryAsync({
      allowsEditing: true,
      aspect: [4, 3],
      mediaTypes: ['images'],
      quality: 0.8,
    });
    if (!result.canceled) setImageUri(result.assets[0]?.uri ?? null);
  };

  const toggleAdditional = () => {
    LayoutAnimation.configureNext(LayoutAnimation.Presets.easeInEaseOut);
    setAdditionalOpen((current) => !current);
  };

  useEffect(() => {
    const showSubscription = Keyboard.addListener('keyboardDidShow', () =>
      setKeyboardVisible(true),
    );
    const hideSubscription = Keyboard.addListener('keyboardDidHide', () =>
      setKeyboardVisible(false),
    );
    return () => {
      showSubscription.remove();
      hideSubscription.remove();
    };
  }, []);

  const keepFocusedFieldVisible: NonNullable<TextInputProps['onFocus']> = (
    event,
  ) => {
    const target = event.nativeEvent?.target ?? event.target;
    const scrollToFocusedField = () => {
      const scrollView = formScrollRef.current;
      if (!scrollView || target == null) return;
      scrollView.scrollResponderScrollNativeHandleToKeyboard(target, 32, true);
    };

    requestAnimationFrame(scrollToFocusedField);
    setTimeout(scrollToFocusedField, 220);
  };

  return (
    <Modal animationType="fade" navigationBarTranslucent onRequestClose={close} statusBarTranslucent transparent visible={visible}>
      <View style={styles.layer}>
        <Pressable accessibilityLabel="Cerrar formulario de servicio" accessibilityRole="button" onPress={close} style={styles.backdrop} />

        <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : 'height'} pointerEvents="box-none" style={styles.keyboardArea}>
          <View style={[styles.sheet, { maxHeight: sheetMaxHeight }]}>
            <View style={styles.handle} />
            <ScrollView contentContainerStyle={[styles.content, keyboardVisible ? styles.contentWithKeyboard : null]} keyboardDismissMode="on-drag" keyboardExtraOffset={36} keyboardShouldPersistTaps="handled" overScrollMode="never" ref={formScrollRef} showsVerticalScrollIndicator={false} style={styles.scroll}>
              <View style={styles.header}>
                <View style={styles.headerCopy}>
                  <Text accessibilityRole="header" style={styles.title}>
                    Añadir servicio
                  </Text>
                  <Text style={styles.subtitle}>Define lo que ofrecerás a tus clientes.</Text>
                </View>
                <Pressable accessibilityLabel="Cerrar" accessibilityRole="button" onPress={close} style={styles.closeButton}>
                  <Ionicons color="#667080" name="close" size={24} />
                </Pressable>
              </View>

              <View style={styles.field}>
                <Text style={styles.label}>
                  Nombre del servicio <Text style={styles.required}>*</Text>
                </Text>
                <View style={[styles.inputShell, submitted && !name.trim() ? styles.inputError : null]}>
                  <Ionicons color="#667080" name="cut-outline" size={21} />
                  <TextInput onChangeText={setName} onFocus={keepFocusedFieldVisible} placeholder="Ej. Corte clásico" placeholderTextColor="#98a0ab" style={styles.input} value={name} />
                </View>
                {submitted && !name.trim() ? (
                  <Text accessibilityRole="alert" style={styles.error}>
                    El nombre del servicio es obligatorio.
                  </Text>
                ) : null}
              </View>

              <View style={styles.field}>
                <Text style={styles.label}>Descripción del servicio (opcional)</Text>
                <TextInput multiline onChangeText={setDescription} onFocus={keepFocusedFieldVisible} placeholder="Describe brevemente el servicio" placeholderTextColor="#98a0ab" style={[styles.inputShell, styles.textArea]} textAlignVertical="top" value={description} />
              </View>

              <View style={styles.fieldRow}>
                <View style={styles.rowField}>
                  <Text style={styles.label}>
                    Duración <Text style={styles.required}>*</Text>
                  </Text>
                  <View style={[styles.inputShell, submitted && !isPositiveNumber(duration) ? styles.inputError : null]}>
                    <Ionicons color="#667080" name="time-outline" size={21} />
                    <TextInput accessibilityLabel="Duración en minutos" keyboardType="number-pad" onChangeText={setDuration} onFocus={keepFocusedFieldVisible} placeholder="30 min" placeholderTextColor="#98a0ab" style={styles.input} value={duration} />
                  </View>
                  {submitted && !isPositiveNumber(duration) ? (
                    <Text accessibilityRole="alert" style={styles.error}>
                      Ingresa una duración válida.
                    </Text>
                  ) : null}
                </View>

                <View style={styles.rowField}>
                  <Text style={styles.label}>Precio {priceType === 'fixed' || priceType === 'from' ? <Text style={styles.required}>*</Text> : null}</Text>
                  <View style={[styles.inputShell, submitted && (priceType === 'fixed' || priceType === 'from') && !isPositiveNumber(price) ? styles.inputError : null]}>
                    <Text style={styles.currency}>$</Text>
                    <TextInput accessibilityLabel="Precio del servicio" editable={priceType === 'fixed' || priceType === 'from'} keyboardType="decimal-pad" onChangeText={setPrice} onFocus={keepFocusedFieldVisible} placeholder={priceType === 'fixed' || priceType === 'from' ? '15.00' : 'No aplica'} placeholderTextColor="#98a0ab" style={styles.input} value={price} />
                  </View>
                  {submitted && (priceType === 'fixed' || priceType === 'from') && !isPositiveNumber(price) ? (
                    <Text accessibilityRole="alert" style={styles.error}>
                      Ingresa un precio válido.
                    </Text>
                  ) : null}
                </View>
              </View>

              <Pressable accessibilityRole="button" onPress={toggleAdditional} style={styles.additionalToggle}>
                <View style={styles.additionalHeading}>
                  <Ionicons color="#101c2d" name="options-outline" size={21} />
                  <Text style={styles.additionalTitle}>Configuración adicional</Text>
                </View>
                <Ionicons color="#667080" name={additionalOpen ? 'chevron-up' : 'chevron-down'} size={21} />
              </Pressable>
              {additionalOpen ? (
                <View style={styles.additionalContent}>
                  <CheckRow checked={onlineBooking} label="Se puede reservar online" onPress={() => setOnlineBooking((current) => !current)} />
                  <CheckRow checked={showServiceTime} label="Mostrar tiempo de servicio" onPress={() => setShowServiceTime((current) => !current)} />

                  <View style={styles.field}>
                    <Text style={styles.label}>Tipo de precio</Text>
                    <Pressable accessibilityRole="button" onPress={() => setPriceMenuOpen((current) => !current)} style={styles.select}>
                      <Ionicons color="#667080" name="pricetag-outline" size={21} />
                      <Text style={styles.selectText}>{PRICE_TYPES[priceType]}</Text>
                      <Ionicons color="#667080" name={priceMenuOpen ? 'chevron-up' : 'chevron-down'} size={20} />
                    </Pressable>
                    {priceMenuOpen ? (
                      <View style={styles.optionMenu}>
                        {(Object.keys(PRICE_TYPES) as PriceType[]).map((option) => (
                          <Pressable
                            key={option}
                            onPress={() => {
                              setPriceType(option);
                              setPriceMenuOpen(false);
                            }}
                            style={styles.option}
                          >
                            <Text style={styles.optionText}>{PRICE_TYPES[option]}</Text>
                            {priceType === option ? <Ionicons color="#101c2d" name="checkmark" size={20} /> : null}
                          </Pressable>
                        ))}
                      </View>
                    ) : null}
                  </View>

                  <View style={styles.field}>
                    <View style={styles.labelRow}>
                      <Text style={styles.label}>Categoría de servicio</Text>
                      <Pressable accessibilityLabel="Información sobre categorías" onPress={() => setCategoryModalOpen(true)} style={styles.infoButton}>
                        <Ionicons color="#101c2d" name="information" size={18} />
                      </Pressable>
                    </View>
                    <Pressable accessibilityRole="button" onPress={() => setCategoryModalOpen(true)} style={styles.select}>
                      <Ionicons color="#667080" name="folder-outline" size={21} />
                      <Text style={[styles.selectText, !category ? styles.placeholder : null]}>{category?.name ?? 'Selecciona o crea una categoría'}</Text>
                      <Ionicons color="#667080" name="chevron-forward" size={20} />
                    </Pressable>
                  </View>

                  <View style={styles.field}>
                    <View style={styles.labelRow}>
                      <Text style={styles.label}>Establece el impuesto</Text>
                      <Pressable accessibilityLabel="Información sobre impuestos" onPress={() => setTaxModalOpen(true)} style={styles.infoButton}>
                        <Ionicons color="#101c2d" name="information" size={18} />
                      </Pressable>
                    </View>
                    <Pressable accessibilityRole="button" onPress={() => setTaxModalOpen(true)} style={styles.select}>
                      <Ionicons color="#667080" name="receipt-outline" size={21} />
                      <Text style={[styles.selectText, !tax ? styles.placeholder : null]}>{tax ? `${tax.name} (${tax.percentage}%)` : 'Selecciona o crea un impuesto'}</Text>
                      <Ionicons color="#667080" name="chevron-forward" size={20} />
                    </Pressable>
                  </View>

                  <View style={styles.field}>
                    <Text style={styles.label}>Imagen del servicio</Text>
                    <Pressable accessibilityRole="button" onPress={selectImage} style={styles.imageField}>
                      <View style={styles.imagePreview}>{imageUri ? <Image source={{ uri: imageUri }} style={styles.imagePreviewPhoto} /> : <Ionicons color="#667080" name="image-outline" size={28} />}</View>
                      <View style={styles.imageCopy}>
                        <Text style={styles.imageTitle}>Imagen del servicio</Text>
                        <Text style={styles.imageHint}>{imageUri ? 'Cambiar imagen' : 'Cargar imagen'}</Text>
                      </View>
                      <Ionicons color="#101c2d" name="chevron-forward" size={21} />
                    </Pressable>
                    {imageError ? (
                      <Text accessibilityRole="alert" style={styles.error}>
                        {imageError}
                      </Text>
                    ) : null}
                  </View>

                  <View style={styles.field}>
                    <Text style={styles.label}>Color de la agenda</Text>
                    <Text style={styles.fieldHint}>Elige uno de los 40 colores para identificar este servicio.</Text>
                    <View style={styles.colorGrid}>
                      {AGENDA_COLORS.map((color) => (
                        <Pressable key={color} accessibilityLabel={`Color ${color}`} onPress={() => setAgendaColor(color)} style={[styles.colorOption, { backgroundColor: color }, agendaColor === color ? styles.colorSelected : null]}>
                          {agendaColor === color ? <Ionicons color="#fff" name="checkmark" size={18} /> : null}
                        </Pressable>
                      ))}
                    </View>
                  </View>

                  <View style={styles.depositField}>
                    <PercentageSlider label="Valor del abono para reserva" onChange={setDownPaymentPercentage} value={downPaymentPercentage} />
                  </View>
                </View>
              ) : null}
            </ScrollView>
            <View
              style={[
                styles.sheetFooter,
                {
                  paddingBottom: Math.max(insets.bottom, Platform.OS === 'android' ? 12 : 8),
                },
              ]}
            >
              {saveError ? (
                <Text accessibilityRole="alert" style={styles.error}>
                  {saveError}
                </Text>
              ) : null}
              <NavaButton foregroundColor={appTheme.colors.accentDark} loading={saving} icon="checkmark-outline" label="Guardar servicio" onPress={save} style={styles.saveButton} variant="outline" />
            </View>
          </View>
        </KeyboardAvoidingView>
      </View>
      <CategoryDialog
        onClose={() => setCategoryModalOpen(false)}
        onSave={(value) => {
          setCategory(value);
          setCategoryModalOpen(false);
        }}
        visible={categoryModalOpen}
      />
      <TaxDialog
        onClose={() => setTaxModalOpen(false)}
        onSave={(value) => {
          setTax(value);
          setTaxModalOpen(false);
        }}
        visible={taxModalOpen}
      />
    </Modal>
  );
}

function CheckRow({ checked, label, onPress }: { readonly checked: boolean; readonly label: string; readonly onPress: () => void }) {
  return (
    <Pressable accessibilityRole="checkbox" accessibilityState={{ checked }} onPress={onPress} style={styles.checkboxRow}>
      <Ionicons color="#101c2d" name={checked ? 'checkbox' : 'square-outline'} size={25} />
      <Text style={styles.checkboxLabel}>{label}</Text>
    </Pressable>
  );
}

function PercentageSlider({ label, onChange, value }: { readonly label: string; readonly onChange: (value: number) => void; readonly value: number }) {
  const [trackWidth, setTrackWidth] = useState(0);
  const setValue = (event: GestureResponderEvent) => {
    if (trackWidth) onChange(Math.max(0, Math.min(100, Math.round((event.nativeEvent.locationX * 100) / trackWidth))));
  };
  return (
    <View>
      <View style={styles.sliderHeading}>
        <Text style={styles.sliderLabel}>{label}</Text>
        <Text style={styles.sliderValue}>{value}%</Text>
      </View>
      <View accessibilityLabel={`${label}: ${value}%`} accessibilityRole="adjustable" onLayout={(event) => setTrackWidth(event.nativeEvent.layout.width)} onMoveShouldSetResponder={() => true} onResponderGrant={setValue} onResponderMove={setValue} onResponderRelease={setValue} onResponderTerminationRequest={() => false} onStartShouldSetResponder={() => true} style={styles.sliderTrack}>
        <View pointerEvents="none" style={[styles.sliderFill, { width: `${value}%` }]} />
        <View pointerEvents="none" style={[styles.sliderThumb, { left: `${value}%` }]} />
      </View>
    </View>
  );
}

function Dialog({ children, onClose, visible }: { readonly children: React.ReactNode; readonly onClose: () => void; readonly visible: boolean }) {
  const { height } = useWindowDimensions();
  const insets = useSafeAreaInsets();
  return (
    <Modal
      animationType="fade"
      navigationBarTranslucent
      onRequestClose={onClose}
      statusBarTranslucent
      transparent
      visible={visible}
    >
      <KeyboardAvoidingView
        behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
        style={styles.dialogLayer}
      >
        <Pressable onPress={onClose} style={styles.dialogBackdrop} />
        <ScrollView
          contentContainerStyle={styles.dialogContent}
          keyboardShouldPersistTaps="handled"
          showsVerticalScrollIndicator={false}
          style={[
            styles.dialog,
            {
              maxHeight: Math.max(1, height - insets.top - insets.bottom - 32),
            },
          ]}
        >
          <Pressable accessibilityLabel="Cerrar" onPress={onClose} style={styles.dialogClose}>
            <Ionicons color="#667080" name="close" size={21} />
          </Pressable>
          {children}
        </ScrollView>
      </KeyboardAvoidingView>
    </Modal>
  );
}

function CategoryDialog({ onClose, onSave, visible }: { readonly onClose: () => void; readonly onSave: (category: ServiceCategory) => void; readonly visible: boolean }) {
  const [creating, setCreating] = useState(false);
  const [name, setName] = useState('');
  const [description, setDescription] = useState('');
  const close = () => {
    setCreating(false);
    setName('');
    setDescription('');
    onClose();
  };
  const save = () => {
    if (name.trim()) {
      onSave({ name: name.trim(), description: description.trim() });
      setCreating(false);
      setName('');
      setDescription('');
    }
  };
  return (
    <Dialog onClose={close} visible={visible}>
      {creating ? (
        <>
          <Text style={styles.dialogTitle}>Añadir categoría de servicio</Text>
          <Text style={styles.dialogCopy}>Añade los detalles de la categoría.</Text>
          <Text style={styles.label}>Nombre</Text>
          <TextInput onChangeText={setName} placeholder="Ej. Cortes" placeholderTextColor="#98a0ab" style={styles.dialogInput} value={name} />
          <Text style={styles.label}>Descripción</Text>
          <TextInput multiline onChangeText={setDescription} placeholder="Describe esta categoría" placeholderTextColor="#98a0ab" style={[styles.dialogInput, styles.dialogTextArea]} textAlignVertical="top" value={description} />
          <NavaButton icon="checkmark-outline" label="Guardar cambios" onPress={save} style={styles.dialogButton} variant="primary" />
        </>
      ) : (
        <>
          <View style={styles.dialogIcon}>
            <Ionicons color="#101c2d" name="information" size={28} />
          </View>
          <Text style={styles.dialogTitle}>Categoría de servicio</Text>
          <Text style={styles.dialogCopy}>Debes crear una categoría y añadir sus detalles antes de asociarla a este servicio.</Text>
          <NavaButton icon="add-outline" label="Crear categoría" onPress={() => setCreating(true)} style={styles.dialogButton} variant="primary" />
        </>
      )}
    </Dialog>
  );
}

function TaxDialog({ onClose, onSave, visible }: { readonly onClose: () => void; readonly onSave: (tax: ServiceTax) => void; readonly visible: boolean }) {
  const [creating, setCreating] = useState(false);
  const [name, setName] = useState('');
  const [percentage, setPercentage] = useState(15);
  const [checkout, setCheckout] = useState(true);
  const [purchaseEnd, setPurchaseEnd] = useState(false);
  const [showInfo, setShowInfo] = useState(false);
  const close = () => {
    setCreating(false);
    setName('');
    setPercentage(15);
    setCheckout(true);
    setPurchaseEnd(false);
    setShowInfo(false);
    onClose();
  };
  const save = () => {
    if (name.trim()) {
      onSave({
        name: name.trim(),
        percentage,
        addAtCheckout: checkout,
        addAtPurchaseEnd: purchaseEnd,
      });
      close();
    }
  };
  return (
    <Dialog onClose={close} visible={visible}>
      {creating ? (
        <>
          <Text style={styles.dialogTitle}>Añadir impuesto</Text>
          <Text style={styles.label}>Nombre</Text>
          <TextInput onChangeText={setName} placeholder="Ej. IVA" placeholderTextColor="#98a0ab" style={styles.dialogInput} value={name} />
          <PercentageSlider label="Valor de impuesto" onChange={setPercentage} value={percentage} />
          <View style={styles.taxOptions}>
            <View style={styles.taxHeader}>
              <Text style={styles.label}>Aplicación del impuesto</Text>
              <Pressable accessibilityLabel="Información sobre impuesto" onPress={() => setShowInfo((current) => !current)} style={styles.infoButton}>
                <Ionicons color="#101c2d" name="information" size={18} />
              </Pressable>
            </View>
            {showInfo ? <Text style={styles.taxInfo}>Puedes añadir el impuesto durante el checkout o aplicarlo al finalizar la compra.</Text> : null}
            <CheckRow checked={checkout} label="Añadir el impuesto en el servicio con checkout" onPress={() => setCheckout((current) => !current)} />
            <CheckRow checked={purchaseEnd} label="Añadir impuesto al finalizar la compra" onPress={() => setPurchaseEnd((current) => !current)} />
          </View>
          <NavaButton icon="checkmark-outline" label="Guardar" onPress={save} style={styles.dialogButton} variant="primary" />
        </>
      ) : (
        <>
          <View style={styles.dialogIcon}>
            <Ionicons color="#101c2d" name="information" size={28} />
          </View>
          <Text style={styles.dialogTitle}>Impuesto del servicio</Text>
          <Text style={styles.dialogCopy}>Crea un impuesto y define cómo debe aplicarse a este servicio.</Text>
          <NavaButton icon="add-outline" label="Crear impuesto" onPress={() => setCreating(true)} style={styles.dialogButton} variant="primary" />
        </>
      )}
    </Dialog>
  );
}

const styles = StyleSheet.create({
  additionalContent: {
    backgroundColor: appTheme.colors.surfaceMuted,
    borderRadius: 18,
    borderWidth: 0,
    marginBottom: 17,
    marginTop: -8,
    padding: 14,
  },
  additionalHeading: { alignItems: 'center', flexDirection: 'row', gap: 9 },
  additionalTitle: {
    color: appTheme.colors.text,
    fontSize: 15,
    fontWeight: '800',
  },
  additionalToggle: {
    alignItems: 'center',
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginBottom: 17,
    minHeight: 56,
  },
  backdrop: {
    ...StyleSheet.absoluteFill,
    backgroundColor: appTheme.colors.overlay,
  },
  closeButton: {
    alignItems: 'center',
    backgroundColor: appTheme.colors.surfaceMuted,
    borderRadius: 18,
    height: 36,
    justifyContent: 'center',
    width: 36,
  },
  checkboxLabel: {
    color: appTheme.colors.text,
    flex: 1,
    fontSize: 14,
    fontWeight: '700',
  },
  checkboxRow: {
    alignItems: 'center',
    flexDirection: 'row',
    gap: 10,
    paddingVertical: 7,
  },
  colorGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 10, marginTop: 12 },
  colorOption: {
    alignItems: 'center',
    borderColor: 'rgba(16, 28, 45, 0.18)',
    borderRadius: 16,
    borderWidth: 1,
    height: 32,
    justifyContent: 'center',
    width: 32,
  },
  colorSelected: {
    borderColor: '#101c2d',
    borderWidth: 3,
    transform: [{ scale: 1.12 }],
  },
  content: {
    paddingBottom: 18,
    paddingHorizontal: 22,
  },
  contentWithKeyboard: { paddingBottom: 176 },
  currency: {
    color: appTheme.colors.textMuted,
    fontSize: 18,
    fontWeight: '800',
  },
  depositField: {
    backgroundColor: appTheme.colors.surfaceMuted,
    borderRadius: 18,
    borderWidth: 0,
    marginBottom: 17,
    padding: 15,
  },
  dialog: {
    backgroundColor: appTheme.colors.surface,
    borderRadius: 25,
    maxWidth: 540,
    width: '88%',
  },
  dialogContent: { padding: 22 },
  dialogBackdrop: {
    ...StyleSheet.absoluteFill,
    backgroundColor: appTheme.colors.overlay,
  },
  dialogButton: {
    backgroundColor: appTheme.colors.surface,
    borderWidth: 0,
    flexBasis: 'auto',
    flexGrow: 0,
    height: 58,
    marginTop: 20,
    transform: [{ translateY: -3 }],
    width: '100%',
    ...goldButtonShadow,
  },
  dialogClose: {
    alignItems: 'center',
    alignSelf: 'flex-end',
    backgroundColor: appTheme.colors.surfaceMuted,
    borderRadius: 16,
    height: 32,
    justifyContent: 'center',
    marginBottom: 8,
    width: 32,
  },
  dialogCopy: {
    color: appTheme.colors.textMuted,
    fontSize: 15,
    lineHeight: 22,
    marginBottom: 20,
  },
  dialogIcon: {
    alignItems: 'center',
    backgroundColor: appTheme.colors.accentSubtle,
    borderRadius: 24,
    height: 48,
    justifyContent: 'center',
    marginBottom: 14,
    width: 48,
  },
  dialogInput: {
    backgroundColor: appTheme.colors.surfaceMuted,
    borderRadius: 14,
    borderWidth: 0,
    color: appTheme.colors.text,
    fontSize: 16,
    marginBottom: 15,
    minHeight: 54,
    paddingHorizontal: 14,
    paddingVertical: 12,
  },
  dialogLayer: { alignItems: 'center', flex: 1, justifyContent: 'center' },
  dialogTextArea: { minHeight: 84 },
  dialogTitle: {
    color: appTheme.colors.text,
    fontSize: 22,
    fontWeight: '900',
    marginBottom: 8,
  },
  error: {
    color: '#bd2d2d',
    fontSize: 13,
    marginTop: 6,
  },
  field: {
    marginBottom: 17,
  },
  fieldHint: { color: appTheme.colors.textMuted, fontSize: 13, lineHeight: 19 },
  fieldRow: {
    flexDirection: 'row',
    gap: 12,
  },
  handle: {
    alignSelf: 'center',
    backgroundColor: '#dfe2e5',
    borderRadius: 99,
    height: 6,
    marginBottom: 18,
    marginTop: 12,
    width: 62,
  },
  header: {
    alignItems: 'flex-start',
    flexDirection: 'row',
    gap: 14,
    justifyContent: 'space-between',
    marginBottom: 24,
  },
  headerCopy: {
    flex: 1,
  },
  imageCopy: { flex: 1 },
  imageField: {
    alignItems: 'center',
    backgroundColor: appTheme.colors.surfaceMuted,
    borderRadius: 15,
    borderWidth: 0,
    flexDirection: 'row',
    gap: 13,
    minHeight: 76,
    padding: 10,
  },
  imageHint: {
    color: appTheme.colors.accentDark,
    fontSize: 13,
    fontWeight: '700',
    marginTop: 3,
  },
  imagePreview: {
    alignItems: 'center',
    backgroundColor: appTheme.colors.surface,
    borderRadius: 12,
    height: 54,
    justifyContent: 'center',
    overflow: 'hidden',
    width: 66,
  },
  imagePreviewPhoto: { height: '100%', width: '100%' },
  imageTitle: { color: appTheme.colors.text, fontSize: 15, fontWeight: '800' },
  infoButton: {
    alignItems: 'center',
    height: 26,
    justifyContent: 'center',
    width: 26,
  },
  input: {
    color: appTheme.colors.text,
    flex: 1,
    fontSize: 16,
    minHeight: 54,
  },
  inputError: {
    borderColor: '#bd2d2d',
  },
  inputShell: {
    alignItems: 'center',
    backgroundColor: appTheme.colors.surfaceMuted,
    borderRadius: 15,
    borderWidth: 0,
    flexDirection: 'row',
    gap: 11,
    minHeight: 56,
    paddingHorizontal: 15,
  },
  keyboardArea: {
    flex: 1,
    justifyContent: 'flex-end',
  },
  label: {
    color: '#101c2d',
    fontSize: 14,
    fontWeight: '800',
    marginBottom: 8,
  },
  labelRow: {
    alignItems: 'center',
    flexDirection: 'row',
    justifyContent: 'space-between',
  },
  layer: {
    flex: 1,
    justifyContent: 'flex-end',
  },
  option: {
    alignItems: 'center',
    borderBottomColor: '#eceef1',
    borderBottomWidth: 1,
    flexDirection: 'row',
    justifyContent: 'space-between',
    minHeight: 50,
    paddingHorizontal: 15,
  },
  optionMenu: {
    backgroundColor: appTheme.colors.surface,
    borderRadius: 15,
    borderWidth: 0,
    marginTop: 8,
    overflow: 'hidden',
  },
  optionText: { color: appTheme.colors.text, fontSize: 15, fontWeight: '700' },
  placeholder: { color: '#98a0ab' },
  required: {
    color: '#bd2d2d',
  },
  rowField: {
    flex: 1,
    marginBottom: 17,
  },
  saveButton: {
    backgroundColor: appTheme.colors.surface,
    borderWidth: 0,
    flexBasis: 'auto',
    flexGrow: 0,
    height: 58,
    transform: [{ translateY: -3 }],
    width: '100%',
    ...goldButtonShadow,
  },
  select: {
    alignItems: 'center',
    backgroundColor: appTheme.colors.surfaceMuted,
    borderRadius: 15,
    borderWidth: 0,
    flexDirection: 'row',
    gap: 11,
    minHeight: 56,
    paddingHorizontal: 15,
  },
  selectText: { color: appTheme.colors.text, flex: 1, fontSize: 16 },
  scroll: { flexShrink: 1 },
  sheet: {
    backgroundColor: appTheme.colors.surfaceElevated,
    borderTopLeftRadius: 30,
    borderTopRightRadius: 30,
    flexShrink: 1,
    overflow: 'hidden',
  },
  sheetFooter: {
    backgroundColor: appTheme.colors.surfaceElevated,
    borderTopColor: appTheme.colors.border,
    borderTopWidth: StyleSheet.hairlineWidth,
    paddingHorizontal: 22,
    paddingTop: 10,
  },
  subtitle: {
    color: appTheme.colors.textMuted,
    fontSize: 15,
    lineHeight: 22,
    marginTop: 6,
  },
  textArea: {
    color: '#101c2d',
    fontSize: 16,
    minHeight: 92,
    paddingHorizontal: 15,
    paddingVertical: 14,
  },
  sliderFill: {
    backgroundColor: '#101c2d',
    borderRadius: 4,
    bottom: 0,
    left: 0,
    position: 'absolute',
    top: 0,
  },
  sliderHeading: {
    alignItems: 'center',
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginBottom: 11,
  },
  sliderLabel: { color: '#101c2d', flex: 1, fontSize: 14, fontWeight: '800' },
  sliderThumb: {
    backgroundColor: '#fff',
    borderColor: '#101c2d',
    borderRadius: 10,
    borderWidth: 3,
    height: 20,
    marginLeft: -10,
    position: 'absolute',
    top: -7,
    width: 20,
  },
  sliderTrack: { backgroundColor: '#d7e2f8', borderRadius: 4, height: 7 },
  sliderValue: { color: '#101c2d', fontSize: 15, fontWeight: '900' },
  taxHeader: {
    alignItems: 'center',
    flexDirection: 'row',
    justifyContent: 'space-between',
  },
  taxInfo: {
    backgroundColor: '#e8f0ff',
    borderRadius: 10,
    color: '#274b89',
    fontSize: 13,
    lineHeight: 18,
    marginBottom: 7,
    padding: 10,
  },
  taxOptions: { marginTop: 20 },
  title: {
    color: appTheme.colors.text,
    fontSize: 27,
    fontWeight: '900',
    letterSpacing: -0.7,
  },
});
