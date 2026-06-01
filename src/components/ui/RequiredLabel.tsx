import { View, Text, StyleSheet } from 'react-native';
import { colors } from '@/constants/colors';
import { fonts } from '@/constants/fonts';

// Field label with a small pink asterisk superscripted at the top-right to mark
// a required field. The row shrinks to its content (alignSelf flex-start) and
// top-aligns the children (alignItems flex-start) so the smaller asterisk sits
// at the upper-right of the label text rather than on its baseline.
export function RequiredLabel({ text, gap }: { text: string; gap?: boolean }) {
  return (
    <View style={[styles.row, gap && styles.gap]}>
      <Text style={styles.label}>{text}</Text>
      <Text style={styles.star}>*</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  row: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    alignSelf: 'flex-start',
    marginBottom: 8,
  },
  gap: { marginTop: 16 },
  label: { fontSize: 14, fontFamily: fonts.medium, color: colors.text },
  star: {
    color: colors.primary,
    fontSize: 12,
    lineHeight: 14,
    marginLeft: 2,
    marginTop: 2,
  },
});
