// =========================================================================
// KIỂM TRA TÍNH TOÀN VẸN TÀI CHÍNH & TIỀN TỆ (FINANCIAL INTEGRITY CHECK)
// Phân hệ: backend/dataset/validation/checks/financial.check.ts
// Đặc tả: Milestone 10.1 — Red Team Fix: Kiểm toán Decimal(12,2), scale, precision & dòng tiền
// =========================================================================

import { InvoiceStatus, Prisma } from '@prisma/client';
import { CheckResult, DatasetSnapshot, SnapshotInvoice, SnapshotPayment } from './types';

export { CheckResult };

export interface FinancialValidationInput {
  mismatchedTotalAmounts: number;
  mismatchedPaidAmounts: number;
  overpaymentCount: number;
  invalidStatusCount: number;
  negativeFeeCount: number;
}

/**
 * Giới hạn lưu trữ tối đa của cột PostgreSQL DECIMAL(12, 2)
 * Tổng 12 chữ số, 2 chữ số thập phân -> tối đa 9,999,999,999.99
 */
export const MAX_DECIMAL_12_2 = new Prisma.Decimal('9999999999.99');

/**
 * Hàm kiểm tra từ bộ đếm số liệu thô (giữ tương thích ngược với các test cũ)
 */
export function checkFinancialIntegrity(input: FinancialValidationInput): CheckResult {
  const errors: string[] = [];

  if (input.mismatchedTotalAmounts > 0) {
    errors.push(
      `Phát hiện ${input.mismatchedTotalAmounts} hóa đơn có totalAmount không khớp tổng 4 khoản phí.`
    );
  }

  if (input.mismatchedPaidAmounts > 0) {
    errors.push(
      `Phát hiện ${input.mismatchedPaidAmounts} hóa đơn có paidAmount không khớp tổng Payment.amount.`
    );
  }

  if (input.overpaymentCount > 0) {
    errors.push(
      `Phát hiện ${input.overpaymentCount} hóa đơn bị nộp thừa tiền (paidAmount > totalAmount).`
    );
  }

  if (input.invalidStatusCount > 0) {
    errors.push(
      `Phát hiện ${input.invalidStatusCount} hóa đơn có InvoiceStatus sai lệch so với số tiền đã nộp.`
    );
  }

  if (input.negativeFeeCount > 0) {
    errors.push(`Phát hiện ${input.negativeFeeCount} khoản phí mang giá trị âm.`);
  }

  return {
    name: 'Financial Consistency Check',
    passed: errors.length === 0,
    message:
      errors.length === 0
        ? 'Dữ liệu tài chính, dòng tiền và Decimal nhất quán 100%.'
        : `Phát hiện ${errors.length} vi phạm tài chính: ${errors.join('; ')}`,
    violationsCount: errors.length,
    errors,
    details: input,
  };
}

interface AuditedDecimal {
  val: Prisma.Decimal | null;
  isValid: boolean;
}

/**
 * Kiểm định chuyên sâu một trường Decimal(12,2)
 * Bắt lỗi cấu trúc an toàn, không để exception làm sập validation runner
 */
function auditDecimalField(
  rawVal: any,
  fieldName: string,
  context: string,
  errors: string[],
  options: { mustBePositive?: boolean; allowZero?: boolean } = {}
): AuditedDecimal {
  if (rawVal === undefined || rawVal === null) {
    errors.push(`${context} có ${fieldName} bị null hoặc undefined.`);
    return { val: null, isValid: false };
  }

  let dec: Prisma.Decimal;
  try {
    if (rawVal instanceof Prisma.Decimal) {
      dec = rawVal;
    } else if (typeof rawVal === 'number') {
      if (!Number.isFinite(rawVal) || Number.isNaN(rawVal)) {
        errors.push(`${context} có ${fieldName} không phải số hữu hạn (nhận: ${rawVal}).`);
        return { val: null, isValid: false };
      }
      dec = new Prisma.Decimal(rawVal.toString());
    } else if (typeof rawVal === 'string') {
      dec = new Prisma.Decimal(rawVal.trim());
    } else {
      errors.push(`${context} có ${fieldName} có kiểu dữ liệu không hợp lệ.`);
      return { val: null, isValid: false };
    }
  } catch (err: any) {
    errors.push(`${context} có ${fieldName} không thể parse thành Decimal hợp lệ: ${err.message}`);
    return { val: null, isValid: false };
  }

  // 1. Kiểm tra NaN và Infinity
  if (dec.isNaN() || !dec.isFinite()) {
    errors.push(`${context} có ${fieldName} mang giá trị NaN hoặc không hữu hạn.`);
    return { val: null, isValid: false };
  }

  // 2. Kiểm tra scale (tối đa 2 chữ số thập phân)
  if (dec.decimalPlaces() > 2) {
    errors.push(
      `${context} có ${fieldName} (${dec.toString()}) vượt quá 2 chữ số thập phân của DECIMAL(12,2) (thực tế: ${dec.decimalPlaces()} số lẻ).`
    );
    return { val: dec, isValid: false };
  }

  // 3. Kiểm tra precision và giới hạn lưu trữ tối đa DECIMAL(12, 2)
  if (dec.greaterThan(MAX_DECIMAL_12_2)) {
    errors.push(
      `${context} có ${fieldName} (${dec.toString()}) vượt quá giới hạn tối đa của DECIMAL(12,2) (tối đa: ${MAX_DECIMAL_12_2.toString()}).`
    );
    return { val: dec, isValid: false };
  }

  // 4. Kiểm tra số âm (phí không được âm)
  if (dec.isNegative()) {
    errors.push(`${context} có ${fieldName} mang giá trị âm: ${dec.toString()}`);
    return { val: dec, isValid: false };
  }

  // 5. Kiểm tra giá trị > 0 cho Payment amount
  if (options.mustBePositive && dec.isZero()) {
    errors.push(`${context} có ${fieldName} bằng 0 (số tiền thanh toán bắt buộc phải lớn hơn 0).`);
    return { val: dec, isValid: false };
  }

  return { val: dec, isValid: true };
}

/**
 * Kiểm tra toàn diện tính toàn vẹn tài chính trực tiếp trên Dataset Snapshot
 */
export function validateFinancialIntegrity(snapshot: DatasetSnapshot): CheckResult {
  const errors: string[] = [];
  const invoiceMap = new Map<number, SnapshotInvoice>(
    snapshot.invoices.map((i) => [i.id, i])
  );

  let mismatchedTotalAmounts = 0;
  let mismatchedPaidAmounts = 0;
  let overpaymentCount = 0;
  let invalidStatusCount = 0;
  let negativeFeeCount = 0;

  // 1. Gom nhóm Payment theo invoiceId và kiểm định từng giao dịch
  const paymentsByInvoice = new Map<number, SnapshotPayment[]>();

  for (const p of snapshot.payments) {
    const auditRes = auditDecimalField(
      p.amount,
      'amount',
      `Giao dịch Payment #${p.id}`,
      errors,
      { mustBePositive: true }
    );

    if (!auditRes.isValid && auditRes.val?.isNegative()) {
      negativeFeeCount++;
    }

    // Kiểm tra Payment mồ côi
    if (!invoiceMap.has(p.invoiceId)) {
      errors.push(`Giao dịch Payment #${p.id} tham chiếu invoiceId ${p.invoiceId} không tồn tại.`);
    } else {
      const list = paymentsByInvoice.get(p.invoiceId) ?? [];
      list.push(p);
      paymentsByInvoice.set(p.invoiceId, list);
    }
  }

  // 2. Kiểm định từng Invoice
  for (const inv of snapshot.invoices) {
    const ctx = `Hóa đơn #${inv.id}`;

    // Kiểm định 6 trường Decimal của Invoice
    const mgmtRes = auditDecimalField(inv.managementFee, 'managementFee', ctx, errors);
    const parkRes = auditDecimalField(inv.parkingFee, 'parkingFee', ctx, errors);
    const waterRes = auditDecimalField(inv.waterFee, 'waterFee', ctx, errors);
    const otherRes = auditDecimalField(inv.otherFee, 'otherFee', ctx, errors);
    const totalRes = auditDecimalField(inv.totalAmount, 'totalAmount', ctx, errors);
    const paidRes = auditDecimalField(inv.paidAmount, 'paidAmount', ctx, errors);

    if (
      (mgmtRes.val && mgmtRes.val.isNegative()) ||
      (parkRes.val && parkRes.val.isNegative()) ||
      (waterRes.val && waterRes.val.isNegative()) ||
      (otherRes.val && otherRes.val.isNegative())
    ) {
      negativeFeeCount++;
    }

    // Kiểm tra totalAmount = tổng 4 khoản phí (chỉ so sánh khi các trường hợp lệ)
    if (mgmtRes.val && parkRes.val && waterRes.val && otherRes.val && totalRes.val) {
      const expectedTotal = mgmtRes.val
        .plus(parkRes.val)
        .plus(waterRes.val)
        .plus(otherRes.val);

      if (!totalRes.val.equals(expectedTotal)) {
        mismatchedTotalAmounts++;
        errors.push(
          `${ctx} có totalAmount (${totalRes.val.toString()}) không khớp tổng 4 khoản phí (${expectedTotal.toString()} = ${mgmtRes.val.toString()} + ${parkRes.val.toString()} + ${waterRes.val.toString()} + ${otherRes.val.toString()}).`
        );
      }
    }

    // Kiểm tra paidAmount = tổng Payment thực tế
    const invPayments = paymentsByInvoice.get(inv.id) ?? [];
    let expectedPaid = new Prisma.Decimal(0);
    let allPaymentsValid = true;

    for (const p of invPayments) {
      try {
        const pDec = p.amount instanceof Prisma.Decimal ? p.amount : new Prisma.Decimal(p.amount.toString());
        if (pDec.isFinite() && !pDec.isNaN()) {
          expectedPaid = expectedPaid.plus(pDec);
        } else {
          allPaymentsValid = false;
        }
      } catch {
        allPaymentsValid = false;
      }
    }

    if (paidRes.val && allPaymentsValid) {
      if (!paidRes.val.equals(expectedPaid)) {
        mismatchedPaidAmounts++;
        errors.push(
          `${ctx} có paidAmount (${paidRes.val.toString()}) không khớp tổng Payment thực tế (${expectedPaid.toString()}).`
        );
      }

      // Kiểm tra nộp thừa (Overpayment)
      if (totalRes.val && paidRes.val.greaterThan(totalRes.val)) {
        overpaymentCount++;
        errors.push(
          `${ctx} bị overpayment: số tiền đã trả (${paidRes.val.toString()}) vượt quá tổng tiền (${totalRes.val.toString()}).`
        );
      }

      // Kiểm tra tính nhất quán của InvoiceStatus với số tiền
      if (totalRes.val) {
        if (paidRes.val.isZero()) {
          if (inv.status !== InvoiceStatus.UNPAID) {
            invalidStatusCount++;
            errors.push(
              `${ctx} chưa thanh toán (paidAmount = 0) nhưng có status = ${inv.status} (phải là UNPAID).`
            );
          }
        } else if (paidRes.val.greaterThan(0) && paidRes.val.lessThan(totalRes.val)) {
          if (inv.status !== InvoiceStatus.PARTIALLY_PAID) {
            invalidStatusCount++;
            errors.push(
              `${ctx} thanh toán một phần (0 < ${paidRes.val.toString()} < ${totalRes.val.toString()}) nhưng có status = ${inv.status} (phải là PARTIALLY_PAID).`
            );
          }
        } else if (paidRes.val.equals(totalRes.val)) {
          if (inv.status !== InvoiceStatus.PAID) {
            invalidStatusCount++;
            errors.push(
              `${ctx} đã thanh toán đủ (paidAmount = totalAmount = ${totalRes.val.toString()}) nhưng có status = ${inv.status} (phải là PAID).`
            );
          }
        }
      }
    }
  }

  return {
    name: 'Financial Consistency Check',
    passed: errors.length === 0,
    message:
      errors.length === 0
        ? 'Dữ liệu tài chính, dòng tiền và Decimal(12,2) nhất quán 100%.'
        : `Phát hiện ${errors.length} vi phạm tài chính: ${errors.slice(0, 10).join('; ')}${
            errors.length > 10 ? `... và ${errors.length - 10} lỗi khác` : ''
          }`,
    violationsCount: errors.length,
    errors,
    details: {
      mismatchedTotalAmounts,
      mismatchedPaidAmounts,
      overpaymentCount,
      invalidStatusCount,
      negativeFeeCount,
      totalErrors: errors.length,
    },
  };
}
