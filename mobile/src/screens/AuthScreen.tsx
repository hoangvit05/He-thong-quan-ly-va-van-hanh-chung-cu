// ===================================================
// MÀN HÌNH ĐĂNG NHẬP & ĐỔI MẬT KHẨU
// Phụ trách: Nguyệt
// ===================================================
import React from 'react';
import { View, Text, StyleSheet } from 'react-native';

export const AuthScreen = () => {
  return (
    <View style={styles.container}>
      <Text style={styles.title}>Đăng Nhập Cư Dân</Text>
      <Text style={styles.subtitle}>Nhập số phòng và mật khẩu được BQL cấp</Text>
      {/* TODO (Nguyệt): Viết Form đăng nhập và đổi mật khẩu */}
    </View>
  );
};

const styles = StyleSheet.create({
  container: { flex: 1, justifyContent: 'center', alignItems: 'center', padding: 20 },
  title: { fontSize: 24, fontWeight: 'bold', marginBottom: 8 },
  subtitle: { fontSize: 14, color: '#666' },
});
