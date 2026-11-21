// Phụ trách: Thuần — chỉ nghiệm thu phiếu của mình đã COMPLETED.
import React, { useState } from 'react';
import { Modal, ScrollView, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { API_ENDPOINTS } from '../api/endpoints';
import { Ticket } from '../api/maintenance';
import { useResource } from '../api/useResource';
import { useSubmit } from '../api/useSubmit';
import { TicketList, TicketSummary } from '../components/MaintenanceUI';
import { Action, ErrorBox, Field, Loading, s } from '../components/ResidentUI';

function RatingForm({ id, close, done }: { id: number; close: () => void; done: (ticket: Ticket) => void }) {
  const detail = useResource<Ticket>(API_ENDPOINTS.TICKETS.DETAIL(id));
  const request = useSubmit<Ticket>();
  const [rating, setRating] = useState(0);
  const [comment, setComment] = useState('');
  const [accepted, setAccepted] = useState(false);
  const [error, setError] = useState('');
  async function send() {
    if (detail.data?.status !== 'COMPLETED') { setError('Phiếu chưa sẵn sàng nghiệm thu.'); return; }
    if (!Number.isInteger(rating) || rating < 1 || rating > 5) { setError('Chọn điểm đánh giá từ 1 đến 5 sao.'); return; }
    if (!accepted) { setError('Vui lòng xác nhận đã kiểm tra việc sửa chữa.'); return; }
    if (comment.length > 500) { setError('Nhận xét tối đa 500 ký tự.'); return; }
    setError('');
    const ticket = await request.submit(API_ENDPOINTS.TICKETS.RATE(id), { rating, ratingComment: comment.trim() });
    if (ticket) done(ticket);
  }
  return <Modal visible animationType="slide" onRequestClose={close}><SafeAreaView style={s.page}>
    <ScrollView keyboardShouldPersistTaps="handled" contentContainerStyle={s.content}>
      <Action secondary title="Đóng nghiệm thu" onPress={close} />
      {detail.loading && <Loading />}
      <ErrorBox message={detail.error} retry={() => { void detail.reload(); }} />
      {detail.data && <><View style={s.card}><TicketSummary ticket={detail.data} /><Text style={s.muted}>{detail.data.description}</Text></View>
        {detail.data.status !== 'COMPLETED' ? <Text style={s.muted}>Phiếu không còn ở trạng thái chờ nghiệm thu. Đóng và tải lại danh sách.</Text> : <>
          <Text style={s.subtitle}>Chất lượng sửa chữa: {rating ? rating + '/5 sao' : 'Chưa chọn'}</Text>
          {([1, 2, 3, 4, 5] as const).map(value => <Action key={value} secondary={rating !== value}
            title={value + ' sao'} disabled={request.pending} onPress={() => setRating(value)} />)}
          <Field label="Nhận xét nghiệm thu (không bắt buộc)" value={comment} onChangeText={setComment}
            multiline maxLength={500} editable={!request.pending} />
          <Action secondary title={accepted ? 'Đã xác nhận kiểm tra sửa chữa' : 'Xác nhận đã kiểm tra sửa chữa'}
            disabled={request.pending} onPress={() => setAccepted(value => !value)} />
          <Text style={s.muted}>Gửi đánh giá sẽ nghiệm thu và đóng phiếu.</Text>
          <ErrorBox message={error || request.error} />
          {!!request.error && <Text style={s.muted}>Kiểm tra lại trạng thái phiếu trước khi gửi lại nếu kết nối bị gián đoạn.</Text>}
          <Action title={request.pending ? 'Đang gửi đánh giá...' : 'Gửi đánh giá và đóng phiếu'} disabled={request.pending} onPress={() => { void send(); }} />
        </>}
      </>}
    </ScrollView>
  </SafeAreaView></Modal>;
}
export function RatingScreen() {
  const [selected, setSelected] = useState<number | null>(null);
  const [revision, setRevision] = useState(0);
  const [message, setMessage] = useState('');
  return <View style={s.page}>
    {!!message && <Text accessibilityLiveRegion="polite" style={s.muted}>{message}</Text>}
    <TicketList key={revision} title="Nghiệm thu và đánh giá" status="COMPLETED" empty="Không có phiếu đang chờ nghiệm thu."
      action="Nghiệm thu phiếu" choose={ticket => { setMessage(''); setSelected(ticket.id); }} />
    {selected !== null && <RatingForm key={selected} id={selected} close={() => { setSelected(null); setRevision(value => value + 1); }}
      done={ticket => { setSelected(null); setMessage('Đã ghi nhận đánh giá cho phiếu #' + ticket.id + '.'); setRevision(value => value + 1); }} />}
  </View>;
}
