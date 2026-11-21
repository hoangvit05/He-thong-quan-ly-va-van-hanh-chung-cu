// Phụ trách: Thuần — góp ý cá nhân và phản hồi BQL.
import React, { useState } from 'react';
import { RefreshControl, ScrollView, Text, View } from 'react-native';
import { API_ENDPOINTS } from '../api/endpoints';
import { Feedback, validateFeedback } from '../api/maintenance';
import { dateLabel } from '../api/resident';
import { useResource } from '../api/useResource';
import { useSubmit } from '../api/useSubmit';
import { Pager } from '../components/MaintenanceUI';
import { Action, ErrorBox, Field, Loading, Row, s } from '../components/ResidentUI';

export function FeedbackScreen() {
  const [page, setPage] = useState(1);
  const [title, setTitle] = useState('');
  const [content, setContent] = useState('');
  const [error, setError] = useState('');
  const [message, setMessage] = useState('');
  const request = useSubmit<Feedback>();
  const list = useResource<Feedback[]>(API_ENDPOINTS.FEEDBACK.MY_FEEDBACK + '?page=' + page + '&limit=10');
  async function send() {
    const invalid = validateFeedback(title, content);
    setError(invalid); setMessage(''); if (invalid) return;
    // Do not send roomId/residentId/reply/isResolved; server owns identity and reply state.
    const feedback = await request.submit(API_ENDPOINTS.FEEDBACK.SUBMIT, { title: title.trim(), content: content.trim() });
    if (feedback) {
      setMessage('Đã tiếp nhận góp ý #' + feedback.id + '.');
      setTitle(''); setContent('');
      if (page === 1) void list.reload(); else setPage(1);
    }
  }
  return <View style={s.page}><ScrollView keyboardShouldPersistTaps="handled" contentContainerStyle={s.content}
    refreshControl={<RefreshControl refreshing={list.loading} onRefresh={() => { void list.reload(); }} />}>
    <Text style={s.title}>Góp ý của tôi</Text>
    <View style={s.card}>
      <Field label="Tiêu đề góp ý" value={title} onChangeText={setTitle} maxLength={200} editable={!request.pending} />
      <Field label="Nội dung góp ý" value={content} onChangeText={setContent} multiline maxLength={2000} editable={!request.pending} />
      <ErrorBox message={error || request.error} />
      {!!request.error && <Text style={s.muted}>Nếu mất kết nối khi gửi, kiểm tra danh sách góp ý trước khi gửi lại.</Text>}
      {!!message && <Text accessibilityLiveRegion="polite" style={s.muted}>{message}</Text>}
      <Action title={request.pending ? 'Đang gửi góp ý...' : 'Gửi góp ý'} disabled={request.pending} onPress={() => { void send(); }} />
    </View>
    <Action secondary title="Tải lại góp ý" disabled={list.loading} onPress={() => { void list.reload(); }} />
    {list.loading && <Loading />}
    <ErrorBox message={list.error} retry={() => { void list.reload(); }} />
    {list.data?.length === 0 && <Text style={s.muted}>Bạn chưa gửi góp ý nào.</Text>}
    {list.data?.map(feedback => <View key={feedback.id} style={s.card}>
      <Text style={s.subtitle}>#{feedback.id} — {feedback.title}</Text>
      <Text style={s.muted}>{feedback.content}</Text>
      <Row label="Ngày gửi" value={dateLabel(feedback.createdAt)} />
      <Row label="Trạng thái" value={feedback.isResolved ? 'Đã giải quyết' : 'Đang xử lý'} />
      <Text style={s.subtitle}>Phản hồi của Ban quản lý</Text>
      <Text style={s.muted}>{feedback.reply || 'Chưa có phản hồi.'}</Text>
      {feedback.repliedAt && <Row label="Ngày phản hồi" value={dateLabel(feedback.repliedAt)} />}
    </View>)}
    <Pager page={page} totalPages={list.pagination?.totalPages ?? page} loading={list.loading} change={setPage} />
  </ScrollView></View>;
}
