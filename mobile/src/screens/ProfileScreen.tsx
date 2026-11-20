import React, { useRef, useState } from 'react';
import { KeyboardAvoidingView, Platform, RefreshControl, ScrollView, Text, View } from 'react-native';
import { useAuth } from '../auth/AuthContext';
import { apiClient } from '../api/apiClient';
import { API_ENDPOINTS } from '../api/endpoints';
import { Envelope, errorMessage, Resident, unwrap, validatePassword } from '../api/resident';
import { useResource } from '../api/useResource';
import { Action, ErrorBox, Field, Loading, Row, s } from '../components/ResidentUI';

export function ProfileScreen() {
  const auth = useAuth();
  const profile = useResource<Resident>(API_ENDPOINTS.AUTH.ME);
  const [changing, setChanging] = useState(false);
  const [current, setCurrent] = useState('');
  const [next, setNext] = useState('');
  const [confirm, setConfirm] = useState('');
  const [error, setError] = useState('');
  const [message, setMessage] = useState('');
  const [busy, setBusy] = useState(false);
  const pending = useRef(false);
  async function changePassword() {
    if (pending.current) return;
    const invalid = validatePassword(current, next, confirm);
    if (invalid) { setError(invalid); return; }
    pending.current = true; setBusy(true); setError(''); setMessage('');
    try {
      const response = await apiClient.post<Envelope<null>>(API_ENDPOINTS.AUTH.CHANGE_PASSWORD, {
        currentPassword: current, newPassword: next, confirmPassword: confirm,
      });
      unwrap(response.data);
      setCurrent(''); setNext(''); setConfirm(''); setChanging(false);
      setMessage('Đã đổi mật khẩu thành công.');
    } catch (cause) { setError(errorMessage(cause)); }
    finally { pending.current = false; setBusy(false); }
  }
  const user = profile.data;
  return <KeyboardAvoidingView style={s.page} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
    <ScrollView keyboardShouldPersistTaps="handled" contentContainerStyle={s.content}
      refreshControl={<RefreshControl refreshing={profile.loading} onRefresh={() => { void profile.reload(); }} />}>
      <Text style={s.title}>Căn hộ của tôi</Text>
      <Text style={s.muted}>Thông tin cư dân và quản lý tài khoản</Text>
      {profile.loading && <Loading />}
      <ErrorBox message={profile.error} retry={() => { void profile.reload(); }} />
      {user && <>
        <View style={s.card}><Text style={s.subtitle}>{user.fullName}</Text>
          <Row label="Tài khoản" value={user.username} /><Row label="Email" value={user.email || 'Chưa cập nhật'} />
          <Row label="Điện thoại" value={user.phone || 'Chưa cập nhật'} />
        </View>
        <View style={s.card}><Text style={s.subtitle}>Thông tin căn hộ</Text>
          {user.room ? <><Row label="Số phòng" value={user.room.roomNumber} />
            <Row label="Tầng" value={String(user.room.floor)} /><Row label="Diện tích" value={String(user.room.area) + ' m²'} /></>
            : <Text style={s.muted}>Tài khoản chưa được gắn căn hộ. Vui lòng liên hệ Ban quản lý.</Text>}
        </View>
      </>}
      {!!message && <Text accessibilityLiveRegion="polite" style={s.muted}>{message}</Text>}
      <View style={s.card}><Text style={s.subtitle}>Bảo mật tài khoản</Text>
        {changing ? <>
          <Field label="Mật khẩu hiện tại" value={current} onChangeText={setCurrent} secureTextEntry maxLength={100} editable={!busy} />
          <Field label="Mật khẩu mới (6–100 ký tự)" value={next} onChangeText={setNext} secureTextEntry maxLength={100} editable={!busy} />
          <Field label="Nhập lại mật khẩu mới" value={confirm} onChangeText={setConfirm} secureTextEntry maxLength={100} editable={!busy} />
          <ErrorBox message={error} />
          <Action title={busy ? 'Đang lưu…' : 'Lưu mật khẩu mới'} disabled={busy} onPress={() => { void changePassword(); }} />
          <Action secondary title="Hủy" disabled={busy} onPress={() => {
            setChanging(false); setCurrent(''); setNext(''); setConfirm(''); setError('');
          }} />
        </> : <Action secondary title="Đổi mật khẩu" onPress={() => { setChanging(true); setMessage(''); }} />}
        <Action title="Đăng xuất" disabled={busy} onPress={() => { void auth.signOut(); }} />
      </View>
    </ScrollView>
  </KeyboardAvoidingView>;
}
