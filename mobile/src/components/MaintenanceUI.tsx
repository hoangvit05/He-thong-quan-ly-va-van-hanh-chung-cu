import React, { useState } from 'react';
import { RefreshControl, ScrollView, Text, View } from 'react-native';
import { API_ENDPOINTS } from '../api/endpoints';
import { Ticket, statusLabel } from '../api/maintenance';
import { dateLabel } from '../api/resident';
import { useResource } from '../api/useResource';
import { Action, ErrorBox, Loading, Row, s } from './ResidentUI';

export function Pager({ page, totalPages, loading, change }: {
  page: number; totalPages: number; loading: boolean; change: (page: number) => void;
}) {
  return <View style={s.card}>
    <Text style={s.muted}>Trang {page} / {Math.max(1, totalPages)}</Text>
    <Action secondary title="Trang trước" disabled={loading || page <= 1} onPress={() => change(page - 1)} />
    <Action secondary title="Trang sau" disabled={loading || page >= totalPages} onPress={() => change(page + 1)} />
  </View>;
}
export function TicketSummary({ ticket }: { ticket: Ticket }) {
  return <>
    <Text style={s.subtitle}>#{ticket.id} — {ticket.title || ticket.category}</Text>
    <Row label="Trạng thái" value={statusLabel(ticket.status)} />
    <Row label="Vị trí" value={ticket.roomId === null ? 'Khu vực chung' : ticket.room?.roomNumber || 'Căn hộ của bạn'} />
    <Row label="Ngày gửi" value={dateLabel(ticket.createdAt)} />
    {ticket.isDuplicate && <Text style={s.muted}>Có sự cố tương tự trong 24 giờ khi gửi phiếu.</Text>}
  </>;
}
export function TicketList({ title, status, empty, choose, action }: {
  title: string; status?: string; empty: string; choose: (ticket: Ticket) => void; action: string;
}) {
  const [page, setPage] = useState(1);
  const resource = useResource<Ticket[]>(API_ENDPOINTS.TICKETS.MY_TICKETS + '?page=' + page + '&limit=10' +
    (status ? '&status=' + encodeURIComponent(status) : ''));
  return <ScrollView contentContainerStyle={s.content}
    refreshControl={<RefreshControl refreshing={resource.loading} onRefresh={() => { void resource.reload(); }} />}>
    <Text style={s.title}>{title}</Text>
    <Action secondary title="Tải lại danh sách" disabled={resource.loading} onPress={() => { void resource.reload(); }} />
    {resource.loading && <Loading />}
    <ErrorBox message={resource.error} retry={() => { void resource.reload(); }} />
    {resource.data?.length === 0 && <Text style={s.muted}>{empty}</Text>}
    {resource.data?.map(ticket => <View key={ticket.id} style={s.card}>
      <TicketSummary ticket={ticket} />
      <Action title={action + ' #' + ticket.id} onPress={() => choose(ticket)} />
    </View>)}
    <Pager page={page} totalPages={resource.pagination?.totalPages ?? page} loading={resource.loading} change={setPage} />
  </ScrollView>;
}
