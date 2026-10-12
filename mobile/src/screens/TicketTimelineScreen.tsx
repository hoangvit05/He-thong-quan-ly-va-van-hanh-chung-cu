// ===================================================
// MÀN HÌNH XEM TIẾN ĐỘ SỬA CHỮA (TIMELINE)
// Phụ trách: Thuần
// ===================================================
import React from 'react';
import { View, Text, StyleSheet } from 'react-native';

export const TicketTimelineScreen = () => {
  return (
    <View style={styles.container}>
      <Text style={styles.title}>Tiến Độ Sửa Chữa</Text>
      <Text style={styles.subtitle}>Mới gửi -> Đã gán thợ -> Đang sửa -> Đã xong</Text>
      {/* TODO (Thuần): Dòng thời gian tiến độ trạng thái phiếu */}
    </View>
  );
};

const styles = StyleSheet.create({
  container: { flex: 1, padding: 20 },
  title: { fontSize: 20, fontWeight: 'bold', marginBottom: 8 },
  subtitle: { fontSize: 14, color: '#666' },
});
