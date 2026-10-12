// ===================================================
// MÀN HÌNH GỬI PHIẾU BÁO HỎNG SỰ CỐ
// Phụ trách: Thuần
// ===================================================
import React from 'react';
import { View, Text, StyleSheet } from 'react-native';

export const CreateTicketScreen = () => {
  return (
    <View style={styles.container}>
      <Text style={styles.title}>Báo Hỏng / Sự Cố Tòa Nhà</Text>
      <Text style={styles.subtitle}>Chọn loại sự cố (Điện, Nước, Mạng...), mô tả, chụp ảnh/video gửi đi</Text>
      {/* TODO (Thuần): Form chọn danh mục, picker ảnh và nút gửi phiếu */}
    </View>
  );
};

const styles = StyleSheet.create({
  container: { flex: 1, padding: 20 },
  title: { fontSize: 20, fontWeight: 'bold', marginBottom: 8 },
  subtitle: { fontSize: 14, color: '#666' },
});
