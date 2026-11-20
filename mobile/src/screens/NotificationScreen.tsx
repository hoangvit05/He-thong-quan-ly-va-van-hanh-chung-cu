import React, { useState } from 'react';
import { Modal, RefreshControl, ScrollView, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { API_ENDPOINTS } from '../api/endpoints';
import { dateLabel, Notice } from '../api/resident';
import { useResource } from '../api/useResource';
import { Action, ErrorBox, Loading, s } from '../components/ResidentUI';

export function NotificationScreen() {
  const [page, setPage] = useState(1);
  const [selected, setSelected] = useState<Notice | null>(null);
  const notices = useResource<Notice[]>(API_ENDPOINTS.NOTIFICATIONS.LIST + '?page=' + page + '&limit=20');
  const totalPages = Math.max(1, notices.pagination?.totalPages ?? 1);
  return <View style={s.page}><ScrollView contentContainerStyle={s.content}
    refreshControl={<RefreshControl refreshing={notices.loading} onRefresh={() => { if (page !== 1) setPage(1); else void notices.reload(); }} />}>
    <Text style={s.title}>Bảng tin tòa nhà</Text>
    <Text style={s.muted}>Thông báo chung và tin dành cho căn hộ của bạn.</Text>
    {notices.loading && <Loading />}
    <ErrorBox message={notices.error} retry={() => { void notices.reload(); }} />
    {notices.data?.length === 0 && <Text style={s.muted}>Chưa có thông báo trên trang này.</Text>}
    {notices.data?.map(notice => <View key={notice.id} style={s.card}>
      <Text style={s.muted}>{notice.targetRoom ? 'Căn hộ ' + notice.targetRoom : 'Toàn tòa nhà'} · {dateLabel(notice.createdAt)}</Text>
      <Text style={s.subtitle}>{notice.title}</Text><Text style={s.muted} numberOfLines={3}>{notice.content}</Text>
      <Action secondary title="Đọc thông báo" onPress={() => setSelected(notice)} />
    </View>)}
    <Text style={s.muted}>Trang {page}{notices.pagination ? ' / ' + totalPages : ''}</Text>
    <Action secondary title="Trang trước" disabled={page === 1 || notices.loading} onPress={() => setPage(value => value - 1)} />
    <Action secondary title="Trang sau" disabled={page >= totalPages || notices.loading || !!notices.error} onPress={() => setPage(value => value + 1)} />
  </ScrollView>
    {selected && <Modal visible animationType="slide" onRequestClose={() => setSelected(null)}>
      <SafeAreaView style={s.page}><ScrollView contentContainerStyle={s.content}>
        <Action secondary title="Đóng thông báo" onPress={() => setSelected(null)} />
        <Text style={s.title}>{selected.title}</Text>
        <Text style={s.muted}>{dateLabel(selected.createdAt)} · {selected.author?.fullName || 'Ban quản lý'}</Text>
        <Text selectable style={[s.muted, { fontSize: 17, lineHeight: 27 }]}>{selected.content}</Text>
      </ScrollView></SafeAreaView>
    </Modal>}
  </View>;
}
