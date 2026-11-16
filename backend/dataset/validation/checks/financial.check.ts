// =========================================================================
// KIỂM TRA TÍNH TOÀN VẸN TÀI CHÍNH & TIỀN TỆ (FINANCIAL INTEGRITY CHECK)
// Phân hệ: backend/dataset/validation/checks/financial.check.ts
// Đặc tả: Milestone 10 — Kiểm toán tính nhất quán Decimal, dòng tiền và hóa đơn
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

/**
 * Chuyển đổi an toàn giá trị tiền tệ sang Prisma.Decimal
 */
function toDecimal(val: Prisma.Decimal | number | string): Prisma.Decimal {
  if (val instanceof Prisma.Decimal) return val;
  return new Prisma.Decimal(val.toString());
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

  // 1. Gom nhóm Payment theo invoiceId và kiểm tra từng giao dịch
  const paymentsByInvoice = new Map<number, SnapshotPayment[]>();

  for (const p of snapshot.payments) {
    const amountDec = toDecimal(p.amount);

    // Tiền thanh toán không được âm hoặc bằng 0
    if (amountDec.isNegative() || amountDec.isZero()) {
      negativeFeeCount++;
      errors.push(
        `Giao dịch Payment #${p.id} có số tiền ${amountDec.toString()} không hợp lệ (phải lớn hơn 0).`
      );
    }

    // Kiểm tra độ chính xác thập phân (tối đa 2 chữ số thập phân theo DECIMAL(12,2))
    if (amountDec.decimalPlaces() > 2) {
      errors.push(
        `Giao dịch Payment #${p.id} có số tiền ${amountDec.toString()} vượt quá 2 chữ số thập phân cho phép.`
      );
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

  // 2. Kiểm tra từng Invoice
  for (const inv of snapshot.invoices) {
    const mgmt = toDecimal(inv.managementFee);
    const park = toDecimal(inv.parkingFee);
    const water = toDecimal(inv.waterFee);
    const other = toDecimal(inv.otherFee);
    const total = toDecimal(inv.totalAmount);
    const paid = toDecimal(inv.paidAmount);

    // Kiểm tra phí âm
    if (mgmt.isNegative()) {
      negativeFeeCount++;
      errors.push(`Hóa đơn #${inv.id} có managementFee âm: ${mgmt.toString()}`);
    }
    if (park.isNegative()) {
      negativeFeeCount++;
      errors.push(`Hóa đơn #${inv.id} có parkingFee âm: ${park.toString()}`);
    }
    if (water.isNegative()) {
      negativeFeeCount++;
      errors.push(`Hóa đơn #${inv.id} có waterFee âm: ${water.toString()}`);
    }
    if (other.isNegative()) {
      negativeFeeCount++;
      errors.push(`Hóa đơn #${inv.id} có otherFee âm: ${other.toString()}`);
    }

    // Kiểm tra totalAmount = tổng 4 khoản phí
    const expectedTotal = mgmt.plus(park).plus(water).plus(other);
    if (!total.equals(expectedTotal)) {
      mismatchedTotalAmounts++;
      errors.push(
        `Hóa đơn #${inv.id} có totalAmount (${total.toString()}) không khớp tổng 4 khoản phí (${expectedTotal.toString()} = ${mgmt.toString()} + ${park.toString()} + ${water.toString()} + ${other.toString()}).`
      );
    }

    // Kiểm tra paidAmount = tổng Payment thực tế
    const invPayments = paymentsByInvoice.get(inv.id) ?? [];
    let expectedPaid = new Prisma.Decimal(0);
    for (const p of invPayments) {
      expectedPaid = expectedPaid.plus(toDecimal(p.amount));
    }

    if (!paid.equals(expectedPaid)) {
      mismatchedPaidAmounts++;
      errors.push(
        `Hóa đơn #${inv.id} có paidAmount (${paid.toString()}) không khớp tổng Payment thực tế (${expectedPaid.toString()}).`
      );
    }

    // Kiểm tra nộp thừa (Overpayment)
    if (paid.greaterThan(total)) {
      overpaymentCount++;
      errors.push(
        `Hóa đơn #${inv.id} bị overpayment: số tiền đã trả (${paid.toString()}) vượt quá tổng tiền (${total.toString()}).`
      );
    }

    // Kiểm tra tính nhất quán của InvoiceStatus với số tiền
    if (paid.isZero()) {
      if (inv.status !== InvoiceStatus.UNPAID) {
        invalidStatusCount++;
        errors.push(
          `Hóa đơn #${inv.id} chưa thanh toán (paidAmount = 0) nhưng có status = ${inv.status} (phải là UNPAID).`
        );
      }
    } else if (paid.greaterThan(0) && paid.lessThan(total)) {
      if (inv.status !== InvoiceStatus.PARTIALLY_PAID) {
        invalidStatusCount++;
        errors.push(
          `Hóa đơn #${inv.id} thanh toán một phần (0 < ${paid.toString()} < ${total.toString()}) nhưng có status = ${inv.status} (phải là PARTIALLY_PAID).`
        );
      }
    } else if (paid.equals(total)) {
      if (inv.status !== InvoiceStatus.PAID) {
        invalidStatusCount++;
        errors.push(
          `Hóa đơn #${inv.id} đã thanh toán đủ (paidAmount = totalAmount = ${total.toString()}) nhưng có status = ${inv.status} (phải là PAID).`
        );
      }
    }
  }

  return {
    name: 'Financial Consistency Check',
    passed: errors.length === 0,
    message:
      errors.length === 0
        ? 'Dữ liệu tài chính, dòng tiền và Decimal nhất quán 100%.'
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
