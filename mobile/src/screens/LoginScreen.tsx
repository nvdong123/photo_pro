import { useEffect, useState } from 'react';
import {
  View, Text, TextInput, TouchableOpacity,
  StyleSheet, Alert, ActivityIndicator, KeyboardAvoidingView, Platform,
} from 'react-native';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import type { RootStackParamList } from '../../App';
import { getApiBase, setApiBase, setToken } from '../services/apiClient';

type Props = NativeStackScreenProps<RootStackParamList, 'Login'>;

const PRIMARY = '#1a6b4e';

export default function LoginScreen({ navigation }: Props) {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [serverUrl, setServerUrl] = useState('');
  const [showServer, setShowServer] = useState(false);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    getApiBase().then(setServerUrl);
  }, []);

  const handleLogin = async () => {
    if (!email.trim() || !password) {
      Alert.alert('Lỗi', 'Vui lòng nhập email và mật khẩu.');
      return;
    }
    setLoading(true);
    try {
      const base = serverUrl.trim().replace(/\/$/, '');
      await setApiBase(base);

      const res = await fetch(`${base}/api/v1/admin/auth/login`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email: email.trim(), password }),
      });
      if (!res.ok) {
        const body = await res.json().catch(() => ({})) as Record<string, unknown>;
        const msg = (body as { detail?: string }).detail
          ?? (body as { error?: { message?: string } }).error?.message
          ?? `Lỗi ${res.status}`;
        throw new Error(msg);
      }

      const json = await res.json() as { data: { access_token: string } };
      await setToken(json.data.access_token);
      navigation.replace('LocationSelect');
    } catch (err) {
      Alert.alert('Đăng nhập thất bại', err instanceof Error ? err.message : 'Lỗi không xác định');
    } finally {
      setLoading(false);
    }
  };

  return (
    <KeyboardAvoidingView style={styles.container} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
      <View style={styles.card}>
        <Text style={styles.title}>PhotoPro</Text>
        <Text style={styles.subtitle}>Đăng nhập để upload ảnh sự kiện</Text>

        <TextInput
          style={styles.input}
          placeholder="Email"
          placeholderTextColor="#9ca3af"
          value={email}
          onChangeText={setEmail}
          autoCapitalize="none"
          keyboardType="email-address"
        />
        <TextInput
          style={styles.input}
          placeholder="Mật khẩu"
          placeholderTextColor="#9ca3af"
          value={password}
          onChangeText={setPassword}
          secureTextEntry
        />

        {/* Server URL — collapsed by default, expandable for debugging */}
        <TouchableOpacity onPress={() => setShowServer(v => !v)} style={styles.serverToggle}>
          <Text style={styles.serverToggleText}>
            {showServer ? '▲ Ẩn địa chỉ server' : '⚙ Địa chỉ server'}
          </Text>
        </TouchableOpacity>
        {showServer && (
          <TextInput
            style={[styles.input, styles.serverInput]}
            placeholder="https://api.102photo.trip360.vn"
            placeholderTextColor="#9ca3af"
            value={serverUrl}
            onChangeText={setServerUrl}
            autoCapitalize="none"
            autoCorrect={false}
            keyboardType="url"
          />
        )}

        <TouchableOpacity
          style={[styles.btn, loading && styles.btnDisabled]}
          onPress={handleLogin}
          disabled={loading}
        >
          {loading
            ? <ActivityIndicator color="#fff" />
            : <Text style={styles.btnText}>Đăng Nhập</Text>
          }
        </TouchableOpacity>
      </View>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#f5f7fa',
    justifyContent: 'center',
    padding: 24,
  },
  card: {
    backgroundColor: '#fff',
    borderRadius: 16,
    padding: 28,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.08,
    shadowRadius: 8,
    elevation: 4,
  },
  title: { fontSize: 28, fontWeight: '800', color: PRIMARY, textAlign: 'center', marginBottom: 6 },
  subtitle: { fontSize: 14, color: '#6b7280', textAlign: 'center', marginBottom: 24 },
  input: {
    borderWidth: 1, borderColor: '#e2e5ea', borderRadius: 8,
    padding: 12, marginBottom: 14, fontSize: 15, color: '#111827',
    backgroundColor: '#fafafa',
  },
  btn: {
    backgroundColor: PRIMARY, borderRadius: 10,
    padding: 15, alignItems: 'center', marginTop: 8,
  },
  btnDisabled: { backgroundColor: '#9ca3af' },
  btnText: { color: '#fff', fontWeight: '700', fontSize: 16 },
  serverToggle: { alignSelf: 'flex-end', marginBottom: 4 },
  serverToggleText: { fontSize: 12, color: '#6b7280' },
  serverInput: { fontSize: 13, color: '#374151' },
});
