// ===================================================
// MÀN HÌNH TRA CỨU PHÍ DỊCH VỤ & HÓA ĐƠN ĐỊNH KỲ
// Phụ trách: Nguyệt
// ===================================================
import React from 'react';
import { View, Text, StyleSheet } from 'react-native';

export const InvoiceScreen = () => {
  return (
    <View style={styles.container}>
      <Text style={styles.title}>Hóa Đơn Phí Dịch Vụ Định Kỳ</Text>
      <Text style={styles.subtitle}>Xem biểu phí hàng tháng, trạng thái Đã nộp/Chưa nộp và quét mã VietQR</Text>
      {/* TODO (Nguyệt): Danh sách hóa đơn các tháng và hiển thị mã VietQR chuyển khoản */}
    </View>
  );
};

const styles = StyleSheet.create({
  container: { flex: 1, padding: 20 },
  title: { fontSize: 20, fontWeight: 'bold', marginBottom: 8 },
  subtitle: { fontSize: 14, color: '#666' },
});
