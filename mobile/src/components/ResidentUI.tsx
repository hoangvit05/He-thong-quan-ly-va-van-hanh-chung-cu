import React from 'react';
import { ActivityIndicator, Pressable, StyleSheet, Text, TextInput, TextInputProps, View } from 'react-native';

export const colors = { ink: '#17323B', muted: '#536B73', brand: '#126B60', background: '#F3F7F6', border: '#CFDDDA', danger: '#AA3030' };
export function Action({ title, onPress, disabled = false, secondary = false }: {
  title: string; onPress: () => void; disabled?: boolean; secondary?: boolean;
}) {
  return <Pressable accessibilityRole="button" accessibilityState={{ disabled }} disabled={disabled} onPress={onPress}
    style={({ pressed }) => [s.button, secondary && s.secondary, (disabled || pressed) && { opacity: 0.55 }]}>
    <Text style={[s.buttonText, secondary && { color: colors.brand }]}>{title}</Text>
  </Pressable>;
}
export function Field({ label, ...props }: TextInputProps & { label: string }) {
  return <View style={s.field}><Text style={s.label}>{label}</Text>
    <TextInput accessibilityLabel={label} placeholderTextColor={colors.muted} style={s.input} {...props} /></View>;
}
export function ErrorBox({ message, retry }: { message: string; retry?: () => void }) {
  if (!message) return null;
  return <View accessibilityLiveRegion="polite" style={s.error}>
    <Text style={{ color: colors.danger }}>{message}</Text>
    {retry && <Action secondary title="Thử lại" onPress={retry} />}
  </View>;
}
export function Loading() { return <ActivityIndicator accessibilityLabel="Đang tải" size="large" color={colors.brand} style={{ margin: 24 }} />; }
export function Row({ label, value }: { label: string; value: string }) {
  return <View style={s.row}><Text style={s.muted}>{label}</Text><Text selectable style={s.value}>{value}</Text></View>;
}
export const s = StyleSheet.create({
  page: { flex: 1, backgroundColor: colors.background },
  content: { padding: 20, paddingBottom: 40, gap: 16, width: '100%', maxWidth: 680, alignSelf: 'center' },
  title: { fontSize: 26, fontWeight: '700', color: colors.ink },
  subtitle: { fontSize: 18, fontWeight: '600', color: colors.ink },
  muted: { fontSize: 14, lineHeight: 21, color: colors.muted },
  card: { backgroundColor: '#FFFFFF', padding: 18, borderRadius: 16, borderWidth: 1, borderColor: colors.border, gap: 12 },
  button: { backgroundColor: colors.brand, minHeight: 48, padding: 12, borderRadius: 10, alignItems: 'center', justifyContent: 'center' },
  secondary: { backgroundColor: '#E6F1EE' },
  buttonText: { color: '#FFFFFF', fontWeight: '600', fontSize: 15 },
  field: { gap: 8 },
  label: { color: colors.ink, fontWeight: '500' },
  input: { borderWidth: 1, borderColor: colors.border, backgroundColor: '#FFFFFF', borderRadius: 10, padding: 12, minHeight: 48, color: colors.ink, fontSize: 16 },
  error: { backgroundColor: '#FFF0EE', padding: 14, borderRadius: 10, gap: 12 },
  row: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start', gap: 12 },
  value: { flex: 1, textAlign: 'right', color: colors.ink, fontSize: 15, lineHeight: 21 },
});
