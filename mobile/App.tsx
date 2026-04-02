import { NavigationContainer } from '@react-navigation/native';
import { createNativeStackNavigator } from '@react-navigation/native-stack';
import { StatusBar } from 'expo-status-bar';
import LoginScreen from './src/screens/LoginScreen';
import UploadScreen from './src/screens/UploadScreen';
import CameraConnectScreen from './src/screens/CameraConnectScreen';
import LiveAlbumScreen from './src/screens/LiveAlbumScreen';

export type RootStackParamList = {
  Login: undefined;
  Upload: undefined;
  CameraConnect: undefined;
  LiveAlbum: { locationId: string; locationName: string };
};

const Stack = createNativeStackNavigator<RootStackParamList>();

const PRIMARY = '#1a6b4e';

export default function App() {
  return (
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
      </Stack.Navigator>
    </NavigationContainer>
  );
}
