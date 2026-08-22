import Ionicons from '@expo/vector-icons/Ionicons';
import {
  getCountries,
  getCountryCallingCode,
  type CountryCode,
} from 'libphonenumber-js/min';
import {
  FlatList,
  Modal,
  Platform,
  Pressable,
  StyleSheet,
  Text,
  TextInput,
  type NativeScrollEvent,
  type NativeSyntheticEvent,
  type TextInputProps,
  View,
} from 'react-native';
import { useState } from 'react';

import {
  appTheme,
  goldButtonShadow,
  useNativeLayoutMetrics,
} from './BottomNavigation';
import { NavaButton } from './NavaButton';

export interface CountryOption {
  readonly code: string;
  readonly dial: string;
  readonly name: string;
}

type DisplayNamesConstructor = typeof Intl.DisplayNames;

const FALLBACK_COUNTRY_NAMES: Readonly<Record<string, string>> = {
  AR: 'Argentina',
  BO: 'Bolivia',
  BR: 'Brasil',
  CA: 'Canadá',
  CL: 'Chile',
  CO: 'Colombia',
  CR: 'Costa Rica',
  CU: 'Cuba',
  DO: 'República Dominicana',
  EC: 'Ecuador',
  ES: 'España',
  GT: 'Guatemala',
  HN: 'Honduras',
  MX: 'México',
  NI: 'Nicaragua',
  PA: 'Panamá',
  PE: 'Perú',
  PR: 'Puerto Rico',
  PY: 'Paraguay',
  SV: 'El Salvador',
  US: 'Estados Unidos',
  UY: 'Uruguay',
  VE: 'Venezuela',
};

export function resolveCountryName(
  code: string,
  DisplayNames: DisplayNamesConstructor | null | undefined = Intl.DisplayNames,
) {
  if (typeof DisplayNames === 'function') {
    try {
      return (
        new DisplayNames(['es'], { type: 'region' }).of(code) ??
        FALLBACK_COUNTRY_NAMES[code] ??
        code
      );
    } catch {
      // Hermes does not implement Intl.DisplayNames on every Android runtime.
    }
  }
  return FALLBACK_COUNTRY_NAMES[code] ?? code;
}

export const COUNTRIES: readonly CountryOption[] = getCountries()
  .map((code) => ({
    code,
    dial: `+${getCountryCallingCode(code as CountryCode)}`,
    name: resolveCountryName(code),
  }))
  .sort((first, second) => first.name.localeCompare(second.name));

export function detectCountryCode() {
  try {
    const zone = Intl.DateTimeFormat().resolvedOptions().timeZone;
    const zones: Record<string, string> = {
      'America/Guayaquil': 'EC',
      'America/Bogota': 'CO',
      'America/Lima': 'PE',
      'America/Mexico_City': 'MX',
      'America/Argentina/Buenos_Aires': 'AR',
      'America/Santiago': 'CL',
      'Europe/Madrid': 'ES',
    };
    if (zones[zone]) return zones[zone];
    const locale = Intl.DateTimeFormat().resolvedOptions().locale;
    const region = locale.split('-')[1]?.toUpperCase();
    if (region && COUNTRIES.some((country) => country.code === region))
      return region;
    return 'EC';
  } catch {
    return 'EC';
  }
}

export function PhoneCountryField({
  countryCode,
  error,
  onBlur,
  onChangeCountry,
  onChangeText,
  onFocus,
  value,
}: {
  readonly countryCode: string;
  readonly error?: string | undefined;
  readonly onBlur?: TextInputProps['onBlur'];
  readonly onChangeCountry: (code: string) => void;
  readonly onChangeText: (value: string) => void;
  readonly onFocus?: TextInputProps['onFocus'];
  readonly value: string;
}) {
  const [open, setOpen] = useState(false);
  const country =
    COUNTRIES.find((item) => item.code === countryCode) ?? COUNTRIES[0]!;
  return (
    <View style={styles.field}>
      <Text style={styles.label}>Número telefónico</Text>
      <View style={[styles.phoneRow, error ? styles.errorBorder : null]}>
        <Pressable
          accessibilityRole="button"
          onPress={() => setOpen(true)}
          style={styles.dialButton}
        >
          <Text style={styles.flag}>{flag(country.code)}</Text>
          <Text style={styles.dial}>{country.dial}</Text>
          <Ionicons color="#667080" name="chevron-down" size={18} />
        </Pressable>
        <TextInput
          autoComplete="tel"
          accessibilityLabel="Número telefónico"
          inputMode="tel"
          keyboardType={Platform.OS === 'web' ? 'numeric' : 'phone-pad'}
          maxLength={24}
          onBlur={onBlur}
          onChangeText={(text) =>
            onChangeText(text.replace(/[^\d+()\s-]/gu, ''))
          }
          onFocus={onFocus}
          placeholder="Número telefónico"
          placeholderTextColor="#98a0ab"
          style={styles.phoneInput}
          value={value}
        />
      </View>
      {error ? (
        <Text accessibilityRole="alert" style={styles.error}>
          {error}
        </Text>
      ) : null}
      {open ? (
        <OptionsModal
          onClose={() => setOpen(false)}
          onSelect={(option) => {
            onChangeCountry(option.code);
            setOpen(false);
          }}
          options={COUNTRIES}
          title="Código de país"
          visible
        />
      ) : null}
    </View>
  );
}

export function CountryCityFields({
  city,
  countryCode,
  cityError,
  countryError,
  onCity,
  onCityFocus,
  onCountry,
}: {
  readonly city: string;
  readonly countryCode: string;
  readonly cityError?: string | undefined;
  readonly countryError?: string | undefined;
  readonly onCity: (city: string) => void;
  readonly onCityFocus?: TextInputProps['onFocus'];
  readonly onCountry: (country: CountryOption) => void;
}) {
  const [countryOpen, setCountryOpen] = useState(false);
  const country =
    COUNTRIES.find((item) => item.code === countryCode) ?? COUNTRIES[0]!;
  return (
    <>
      <SelectionField
        error={countryError}
        icon="earth-outline"
        label="País"
        onPress={() => setCountryOpen(true)}
        value={`${flag(country.code)}  ${country.name}`}
      />
      <View style={styles.field}>
        <Text style={styles.label}>Ciudad</Text>
        <View style={[styles.selection, cityError ? styles.errorBorder : null]}>
          <Ionicons color="#101c2d" name="location-outline" size={22} />
          <TextInput
            accessibilityLabel="Ciudad"
            autoCapitalize="words"
            onChangeText={onCity}
            onFocus={onCityFocus}
            placeholder="Escribe tu ciudad"
            placeholderTextColor="#98a0ab"
            style={styles.cityInput}
            value={city}
          />
        </View>
        {cityError ? (
          <Text accessibilityRole="alert" style={styles.error}>
            {cityError}
          </Text>
        ) : null}
      </View>
      <OptionsModal
        onClose={() => setCountryOpen(false)}
        onSelect={(option) => {
          onCountry(option);
          setCountryOpen(false);
        }}
        options={COUNTRIES}
        title="Selecciona tu país"
        visible={countryOpen}
      />
    </>
  );
}

export function TimeField({
  error,
  label,
  onChange,
  value,
}: {
  readonly error?: string | undefined;
  readonly label: string;
  readonly onChange: (value: string) => void;
  readonly value: string;
}) {
  const [open, setOpen] = useState(false);
  return (
    <>
      <SelectionField
        error={error}
        icon="time-outline"
        label={label}
        onPress={() => setOpen(true)}
        value={value || 'Selecciona una hora'}
      />
      {open ? (
        <TimeWheelModal
          label={label}
          onClose={() => setOpen(false)}
          onConfirm={(time) => {
            onChange(time);
            setOpen(false);
          }}
          value={value}
        />
      ) : null}
    </>
  );
}

function SelectionField({
  error,
  icon,
  label,
  onPress,
  value,
}: {
  readonly error?: string | undefined;
  readonly icon: 'earth-outline' | 'location-outline' | 'time-outline';
  readonly label: string;
  readonly onPress: () => void;
  readonly value: string;
}) {
  return (
    <View style={styles.field}>
      <Text style={styles.label}>{label}</Text>
      <Pressable
        accessibilityRole="button"
        onPress={onPress}
        style={[styles.selection, error ? styles.errorBorder : null]}
      >
        <Ionicons color="#101c2d" name={icon} size={22} />
        <Text style={styles.selectionText}>{value}</Text>
        <Ionicons color="#667080" name="chevron-down" size={20} />
      </Pressable>
      {error ? (
        <Text accessibilityRole="alert" style={styles.error}>
          {error}
        </Text>
      ) : null}
    </View>
  );
}
function OptionsModal({
  onClose,
  onSelect,
  options,
  title,
  visible,
}: {
  readonly onClose: () => void;
  readonly onSelect: (option: CountryOption) => void;
  readonly options: readonly CountryOption[];
  readonly title: string;
  readonly visible: boolean;
}) {
  const layout = useNativeLayoutMetrics(0.7);
  return (
    <Modal
      animationType="fade"
      navigationBarTranslucent
      onRequestClose={onClose}
      statusBarTranslucent
      transparent
      visible={visible}
    >
      <View style={styles.modalLayer}>
        <Pressable onPress={onClose} style={styles.modalBackdrop} />
        <View
          style={[
            styles.modalCard,
            {
              maxHeight: layout.sheetMaxHeight,
              paddingBottom: layout.bottomInset + 6,
            },
          ]}
        >
          <Text style={styles.modalTitle}>{title}</Text>
          <FlatList
            data={options}
            getItemLayout={(_, index) => ({
              index,
              length: 54,
              offset: 54 * index,
            })}
            initialNumToRender={16}
            keyExtractor={(option) => option.code}
            keyboardShouldPersistTaps="handled"
            maxToRenderPerBatch={16}
            renderItem={({ item: option }) => (
              <Pressable onPress={() => onSelect(option)} style={styles.option}>
                <Text style={styles.flag}>{flag(option.code)}</Text>
                <Text style={styles.optionText}>{option.name}</Text>
                <Text style={styles.optionMeta}>{option.dial}</Text>
              </Pressable>
            )}
            windowSize={7}
          />
        </View>
      </View>
    </Modal>
  );
}
function TimeWheelModal({
  label,
  onClose,
  onConfirm,
  value,
}: {
  readonly label: string;
  readonly onClose: () => void;
  readonly onConfirm: (value: string) => void;
  readonly value: string;
}) {
  const layout = useNativeLayoutMetrics();
  const hours = Array.from({ length: 24 }, (_, index) =>
    String(index).padStart(2, '0'),
  );
  const minutes = Array.from({ length: 60 }, (_, index) =>
    String(index).padStart(2, '0'),
  );
  const [initialHour = '09', initialMinute = '00'] = value.split(':');
  const [hour, setHour] = useState(
    hours.includes(initialHour) ? initialHour : '09',
  );
  const [minute, setMinute] = useState(
    minutes.includes(initialMinute) ? initialMinute : '00',
  );
  const selectFromScroll = (
    event: NativeSyntheticEvent<NativeScrollEvent>,
    options: string[],
    select: (next: string) => void,
  ) => {
    const index = Math.max(
      0,
      Math.min(
        options.length - 1,
        Math.round(event.nativeEvent.contentOffset.y / 52),
      ),
    );
    select(options[index]!);
  };
  const renderWheel = (
    options: string[],
    selected: string,
    select: (next: string) => void,
  ) => (
    <FlatList
      contentContainerStyle={styles.wheelContent}
      data={options}
      decelerationRate="fast"
      getItemLayout={(_, index) => ({ index, length: 52, offset: 52 * index })}
      initialScrollIndex={Math.max(0, options.indexOf(selected))}
      keyExtractor={(item) => item}
      onMomentumScrollEnd={(event) => selectFromScroll(event, options, select)}
      onScrollEndDrag={(event) => selectFromScroll(event, options, select)}
      renderItem={({ item }) => (
        <Pressable onPress={() => select(item)} style={styles.wheelItem}>
          <Text
            style={[
              styles.wheelText,
              item === selected ? styles.wheelTextSelected : null,
            ]}
          >
            {item}
          </Text>
        </Pressable>
      )}
      showsVerticalScrollIndicator={false}
      snapToAlignment="start"
      snapToInterval={52}
      style={styles.wheelList}
    />
  );
  return (
    <Modal
      animationType="fade"
      navigationBarTranslucent
      onRequestClose={onClose}
      statusBarTranslucent
      transparent
      visible
    >
      <View style={styles.modalLayer}>
        <Pressable onPress={onClose} style={styles.modalBackdrop} />
        <View
          style={[styles.timeCard, { paddingBottom: layout.bottomInset + 12 }]}
        >
          <Text style={styles.modalTitle}>{label}</Text>
          <Text style={styles.timeHint}>
            Desliza para seleccionar la hora y los minutos
          </Text>
          <View style={styles.wheelLabels}>
            <Text style={styles.wheelLabel}>Hora</Text>
            <Text style={styles.wheelLabel}>Minutos</Text>
          </View>
          <View style={styles.wheels}>
            <View pointerEvents="none" style={styles.wheelHighlight} />
            {renderWheel(hours, hour, setHour)}
            <Text style={styles.timeSeparator}>:</Text>
            {renderWheel(minutes, minute, setMinute)}
          </View>
          <Text style={styles.timePreview}>
            {hour}:{minute}
          </Text>
          <View style={styles.timeActions}>
            <NavaButton
              foregroundColor={appTheme.colors.accentDark}
              icon="close-outline"
              label="Cancelar"
              onPress={onClose}
              style={styles.timeActionButton}
              variant="outline"
            />
            <NavaButton
              foregroundColor={appTheme.colors.accentDark}
              icon="checkmark-outline"
              label="Confirmar"
              onPress={() => onConfirm(`${hour}:${minute}`)}
              style={styles.timeActionButton}
              variant="outline"
            />
          </View>
        </View>
      </View>
    </Modal>
  );
}
function flag(code: string) {
  return String.fromCodePoint(
    ...code
      .toUpperCase()
      .split('')
      .map((character) => 127397 + character.charCodeAt(0)),
  );
}

const styles = StyleSheet.create({
  cancelButton: {
    alignItems: 'center',
    borderColor: '#101c2d',
    borderRadius: 18,
    borderWidth: 2,
    flex: 1,
    justifyContent: 'center',
    minHeight: 54,
  },
  cancelText: { color: '#101c2d', fontSize: 16, fontWeight: '800' },
  confirmButton: {
    alignItems: 'center',
    backgroundColor: '#101c2d',
    borderRadius: 18,
    flex: 1,
    justifyContent: 'center',
    minHeight: 54,
  },
  confirmText: { color: '#fff', fontSize: 16, fontWeight: '800' },
  cityInput: {
    color: '#101c2d',
    flex: 1,
    fontSize: 16,
    minHeight: 54,
  },
  dial: { color: '#101c2d', fontSize: 15, fontWeight: '700' },
  dialButton: {
    alignItems: 'center',
    borderRightColor: '#d9dde3',
    borderRightWidth: 1,
    flexDirection: 'row',
    gap: 6,
    minHeight: 54,
    paddingHorizontal: 12,
  },
  error: { color: '#bd2d2d', fontSize: 13, marginTop: 5 },
  errorBorder: { borderColor: '#bd2d2d' },
  field: { marginBottom: 15 },
  flag: { fontSize: 22 },
  label: { color: '#101c2d', fontSize: 14, fontWeight: '700', marginBottom: 7 },
  modalBackdrop: {
    ...StyleSheet.absoluteFill,
    backgroundColor: 'rgba(5, 10, 16, 0.55)',
  },
  modalCard: {
    backgroundColor: '#fff',
    borderTopLeftRadius: 26,
    borderTopRightRadius: 26,
    paddingBottom: 18,
    paddingHorizontal: 20,
    paddingTop: 22,
  },
  modalLayer: { flex: 1, justifyContent: 'flex-end' },
  modalTitle: {
    color: '#101c2d',
    fontSize: 22,
    fontWeight: '900',
    marginBottom: 14,
  },
  option: {
    alignItems: 'center',
    borderBottomColor: '#e7e9ec',
    borderBottomWidth: 1,
    flexDirection: 'row',
    gap: 12,
    minHeight: 54,
    paddingHorizontal: 4,
  },
  optionMeta: { color: '#667080', fontSize: 15 },
  optionText: { color: '#101c2d', flex: 1, fontSize: 16 },
  phoneInput: {
    color: '#101c2d',
    flex: 1,
    fontSize: 16,
    minHeight: 54,
    minWidth: 0,
    paddingHorizontal: 14,
  },
  phoneRow: {
    backgroundColor: '#f7f8fa',
    borderColor: '#d9dde3',
    borderRadius: 14,
    borderWidth: 1,
    flexDirection: 'row',
    overflow: 'hidden',
  },
  selection: {
    alignItems: 'center',
    backgroundColor: '#f7f8fa',
    borderColor: '#d9dde3',
    borderRadius: 14,
    borderWidth: 1,
    flexDirection: 'row',
    gap: 10,
    minHeight: 56,
    paddingHorizontal: 15,
  },
  selectionText: { color: '#101c2d', flex: 1, fontSize: 16 },
  timeActions: { flexDirection: 'row', gap: 12, marginTop: 18 },
  timeActionButton: {
    backgroundColor: appTheme.colors.surface,
    borderWidth: 0,
    minHeight: 58,
    ...goldButtonShadow,
  },
  timeCard: {
    backgroundColor: appTheme.colors.surfaceMuted,
    borderTopLeftRadius: appTheme.radii.sheet,
    borderTopRightRadius: appTheme.radii.sheet,
    paddingBottom: 24,
    paddingHorizontal: 22,
    paddingTop: 22,
  },
  timeHint: { color: '#667080', fontSize: 14, marginBottom: 16, marginTop: -7 },
  timePreview: {
    color: '#101c2d',
    fontSize: 28,
    fontWeight: '900',
    marginTop: 14,
    textAlign: 'center',
  },
  timeSeparator: {
    color: '#101c2d',
    fontSize: 32,
    fontWeight: '900',
    paddingHorizontal: 8,
  },
  wheelContent: { paddingVertical: 52 },
  wheelHighlight: {
    backgroundColor: appTheme.colors.accentWash,
    borderRadius: appTheme.radii.control,
    height: 52,
    left: 0,
    position: 'absolute',
    right: 0,
    top: 52,
  },
  wheelItem: { alignItems: 'center', height: 52, justifyContent: 'center' },
  wheelLabel: {
    color: '#667080',
    flex: 1,
    fontSize: 13,
    fontWeight: '700',
    textAlign: 'center',
  },
  wheelLabels: { flexDirection: 'row', gap: 42, paddingHorizontal: 20 },
  wheelList: { flex: 1, height: 156, zIndex: 1 },
  wheels: {
    alignItems: 'center',
    flexDirection: 'row',
    height: 156,
    marginTop: 7,
    overflow: 'hidden',
    paddingHorizontal: 20,
  },
  wheelText: { color: '#98a0ab', fontSize: 22 },
  wheelTextSelected: { color: '#101c2d', fontSize: 27, fontWeight: '900' },
});
