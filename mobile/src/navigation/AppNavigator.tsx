// Nguyệt owns navigation. Thuần's screens are linked here without modifying their implementations.
import React, { useState } from 'react';
import { Modal, ScrollView, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { createBottomTabNavigator } from '@react-navigation/bottom-tabs';
import { ProfileScreen } from '../screens/ProfileScreen';
import { NotificationScreen } from '../screens/NotificationScreen';
import { InvoiceScreen } from '../screens/InvoiceScreen';
import { CreateTicketScreen } from '../screens/CreateTicketScreen';
import { TicketTimelineScreen } from '../screens/TicketTimelineScreen';
import { RatingScreen } from '../screens/RatingScreen';
import { FeedbackScreen } from '../screens/FeedbackScreen';
import { Action, colors, s } from '../components/ResidentUI';

function MaintenanceScreen() {
  const [screen, setScreen] = useState<'create' | 'timeline' | 'rating' | null>(null);
  return <View style={s.page}><ScrollView contentContainerStyle={s.content}>
    <Text style={s.title}>Hỗ trợ sửa chữa</Text>
    <Action title="Báo sự cố" onPress={() => setScreen('create')} />
    <Action secondary title="Theo dõi tiến độ" onPress={() => setScreen('timeline')} />
    <Action secondary title="Nghiệm thu và đánh giá" onPress={() => setScreen('rating')} />
  </ScrollView>
    {screen && <Modal visible animationType="slide" onRequestClose={() => setScreen(null)}>
      <SafeAreaView style={s.page}>
        <View style={{ padding: 16 }}><Action secondary title="Quay lại" onPress={() => setScreen(null)} /></View>
        {screen === 'create' ? <CreateTicketScreen /> : screen === 'timeline' ? <TicketTimelineScreen /> : <RatingScreen />}
      </SafeAreaView>
    </Modal>}
  </View>;
}
const Tab = createBottomTabNavigator();
export function AppNavigator() {
  return <Tab.Navigator screenOptions={{ tabBarActiveTintColor: colors.brand, headerTintColor: colors.ink, headerStyle: { backgroundColor: '#FFFFFF' } }}>
    <Tab.Screen name="Trang chủ" component={ProfileScreen} options={{ title: 'Căn hộ' }} />
    <Tab.Screen name="Báo hỏng" component={MaintenanceScreen} options={{ title: 'Sự cố' }} />
    <Tab.Screen name="Hóa đơn" component={InvoiceScreen} options={{ title: 'Hóa đơn' }} />
    <Tab.Screen name="Góp ý" component={FeedbackScreen} />
    <Tab.Screen name="Thông báo" component={NotificationScreen} />
  </Tab.Navigator>;
}
