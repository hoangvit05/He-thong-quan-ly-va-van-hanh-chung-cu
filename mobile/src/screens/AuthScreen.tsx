import React, { useRef, useState } from 'react';
import { KeyboardAvoidingView, Platform, ScrollView, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useAuth } from '../auth/AuthContext';
import { Action, ErrorBox, Field, s } from '../components/ResidentUI';
import { errorMessage } from '../api/resident';

export function AuthScreen() {
  const { signIn } = useAuth();
  const [identifier, setIdentifier] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const pending = useRef(false);
  async function submit() {
    if (pending.current) return;
    if (!identifier.trim() || !password) { setError('Nhập tài khoản và mật khẩu để tiếp tục.'); return; }
    pending.current = true; setBusy(true); setError('');
    try { await signIn(identifier, password); }
    catch (cause) { setError(errorMessage(cause)); }
    finally { pending.current = false; setBusy(false); }
  }
  return <SafeAreaView style={s.page}><KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
    <ScrollView keyboardShouldPersistTaps="handled" contentContainerStyle={[s.content, { flexGrow: 1, justifyContent: 'center' }]}>
      <Text style={s.muted}>CỔNG CƯ DÂN</Text>
      <Text style={s.title}>Chào mừng về nhà</Text>
      <Text style={s.muted}>Đăng nhập bằng tài khoản Ban quản lý đã cấp và phê duyệt.</Text>
      <View style={s.card}>
        <Field label="Tên đăng nhập, email hoặc số điện thoại" value={identifier} onChangeText={setIdentifier}
          editable={!busy} autoCapitalize="none" autoCorrect={false} maxLength={100} textContentType="username" />
        <Field label="Mật khẩu" value={password} onChangeText={setPassword} editable={!busy}
          secureTextEntry maxLength={100} autoCapitalize="none" textContentType="password" onSubmitEditing={() => { void submit(); }} />
        <ErrorBox message={error} />
        <Action title={busy ? 'Đang đăng nhập…' : 'Đăng nhập'} disabled={busy} onPress={() => { void submit(); }} />
      </View>
      <Text style={s.muted}>Quên mật khẩu hoặc chưa có tài khoản? Liên hệ Ban quản lý để được hỗ trợ.</Text>
    </ScrollView>
  </KeyboardAvoidingView></SafeAreaView>;
}
