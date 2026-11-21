// Phụ trách: Thuần — form báo hỏng dùng API cư dân hiện có.
import React, { useState } from 'react';
import { ScrollView, Text, View } from 'react-native';
import { API_ENDPOINTS } from '../api/endpoints';
import { Ticket, validateTicket } from '../api/maintenance';
import { useSubmit } from '../api/useSubmit';
import { Action, ErrorBox, Field, s } from '../components/ResidentUI';

export function CreateTicketScreen() {
  const [title, setTitle] = useState('');
  const [category, setCategory] = useState('');
  const [description, setDescription] = useState('');
  const [common, setCommon] = useState(false);
  const [error, setError] = useState('');
  const [receipt, setReceipt] = useState<Ticket | null>(null);
  const request = useSubmit<Ticket>();
  async function send() {
    const invalid = validateTicket(title, category, description);
    setError(invalid); if (invalid) return;
    // Identity and default room are resolved by the backend from JWT.
    const ticket = await request.submit(API_ENDPOINTS.TICKETS.CREATE, {
      ...(title.trim() ? { title: title.trim() } : {}),
      category: category.trim(), description: description.trim(), ...(common ? { roomId: null } : {}),
    });
    if (ticket) setReceipt(ticket);
  }
  return <View style={s.page}><ScrollView keyboardShouldPersistTaps="handled" contentContainerStyle={s.content}>
    <Text style={s.title}>Báo hỏng / Sự cố</Text>
    {receipt ? <View style={s.card}>
      <Text accessibilityLiveRegion="polite" style={s.subtitle}>Đã tiếp nhận phiếu #{receipt.id}</Text>
      <Text style={s.muted}>{receipt.isDuplicate
        ? 'Có sự cố tương tự trong 24 giờ. Phiếu vẫn được tiếp nhận và đã được đánh dấu để Ban quản lý kiểm tra.'
        : 'Bạn có thể theo dõi xử lý tại mục Theo dõi tiến độ.'}</Text>
      <Action title="Tạo phiếu khác" onPress={() => {
        setReceipt(null); setTitle(''); setCategory(''); setDescription(''); setCommon(false); setError('');
      }} />
    </View> : <>
      <Field label="Tiêu đề (không bắt buộc)" value={title} onChangeText={setTitle} maxLength={100} editable={!request.pending} />
      <Field label="Danh mục sự cố" value={category} onChangeText={setCategory} maxLength={50} editable={!request.pending} placeholder="Điện, Nước, Internet..." />
      <Field label="Mô tả sự cố" value={description} onChangeText={setDescription} maxLength={2000} multiline editable={!request.pending} />
      <Text style={s.muted}>Vị trí: {common ? 'Khu vực chung' : 'Căn hộ của bạn; nếu chưa gắn căn hộ, gửi cho khu vực chung'}.</Text>
      <Action secondary title={common ? 'Chuyển sang căn hộ của tôi' : 'Chuyển sang khu vực chung'}
        disabled={request.pending} onPress={() => setCommon(value => !value)} />
      <Text style={s.muted}>Hiện có thể gửi phiếu không kèm ảnh/video.</Text>
      <ErrorBox message={error || request.error} />
      {!!request.error && <Text style={s.muted}>Nếu mất kết nối khi gửi, kiểm tra danh sách phiếu trước khi gửi lại.</Text>}
      <Action title={request.pending ? 'Đang gửi...' : 'Gửi báo hỏng'} disabled={request.pending} onPress={() => { void send(); }} />
    </>}
  </ScrollView></View>;
}
