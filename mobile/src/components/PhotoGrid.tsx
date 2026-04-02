import { FlatList, Image, View, StyleSheet, Text } from 'react-native';

interface Photo {
  id: string;
  thumb_url: string;
}

interface Props {
  photos: Photo[];
  emptyMessage?: string;
}

export default function PhotoGrid({ photos, emptyMessage = 'Chưa có ảnh' }: Props) {
  if (!photos.length) {
    return (
      <View style={styles.empty}>
        <Text style={styles.emptyText}>{emptyMessage}</Text>
      </View>
    );
  }

  return (
    <FlatList
      data={photos}
      keyExtractor={(item) => item.id}
      numColumns={2}
      renderItem={({ item }) => (
        <View style={styles.card}>
          <Image source={{ uri: item.thumb_url }} style={styles.img} />
        </View>
      )}
      contentContainerStyle={{ padding: 8 }}
    />
  );
}

const styles = StyleSheet.create({
  card: { flex: 1, margin: 4 },
  img: { width: '100%', aspectRatio: 1, borderRadius: 8, backgroundColor: '#2a2a2a' },
  empty: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: 40 },
  emptyText: { color: '#6b7280', fontSize: 14 },
});
