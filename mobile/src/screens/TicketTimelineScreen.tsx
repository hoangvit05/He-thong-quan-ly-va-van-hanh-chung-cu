// Phụ trách: Thuần — trạng thái hiện tại từ server, không suy diễn lịch sử chuyển trạng thái.
import React, { useState } from 'react';
import { Modal, ScrollView, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { API_ENDPOINTS } from '../api/endpoints';
import { Ticket, ticketSteps } from '../api/maintenance';
import { dateLabel } from '../api/resident';
import { useResource } from '../api/useResource';
import { TicketList, TicketSummary } from '../components/MaintenanceUI';
import { Action, ErrorBox, Loading, Row, s } from '../components/ResidentUI';

function TicketDetail({ id, close }: { id: number; close: () => void }) {
  const resource = useResource<Ticket>(API_ENDPOINTS.TICKETS.DETAIL(id));
  const ticket = resource.data;
  return <Modal visible animationType="slide" onRequestClose={close}><SafeAreaView style={s.page}>
    <ScrollView contentContainerStyle={s.content}>
      <Action secondary title="Đóng chi tiết phiếu" onPress={close} />
      <Action secondary title="Cập nhật tiến độ" disabled={resource.loading} onPress={() => { void resource.reload(); }} />
      {resource.loading && <Loading />}
      <ErrorBox message={resource.error} retry={() => { void resource.reload(); }} />
      {ticket && <>
        <View style={s.card}><TicketSummary ticket={ticket} /><Text style={s.muted}>{ticket.description}</Text>
          <Row label="Thợ phụ trách" value={ticket.technician?.fullName || 'Chưa được gán thợ'} />
          {ticket.technician?.phone && <Row label="Điện thoại thợ" value={ticket.technician.phone} />}
          <Row label="Cập nhật gần nhất" value={dateLabel(ticket.updatedAt)} />
        </View>
        <View style={s.card}><Text style={s.subtitle}>Tiến độ xử lý</Text>
          {ticketSteps.map(step => <Text key={step.status} style={ticket.status === step.status ? s.subtitle : s.muted}>
            {step.label}{ticket.status === step.status ? ' — Hiện tại' : ''}
          </Text>)}
          <Text style={s.muted}>Các bước mô tả quy trình; chỉ bước hiện tại được xác nhận. Phiếu đóng có thể là phiếu đã hủy.</Text>
        </View>
        {ticket.materials && <View style={s.card}><Text style={s.subtitle}>Vật tư sửa chữa</Text><Text style={s.muted}>{ticket.materials}</Text></View>}
        {ticket.rating != null && <View style={s.card}><Row label="Đánh giá" value={ticket.rating + '/5 sao'} />
          {ticket.ratingComment && <Text style={s.muted}>{ticket.ratingComment}</Text>}</View>}
      </>}
    </ScrollView>
  </SafeAreaView></Modal>;
}
export function TicketTimelineScreen() {
  const [selected, setSelected] = useState<number | null>(null);
  const [revision, setRevision] = useState(0);
  return <View style={s.page}>
    <TicketList key={revision} title="Theo dõi tiến độ" empty="Bạn chưa gửi phiếu sự cố nào." action="Xem phiếu"
      choose={ticket => setSelected(ticket.id)} />
    {selected !== null && <TicketDetail key={selected} id={selected} close={() => { setSelected(null); setRevision(value => value + 1); }} />}
  </View>;
}
