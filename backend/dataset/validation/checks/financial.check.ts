// =========================================================================
// KIỂM TRA TÍNH TOÀN VẸN TÀI CHÍNH & TIỀN TỆ (FINANCIAL INTEGRITY CHECK)
// =========================================================================

import { CheckResult } from './counts.check';

export interface FinancialValidationInput {
  mismatchedTotalAmounts: number;
  mismatchedPaidAmounts: number;
  overpaymentCount: number;
  invalidStatusCount: number;
  negativeFeeCount: number;
}

/**
 * Kiểm tra các ràng buộc tài chính tiền tệ của Invoice và Payment
 */
export function checkFinancialIntegrity(input: FinancialValidationInput): CheckResult {
  const errors: string[] = [];

  if (input.mismatchedTotalAmounts > 0) {
    errors.push(`Phát hiện ${input.mismatchedTotalAmounts} hóa đơn có totalAmount không khớp tổng 4 khoản phí.`);
  }

  if (input.mismatchedPaidAmounts > 0) {
    errors.push(`Phát hiện ${input.mismatchedPaidAmounts} hóa đơn có paidAmount không khớp tổng Payment.amount.`);
  }

  if (input.overpaymentCount > 0) {
    errors.push(`Phát hiện ${input.overpaymentCount} hóa đơn bị nộp thừa tiền (paidAmount > totalAmount).`);
  }

  if (input.invalidStatusCount > 0) {
    errors.push(`Phát hiện ${input.invalidStatusCount} hóa đơn có InvoiceStatus sai lệch so với số tiền đã nộp.`);
  }

  if (input.negativeFeeCount > 0) {
    errors.push(`Phát hiện ${input.negativeFeeCount} khoản phí mang giá trị âm.`);
  }

  return {
    name: 'Financial Consistency Check',
    passed: errors.length === 0,
    message: errors.length === 0 ? 'Dữ liệu tài chính, dòng tiền và Decimal nhất quán 100%.' : errors.join('; '),
    details: input,
  };
}

