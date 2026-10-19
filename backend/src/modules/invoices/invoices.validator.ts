// =========================================================================
// TIỆN ÍCH KIỂM TRA HỢP LỆ VÀ XÁC THỰC DỮ LIỆU PHÂN HỆ HÓA ĐƠN & BIỂU PHÍ
// Phụ trách: Hiếu (Bảo vệ tính toàn vẹn tài chính, độ chính xác Decimal và chống sai lệch dữ liệu)
// =========================================================================
import { Prisma, InvoiceStatus, PaymentMethod } from '@prisma/client';
import { containsBase64Payload } from '../../common/utils/validation';

export interface ValidationResult {
  isValid: boolean;
  errors: string[];
}

/**
 * Giới hạn số tiền tối đa cho một hạng mục phí: 999,999,999.99 VND (dưới 1 tỷ VND)
 * Điều này ngăn chặn lỗi tràn số cột DECIMAL(12, 2) trong PostgreSQL.
 */
export const MAX_SAFE_FEE_DECIMAL = new Prisma.Decimal('999999999.99');

/**
 * Kiểm tra xem chuỗi có đúng định dạng tháng YYYY-MM hoặc MM/YYYY hay không
 */
export function isValidMonthFormat(rawMonth: unknown): boolean {
  if (typeof rawMonth !== 'string') return false;
  const trimmed = rawMonth.trim();
  // Khớp ISO YYYY-MM (2026-01 đến 2026-12)
  if (/^\d{4}-(0[1-9]|1[0-2])$/.test(trimmed)) return true;
  // Khớp MM/YYYY (01/2026 đến 12/2026)
  if (/^(0[1-9]|1[0-2])\/\d{4}$/.test(trimmed)) return true;
  return false;
}

/**
 * Chuẩn hóa định dạng tháng về chuẩn ISO YYYY-MM (ví dụ: "2026-10")
 * Từ chối nghiêm ngặt các định dạng sai như "2026-2", "2026-13", "2026-00"
 */
export function normalizeMonth(rawMonth: unknown): string {
  if (typeof rawMonth !== 'string' || !rawMonth.trim()) {
    throw new Error('Định dạng tháng không hợp lệ. Vui lòng nhập định dạng YYYY-MM (ví dụ: "2026-10") hoặc MM/YYYY.');
  }

  const trimmed = rawMonth.trim();

  // Khớp định dạng YYYY-MM (2026-10)
  if (/^\d{4}-(0[1-9]|1[0-2])$/.test(trimmed)) {
    return trimmed;
  }

  // Khớp định dạng MM/YYYY (10/2026) -> chuyển thành YYYY-MM
  const match = trimmed.match(/^(0[1-9]|1[0-2])\/(\d{4})$/);
  if (match) {
    return `${match[2]}-${match[1]}`;
  }

  throw new Error('Định dạng tháng không hợp lệ. Vui lòng nhập định dạng YYYY-MM (ví dụ: "2026-10") hoặc MM/YYYY.');
}

/**
 * Kiểm tra và chuyển đổi an toàn sang Prisma.Decimal với độ chính xác 2 chữ số thập phân.
 * Chặn tuyệt đối số âm, NaN, Infinity và giá trị vượt ngưỡng tràn cột DECIMAL(12, 2).
 */
export function parseSafeDecimal(
  val: unknown,
  fieldName: string,
  defaultValue = '0',
  maxAllowed: Prisma.Decimal = MAX_SAFE_FEE_DECIMAL
): Prisma.Decimal {
  if (val === undefined || val === null || val === '') {
    return new Prisma.Decimal(defaultValue);
  }

  try {
    const dec = new Prisma.Decimal(val as any);
    if (dec.isNaN() || !dec.isFinite()) {
      throw new Error(`Giá trị ${fieldName} không hợp lệ.`);
    }
    if (dec.isNegative()) {
      throw new Error(`Số tiền ${fieldName} không được âm.`);
    }
    if (dec.greaterThan(maxAllowed)) {
      throw new Error(`Số tiền ${fieldName} vượt quá giới hạn tối đa cho phép (${maxAllowed.toString()} VND).`);
    }
    return dec.toDecimalPlaces(2, Prisma.Decimal.ROUND_HALF_UP);
  } catch (err: any) {
    throw new Error(err.message || `Giá trị ${fieldName} không hợp lệ.`);
  }
}

/**
 * Kiểm tra tính hợp lệ của dữ liệu đầu vào khi BQL lập hóa đơn mới
 */
export function validateCreateInvoiceInput(data: any): {
  isValid: boolean;
  errors: string[];
  parsed?: {
    roomId: number;
    normalizedMonth: string;
    managementFee: Prisma.Decimal;
    parkingFee: Prisma.Decimal;
    waterFee: Prisma.Decimal;
    otherFee: Prisma.Decimal;
    totalAmount: Prisma.Decimal;
    dueDate: Date | null;
  };
} {
  const errors: string[] = [];

  if (!data || typeof data !== 'object') {
    return { isValid: false, errors: ['Dữ liệu lập hóa đơn không đúng định dạng JSON.'] };
  }

  // 1. Kiểm tra roomId
  const parsedRoomId = Number(data.roomId);
  if (!data.roomId || !Number.isInteger(parsedRoomId) || parsedRoomId <= 0) {
    errors.push('Mã căn hộ (roomId) là bắt buộc và phải là số nguyên dương.');
  }

  // 2. Kiểm tra định dạng tháng
  let normalizedMonth = '';
  try {
    normalizedMonth = normalizeMonth(data.month);
  } catch (err: any) {
    errors.push(err.message);
  }

  // 3. Kiểm tra các hạng mục phí bằng Decimal
  let managementFee = new Prisma.Decimal(0);
  let parkingFee = new Prisma.Decimal(0);
  let waterFee = new Prisma.Decimal(0);
  let otherFee = new Prisma.Decimal(0);

  try {
    managementFee = parseSafeDecimal(data.managementFee, 'Phí quản lý');
  } catch (err: any) {
    errors.push(err.message);
  }

  try {
    parkingFee = parseSafeDecimal(data.parkingFee, 'Phí gửi xe');
  } catch (err: any) {
    errors.push(err.message);
  }

  try {
    waterFee = parseSafeDecimal(data.waterFee, 'Tiền nước');
  } catch (err: any) {
    errors.push(err.message);
  }

  try {
    otherFee = parseSafeDecimal(data.otherFee, 'Phí khác');
  } catch (err: any) {
    errors.push(err.message);
  }

  // Chốt Snapshot tổng tiền
  const totalAmount = managementFee.plus(parkingFee).plus(waterFee).plus(otherFee);

  // 4. Kiểm tra dueDate (nếu có)
  let dueDate: Date | null = null;
  if (data.dueDate !== undefined && data.dueDate !== null && data.dueDate !== '') {
    const parsedDate = new Date(data.dueDate);
    if (isNaN(parsedDate.getTime())) {
      errors.push('Hạn nộp tiền (dueDate) không đúng định dạng ngày tháng hợp lệ.');
    } else {
      dueDate = parsedDate;
    }
  }

  if (errors.length > 0) {
    return { isValid: false, errors };
  }

  return {
    isValid: true,
    errors: [],
    parsed: {
      roomId: parsedRoomId,
      normalizedMonth,
      managementFee,
      parkingFee,
      waterFee,
      otherFee,
      totalAmount,
      dueDate,
    },
  };
}

/**
 * Kiểm tra tính hợp lệ khi BQL cập nhật trạng thái thanh toán & ghi nhận giao dịch
 */
export function validatePaymentUpdateInput(data: any): {
  isValid: boolean;
  errors: string[];
  parsed?: {
    status?: InvoiceStatus;
    paymentMethod: PaymentMethod;
    paidAmount?: Prisma.Decimal;
    transactionCode: string | null;
    note: string | null;
  };
} {
  const errors: string[] = [];

  if (!data || typeof data !== 'object') {
    return { isValid: false, errors: ['Dữ liệu cập nhật thanh toán không đúng định dạng JSON.'] };
  }

  // Yêu cầu ít nhất một trong hai trường: status hoặc paidAmount
  const hasStatus = data.status !== undefined && data.status !== null && data.status !== '';
  const hasPaidAmount = data.paidAmount !== undefined && data.paidAmount !== null && data.paidAmount !== '';
  if (!hasStatus && !hasPaidAmount) {
    errors.push('Vui lòng cung cấp ít nhất một trong hai thông tin: trạng thái (status) hoặc số tiền thanh toán (paidAmount).');
  }

  // 1. Kiểm tra status nếu được truyền
  let status: InvoiceStatus | undefined = undefined;
  if (data.status !== undefined && data.status !== null) {
    if (!Object.values(InvoiceStatus).includes(data.status)) {
      errors.push(`Trạng thái hóa đơn không hợp lệ. Các trạng thái được phép: [${Object.values(InvoiceStatus).join(', ')}].`);
    } else {
      status = data.status as InvoiceStatus;
    }
  }

  // 2. Kiểm tra paymentMethod
  let paymentMethod: PaymentMethod = PaymentMethod.VIETQR;
  if (data.paymentMethod !== undefined && data.paymentMethod !== null) {
    if (!Object.values(PaymentMethod).includes(data.paymentMethod)) {
      errors.push(`Phương thức thanh toán không hợp lệ. Các phương thức được phép: [${Object.values(PaymentMethod).join(', ')}].`);
    } else {
      paymentMethod = data.paymentMethod as PaymentMethod;
    }
  }

  // 3. Kiểm tra paidAmount nếu được truyền
  let paidAmount: Prisma.Decimal | undefined = undefined;
  if (data.paidAmount !== undefined && data.paidAmount !== null && data.paidAmount !== '') {
    try {
      paidAmount = parseSafeDecimal(data.paidAmount, 'Số tiền thanh toán');
      if (paidAmount.isZero()) {
        errors.push('Số tiền thanh toán phải lớn hơn 0.');
      }
    } catch (err: any) {
      errors.push(err.message);
    }
  }

  // 4. Kiểm tra transactionCode và note (chặn Base64, giới hạn độ dài)
  let transactionCode: string | null = null;
  if (data.transactionCode !== undefined && data.transactionCode !== null && data.transactionCode !== '') {
    if (typeof data.transactionCode !== 'string') {
      errors.push('Mã giao dịch (transactionCode) phải là chuỗi ký tự.');
    } else if (data.transactionCode.length > 100) {
      errors.push('Mã giao dịch không được vượt quá 100 ký tự.');
    } else if (containsBase64Payload(data.transactionCode)) {
      errors.push('Mã giao dịch không được chứa dữ liệu Base64.');
    } else {
      transactionCode = data.transactionCode.trim();
    }
  }

  let note: string | null = null;
  if (data.note !== undefined && data.note !== null && data.note !== '') {
    if (typeof data.note !== 'string') {
      errors.push('Ghi chú thanh toán (note) phải là chuỗi ký tự.');
    } else if (data.note.length > 500) {
      errors.push('Ghi chú thanh toán không được vượt quá 500 ký tự.');
    } else if (containsBase64Payload(data.note)) {
      errors.push('Ghi chú thanh toán không được chứa dữ liệu Base64.');
    } else {
      note = data.note.trim();
    }
  }

  if (errors.length > 0) {
    return { isValid: false, errors };
  }

  return {
    isValid: true,
    errors: [],
    parsed: {
      status,
      paymentMethod,
      paidAmount,
      transactionCode,
      note,
    },
  };
}
