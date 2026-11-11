// =========================================================================
// KIỂM THỬ XÁC MINH INVOICE & PAYMENT GENERATORS (MILESTONE 5 & M5.1 TESTS)
// =========================================================================

import assert from 'assert';
import { InvoiceStatus, PaymentMethod, Prisma } from '@prisma/client';
import { generateRooms, GeneratedRoom } from '../seed/generators/room.generator';
import { generateInvoicesAndPayments, GeneratedInvoice } from '../seed/generators/invoice.generator';
import { generatePayments, GeneratedPayment } from '../seed/generators/payment.generator';
import { sumDecimals } from '../seed/utils/decimal';

let passedTests = 0;
let totalTests = 0;

function runTest(name: string, fn: () => void) {
  totalTests++;
  try {
    fn();
    console.log(`  ✅ [PASS] ${name}`);
    passedTests++;
  } catch (err: any) {
    console.error(`  ❌ [FAIL] ${name}: ${err.message}`);
    throw err;
  }
}

console.log('======================================================');
console.log('🧪 BẮT ĐẦU KIỂM ĐỊNH INVOICE & PAYMENT GENERATORS (M5/M5.1)');
console.log('======================================================');

const sampleRooms: GeneratedRoom[] = generateRooms({ seed: 20261111 });
const { invoices, payments } = generateInvoicesAndPayments(sampleRooms, { seed: 20261111 });

// =========================================================================
// 1. KIỂM THỬ SỐ LƯỢNG VÀ CẤU TRÚC (COUNTS & STRUCTURE)
// =========================================================================
console.log('--- 1. Kiểm thử Số lượng & Cấu trúc ---');

runTest('1.1 Số lượng Invoice nằm trong khoảng [400, 600]', () => {
  assert.ok(
    invoices.length >= 400 && invoices.length <= 600,
    `Số lượng Invoice (${invoices.length}) phải nằm trong [400, 600]`
  );
  assert.strictEqual(invoices.length, 500, `Mặc định phải sinh đúng 500 Invoice (nhận ${invoices.length})`);
});

runTest('1.2 Số lượng Payment nằm trong khoảng [300, 500]', () => {
  assert.ok(
    payments.length >= 300 && payments.length <= 500,
    `Số lượng Payment (${payments.length}) phải nằm trong [300, 500]`
  );
  assert.strictEqual(payments.length, 472, `Với seed hiện tại phải sinh đúng 472 Payment (nhận ${payments.length})`);
});

runTest('1.3 ID của Invoice và Payment hợp lệ, không bị trùng lặp', () => {
  const invoiceIds = invoices.map((i) => i.id);
  const uniqueInvoiceIds = new Set(invoiceIds);
  assert.strictEqual(uniqueInvoiceIds.size, invoices.length, 'Phát hiện ID Invoice bị trùng');

  const paymentIds = payments.map((p) => p.id);
  const uniquePaymentIds = new Set(paymentIds);
  assert.strictEqual(uniquePaymentIds.size, payments.length, 'Phát hiện ID Payment bị trùng');
});

runTest('1.4 Các Enum chỉ nhận giá trị hợp lệ theo Prisma schema', () => {
  const validInvoiceStatuses = new Set([
    InvoiceStatus.PAID,
    InvoiceStatus.PARTIALLY_PAID,
    InvoiceStatus.UNPAID,
  ]);
  for (const inv of invoices) {
    assert.ok(validInvoiceStatuses.has(inv.status), `Trạng thái Invoice không hợp lệ: ${inv.status}`);
  }

  const validPaymentMethods = new Set([
    PaymentMethod.VIETQR,
    PaymentMethod.BANK_TRANSFER,
    PaymentMethod.CASH,
  ]);
  for (const p of payments) {
    assert.ok(validPaymentMethods.has(p.paymentMethod), `Phương thức thanh toán không hợp lệ: ${p.paymentMethod}`);
  }
});

// =========================================================================
// 2. KIỂM THỬ QUAN HỆ & RÀNG BUỘC TOÀN VẸN (RELATIONAL INTEGRITY)
// =========================================================================
console.log('--- 2. Kiểm thử Quan hệ & Ràng buộc toàn vẹn ---');

runTest('2.1 Mọi roomId của Invoice tồn tại trong danh sách Room đầu vào', () => {
  const validRoomIds = new Set(sampleRooms.map((r) => r.id));
  for (const inv of invoices) {
    assert.ok(validRoomIds.has(inv.roomId), `Invoice ${inv.id} tham chiếu roomId không tồn tại: ${inv.roomId}`);
  }
});

runTest('2.2 Ràng buộc duy nhất @@unique([roomId, month]) không có bất kỳ cặp trùng nào', () => {
  const seenPairs = new Set<string>();
  for (const inv of invoices) {
    const key = `${inv.roomId}:${inv.month}`;
    assert.ok(!seenPairs.has(key), `Phát hiện vi phạm unique [roomId, month]: ${key}`);
    seenPairs.add(key);
  }
});

runTest('2.3 Mọi invoiceId của Payment đều tham chiếu tới Invoice tồn tại', () => {
  const validInvoiceIds = new Set(invoices.map((i) => i.id));
  for (const p of payments) {
    assert.ok(
      validInvoiceIds.has(p.invoiceId),
      `Payment ${p.id} tham chiếu invoiceId không tồn tại: ${p.invoiceId}`
    );
  }
});

runTest('2.4 Có các trường hợp thanh toán nhiều lần trên cùng một hóa đơn', () => {
  const invoicePaymentCount = new Map<number, number>();
  for (const p of payments) {
    invoicePaymentCount.set(p.invoiceId, (invoicePaymentCount.get(p.invoiceId) || 0) + 1);
  }

  let multiPaymentCount = 0;
  for (const [, count] of invoicePaymentCount.entries()) {
    if (count >= 2) {
      multiPaymentCount++;
    }
  }
  assert.ok(multiPaymentCount > 0, `Phải có ít nhất 1 Invoice có từ 2 Payment trở lên (tìm thấy ${multiPaymentCount})`);
});

// =========================================================================
// 3. KIỂM THỬ TÍNH NHẤT QUÁN TÀI CHÍNH (FINANCIAL INTEGRITY & DECIMAL)
// =========================================================================
console.log('--- 3. Kiểm thử Tính nhất quán Tài chính ---');

runTest('3.1 Tổng 4 khoản phí bằng chính xác totalAmount bằng Prisma.Decimal', () => {
  for (const inv of invoices) {
    const expectedTotal = inv.managementFee
      .plus(inv.parkingFee)
      .plus(inv.waterFee)
      .plus(inv.otherFee)
      .toDecimalPlaces(2, Prisma.Decimal.ROUND_HALF_UP);

    assert.ok(
      inv.totalAmount.equals(expectedTotal),
      `Invoice ${inv.id} có totalAmount (${inv.totalAmount}) không bằng tổng 4 phí (${expectedTotal})`
    );
  }
});

runTest('3.2 Tổng Payment.amount của từng Invoice bằng chính xác paidAmount', () => {
  const paymentsByInvoice = new Map<number, GeneratedPayment[]>();
  for (const p of payments) {
    const list = paymentsByInvoice.get(p.invoiceId) || [];
    list.push(p);
    paymentsByInvoice.set(p.invoiceId, list);
  }

  for (const inv of invoices) {
    const invoicePayments = paymentsByInvoice.get(inv.id) || [];
    const sum = sumDecimals(...invoicePayments.map((p) => p.amount));

    assert.ok(
      inv.paidAmount.equals(sum),
      `Invoice ${inv.id} có paidAmount (${inv.paidAmount}) không bằng tổng Payment (${sum})`
    );
  }
});

runTest('3.3 Tuyệt đối không có hóa đơn nào bị nộp thừa (paidAmount <= totalAmount)', () => {
  for (const inv of invoices) {
    assert.ok(
      inv.paidAmount.lessThanOrEqualTo(inv.totalAmount),
      `Invoice ${inv.id} bị nộp thừa tiền: paidAmount (${inv.paidAmount}) > totalAmount (${inv.totalAmount})`
    );
  }
});

runTest('3.4 Tuyệt đối không có Payment có amount <= 0 hoặc âm', () => {
  for (const p of payments) {
    assert.ok(
      p.amount.greaterThan(0),
      `Payment ${p.id} có amount không hợp lệ: ${p.amount.toString()} (phải > 0)`
    );
  }
});

runTest('3.5 Phân loại trạng thái InvoiceStatus khớp chính xác 100% với số tiền đã nộp', () => {
  for (const inv of invoices) {
    if (inv.status === InvoiceStatus.UNPAID) {
      assert.ok(inv.paidAmount.isZero(), `Hóa đơn UNPAID ID ${inv.id} nhưng paidAmount = ${inv.paidAmount}`);
    } else if (inv.status === InvoiceStatus.PAID) {
      assert.ok(
        inv.paidAmount.equals(inv.totalAmount),
        `Hóa đơn PAID ID ${inv.id} nhưng paidAmount (${inv.paidAmount}) != totalAmount (${inv.totalAmount})`
      );
    } else if (inv.status === InvoiceStatus.PARTIALLY_PAID) {
      assert.ok(
        inv.paidAmount.greaterThan(0) && inv.paidAmount.lessThan(inv.totalAmount),
        `Hóa đơn PARTIALLY_PAID ID ${inv.id} có paidAmount (${inv.paidAmount}) không nằm trong (0, totalAmount)`
      );
    }
  }
});

runTest('3.6 Hóa đơn UNPAID tuyệt đối không có bất kỳ Payment nào', () => {
  const paymentsByInvoice = new Map<number, number>();
  for (const p of payments) {
    paymentsByInvoice.set(p.invoiceId, (paymentsByInvoice.get(p.invoiceId) || 0) + 1);
  }

  for (const inv of invoices) {
    if (inv.status === InvoiceStatus.UNPAID) {
      const pCount = paymentsByInvoice.get(inv.id) || 0;
      assert.strictEqual(pCount, 0, `Hóa đơn UNPAID ID ${inv.id} lại có ${pCount} Payment`);
    }
  }
});

runTest('3.7 Kiểm tra định dạng Decimal scale tối đa 2 chữ số và không vượt Decimal(12,2)', () => {
  const maxDecimalLimit = new Prisma.Decimal('999999999.99');

  for (const inv of invoices) {
    assert.ok(inv.totalAmount.lessThanOrEqualTo(maxDecimalLimit), `totalAmount vượt quá Decimal(12,2)`);
    assert.ok(inv.paidAmount.lessThanOrEqualTo(maxDecimalLimit), `paidAmount vượt quá Decimal(12,2)`);
    assert.ok(inv.totalAmount.decimalPlaces() <= 2, `totalAmount có hơn 2 chữ số thập phân`);
    assert.ok(inv.paidAmount.decimalPlaces() <= 2, `paidAmount có hơn 2 chữ số thập phân`);
  }

  for (const p of payments) {
    assert.ok(p.amount.lessThanOrEqualTo(maxDecimalLimit), `Payment amount vượt quá Decimal(12,2)`);
    assert.ok(p.amount.decimalPlaces() <= 2, `Payment amount có hơn 2 chữ số thập phân`);
  }
});

runTest('3.8 Có đầy đủ cả 3 trạng thái hóa đơn PAID, PARTIALLY_PAID, UNPAID', () => {
  const paidCount = invoices.filter((i) => i.status === InvoiceStatus.PAID).length;
  const partialCount = invoices.filter((i) => i.status === InvoiceStatus.PARTIALLY_PAID).length;
  const unpaidCount = invoices.filter((i) => i.status === InvoiceStatus.UNPAID).length;

  assert.ok(paidCount > 0, `Phải có hóa đơn PAID (nhận ${paidCount})`);
  assert.ok(partialCount > 0, `Phải có hóa đơn PARTIALLY_PAID (nhận ${partialCount})`);
  assert.ok(unpaidCount > 0, `Phải có hóa đơn UNPAID (nhận ${unpaidCount})`);
});

// =========================================================================
// 4. KIỂM THỬ TÍNH ĐƠN ĐỊNH (DETERMINISM)
// =========================================================================
console.log('--- 4. Kiểm thử Tính đơn định (Determinism) ---');

runTest('4.1 Cùng seed và cùng input tạo ra kết quả 100% giống nhau', () => {
  const resA = generateInvoicesAndPayments(sampleRooms, { seed: 12345678 });
  const resB = generateInvoicesAndPayments(sampleRooms, { seed: 12345678 });

  assert.deepStrictEqual(resA.invoices, resB.invoices, 'Hai lượt sinh cùng seed phải có invoices giống nhau');
  assert.deepStrictEqual(resA.payments, resB.payments, 'Hai lượt sinh cùng seed phải có payments giống nhau');
});

runTest('4.2 Khác seed tạo ra kết quả dữ liệu khác nhau', () => {
  const resA = generateInvoicesAndPayments(sampleRooms, { seed: 11112222 });
  const resB = generateInvoicesAndPayments(sampleRooms, { seed: 88889999 });

  const totalsA = resA.invoices.map((i) => i.totalAmount.toString());
  const totalsB = resB.invoices.map((i) => i.totalAmount.toString());
  assert.notDeepStrictEqual(totalsA, totalsB, 'Khác seed phải tạo ra dữ liệu số tiền khác nhau');
});

// =========================================================================
// 5. KIỂM THỬ CÁC TRƯỜNG HỢP BIÊN & NGOẠI LỆ (EDGE CASES & HARDENING)
// =========================================================================
console.log('--- 5. Kiểm thử Edge Cases & Ngoại lệ (M5.1 Hardening) ---');

runTest('5.1 Danh sách Room rỗng phải ném lỗi rõ ràng', () => {
  assert.throws(
    () => {
      generateInvoicesAndPayments([]);
    },
    /Danh sách Room rỗng/
  );
});

runTest('5.2 Dữ liệu đầu vào có ID Room không hợp lệ hoặc bị trùng phải ném lỗi', () => {
  const invalidRooms: any[] = [
    { id: -1, roomNumber: '101', floor: 1, area: 50, status: 'OCCUPIED', createdAt: new Date(), updatedAt: new Date() },
  ];
  assert.throws(
    () => {
      generateInvoicesAndPayments(invalidRooms);
    },
    /Phát hiện Room có ID không hợp lệ/
  );

  const duplicateRooms: any[] = [
    { id: 1, roomNumber: '101', floor: 1, area: 50, status: 'OCCUPIED', createdAt: new Date(), updatedAt: new Date() },
    { id: 1, roomNumber: '102', floor: 1, area: 60, status: 'OCCUPIED', createdAt: new Date(), updatedAt: new Date() },
  ];
  assert.throws(
    () => {
      generateInvoicesAndPayments(duplicateRooms);
    },
    /Phát hiện ID Room bị trùng lặp/
  );
});

runTest('5.3 Dữ liệu đầu vào có diện tích Room không hợp lệ (<= 0) phải ném lỗi', () => {
  const zeroAreaRooms: any[] = [
    { id: 1, roomNumber: '101', floor: 1, area: 0, status: 'OCCUPIED', createdAt: new Date(), updatedAt: new Date() },
  ];
  assert.throws(
    () => {
      generateInvoicesAndPayments(zeroAreaRooms);
    },
    /có diện tích \(area\) không hợp lệ/
  );
});

runTest('5.4 Hóa đơn có totalAmount <= 0 khi sinh Payment phải ném lỗi', () => {
  const invalidInvoice: GeneratedInvoice = {
    id: 999,
    roomId: 1,
    month: '2026-10',
    managementFee: new Prisma.Decimal(0),
    parkingFee: new Prisma.Decimal(0),
    waterFee: new Prisma.Decimal(0),
    otherFee: new Prisma.Decimal(0),
    totalAmount: new Prisma.Decimal(0),
    paidAmount: new Prisma.Decimal(0),
    dueDate: null,
    status: InvoiceStatus.PAID,
    createdAt: new Date(),
    updatedAt: new Date(),
  };

  assert.throws(
    () => {
      generatePayments([invalidInvoice]);
    },
    /có totalAmount không hợp lệ/
  );
});

// =========================================================================
// 6. KIỂM THỬ KIỂM TOÁN ĐẦU VÀO M5.1 (INPUT VALIDATION & CAPACITY HARDENING)
// =========================================================================
console.log('--- 6. Kiểm thử M5.1: Custom Months & Options Hardening ---');

runTest('6.1 Tháng sai định dạng (không phải YYYY-MM) phải ném lỗi', () => {
  assert.throws(
    () => {
      generateInvoicesAndPayments(sampleRooms, { count: 10, months: ['2026/10'] });
    },
    /Định dạng tháng không hợp lệ/
  );
  assert.throws(
    () => {
      generateInvoicesAndPayments(sampleRooms, { count: 10, months: ['abc-xyz'] });
    },
    /Định dạng tháng không hợp lệ/
  );
});

runTest('6.2 Tháng ngoài miền 01-12 (2026-00, 2026-13) phải ném lỗi', () => {
  assert.throws(
    () => {
      generateInvoicesAndPayments(sampleRooms, { count: 10, months: ['2026-00'] });
    },
    /Định dạng tháng không hợp lệ/
  );
  assert.throws(
    () => {
      generateInvoicesAndPayments(sampleRooms, { count: 10, months: ['2026-13'] });
    },
    /Định dạng tháng không hợp lệ/
  );
});

runTest('6.3 Danh sách months có tháng bị trùng lặp phải ném lỗi', () => {
  assert.throws(
    () => {
      generateInvoicesAndPayments(sampleRooms, { count: 10, months: ['2026-08', '2026-09', '2026-08'] });
    },
    /Phát hiện tháng bị trùng lặp/
  );
});

runTest('6.4 Danh sách months chứa phần tử rỗng hoặc sai kiểu phải ném lỗi', () => {
  assert.throws(
    () => {
      generateInvoicesAndPayments(sampleRooms, { count: 10, months: ['2026-08', '   '] });
    },
    /không hợp lệ hoặc rỗng/
  );
  assert.throws(
    () => {
      generateInvoicesAndPayments(sampleRooms, { count: 10, months: ['2026-08', null as any] });
    },
    /không hợp lệ hoặc rỗng/
  );
  assert.throws(
    () => {
      generateInvoicesAndPayments(sampleRooms, { count: 10, months: [] });
    },
    /Danh sách months được cung cấp rỗng/
  );
});

runTest('6.5 Danh sách months hợp lệ nhưng không đủ capacity phải ném lỗi rõ ràng', () => {
  const smallRooms = sampleRooms.slice(0, 10); // 10 phòng
  // 2 tháng x 10 phòng = max 20 capacity, nhưng yêu cầu sinh 50
  assert.throws(
    () => {
      generateInvoicesAndPayments(smallRooms, { count: 50, months: ['2026-09', '2026-10'] });
    },
    /Dung lượng tối đa của 2 tháng x 10 phòng \(20\) không đủ để sinh 50 hóa đơn/
  );
});

runTest('6.6 Danh sách months hợp lệ có đủ capacity sinh thành công và ngày tháng hợp lệ', () => {
  const smallRooms = sampleRooms.slice(0, 10); // 10 phòng
  // 5 tháng x 10 phòng = max 50 capacity, yêu cầu sinh 30
  const result = generateInvoicesAndPayments(smallRooms, {
    count: 30,
    months: ['2026-06', '2026-07', '2026-08', '2026-09', '2026-10'],
  });

  assert.strictEqual(result.invoices.length, 30);
  for (const inv of result.invoices) {
    assert.ok(inv.createdAt instanceof Date && !isNaN(inv.createdAt.getTime()), 'createdAt không hợp lệ');
    assert.ok(inv.dueDate instanceof Date && !isNaN(inv.dueDate.getTime()), 'dueDate không hợp lệ');
    assert.ok(inv.dueDate.getTime() > inv.createdAt.getTime(), 'dueDate phải sau createdAt');
    assert.strictEqual(inv.createdAt.getUTCFullYear(), 2026, 'Năm của createdAt phải là 2026');
    assert.strictEqual(inv.dueDate.getUTCFullYear(), 2026, 'Năm của dueDate phải là 2026');
  }
});

runTest('6.6.1 (M5.2) Năm UTC nhỏ hơn 100 (0026-10) giữ chính xác năm trong month, createdAt và dueDate', () => {
  const smallRooms = sampleRooms.slice(0, 5); // 5 phòng
  const result = generateInvoicesAndPayments(smallRooms, {
    count: 5,
    months: ['0026-10'],
  });

  assert.strictEqual(result.invoices.length, 5);
  for (const inv of result.invoices) {
    assert.strictEqual(inv.month, '0026-10');
    assert.strictEqual(inv.createdAt.getUTCFullYear(), 26, 'Năm createdAt phải chính xác là 26 (không bị cộng 1900 thành 1926)');
    assert.strictEqual(inv.dueDate?.getUTCFullYear(), 26, 'Năm dueDate phải chính xác là 26 (không bị cộng 1900 thành 1926)');
    assert.strictEqual(inv.createdAt.getUTCMonth(), 9, 'Tháng createdAt phải là tháng 10 (index 9)');
    assert.strictEqual(inv.dueDate?.getUTCMonth(), 9, 'Tháng dueDate phải là tháng 10 (index 9)');
  }
});

runTest('6.7 Tham số count không hợp lệ (NaN, Infinity, số âm, số thực) phải ném lỗi', () => {
  assert.throws(
    () => {
      generateInvoicesAndPayments(sampleRooms, { count: NaN });
    },
    /count phải là số nguyên hữu hạn/
  );
  assert.throws(
    () => {
      generateInvoicesAndPayments(sampleRooms, { count: Infinity });
    },
    /count phải là số nguyên hữu hạn/
  );
  assert.throws(
    () => {
      generateInvoicesAndPayments(sampleRooms, { count: -5 });
    },
    /count phải là số nguyên không âm/
  );
  assert.throws(
    () => {
      generateInvoicesAndPayments(sampleRooms, { count: 12.5 });
    },
    /count phải là số nguyên không âm/
  );
});

runTest('6.8 Tham số multiPaymentRate không hợp lệ (NaN, Infinity, <0, >1) phải ném lỗi', () => {
  assert.throws(
    () => {
      generateInvoicesAndPayments(sampleRooms, { count: 10, multiPaymentRate: NaN });
    },
    /multiPaymentRate phải là số thực trong đoạn \[0, 1\]/
  );
  assert.throws(
    () => {
      generateInvoicesAndPayments(sampleRooms, { count: 10, multiPaymentRate: -0.1 });
    },
    /multiPaymentRate phải là số thực trong đoạn \[0, 1\]/
  );
  assert.throws(
    () => {
      generateInvoicesAndPayments(sampleRooms, { count: 10, multiPaymentRate: 1.5 });
    },
    /multiPaymentRate phải là số thực trong đoạn \[0, 1\]/
  );

  // Kiểm tra tương tự trên generatePayments trực tiếp
  assert.throws(
    () => {
      generatePayments(invoices, { multiPaymentRate: -0.5 });
    },
    /multiPaymentRate phải là số thực trong đoạn \[0, 1\]/
  );
  assert.throws(
    () => {
      generatePayments(invoices, { multiPaymentRate: 2.0 });
    },
    /multiPaymentRate phải là số thực trong đoạn \[0, 1\]/
  );
});

runTest('6.9 Khi count = 0 trả về kết quả rỗng hợp lệ', () => {
  const result = generateInvoicesAndPayments(sampleRooms, { count: 0 });
  assert.strictEqual(result.invoices.length, 0);
  assert.strictEqual(result.payments.length, 0);
});

console.log('======================================================');
console.log(`🎉 TOÀN BỘ ${passedTests}/${totalTests} TESTS M5/M5.1 ĐẠT CHUẨN!`);
console.log('======================================================');
