// ===================================================
// MÀN HÌNH XEM THÔNG BÁO & NHẬN THÔNG BÁO ĐẨY
// Phụ trách: Nguyệt
// ===================================================
import React from 'react';
import { View, Text, StyleSheet } from 'react-native';

export const NotificationScreen = () => {
  return (
    <View style={styles.container}>
      <Text style={styles.title}>Bảng Tin & Thông Báo BQL</Text>
      <Text style={styles.subtitle}>Xem tin tức chung và pop-up thông báo đẩy tức thời</Text>
      {/* TODO (Nguyệt): Danh sách tin tức và hiển thị push notifications */}
    </View>
  );
};

const styles = StyleSheet.create({
  container: { flex: 1, padding: 20 },
  title: { fontSize: 20, fontWeight: 'bold', marginBottom: 8 },
  subtitle: { fontSize: 14, color: '#666' },
});
