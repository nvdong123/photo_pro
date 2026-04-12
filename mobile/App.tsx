import { NavigationContainer } from '@react-navigation/native';
import { createNativeStackNavigator } from '@react-navigation/native-stack';
import { Provider as PaperProvider } from 'react-native-paper';
import { StatusBar } from 'expo-status-bar';
import LoginScreen from './src/screens/LoginScreen';
import LocationSelectScreen from './src/screens/LocationSelectScreen';
import ConnectionModeScreen from './src/screens/ConnectionModeScreen';
import UploadScreen from './src/screens/UploadScreen';
import CameraConnectScreen from './src/screens/CameraConnectScreen';
import LiveAlbumScreen from './src/screens/LiveAlbumScreen';
import ImageDetailScreen from './src/screens/ImageDetailScreen';
import UntaggedScreen from './src/screens/UntaggedScreen';
import SessionMonitorScreen from './src/screens/SessionMonitorScreen';

export type ConnectionMode = 'wired' | 'wireless';

export interface SessionRouteParams {
  locationId: string;
  locationName: string;
  connectionMode: ConnectionMode;
}

export type RootStackParamList = {
  Login: undefined;
  LocationSelect: undefined;
  ConnectionMode: { locationId: string; locationName: string };
  CameraConnect: SessionRouteParams;
  Upload: SessionRouteParams;
  SessionMonitor: SessionRouteParams;
  LiveAlbum: { locationId: string; locationName: string };
  ImageDetail: { uri: string; name: string; size?: number; status?: string; capturedAt?: number; addedAt?: string };
  Untagged: undefined;
};

const Stack = createNativeStackNavigator<RootStackParamList>();

const PRIMARY = '#1c5c46';

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
            contentStyle: { backgroundColor: '#f4f1ea' },
          }}
        >
          <Stack.Screen name="Login" component={LoginScreen} options={{ headerShown: false }} />
          <Stack.Screen name="LocationSelect" component={LocationSelectScreen} options={{ title: 'Select Location' }} />
          <Stack.Screen name="ConnectionMode" component={ConnectionModeScreen} options={{ title: 'Choose Connection' }} />
          <Stack.Screen name="CameraConnect" component={CameraConnectScreen} options={{ title: 'Setup Session' }} />
          <Stack.Screen name="Upload" component={UploadScreen} options={{ title: 'Session Monitor' }} />
          <Stack.Screen name="SessionMonitor" component={SessionMonitorScreen} options={{ title: 'Phien chup co day' }} />
          <Stack.Screen name="LiveAlbum" component={LiveAlbumScreen} options={{ title: 'Album Trực Tiếp' }} />
          <Stack.Screen name="ImageDetail" component={ImageDetailScreen} options={{ title: 'Chi tiết ảnh' }} />
          <Stack.Screen name="Untagged" component={UntaggedScreen} options={{ title: 'Ảnh chưa có tag', headerShown: false }} />
        </Stack.Navigator>
      </NavigationContainer>
    </PaperProvider>
  );
}
