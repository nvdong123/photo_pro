import { View, Text, StyleSheet } from 'react-native';

interface Props {
  active: boolean;
}

export default function LiveBadge({ active }: Props) {
  if (!active) return null;
  return (
    <View style={styles.badge}>
      <View style={styles.dot} />
      <Text style={styles.text}>LIVE</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  badge: {
    flexDirection: 'row', alignItems: 'center', gap: 4,
    backgroundColor: '#dc2626', borderRadius: 4,
    paddingHorizontal: 8, paddingVertical: 3,
  },
  dot: { width: 6, height: 6, borderRadius: 3, backgroundColor: '#fff' },
  text: { color: '#fff', fontSize: 10, fontWeight: '800', letterSpacing: 1 },
});
