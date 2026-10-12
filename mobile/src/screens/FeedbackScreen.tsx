// ===================================================
// MÀN HÌNH HÒM THƯ GÓP Ý & PHẢN HỒI NỘI QUY
// Phụ trách: Thuần
// ===================================================
import React from 'react';
import { View, Text, StyleSheet } from 'react-native';

export const FeedbackScreen = () => {
  return (
    <View style={styles.container}>
      <Text style={styles.title}>Hòm Thư Góp Ý Cư Dân</Text>
      <Text style={styles.subtitle}>Gửi phản ánh về nội quy, an ninh, vệ sinh và xem phản hồi từ BQL</Text>
      {/* TODO (Thuần): Form gửi ý kiến và danh sách các câu trả lời của BQL */}
    </View>
  );
};

const styles = StyleSheet.create({
  container: { flex: 1, padding: 20 },
  title: { fontSize: 20, fontWeight: 'bold', marginBottom: 8 },
  subtitle: { fontSize: 14, color: '#666' },
});
