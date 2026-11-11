// =========================================================================
// TIỆN ÍCH LÀM VIỆC VỚI PRISMA.DECIMAL (FINANCIAL DECIMAL UTILITIES)
// Đảm bảo độ chính xác tuyệt đối 2 chữ số thập phân cho trường tiền tệ
// =========================================================================

import { Prisma } from '@prisma/client';

/**
 * Chuyển đổi số hoặc chuỗi sang Prisma.Decimal với 2 chữ số thập phân (ROUND_HALF_UP)
 */
export function toDecimal(value: number | string | Prisma.Decimal): Prisma.Decimal {
  const dec = new Prisma.Decimal(value as any);
  return dec.toDecimalPlaces(2, Prisma.Decimal.ROUND_HALF_UP);
}

/**
 * Tính tổng các giá trị Decimal
 */
export function sumDecimals(...values: Array<number | string | Prisma.Decimal>): Prisma.Decimal {
  let total = new Prisma.Decimal(0);
  for (const v of values) {
    total = total.plus(new Prisma.Decimal(v as any));
  }
  return total.toDecimalPlaces(2, Prisma.Decimal.ROUND_HALF_UP);
}

/**
 * Định dạng hiển thị số tiền VND
 */
export function formatVnd(value: Prisma.Decimal | number | string): string {
  const num = typeof value === 'number' ? value : Number(value.toString());
  return new Intl.NumberFormat('vi-VN', { style: 'currency', currency: 'VND' }).format(num);
}

