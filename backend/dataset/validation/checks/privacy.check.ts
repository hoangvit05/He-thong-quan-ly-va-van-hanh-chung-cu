// =========================================================================
// KIỂM TRA TÍNH RIÊNG TƯ & BẢO VỆ DỮ LIỆU CÁ NHÂN (PRIVACY & PII INTEGRITY CHECK)
// Phân hệ: backend/dataset/validation/checks/privacy.check.ts
// Đặc tả: Milestone 10 — Quét phát hiện số điện thoại, CCCD, Base64, email và Bcrypt hash
// =========================================================================

import { CheckResult, DatasetSnapshot } from './types';

export { CheckResult };

/**
 * Regex kiểm tra định dạng chuỗi băm Bcrypt chuẩn ($2a$, $2b$, $2x$, $2y$)
 */
const BCRYPT_HASH_REGEX = /^\$2[abxy]\$\d{2}\$[./A-Za-z0-9]{53}$/;

/**
 * Regex phát hiện số điện thoại Việt Nam (10 chữ số, các đầu số 03, 05, 07, 08, 09 hoặc +84)
 */
const VN_PHONE_REGEX = /(?:0|\+84)(?:3[2-9]|5[689]|7[06-9]|8[1-9]|9[0-9])[0-9]{7}\b/g;

/**
 * Regex phát hiện dãy 12 chữ số liên tiếp tương ứng định dạng Căn cước công dân (CCCD)
 * Giới hạn quét: Chỉ áp dụng trên các trường văn bản thuần túy, tuyệt đối không quét trường ID số nguyên hay tiền tệ.
 */
const CCCD_REGEX = /\b\d{12}\b/g;

/**
 * Regex phát hiện mã hóa dữ liệu Base64
 */
const BASE64_PAYLOAD_REGEX = /data:(image|video|application)\/[a-zA-Z0-9.+-]+;base64,|;base64,/i;

/**
 * Danh sách domain email công cộng bị cấm xuất hiện trong synthetic dataset
 */
const FORBIDDEN_EMAIL_DOMAINS = [
  'gmail.com',
  'yahoo.com',
  'hotmail.com',
  'outlook.com',
  'icloud.com',
  'aol.com',
  'mail.com',
];

/**
 * Che giấu thông tin nhạy cảm để tránh rò rỉ vào log kiểm định
 */
function maskSensitive(val: string): string {
  if (val.length <= 4) return '***';
  return `${val.substring(0, 3)}***${val.substring(val.length - 2)}`;
}

/**
 * Quét chuỗi văn bản để phát hiện số điện thoại, CCCD và Base64
 */
function scanTextForPII(
  text: string | null | undefined,
  context: string,
  errors: string[]
): void {
  if (!text || typeof text !== 'string') return;

  // 1. Quét số điện thoại VN
  const phoneMatches = text.match(VN_PHONE_REGEX);
  if (phoneMatches) {
    for (const match of phoneMatches) {
      errors.push(
        `Phát hiện chuỗi nghi vấn số điện thoại Việt Nam (${maskSensitive(match)}) tại ${context}.`
      );
    }
  }

  // 2. Quét CCCD 12 số
  const cccdMatches = text.match(CCCD_REGEX);
  if (cccdMatches) {
    for (const match of cccdMatches) {
      errors.push(
        `Phát hiện chuỗi 12 chữ số nghi vấn CCCD (${maskSensitive(match)}) tại ${context}.`
      );
    }
  }

  // 3. Quét Base64
  if (BASE64_PAYLOAD_REGEX.test(text) || (text.length > 5000 && !/\s/.test(text))) {
    errors.push(`Phát hiện chuỗi mã hóa Base64 dung lượng lớn tại ${context}.`);
  }
}

/**
 * Kiểm tra toàn diện tính toàn vẹn riêng tư và dữ liệu PII trực tiếp trên Dataset Snapshot
 */
export function validatePrivacyIntegrity(snapshot: DatasetSnapshot): CheckResult {
  const errors: string[] = [];

  let invalidPasswords = 0;
  let invalidEmails = 0;
  let piiViolations = 0;

  // 1. Kiểm tra User: phone, email và password hash
  for (const u of snapshot.users) {
    // Tiêu chuẩn M4: phone = null cho toàn bộ User
    if (u.phone !== null && u.phone !== undefined) {
      piiViolations++;
      errors.push(
        `User #${u.id} (${u.username}) có trường phone không null (tiêu chuẩn dataset M4 yêu cầu phone = null).`
      );
    }

    // Email: Bắt buộc thuộc domain nội bộ/synthetic chuẩn: @chungcu.internal hoặc @example.invalid
    if (u.email !== null && u.email !== undefined) {
      const emailLower = u.email.toLowerCase();
      const isAllowedDomain =
        emailLower.endsWith('@chungcu.internal') || emailLower.endsWith('@example.invalid');

      if (!isAllowedDomain) {
        invalidEmails++;
        errors.push(
          `User #${u.id} (${u.username}) có email '${u.email}' không thuộc domain synthetic được phép (@chungcu.internal hoặc @example.invalid).`
        );
      }

      for (const forbidden of FORBIDDEN_EMAIL_DOMAINS) {
        if (emailLower.includes(forbidden)) {
          invalidEmails++;
          errors.push(
            `User #${u.id} (${u.username}) sử dụng email công cộng bị cấm: '${forbidden}'.`
          );
        }
      }
    }

    // Password Hash: Bắt buộc mã hóa Bcrypt ($2a$, $2b$, $2x$, $2y$)
    // TUYỆT ĐỐI KHÔNG in chuỗi password/hash vào error log!
    if (!u.password || typeof u.password !== 'string' || !BCRYPT_HASH_REGEX.test(u.password)) {
      invalidPasswords++;
      errors.push(
        `User #${u.id} (${u.username}) có mật khẩu không phải định dạng chuỗi băm Bcrypt hợp lệ.`
      );
    }

    // Quét PII trong tên người dùng
    scanTextForPII(u.fullName, `User.fullName (#${u.id})`, errors);
  }

  // 2. Quét PII trong các trường văn bản của Ticket
  for (const t of snapshot.tickets) {
    scanTextForPII(t.title, `Ticket.title (#${t.id})`, errors);
    scanTextForPII(t.description, `Ticket.description (#${t.id})`, errors);
    scanTextForPII(t.materials, `Ticket.materials (#${t.id})`, errors);
    scanTextForPII(t.ratingComment, `Ticket.ratingComment (#${t.id})`, errors);
  }

  // 3. Quét PII trong Feedback
  for (const f of snapshot.feedbacks) {
    scanTextForPII(f.title, `Feedback.title (#${f.id})`, errors);
    scanTextForPII(f.content, `Feedback.content (#${f.id})`, errors);
    scanTextForPII(f.reply, `Feedback.reply (#${f.id})`, errors);
  }

  // 4. Quét PII trong Notification
  for (const n of snapshot.notifications) {
    scanTextForPII(n.title, `Notification.title (#${n.id})`, errors);
    scanTextForPII(n.content, `Notification.content (#${n.id})`, errors);
  }

  // 5. Quét PII trong Payment note
  for (const p of snapshot.payments) {
    scanTextForPII(p.note, `Payment.note (#${p.id})`, errors);
  }

  return {
    name: 'Privacy & PII Integrity Check',
    passed: errors.length === 0,
    message:
      errors.length === 0
        ? 'Dữ liệu không rò rỉ PII, không chứa số điện thoại/CCCD/Base64, email synthetic chuẩn và mật khẩu 100% Bcrypt hash.'
        : `Phát hiện ${errors.length} cảnh báo riêng tư/PII: ${errors.slice(0, 10).join('; ')}${
            errors.length > 10 ? `... và ${errors.length - 10} cảnh báo khác` : ''
          }`,
    violationsCount: errors.length,
    errors,
    details: {
      invalidPasswords,
      invalidEmails,
      piiViolations,
      totalErrors: errors.length,
    },
  };
}
