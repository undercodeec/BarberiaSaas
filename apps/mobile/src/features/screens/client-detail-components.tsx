import Ionicons from '@expo/vector-icons/Ionicons';
import { Text, View } from 'react-native';

import { emptyValue } from './client-detail-model';
import { styles } from './client-detail.styles';

export function InfoRow({
  icon,
  label,
  last = false,
  value,
}: {
  icon: keyof typeof Ionicons.glyphMap;
  label: string;
  last?: boolean;
  value: string | null;
}) {
  return (
    <View style={[styles.infoRow, last && styles.infoRowLast]}>
      <View style={styles.infoIcon}>
        <Ionicons color="#101c2d" name={icon} size={19} />
      </View>
      <View style={styles.infoCopy}>
        <Text style={styles.infoLabel}>{label}</Text>
        <Text style={[styles.infoValue, !value && styles.secondary]}>
          {emptyValue(value)}
        </Text>
      </View>
    </View>
  );
}
