// ===================================================================
// FILE LINK TOÀN BỘ MÀN HÌNH CƯ DÂN VÀO HỆ THỐNG ĐIỀU HƯỚNG APP
// Phụ trách chung: Nguyệt (Leader dựng khung)
// Thành viên KHÔNG sửa file này! Chỉ code vào đúng file màn hình của mình!
// ===================================================================

import React from 'react';
import { createBottomTabNavigator } from '@react-navigation/bottom-tabs';

// 1. Màn hình của Nguyệt
import { ProfileScreen } from '../screens/ProfileScreen';
import { NotificationScreen } from '../screens/NotificationScreen';
import { InvoiceScreen } from '../screens/InvoiceScreen';

// 2. Màn hình của Thuần
import { CreateTicketScreen } from '../screens/CreateTicketScreen';
import { FeedbackScreen } from '../screens/FeedbackScreen';

const Tab = createBottomTabNavigator();

export const AppNavigator = () => {
  return (
    <Tab.Navigator>
      <Tab.Screen name="Trang chủ" component={ProfileScreen} options={{ title: 'Căn hộ' }} />
      <Tab.Screen name="Báo hỏng" component={CreateTicketScreen} options={{ title: 'Báo sự cố' }} />
      <Tab.Screen name="Hóa đơn" component={InvoiceScreen} options={{ title: 'Tiền phí' }} />
      <Tab.Screen name="Góp ý" component={FeedbackScreen} options={{ title: 'Góp ý' }} />
      <Tab.Screen name="Thông báo" component={NotificationScreen} options={{ title: 'Thông báo' }} />
    </Tab.Navigator>
  );
};
