// =========================================================================
// KIỂM TRA TÍNH RIÊNG TƯ & BẢO VỆ DỮ LIỆU CÁ NHÂN (PRIVACY & PII INTEGRITY CHECK)
// Phân hệ: backend/dataset/validation/checks/privacy.check.ts
// Đặc tả: Milestone 10.1 — Red Team Fix: Quét PII (SĐT, CCCD, Email, STK, Base64, Bcrypt) & Masking
// =========================================================================

import { CheckResult, DatasetSnapshot } from './types';

export { CheckResult };

/**
 * Regex kiểm tra định dạng chuỗi băm Bcrypt chuẩn ($2a$, $2b$, $2x$, $2y$)
 */
const BCRYPT_HASH_REGEX = /^\$2[abxy]\$\d{2}\$[./A-Za-z0-9]{53}$/;

/**
 * Regex phát hiện số điện thoại Việt Nam (kể cả định dạng có dấu cách, dấu chấm, dấu gạch ngang)
 * Ví dụ: 0987123456, 0987.123.456, 0987-123-456, 0987 123 456, +84 987 123 456
 */
const VN_PHONE_REGEX = /(?:(?:\+84|84|0)[\s.-]?(?:3[2-9]|5[689]|7[06-9]|8[1-9]|9\d)(?:[\s.-]?\d){7})\b/g;

/**
 * Regex phát hiện dãy 12 chữ số liên tiếp tương ứng định dạng Căn cước công dân (CCCD)
 */
const CCCD_REGEX = /\b\d{12}\b/g;

/**
 * Regex phát hiện địa chỉ email nhúng trong các trường văn bản
 */
const EMAIL_REGEX = /\b[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}\b/g;

/**
 * Regex phát hiện số tài khoản ngân hàng (8-19 chữ số kết hợp từ khóa ngữ cảnh)
 */
const BANK_ACCOUNT_CONTEXT_REGEX =
  /(?:stk|số tài khoản|so tai khoan|tài khoản ngân hàng|tai khoan ngan hang|tk ngân hàng|tk ngan hang)[\s:=#-]*([0-9]{8,19})\b/gi;

const BANK_ACCOUNT_LOOKAROUND_REGEX =
  /\b([0-9]{8,19})\b(?=[\s\S]{0,35}(?:stk|số tài khoản|so tai khoan|tài khoản ngân hàng|tai khoan ngan hang))/gi;

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
 * Che giấu username để bảo vệ định danh trong error logs
 * Ví dụ: admin -> ad***n, resident01 -> re***1, nguyen -> ng***n, a -> a*, ab -> a*
 */
export function maskUsername(val: string | null | undefined): string {
  if (!val || typeof val !== 'string') return '***';
  const clean = val.trim();
  if (clean.length <= 2) return `${clean[0]}*`;
  return `${clean.substring(0, 2)}***${clean.substring(clean.length - 1)}`;
}

/**
 * Che giấu số điện thoại để tránh rò rỉ vào error log
 */
export function maskPhone(val: string): string {
  const clean = val.replace(/[\s.-]/g, '');
  if (clean.length < 6) return '***';
  return `${clean.substring(0, 3)}***${clean.substring(clean.length - 3)}`;
}

/**
 * Che giấu CCCD
 */
export function maskCCCD(val: string): string {
  if (val.length < 6) return '******';
  return `${val.substring(0, 6)}******`;
}

/**
 * Che giấu email, bao gồm cả username và domain để tránh lộ định danh / tổ chức nhạy cảm
 * Ví dụ: resident@chungcu.internal -> re***@ch***.internal
 *        admin@gmail.com -> ad***@gm***.com
 *        user@example.invalid -> us***@ex***.invalid
 */
export function maskEmail(email: string | null | undefined): string {
  if (!email || typeof email !== 'string') return '***@***';
  const parts = email.split('@');
  if (parts.length !== 2) return '***@***';
  const name = parts[0];
  const domain = parts[1];
  const maskedName = name.length <= 2 ? `${name[0]}*` : `${name.substring(0, 2)}***`;

  // Che giấu domain để không để lộ nguyên văn domain nhạy cảm
  const domainParts = domain.split('.');
  let maskedDomain = '***';
  if (domainParts.length >= 2) {
    const tld = domainParts[domainParts.length - 1];
    const sld = domainParts.slice(0, domainParts.length - 1).join('.');
    const maskedSld = sld.length <= 2 ? `${sld[0]}*` : `${sld.substring(0, 2)}***`;
    maskedDomain = `${maskedSld}.${tld}`;
  } else if (domain.length > 2) {
    maskedDomain = `${domain.substring(0, 2)}***`;
  }
  return `${maskedName}@${maskedDomain}`;
}

/**
 * Che giấu số tài khoản ngân hàng
 */
export function maskBankAccount(acc: string): string {
  if (acc.length < 6) return '****';
  return `${acc.substring(0, 4)}****${acc.substring(acc.length - 4)}`;
}

/**
 * Quét chuỗi văn bản để phát hiện các mẫu PII: SĐT, CCCD, Email, STK và Base64
 */
function scanTextForPII(
  text: string | null | undefined,
  context: string,
  errors: string[],
  options: { allowSyntheticEmail?: boolean } = {}
): void {
  if (!text || typeof text !== 'string') return;

  // 1. Quét số điện thoại Việt Nam (kể cả định dạng cách quãng)
  const phoneMatches = text.match(VN_PHONE_REGEX);
  if (phoneMatches) {
    for (const match of phoneMatches) {
      errors.push(
        `Phát hiện chuỗi nghi vấn số điện thoại Việt Nam (${maskPhone(match)}) tại ${context}.`
      );
    }
  }

  // 2. Quét CCCD 12 số
  const cccdMatches = text.match(CCCD_REGEX);
  if (cccdMatches) {
    for (const match of cccdMatches) {
      errors.push(
        `Phát hiện chuỗi 12 chữ số nghi vấn CCCD (${maskCCCD(match)}) tại ${context}.`
      );
    }
  }

  // 3. Quét Email nhúng trong văn bản
  if (!options.allowSyntheticEmail) {
    const emailMatches = text.match(EMAIL_REGEX);
    if (emailMatches) {
      for (const email of emailMatches) {
        errors.push(
          `Phát hiện địa chỉ email (${maskEmail(email)}) xuất hiện bất thường trong trường văn bản tại ${context}.`
        );
      }
    }
  }

  // 4. Quét Số tài khoản ngân hàng có ngữ cảnh
  const bankMatches = Array.from(text.matchAll(BANK_ACCOUNT_CONTEXT_REGEX));
  for (const m of bankMatches) {
    if (m[1]) {
      errors.push(
        `Phát hiện dãy số nghi vấn tài khoản ngân hàng (${maskBankAccount(m[1])}) kèm từ khóa ngữ cảnh tại ${context}.`
      );
    }
  }

  const lookaroundMatches = Array.from(text.matchAll(BANK_ACCOUNT_LOOKAROUND_REGEX));
  for (const m of lookaroundMatches) {
    if (m[1]) {
      errors.push(
        `Phát hiện dãy số nghi vấn tài khoản ngân hàng (${maskBankAccount(m[1])}) gần từ khóa ngân hàng tại ${context}.`
      );
    }
  }

  // 5. Quét Base64
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
        `User #${u.id} (${maskUsername(u.username)}) có trường phone không null (tiêu chuẩn dataset M4 yêu cầu phone = null).`
      );
    }

    // Quét PII trong username và fullName
    scanTextForPII(u.username, `User.username (#${u.id})`, errors);
    scanTextForPII(u.fullName, `User.fullName (#${u.id})`, errors);

    // Email: Bắt buộc thuộc domain nội bộ/synthetic chuẩn: @chungcu.internal hoặc @example.invalid
    if (u.email !== null && u.email !== undefined) {
      const emailLower = u.email.toLowerCase();
      const isAllowedDomain =
        emailLower.endsWith('@chungcu.internal') || emailLower.endsWith('@example.invalid');

      if (!isAllowedDomain) {
        invalidEmails++;
        errors.push(
          `User #${u.id} (${maskUsername(u.username)}) có email '${maskEmail(u.email)}' không thuộc domain synthetic được phép (@chungcu.internal hoặc @example.invalid).`
        );
      }

      for (const forbidden of FORBIDDEN_EMAIL_DOMAINS) {
        if (emailLower.includes(forbidden)) {
          invalidEmails++;
          errors.push(
            `User #${u.id} (${maskUsername(u.username)}) sử dụng email có domain công cộng bị cấm ('${maskEmail(u.email)}').`
          );
        }
      }
    }

    // Password Hash: Bắt buộc mã hóa Bcrypt ($2a$, $2b$, $2x$, $2y$)
    // TUYỆT ĐỐI KHÔNG in chuỗi password hoặc passwordHash vào error log!
    if (!u.password || typeof u.password !== 'string' || !BCRYPT_HASH_REGEX.test(u.password)) {
      invalidPasswords++;
      errors.push(
        `User #${u.id} (${maskUsername(u.username)}) có mật khẩu không phải định dạng chuỗi băm Bcrypt hợp lệ (giá trị: [REDACTED]).`
      );
    }
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
        ? 'Dữ liệu không rò rỉ PII, không chứa SĐT/CCCD/Email/STK/Base64, email synthetic chuẩn và mật khẩu 100% Bcrypt hash.'
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
