// =========================================================================
// TRÌNH SINH DỮ LIỆU HÓA ĐƠN ĐỊNH KỲ (INVOICE GENERATOR)
// Phân hệ: backend/dataset/seed/generators/invoice.generator.ts
// Đặc tả: Sinh 400-600 Invoice, tính toán bằng Prisma.Decimal, unique [roomId, month]
// =========================================================================

import { InvoiceStatus, Prisma } from '@prisma/client';
import { DATASET_CONFIG } from '../../config/dataset.config';
import { PRNG } from '../utils/random';
import { toDecimal } from '../utils/decimal';
import { GeneratedRoom } from './room.generator';
import { generatePayments, GeneratedPayment, PaymentGeneratorOptions } from './payment.generator';

export interface GeneratedInvoice {
  id: number;
  roomId: number;
  month: string;
  managementFee: Prisma.Decimal;
  parkingFee: Prisma.Decimal;
  waterFee: Prisma.Decimal;
  otherFee: Prisma.Decimal;
  totalAmount: Prisma.Decimal;
  paidAmount: Prisma.Decimal;
  dueDate: Date | null;
  status: InvoiceStatus;
  createdAt: Date;
  updatedAt: Date;
}

export interface InvoiceGeneratorOptions {
  count?: number;
  seed?: number;
  prng?: PRNG;
  months?: string[];
  multiPaymentRate?: number;
}

export interface InvoicePaymentResult {
  invoices: GeneratedInvoice[];
  payments: GeneratedPayment[];
}

/**
 * Sinh danh sách các tháng định dạng YYYY-MM
 */
function getBillingMonths(requiredCount: number, customMonths?: string[]): string[] {
  if (customMonths && customMonths.length > 0) {
    return customMonths;
  }

  // Danh sách các tháng mặc định gần nhất (2026-06 đến 2026-10 hoặc mở rộng lùi về trước)
  const baseYear = 2026;
  const baseEndMonth = 10; // Tháng 10/2026
  const months: string[] = [];

  for (let i = requiredCount - 1; i >= 0; i--) {
    let year = baseYear;
    let m = baseEndMonth - i;
    while (m <= 0) {
      m += 12;
      year -= 1;
    }
    const padM = m < 10 ? `0${m}` : `${m}`;
    months.push(`${year}-${padM}`);
  }

  return months;
}

/**
 * Sinh đồng bộ danh sách Hóa đơn và Giao dịch thanh toán liên kết
 */
export function generateInvoicesAndPayments(
  rooms: GeneratedRoom[],
  options: InvoiceGeneratorOptions = {}
): InvoicePaymentResult {
  // Edge Case 1: Danh sách Room rỗng
  if (!rooms || rooms.length === 0) {
    throw new Error('[InvoiceGenerator] Danh sách Room rỗng, không thể sinh hóa đơn.');
  }

  // Edge Case 2: Kiểm tra tính hợp lệ và không trùng lặp của ID phòng
  const seenRoomIds = new Set<number>();
  for (const r of rooms) {
    if (!r.id || r.id <= 0 || !Number.isInteger(r.id)) {
      throw new Error(`[InvoiceGenerator] Phát hiện Room có ID không hợp lệ: ${r.id}`);
    }
    if (seenRoomIds.has(r.id)) {
      throw new Error(`[InvoiceGenerator] Phát hiện ID Room bị trùng lặp trong danh sách đầu vào: ${r.id}`);
    }
    seenRoomIds.add(r.id);

    if (!r.area || r.area <= 0 || !Number.isFinite(r.area)) {
      throw new Error(`[InvoiceGenerator] Phát hiện Room ID ${r.id} có diện tích (area) không hợp lệ: ${r.area}`);
    }
  }

  const targetCount = options.count ?? 500;
  if (targetCount <= 0) {
    return { invoices: [], payments: [] };
  }

  const prng = options.prng ?? new PRNG(options.seed ?? DATASET_CONFIG.RANDOM_SEED);

  // Tính số tháng cần thiết để sinh đủ số lượng invoice duy nhất
  const requiredMonthsCount = Math.ceil(targetCount / rooms.length);

  // Edge Case 3: Caller cung cấp danh sách months cố định nhưng không đủ để sinh target count
  if (options.months && options.months.length * rooms.length < targetCount) {
    throw new Error(
      `[InvoiceGenerator] Không thể sinh ${targetCount} hóa đơn duy nhất với ${rooms.length} phòng và ${options.months.length} tháng mà không vi phạm ràng buộc [roomId, month].`
    );
  }

  const billingMonths = getBillingMonths(requiredMonthsCount, options.months);

  // Tạo phân bổ trạng thái theo tỷ lệ tham khảo (PAID ~65%, PARTIALLY_PAID ~15%, UNPAID ~20%)
  const statuses: InvoiceStatus[] = [];
  if (targetCount >= 3) {
    statuses.push(InvoiceStatus.PAID, InvoiceStatus.PARTIALLY_PAID, InvoiceStatus.UNPAID);
    for (let i = 3; i < targetCount; i++) {
      statuses.push(prng.pickWeighted(DATASET_CONFIG.INVOICE_STATUS_DISTRIBUTION));
    }
  } else {
    for (let i = 0; i < targetCount; i++) {
      statuses.push(prng.pickWeighted(DATASET_CONFIG.INVOICE_STATUS_DISTRIBUTION));
    }
  }
  const shuffledStatuses = prng.shuffle(statuses);

  const invoices: GeneratedInvoice[] = [];
  let invoiceIdCounter = 1;
  let statusIndex = 0;

  // Lặp qua từng tháng, với mỗi tháng lặp qua danh sách phòng cho đến khi đủ targetCount
  const uniqueMonthRoomCheck = new Set<string>();

  for (const month of billingMonths) {
    if (invoices.length >= targetCount) break;

    const year = parseInt(month.slice(0, 4), 10);
    const monthNum = parseInt(month.slice(5, 7), 10);

    const invoiceCreatedAt = new Date(Date.UTC(year, monthNum - 1, 1, 8, 0, 0));
    const invoiceDueDate = new Date(Date.UTC(year, monthNum - 1, 15, 23, 59, 59));

    for (const room of rooms) {
      if (invoices.length >= targetCount) break;

      const key = `${room.id}:${month}`;
      if (uniqueMonthRoomCheck.has(key)) {
        continue;
      }
      uniqueMonthRoomCheck.add(key);

      // 1. Phí quản lý = diện tích * 12,000 VND/m2 (tính toán hoàn toàn bằng Prisma.Decimal)
      const areaDec = new Prisma.Decimal(room.area.toString());
      const mgmtRate = new Prisma.Decimal(DATASET_CONFIG.FINANCIAL.MANAGEMENT_FEE_PER_M2);
      const managementFee = areaDec.times(mgmtRate).toDecimalPlaces(2, Prisma.Decimal.ROUND_HALF_UP);

      // 2. Phí gửi xe: 1-2 xe máy (100k/xe) và 0-1 ô tô (1.2tr/xe)
      const motorbikes = prng.nextInt(1, 2);
      const hasCar = prng.next() < 0.25; // ~25% căn hộ có ô tô
      const cars = hasCar ? 1 : 0;
      const motorbikeFee = new Prisma.Decimal(motorbikes).times(new Prisma.Decimal(DATASET_CONFIG.FINANCIAL.MOTORBIKE_PARKING_FEE));
      const carFee = new Prisma.Decimal(cars).times(new Prisma.Decimal(DATASET_CONFIG.FINANCIAL.CAR_PARKING_FEE));
      const parkingFee = motorbikeFee.plus(carFee).toDecimalPlaces(2, Prisma.Decimal.ROUND_HALF_UP);

      // 3. Tiền nước sinh hoạt
      const waterVal = prng.nextInt(
        DATASET_CONFIG.FINANCIAL.WATER_FEE_MIN / 1000,
        DATASET_CONFIG.FINANCIAL.WATER_FEE_MAX / 1000
      ) * 1000;
      const waterFee = new Prisma.Decimal(waterVal).toDecimalPlaces(2, Prisma.Decimal.ROUND_HALF_UP);

      // 4. Phí phát sinh khác
      const otherVal = prng.nextInt(
        DATASET_CONFIG.FINANCIAL.OTHER_FEE_MIN / 1000,
        DATASET_CONFIG.FINANCIAL.OTHER_FEE_MAX / 1000
      ) * 1000;
      const otherFee = new Prisma.Decimal(otherVal).toDecimalPlaces(2, Prisma.Decimal.ROUND_HALF_UP);

      // 5. Tổng tiền = 4 khoản phí
      const totalAmount = managementFee.plus(parkingFee).plus(waterFee).plus(otherFee).toDecimalPlaces(2, Prisma.Decimal.ROUND_HALF_UP);

      // Edge Case 4: Kiểm tra giới hạn Decimal(12,2)
      if (totalAmount.greaterThan('999999999.99')) {
        throw new Error(`[InvoiceGenerator] totalAmount ${totalAmount.toString()} vượt quá giới hạn Decimal(12,2).`);
      }

      const assignedStatus = shuffledStatuses[statusIndex++];

      invoices.push({
        id: invoiceIdCounter++,
        roomId: room.id,
        month,
        managementFee,
        parkingFee,
        waterFee,
        otherFee,
        totalAmount,
        paidAmount: toDecimal(0), // Sẽ được cập nhật chính xác tuyệt đối qua generatePayments()
        dueDate: invoiceDueDate,
        status: assignedStatus,
        createdAt: invoiceCreatedAt,
        updatedAt: invoiceCreatedAt,
      });
    }
  }

  // Phối hợp sinh Payments và tự động tổng hợp chính xác paidAmount vào từng Invoice
  const payments = generatePayments(invoices, {
    prng,
    multiPaymentRate: options.multiPaymentRate ?? 0.1,
  });

  return { invoices, payments };
}

/**
 * Sinh danh sách Hóa đơn độc lập (đã tự động phối hợp và tổng hợp paidAmount từ payments)
 */
export function generateInvoices(
  rooms: GeneratedRoom[],
  options: InvoiceGeneratorOptions = {}
): GeneratedInvoice[] {
  const result = generateInvoicesAndPayments(rooms, options);
  return result.invoices;
}

