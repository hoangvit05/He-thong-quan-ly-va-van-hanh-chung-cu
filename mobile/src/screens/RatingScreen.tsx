// ===================================================
// MÀN HÌNH NGHIỆM THU & CHẤM ĐIỂM ĐÁNH GIÁ (1-5 SAO)
// Phụ trách: Thuần
// ===================================================
import React from 'react';
import { View, Text, StyleSheet } from 'react-native';

export const RatingScreen = () => {
  return (
    <View style={styles.container}>
      <Text style={styles.title}>Nghiệm Thu & Đánh Giá Dịch Vụ</Text>
      <Text style={styles.subtitle}>Xác nhận nhà đã sửa xong và chấm từ 1 đến 5 sao</Text>
      {/* TODO (Thuần): Nút xác nhận và rating bar 1-5 sao */}
    </View>
  );
};

const styles = StyleSheet.create({
  container: { flex: 1, padding: 20 },
  title: { fontSize: 20, fontWeight: 'bold', marginBottom: 8 },
  subtitle: { fontSize: 14, color: '#666' },
});
