import Ionicons from '@expo/vector-icons/Ionicons';
import {
  KeyboardAvoidingView,
  Modal,
  Platform,
  Pressable,
  Text,
  TextInput,
  View,
} from 'react-native';

import { appTheme } from '../../components/BottomNavigation';
import { KeyboardAwareScrollView as ScrollView } from '../../components/KeyboardAwareScrollView';
import {
  sameDate,
  type PayphoneManualConfirmationResponse,
} from './agenda-model';
import { styles } from './agenda.styles';

type AgendaCalendarModalProps = {
  readonly bottomInset: number;
  readonly calendarMonth: Date;
  readonly days: ReadonlyArray<Date | null>;
  readonly onClose: () => void;
  readonly onMonthChange: (month: Date) => void;
  readonly onSelectDay: (day: Date) => void;
  readonly selectedDay: Date;
  readonly today: Date;
  readonly topInset: number;
  readonly visible: boolean;
};

export function AgendaCalendarModal({
  bottomInset,
  calendarMonth,
  days,
  onClose,
  onMonthChange,
  onSelectDay,
  selectedDay,
  today,
  topInset,
  visible,
}: AgendaCalendarModalProps) {
  const moveMonth = (offset: number) => {
    onMonthChange(
      new Date(
        calendarMonth.getFullYear(),
        calendarMonth.getMonth() + offset,
        1,
        12,
      ),
    );
  };

  return (
    <Modal
      animationType="fade"
      navigationBarTranslucent
      onRequestClose={onClose}
      statusBarTranslucent
      transparent
      visible={visible}
    >
      <View
        style={[
          styles.calendarModalBackdrop,
          { paddingBottom: bottomInset, paddingTop: topInset },
        ]}
      >
        <View style={styles.calendarModal}>
          <View style={styles.calendarModalHeader}>
            <Pressable
              accessibilityLabel="Mes anterior"
              accessibilityRole="button"
              onPress={() => moveMonth(-1)}
              style={styles.monthControl}
            >
              <Ionicons
                color={appTheme.colors.accentDark}
                name="chevron-back"
                size={22}
              />
            </Pressable>
            <Text style={styles.calendarMonthLabel}>
              {calendarMonth.toLocaleDateString('es-EC', {
                month: 'long',
                year: 'numeric',
              })}
            </Text>
            <Pressable
              accessibilityLabel="Mes siguiente"
              accessibilityRole="button"
              onPress={() => moveMonth(1)}
              style={styles.monthControl}
            >
              <Ionicons
                color={appTheme.colors.accentDark}
                name="chevron-forward"
                size={22}
              />
            </Pressable>
          </View>
          <View style={styles.monthWeekdays}>
            {['L', 'M', 'X', 'J', 'V', 'S', 'D'].map((weekday) => (
              <Text key={weekday} style={styles.monthWeekday}>
                {weekday}
              </Text>
            ))}
          </View>
          <View style={styles.monthGrid}>
            {days.map((day, index) => {
              if (!day)
                return <View key={'blank-' + index} style={styles.monthDate} />;
              const isSelected = sameDate(day, selectedDay);
              const isToday = sameDate(day, today);
              return (
                <Pressable
                  accessibilityLabel={day.toLocaleDateString('es-EC', {
                    day: 'numeric',
                    month: 'long',
                    weekday: 'long',
                  })}
                  accessibilityRole="button"
                  accessibilityState={{ selected: isSelected }}
                  key={day.toISOString()}
                  onPress={() => onSelectDay(day)}
                  style={[
                    styles.monthDate,
                    isSelected && styles.monthDateSelected,
                  ]}
                >
                  <Text
                    style={[
                      styles.monthDateLabel,
                      isSelected && styles.monthDateLabelSelected,
                      isToday && !isSelected && styles.monthDateToday,
                    ]}
                  >
                    {day.getDate()}
                  </Text>
                </Pressable>
              );
            })}
          </View>
          <Pressable
            accessibilityRole="button"
            onPress={onClose}
            style={styles.calendarClose}
          >
            <Text style={styles.calendarCloseLabel}>Cerrar</Text>
          </Pressable>
        </View>
      </View>
    </Modal>
  );
}
type PayphonePaymentModalProps = {
  readonly bottomInset: number;
  readonly confirmed: boolean;
  readonly data: PayphoneManualConfirmationResponse | undefined;
  readonly note: string;
  readonly onClose: () => void;
  readonly onConfirmedChange: (confirmed: boolean) => void;
  readonly onNoteChange: (note: string) => void;
  readonly onReferenceChange: (reference: string) => void;
  readonly onSubmit: () => void;
  readonly pending: boolean;
  readonly reference: string;
  readonly sheetMaxHeight: number;
  readonly visible: boolean;
};

export function PayphonePaymentModal({
  bottomInset,
  confirmed,
  data,
  note,
  onClose,
  onConfirmedChange,
  onNoteChange,
  onReferenceChange,
  onSubmit,
  pending,
  reference,
  sheetMaxHeight,
  visible,
}: PayphonePaymentModalProps) {
  return (
    <Modal
      animationType="slide"
      navigationBarTranslucent
      onRequestClose={onClose}
      statusBarTranslucent
      transparent
      visible={visible}
    >
      <KeyboardAvoidingView
        behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
        style={styles.paymentSheetRoot}
      >
        <Pressable onPress={onClose} style={styles.appointmentModalBackdrop} />
        <ScrollView
          contentContainerStyle={[
            styles.paymentSheet,
            { paddingBottom: bottomInset + 20 },
          ]}
          style={{ maxHeight: sheetMaxHeight }}
        >
          <Text style={styles.appointmentModalTitle}>
            Confirmar cobro PayPhone
          </Text>
          <Text style={styles.paymentWarning}>
            Antes de continuar, verifica en PayPhone Business que el pago fue
            aprobado y que el monto recibido coincide con el total de la cita.
            Nava no puede comprobar este pago automáticamente.
          </Text>
          <View style={styles.paymentDetails}>
            <Text style={styles.paymentDetail}>
              Cliente: {data?.appointment.clientName ?? '-'}
            </Text>
            <Text style={styles.paymentDetail}>
              Fecha:{' '}
              {data?.appointment.startsAt
                ? new Date(data.appointment.startsAt).toLocaleString('es-EC')
                : '-'}
            </Text>
            <Text style={styles.paymentDetail}>
              Total esperado: $
              {((data?.appointment.totalCents ?? 0) / 100).toFixed(2)}{' '}
              {data?.attempt?.currencyCode ?? 'USD'}
            </Text>
            <Text style={styles.paymentDetail}>
              Enlace generado:{' '}
              {data?.attempt
                ? new Date(
                    new Date(data.attempt.expiresAt).getTime() - 60 * 60 * 1000,
                  ).toLocaleString('es-EC')
                : '-'}
            </Text>
            <Text style={styles.paymentDetail}>
              Referencia interna: {data?.attempt?.transactionReference ?? '-'}
            </Text>
          </View>
          <Text style={styles.inputLabel}>Referencia de PayPhone</Text>
          <TextInput
            autoCapitalize="characters"
            editable={!pending}
            onChangeText={onReferenceChange}
            placeholder="Número de transacción verificado"
            placeholderTextColor={appTheme.colors.textMuted}
            style={styles.paymentInput}
            value={reference}
          />
          <Text style={styles.inputLabel}>Nota (opcional)</Text>
          <TextInput
            editable={!pending}
            multiline
            onChangeText={onNoteChange}
            placeholder="Detalle de la verificación"
            placeholderTextColor={appTheme.colors.textMuted}
            style={[styles.paymentInput, styles.paymentNoteInput]}
            value={note}
          />
          <Pressable
            onPress={() => onConfirmedChange(!confirmed)}
            style={styles.confirmationCheck}
          >
            <Ionicons
              color={
                confirmed
                  ? appTheme.colors.accentDark
                  : appTheme.colors.textMuted
              }
              name={confirmed ? 'checkbox-outline' : 'square-outline'}
              size={23}
            />
            <Text style={styles.confirmationCheckText}>
              Confirmo que verifiqué el pago aprobado en PayPhone Business.
            </Text>
          </Pressable>
          <Pressable
            disabled={!confirmed || !reference.trim() || pending}
            onPress={onSubmit}
            style={styles.modalPrimaryAction}
          >
            <Text style={styles.modalPrimaryText}>
              {pending ? 'Registrando...' : 'Registrar como pagado'}
            </Text>
          </Pressable>
        </ScrollView>
      </KeyboardAvoidingView>
    </Modal>
  );
}
