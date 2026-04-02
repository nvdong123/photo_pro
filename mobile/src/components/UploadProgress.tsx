import { View, Text, StyleSheet } from 'react-native';

interface Props {
  completed: number;
  total: number;
  currentFile: string;
}

export default function UploadProgress({ completed, total, currentFile }: Props) {
  const pct = total > 0 ? Math.round((completed / total) * 100) : 0;

  return (
    <View style={styles.container}>
      <View style={styles.row}>
        <Text style={styles.label}>Đang upload: {completed}/{total} ảnh</Text>
        <Text style={styles.pct}>{pct}%</Text>
      </View>
      <View style={styles.bar}>
        <View style={[styles.fill, { width: `${pct}%` as `${number}%` }]} />
      </View>
      {currentFile ? (
        <Text style={styles.filename} numberOfLines={1}>{currentFile}</Text>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    backgroundColor: '#fff', borderRadius: 10, padding: 16,
    marginBottom: 16, borderWidth: 1, borderColor: '#e2e5ea',
  },
  row: { flexDirection: 'row', justifyContent: 'space-between', marginBottom: 8 },
  label: { fontSize: 13, fontWeight: '600', color: '#374151' },
  pct: { fontSize: 13, color: '#6b7280' },
  bar: { height: 8, backgroundColor: '#e5e7eb', borderRadius: 4, overflow: 'hidden' },
  fill: { height: '100%', backgroundColor: '#1a6b4e', borderRadius: 4 },
  filename: { marginTop: 6, fontSize: 11, color: '#9ca3af' },
});
