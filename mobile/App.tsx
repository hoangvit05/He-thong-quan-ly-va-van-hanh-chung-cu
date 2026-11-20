import React from 'react';
import { ScrollView, Text, View } from 'react-native';
import { NavigationContainer } from '@react-navigation/native';
import { SafeAreaProvider, SafeAreaView } from 'react-native-safe-area-context';
import { AuthProvider, useAuth } from './src/auth/AuthContext';
import { AppNavigator } from './src/navigation/AppNavigator';
import { AuthScreen } from './src/screens/AuthScreen';
import { Action, ErrorBox, Loading, s } from './src/components/ResidentUI';

function SessionGate() {
  const auth = useAuth();
  if (auth.restoring) return <SafeAreaView style={s.page}><Loading /></SafeAreaView>;
  if (auth.restoreError) return <SafeAreaView style={s.page}><ScrollView contentContainerStyle={s.content}>
    <Text style={s.title}>Kết nối lại phiên đăng nhập</Text>
    <ErrorBox message={auth.restoreError} retry={() => { void auth.restore(); }} />
    <Action secondary title="Xóa phiên và đăng nhập lại" onPress={() => { void auth.signOut(); }} />
  </ScrollView></SafeAreaView>;
  return auth.user
    ? <NavigationContainer><AppNavigator /></NavigationContainer>
    : <View style={s.page}><AuthScreen /></View>;
}
export default function App() {
  return <SafeAreaProvider><AuthProvider><SessionGate /></AuthProvider></SafeAreaProvider>;
}
