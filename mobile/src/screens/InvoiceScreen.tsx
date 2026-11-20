import React, { useState } from 'react';
import { Image, Modal, RefreshControl, ScrollView, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { API_ENDPOINTS } from '../api/endpoints';
import { dateLabel, Invoice, invoiceStatus, money, safeQrUrl, validMonth, VietQr } from '../api/resident';
import { useResource } from '../api/useResource';
import { Action, ErrorBox, Field, Loading, Row, s } from '../components/ResidentUI';

function InvoiceDetail({ invoice, close }: { invoice: Invoice; close: () => void }) {
  const qr = useResource<VietQr>(API_ENDPOINTS.INVOICES.VIETQR(invoice.id));
  const [imageError, setImageError] = useState(false);
  const url = safeQrUrl(qr.data?.vietQrUrl ?? null);
  return <Modal visible animationType="slide" onRequestClose={close}>
    <SafeAreaView style={s.page}><ScrollView contentContainerStyle={s.content}>
      <Action secondary title="Đóng chi tiết" onPress={close} />
      <Text style={s.title}>Hóa đơn {invoice.month}</Text>
      <View style={s.card}>
        <Row label="Phí quản lý" value={money(invoice.managementFee)} />
        <Row label="Phí gửi xe" value={money(invoice.parkingFee)} />
        <Row label="Tiền nước" value={money(invoice.waterFee)} />
        <Row label="Phí khác" value={money(invoice.otherFee)} />
        <Row label="Tổng tiền" value={money(invoice.totalAmount)} />
        <Row label="Đã thanh toán" value={money(qr.data?.paidAmount ?? invoice.paidAmount)} />
        <Row label="Hạn thanh toán" value={dateLabel(invoice.dueDate)} />
      </View>
      {qr.loading && <Loading />}
      <ErrorBox message={qr.error} retry={() => { setImageError(false); void qr.reload(); }} />
      {qr.data && <View style={s.card}>
        <Text style={s.subtitle}>{qr.data.isFullyPaid ? 'Đã thanh toán đầy đủ' : 'Chuyển khoản VietQR'}</Text>
        <Row label="Còn phải thanh toán" value={money(qr.data.remainingAmount)} />
        {!qr.data.isFullyPaid && <>
          {url && !imageError
            ? <Image accessibilityLabel="Mã VietQR thanh toán hóa đơn" source={{ uri: url }}
                style={{ width: '100%', aspectRatio: 1 }} resizeMode="contain" onError={() => setImageError(true)} />
            : <ErrorBox message="Chưa tải được ảnh VietQR." retry={() => { setImageError(false); void qr.reload(); }} />}
          <Text style={s.muted}>Quét mã để điền thông tin chuyển khoản. Hóa đơn chỉ được cập nhật sau khi Ban quản lý đối soát và xác nhận.</Text>
        </>}
        <Action secondary title="Kiểm tra lại thanh toán" onPress={() => { setImageError(false); void qr.reload(); }} />
      </View>}
      <View style={s.card}><Text style={s.subtitle}>Lịch sử thanh toán</Text>
        {invoice.payments?.length ? invoice.payments.map(payment => <Row key={payment.id}
          label={dateLabel(payment.paidAt)} value={money(payment.amount)} />)
          : <Text style={s.muted}>Chưa có giao dịch được ghi nhận.</Text>}
        <Text style={s.muted}>Đóng chi tiết và tải lại danh sách để cập nhật lịch sử mới nhất.</Text>
      </View>
    </ScrollView></SafeAreaView>
  </Modal>;
}
export function InvoiceScreen() {
  const [month, setMonth] = useState('');
  const [filter, setFilter] = useState('');
  const [error, setError] = useState('');
  const [selected, setSelected] = useState<Invoice | null>(null);
  const invoices = useResource<Invoice[]>(API_ENDPOINTS.INVOICES.MY_INVOICE + (filter ? '?month=' + encodeURIComponent(filter) : ''));
  return <View style={s.page}><ScrollView keyboardShouldPersistTaps="handled" contentContainerStyle={s.content}
    refreshControl={<RefreshControl refreshing={invoices.loading} onRefresh={() => { void invoices.reload(); }} />}>
    <Text style={s.title}>Hóa đơn căn hộ</Text><Text style={s.muted}>Theo dõi phí sinh hoạt và thông tin chuyển khoản.</Text>
    <View style={s.card}><Field label="Tháng (YYYY-MM, để trống để xem tất cả)" value={month} onChangeText={setMonth} maxLength={7} placeholder="2026-11" />
      <ErrorBox message={error} />
      <Action secondary title="Tra cứu" disabled={invoices.loading} onPress={() => {
        const value = month.trim();
        if (!validMonth(value)) { setError('Nhập tháng theo dạng YYYY-MM, ví dụ 2026-11.'); return; }
        setError(''); if (value === filter) void invoices.reload(); else setFilter(value);
      }} />
    </View>
    {invoices.loading && <Loading />}
    <ErrorBox message={invoices.error} retry={() => { void invoices.reload(); }} />
    {invoices.data?.length === 0 && <Text style={s.muted}>Chưa có hóa đơn cho thời gian này.</Text>}
    {invoices.data?.map(invoice => <View key={invoice.id} style={s.card}>
      <Text style={s.subtitle}>Tháng {invoice.month}</Text>
      <Text style={s.muted}>{invoiceStatus[invoice.status] || invoice.status}</Text>
      <Row label="Tổng tiền" value={money(invoice.totalAmount)} />
      <Row label="Đã thanh toán" value={money(invoice.paidAmount)} />
      <Row label="Hạn thanh toán" value={dateLabel(invoice.dueDate)} />
      <Action title="Xem chi tiết và thanh toán" onPress={() => setSelected(invoice)} />
    </View>)}
  </ScrollView>
    {selected && <InvoiceDetail key={selected.id} invoice={selected} close={() => { setSelected(null); void invoices.reload(); }} />}
  </View>;
}
