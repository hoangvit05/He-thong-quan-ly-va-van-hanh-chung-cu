// ===================================================
// MÀN HÌNH TRANG CHỦ & THÔNG TIN CĂN HỘ (PROFILE)
// Phụ trách: Nguyệt
// ===================================================
import React from 'react';
import { View, Text, StyleSheet } from 'react-native';

export const ProfileScreen = () => {
  return (
    <View style={styles.container}>
      <Text style={styles.title}>Thông Tin Căn Hộ Của Bạn</Text>
      <Text style={styles.subtitle}>Xem số phòng, chủ hộ và thành viên đăng ký</Text>
      {/* TODO (Nguyệt): Hiển thị thông tin cá nhân và số căn hộ */}
    </View>
  );
};

const styles = StyleSheet.create({
  container: { flex: 1, padding: 20 },
  title: { fontSize: 20, fontWeight: 'bold', marginBottom: 8 },
  subtitle: { fontSize: 14, color: '#666' },
});
