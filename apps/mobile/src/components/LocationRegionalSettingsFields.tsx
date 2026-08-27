import Ionicons from '@expo/vector-icons/Ionicons';
import { useState } from 'react';
import {
  Modal,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native';

import { appTheme } from './BottomNavigation';
import { COUNTRIES } from './RegistrationSelectors';

const CURRENCIES = [
  { code: 'AED', label: 'AED — Dírham de los EAU' },
  { code: 'AUD', label: 'AUD — Dólar australiano' },
  { code: 'USD', label: 'USD — Dólar estadounidense' },
  { code: 'ARS', label: 'ARS — Peso argentino' },
  { code: 'BOB', label: 'BOB — Boliviano' },
  { code: 'BRL', label: 'BRL — Real brasileño' },
  { code: 'CAD', label: 'CAD — Dólar canadiense' },
  { code: 'CHF', label: 'CHF — Franco suizo' },
  { code: 'CLP', label: 'CLP — Peso chileno' },
  { code: 'CNY', label: 'CNY — Yuan chino' },
  { code: 'COP', label: 'COP — Peso colombiano' },
  { code: 'CRC', label: 'CRC — Colón costarricense' },
  { code: 'DOP', label: 'DOP — Peso dominicano' },
  { code: 'EUR', label: 'EUR — Euro' },
  { code: 'GBP', label: 'GBP — Libra esterlina' },
  { code: 'GTQ', label: 'GTQ — Quetzal guatemalteco' },
  { code: 'HNL', label: 'HNL — Lempira hondureño' },
  { code: 'INR', label: 'INR — Rupia india' },
  { code: 'JPY', label: 'JPY — Yen japonés' },
  { code: 'KRW', label: 'KRW — Won surcoreano' },
  { code: 'MXN', label: 'MXN — Peso mexicano' },
  { code: 'NIO', label: 'NIO — Córdoba nicaragüense' },
  { code: 'NZD', label: 'NZD — Dólar neozelandés' },
  { code: 'PEN', label: 'PEN — Sol peruano' },
  { code: 'PYG', label: 'PYG — Guaraní paraguayo' },
  { code: 'UYU', label: 'UYU — Peso uruguayo' },
  { code: 'VES', label: 'VES — Bolívar venezolano' },
  { code: 'ZAR', label: 'ZAR — Rand sudafricano' },
] as const;

const TIMEZONES = [
  'America/Anchorage',
  'America/Argentina/Buenos_Aires',
  'America/Asuncion',
  'America/Bogota',
  'America/Caracas',
  'America/Chicago',
  'America/Costa_Rica',
  'America/Denver',
  'America/El_Salvador',
  'America/Guayaquil',
  'America/Guatemala',
  'America/Halifax',
  'America/Havana',
  'America/La_Paz',
  'America/Lima',
  'America/Los_Angeles',
  'America/Managua',
  'America/Mexico_City',
  'America/Montevideo',
  'America/New_York',
  'America/Panama',
  'America/Puerto_Rico',
  'America/Santiago',
  'America/Sao_Paulo',
  'America/Santo_Domingo',
  'America/Toronto',
  'America/Vancouver',
  'Asia/Dubai',
  'Asia/Kolkata',
  'Asia/Seoul',
  'Asia/Tokyo',
  'Europe/Lisbon',
  'Europe/Madrid',
  'Europe/Paris',
  'Pacific/Auckland',
  'Pacific/Honolulu',
] as const;

type PickerKind = 'country' | 'currency' | 'timezone' | null;

export function LocationRegionalSettingsFields({
  countryCode,
  currencyCode,
  onChangeCountry,
  onChangeCurrency,
  onChangeTimezone,
  timezone,
}: {
  readonly countryCode: string;
  readonly currencyCode: string;
  readonly onChangeCountry: (value: string) => void;
  readonly onChangeCurrency: (value: string) => void;
  readonly onChangeTimezone: (value: string) => void;
  readonly timezone: string;
}) {
  const [picker, setPicker] = useState<PickerKind>(null);
  const country = COUNTRIES.find((item) => item.code === countryCode);
  const currency = CURRENCIES.find((item) => item.code === currencyCode);
  const title =
    picker === 'country'
      ? 'Selecciona un país'
      : picker === 'currency'
        ? 'Selecciona una moneda'
        : 'Selecciona una zona horaria';

  return (
    <>
      <View style={styles.row}>
        <SelectionField
          accessibilityLabel="País"
          icon="earth-outline"
          label="País"
          onPress={() => setPicker('country')}
          value={country?.name ?? countryCode}
        />
        <SelectionField
          accessibilityLabel="Moneda"
          icon="cash-outline"
          label="Moneda"
          onPress={() => setPicker('currency')}
          value={currency?.label ?? currencyCode}
        />
      </View>
      <SelectionField
        accessibilityLabel="Zona horaria"
        icon="time-outline"
        label="Zona horaria"
        onPress={() => setPicker('timezone')}
        value={timezone}
      />
      <Modal
        animationType="slide"
        onRequestClose={() => setPicker(null)}
        transparent
        visible={picker !== null}
      >
        <View style={styles.modalLayer}>
          <Pressable onPress={() => setPicker(null)} style={styles.backdrop} />
          <View style={styles.sheet}>
            <Text style={styles.title}>{title}</Text>
            <ScrollView
              contentContainerStyle={styles.optionsContent}
              keyboardShouldPersistTaps="handled"
              showsVerticalScrollIndicator
              style={styles.optionsScroll}
              testID="regional-options-scroll"
            >
              {picker === 'country'
                ? COUNTRIES.map((option) => (
                    <Option
                      key={option.code}
                      label={option.name}
                      onPress={() => {
                        onChangeCountry(option.code);
                        setPicker(null);
                      }}
                    />
                  ))
                : null}
              {picker === 'currency'
                ? CURRENCIES.map((option) => (
                    <Option
                      key={option.code}
                      label={option.label}
                      onPress={() => {
                        onChangeCurrency(option.code);
                        setPicker(null);
                      }}
                    />
                  ))
                : null}
              {picker === 'timezone'
                ? TIMEZONES.map((option) => (
                    <Option
                      key={option}
                      label={option}
                      onPress={() => {
                        onChangeTimezone(option);
                        setPicker(null);
                      }}
                    />
                  ))
                : null}
            </ScrollView>
          </View>
        </View>
      </Modal>
    </>
  );
}

function SelectionField({
  accessibilityLabel,
  icon,
  label,
  onPress,
  value,
}: {
  readonly accessibilityLabel: string;
  readonly icon: React.ComponentProps<typeof Ionicons>['name'];
  readonly label: string;
  readonly onPress: () => void;
  readonly value: string;
}) {
  return (
    <View style={styles.field}>
      <Text style={styles.label}>{label}</Text>
      <Pressable
        accessibilityLabel={accessibilityLabel}
        accessibilityRole="button"
        onPress={onPress}
        style={styles.control}
      >
        <Ionicons color={appTheme.colors.accentDark} name={icon} size={18} />
        <Text numberOfLines={1} style={styles.value}>
          {value}
        </Text>
        <Ionicons
          color={appTheme.colors.textMuted}
          name="chevron-down"
          size={18}
        />
      </Pressable>
    </View>
  );
}

function Option({
  label,
  onPress,
}: {
  readonly label: string;
  readonly onPress: () => void;
}) {
  return (
    <Pressable
      accessibilityRole="button"
      onPress={onPress}
      style={styles.option}
    >
      <Text style={styles.optionLabel}>{label}</Text>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  backdrop: { backgroundColor: 'rgba(0,0,0,0.35)', flex: 1 },
  control: {
    alignItems: 'center',
    backgroundColor: appTheme.colors.background,
    borderColor: appTheme.colors.border,
    borderRadius: 13,
    borderWidth: 1,
    flexDirection: 'row',
    gap: 7,
    minHeight: 46,
    paddingHorizontal: 12,
  },
  field: { flex: 1, gap: 7 },
  label: { color: appTheme.colors.text, fontSize: 13, fontWeight: '800' },
  modalLayer: { flex: 1, justifyContent: 'flex-end' },
  option: {
    borderBottomColor: appTheme.colors.border,
    borderBottomWidth: 1,
    minHeight: 52,
    justifyContent: 'center',
    paddingHorizontal: 4,
  },
  optionLabel: { color: appTheme.colors.text, fontSize: 16 },
  optionsContent: { paddingBottom: 12 },
  optionsScroll: { flexGrow: 0, flexShrink: 1 },
  row: { flexDirection: 'row', gap: 10 },
  sheet: {
    backgroundColor: appTheme.colors.surface,
    borderTopLeftRadius: 26,
    borderTopRightRadius: 26,
    maxHeight: '70%',
    padding: 20,
  },
  title: {
    color: appTheme.colors.text,
    fontSize: 20,
    fontWeight: '900',
    marginBottom: 12,
  },
  value: { color: appTheme.colors.text, flex: 1, fontSize: 14 },
});
