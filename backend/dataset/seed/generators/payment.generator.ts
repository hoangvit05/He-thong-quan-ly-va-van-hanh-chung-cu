// =========================================================================
// TRÌNH SINH DỮ LIỆU GIAO DỊCH THANH TOÁN (PAYMENT GENERATOR)
// Phân hệ: backend/dataset/seed/generators/payment.generator.ts
// Đặc tả: Sinh 300-500 Payment, không có trường status, tính toán bằng Prisma.Decimal
// =========================================================================

import { PaymentMethod, Prisma } from '@prisma/client';
import { DATASET_CONFIG } from '../../config/dataset.config';
import { PRNG } from '../utils/random';
import { toDecimal, sumDecimals } from '../utils/decimal';
import type { GeneratedInvoice } from './invoice.generator';

export interface GeneratedPayment {
  id: number;
  invoiceId: number;
  amount: Prisma.Decimal;
  paymentMethod: PaymentMethod;
  transactionCode: string | null;
  note: string | null;
  paidAt: Date;
}

export interface PaymentGeneratorOptions {
  seed?: number;
  prng?: PRNG;
  multiPaymentRate?: number; // Tỷ lệ hóa đơn có 2 lần thanh toán (mặc định 10%)
}

/**
 * Sinh danh sách các giao dịch thanh toán cho hóa đơn
 * Đảm bảo:
 * - Không thanh toán vượt quá totalAmount
 * - UNPAID: 0 payment, paidAmount = 0
 * - PARTIALLY_PAID: 1 hoặc 2 payment, 0 < sum < totalAmount
 * - PAID: 1 hoặc 2 payment, sum == totalAmount
 * - Không có Payment nào có amount <= 0
 */
export function generatePayments(
  invoices: GeneratedInvoice[],
  options: PaymentGeneratorOptions = {}
): GeneratedPayment[] {
  if (!invoices || invoices.length === 0) {
    return [];
  }

  const prng = options.prng ?? new PRNG(options.seed ?? DATASET_CONFIG.RANDOM_SEED);
  const multiPaymentRate = options.multiPaymentRate ?? 0.1;

  const payments: GeneratedPayment[] = [];
  let paymentIdCounter = 1;

  for (const invoice of invoices) {
    // Edge case validation
    if (invoice.totalAmount.lessThanOrEqualTo(0)) {
      throw new Error(
        `[PaymentGenerator] Hóa đơn ID ${invoice.id} có totalAmount không hợp lệ: ${invoice.totalAmount.toString()} (phải > 0).`
      );
    }

    if (invoice.status === 'UNPAID') {
      // Hóa đơn chưa thanh toán: Không sinh bất kỳ giao dịch thanh toán nào
      invoice.paidAmount = toDecimal(0);
      continue;
    }

    // Xác định số tiền cần thanh toán cho hóa đơn này
    const isPaidInFull = invoice.status === 'PAID';
    const allowMulti = prng.next() < multiPaymentRate;

    const invoiceYear = parseInt(invoice.month.slice(0, 4), 10);
    const invoiceMonthNum = parseInt(invoice.month.slice(5, 7), 10);

    if (isPaidInFull) {
      // Thanh toán 100% hóa đơn
      if (!allowMulti) {
        // 1 lần thanh toán đủ 100%
        const method = prng.pickWeighted(DATASET_CONFIG.PAYMENT_METHOD_DISTRIBUTION);
        const pid = paymentIdCounter++;
        const txCode =
          method === PaymentMethod.CASH
            ? null
            : `FT${invoiceYear.toString().slice(2)}${String(invoiceMonthNum).padStart(2, '0')}${String(pid).padStart(5, '0')}${prng.nextInt(10, 99)}`;

        const paidAtDay = prng.nextInt(5, 14);
        const paidAt = new Date(Date.UTC(invoiceYear, invoiceMonthNum - 1, paidAtDay, prng.nextInt(8, 20), prng.nextInt(0, 59)));

        payments.push({
          id: pid,
          invoiceId: invoice.id,
          amount: invoice.totalAmount,
          paymentMethod: method,
          transactionCode: txCode,
          note: `P${invoice.roomId} thanh toan du tien phi thang ${invoice.month}`,
          paidAt,
        });

        invoice.paidAmount = invoice.totalAmount;
        invoice.updatedAt = paidAt;
      } else {
        // 2 lần thanh toán: Lần 1 trả một phần, lần 2 trả nốt phần còn lại
        const frac = prng.nextInt(35, 65) / 100;
        const p1Raw = invoice.totalAmount.times(new Prisma.Decimal(frac.toString())).toDecimalPlaces(2, Prisma.Decimal.ROUND_DOWN);
        const p1Amount = toDecimal(p1Raw.isZero() ? toDecimal(10000) : p1Raw);
        const p2Amount = toDecimal(invoice.totalAmount.minus(p1Amount));

        // Lần 1
        const method1 = prng.pickWeighted(DATASET_CONFIG.PAYMENT_METHOD_DISTRIBUTION);
        const pid1 = paymentIdCounter++;
        const txCode1 =
          method1 === PaymentMethod.CASH
            ? null
            : `FT${invoiceYear.toString().slice(2)}${String(invoiceMonthNum).padStart(2, '0')}${String(pid1).padStart(5, '0')}${prng.nextInt(10, 99)}`;
        const paidAt1 = new Date(Date.UTC(invoiceYear, invoiceMonthNum - 1, prng.nextInt(4, 10), prng.nextInt(8, 20), prng.nextInt(0, 59)));

        payments.push({
          id: pid1,
          invoiceId: invoice.id,
          amount: p1Amount,
          paymentMethod: method1,
          transactionCode: txCode1,
          note: `P${invoice.roomId} thanh toan dot 1 thang ${invoice.month}`,
          paidAt: paidAt1,
        });

        // Lần 2 (nghiệm thu tất toán)
        const method2 = prng.pickWeighted(DATASET_CONFIG.PAYMENT_METHOD_DISTRIBUTION);
        const pid2 = paymentIdCounter++;
        const txCode2 =
          method2 === PaymentMethod.CASH
            ? null
            : `FT${invoiceYear.toString().slice(2)}${String(invoiceMonthNum).padStart(2, '0')}${String(pid2).padStart(5, '0')}${prng.nextInt(10, 99)}`;
        const paidAt2 = new Date(Date.UTC(invoiceYear, invoiceMonthNum - 1, prng.nextInt(12, 22), prng.nextInt(8, 20), prng.nextInt(0, 59)));

        payments.push({
          id: pid2,
          invoiceId: invoice.id,
          amount: p2Amount,
          paymentMethod: method2,
          transactionCode: txCode2,
          note: `P${invoice.roomId} thanh toan dot 2 tat toan thang ${invoice.month}`,
          paidAt: paidAt2,
        });

        invoice.paidAmount = sumDecimals(p1Amount, p2Amount);
        invoice.updatedAt = paidAt2;
      }
    } else {
      // PARTIALLY_PAID: Thanh toán một phần (30% đến 75% tổng tiền)
      const partialFrac = prng.nextInt(30, 75) / 100;
      let targetPartial = invoice.totalAmount
        .times(new Prisma.Decimal(partialFrac.toString()))
        .toDecimalPlaces(2, Prisma.Decimal.ROUND_DOWN);

      // Đảm bảo nghiêm ngặt: 0 < targetPartial < totalAmount
      if (targetPartial.lessThanOrEqualTo(0)) {
        targetPartial = toDecimal(50000);
      }
      if (targetPartial.greaterThanOrEqualTo(invoice.totalAmount)) {
        targetPartial = toDecimal(invoice.totalAmount.minus(toDecimal(50000)));
      }

      if (!allowMulti) {
        // 1 lần thanh toán một phần
        const method = prng.pickWeighted(DATASET_CONFIG.PAYMENT_METHOD_DISTRIBUTION);
        const pid = paymentIdCounter++;
        const txCode =
          method === PaymentMethod.CASH
            ? null
            : `FT${invoiceYear.toString().slice(2)}${String(invoiceMonthNum).padStart(2, '0')}${String(pid).padStart(5, '0')}${prng.nextInt(10, 99)}`;
        const paidAt = new Date(Date.UTC(invoiceYear, invoiceMonthNum - 1, prng.nextInt(6, 18), prng.nextInt(8, 20), prng.nextInt(0, 59)));

        payments.push({
          id: pid,
          invoiceId: invoice.id,
          amount: toDecimal(targetPartial),
          paymentMethod: method,
          transactionCode: txCode,
          note: `P${invoice.roomId} thanh toan mot phan thang ${invoice.month}`,
          paidAt,
        });

        invoice.paidAmount = toDecimal(targetPartial);
        invoice.updatedAt = paidAt;
      } else {
        // 2 lần thanh toán một phần
        const subFrac = prng.nextInt(40, 60) / 100;
        const p1Raw = targetPartial.times(new Prisma.Decimal(subFrac.toString())).toDecimalPlaces(2, Prisma.Decimal.ROUND_DOWN);
        const p1Amount = toDecimal(p1Raw.isZero() ? toDecimal(10000) : p1Raw);
        const p2Amount = toDecimal(targetPartial.minus(p1Amount));

        const method1 = prng.pickWeighted(DATASET_CONFIG.PAYMENT_METHOD_DISTRIBUTION);
        const pid1 = paymentIdCounter++;
        const txCode1 =
          method1 === PaymentMethod.CASH
            ? null
            : `FT${invoiceYear.toString().slice(2)}${String(invoiceMonthNum).padStart(2, '0')}${String(pid1).padStart(5, '0')}${prng.nextInt(10, 99)}`;
        const paidAt1 = new Date(Date.UTC(invoiceYear, invoiceMonthNum - 1, prng.nextInt(5, 12), prng.nextInt(8, 20), prng.nextInt(0, 59)));

        payments.push({
          id: pid1,
          invoiceId: invoice.id,
          amount: p1Amount,
          paymentMethod: method1,
          transactionCode: txCode1,
          note: `P${invoice.roomId} thanh toan mot phan dot 1 thang ${invoice.month}`,
          paidAt: paidAt1,
        });

        const method2 = prng.pickWeighted(DATASET_CONFIG.PAYMENT_METHOD_DISTRIBUTION);
        const pid2 = paymentIdCounter++;
        const txCode2 =
          method2 === PaymentMethod.CASH
            ? null
            : `FT${invoiceYear.toString().slice(2)}${String(invoiceMonthNum).padStart(2, '0')}${String(pid2).padStart(5, '0')}${prng.nextInt(10, 99)}`;
        const paidAt2 = new Date(Date.UTC(invoiceYear, invoiceMonthNum - 1, prng.nextInt(14, 25), prng.nextInt(8, 20), prng.nextInt(0, 59)));

        payments.push({
          id: pid2,
          invoiceId: invoice.id,
          amount: p2Amount,
          paymentMethod: method2,
          transactionCode: txCode2,
          note: `P${invoice.roomId} thanh toan mot phan dot 2 thang ${invoice.month}`,
          paidAt: paidAt2,
        });

        invoice.paidAmount = sumDecimals(p1Amount, p2Amount);
        invoice.updatedAt = paidAt2;
      }
    }
  }

  return payments;
}

