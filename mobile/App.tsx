import { NavigationContainer } from '@react-navigation/native';
import { createNativeStackNavigator } from '@react-navigation/native-stack';
import { Provider as PaperProvider } from 'react-native-paper';
import { StatusBar } from 'expo-status-bar';
import LoginScreen from './src/screens/LoginScreen';
import UploadScreen from './src/screens/UploadScreen';
import CameraConnectScreen from './src/screens/CameraConnectScreen';
import LiveAlbumScreen from './src/screens/LiveAlbumScreen';
import ImageDetailScreen from './src/screens/ImageDetailScreen';

export type RootStackParamList = {
  Login: undefined;
  Upload: undefined;
  CameraConnect: undefined;
  LiveAlbum: { locationId: string; locationName: string };
  ImageDetail: { uri: string; name: string; size?: number; status?: string; capturedAt?: number; addedAt?: string };
};

const Stack = createNativeStackNavigator<RootStackParamList>();

const PRIMARY = '#1a6b4e';

export default function App() {
  return (
    <PaperProvider>
      <NavigationContainer>
        <StatusBar style="light" />
        <Stack.Navigator
          initialRouteName="Login"
          screenOptions={{
            headerStyle: { backgroundColor: PRIMARY },
            headerTintColor: '#fff',
            headerTitleStyle: { fontWeight: '700' },
          }}
        >
          <Stack.Screen name="Login" component={LoginScreen} options={{ headerShown: false }} />
          <Stack.Screen name="Upload" component={UploadScreen} options={{ title: 'Upload Ảnh' }} />
          <Stack.Screen name="CameraConnect" component={CameraConnectScreen} options={{ title: 'Kết Nối Máy Ảnh' }} />
          <Stack.Screen name="LiveAlbum" component={LiveAlbumScreen} options={{ title: 'Album Trực Tiếp' }} />
          <Stack.Screen name="ImageDetail" component={ImageDetailScreen} options={{ title: 'Chi tiết ảnh' }} />
        </Stack.Navigator>
      </NavigationContainer>
    </PaperProvider>
  );
}
