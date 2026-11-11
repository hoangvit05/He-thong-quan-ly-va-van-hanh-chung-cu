// =========================================================================
// KIỂM THỬ XÁC MINH SỬA LỖI MILESTONE 2 (DATABASE SAFETY & TICKET VALIDATOR)
// =========================================================================

import assert from 'assert';
import { assertSafeDatabaseEnvironment } from '../seed/index';
import { checkTicketIntegrity, TicketValidationInput } from './checks/ticket.check';
import { checkCounts, ModelCounts } from './checks/counts.check';

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
console.log('🧪 CHẠY TEST BẢO VỆ DATABASE (DATABASE SAFETY TESTS)');
console.log('======================================================');

const originalEnv = { ...process.env };

function restoreEnv() {
  process.env = { ...originalEnv };
}

// 1. Production -> FAIL
runTest('Database Safety: Môi trường production phải ném lỗi từ chối', () => {
  restoreEnv();
  process.env.NODE_ENV = 'production';
  process.env.ALLOW_DATASET_SEED = 'true';

  assert.throws(
    () => {
      assertSafeDatabaseEnvironment();
    },
    /Tuyệt đối từ chối chạy seed dữ liệu trên môi trường PRODUCTION!/
  );
});

// 2. Thiếu opt-in -> FAIL
runTest('Database Safety: Thiếu biến opt-in (undefined) phải ném lỗi từ chối', () => {
  restoreEnv();
  process.env.NODE_ENV = 'development';
  delete process.env.ALLOW_DATASET_SEED;

  assert.throws(
    () => {
      assertSafeDatabaseEnvironment();
    },
    /ALLOW_DATASET_SEED phải có giá trị 'true'/
  );
});

// 3. Opt-in = 'false' -> FAIL
runTest('Database Safety: Biến opt-in = "false" phải ném lỗi từ chối', () => {
  restoreEnv();
  process.env.NODE_ENV = 'development';
  process.env.ALLOW_DATASET_SEED = 'false';

  assert.throws(
    () => {
      assertSafeDatabaseEnvironment();
    },
    /ALLOW_DATASET_SEED phải có giá trị 'true'/
  );
});

// 4. Development + opt-in = 'true' -> PASS
runTest('Database Safety: Development + ALLOW_DATASET_SEED="true" phải PASS', () => {
  restoreEnv();
  process.env.NODE_ENV = 'development';
  process.env.ALLOW_DATASET_SEED = 'true';

  assert.doesNotThrow(() => {
    assertSafeDatabaseEnvironment();
  });
});

restoreEnv();

console.log('======================================================');
console.log('🧪 CHẠY TEST TICKET VALIDATOR (TICKET VALIDATOR TESTS)');
console.log('======================================================');

// 1. invalidTransitions = 0 -> không phát sinh lỗi transition
runTest('Ticket Validator: invalidTransitions = 0 phải PASS', () => {
  const input: TicketValidationInput = {
    invalidTechnicianAssignments: 0,
    invalidRatings: 0,
    invalidDuplicateFlags: 0,
    invalidTransitions: 0,
  };

  const result = checkTicketIntegrity(input);
  assert.strictEqual(result.passed, true);
  assert.ok(!result.message.includes('chuyển đổi trạng thái'));
});

// 2. invalidTransitions > 0 -> FAIL và phản ánh đúng số lượng
runTest('Ticket Validator: invalidTransitions > 0 phải FAIL và nêu rõ số lượng', () => {
  const input: TicketValidationInput = {
    invalidTechnicianAssignments: 0,
    invalidRatings: 0,
    invalidDuplicateFlags: 0,
    invalidTransitions: 5,
  };

  const result = checkTicketIntegrity(input);
  assert.strictEqual(result.passed, false);
  assert.ok(result.message.includes('Phát hiện 5 ticket có chuyển đổi trạng thái không hợp lệ'));
});

// 3. Kết hợp nhiều lỗi -> tất cả lỗi đều được phản ánh trong kết quả
runTest('Ticket Validator: Kết hợp nhiều lỗi đồng thời phải phản ánh đầy đủ', () => {
  const input: TicketValidationInput = {
    invalidTechnicianAssignments: 2,
    invalidRatings: 3,
    invalidDuplicateFlags: 1,
    invalidTransitions: 4,
  };

  const result = checkTicketIntegrity(input);
  assert.strictEqual(result.passed, false);
  assert.ok(result.message.includes('Phát hiện 4 ticket có chuyển đổi trạng thái'));
  assert.ok(result.message.includes('Phát hiện 2 ticket ở trạng thái ASSIGNED/IN_PROGRESS/COMPLETED'));
  assert.ok(result.message.includes('Phát hiện 3 ticket có điểm rating'));
  assert.ok(result.message.includes('Phát hiện 1 ticket sai lệch cờ isDuplicate'));
});

console.log('======================================================');
console.log('🧪 CHẠY TEST COUNTS VALIDATOR (COUNTS VALIDATOR TESTS)');
console.log('======================================================');

const baseValidCounts: ModelCounts = {
  rooms: 100,
  users: {
    admin: 1,
    bql: 2,
    technician: 5,
    resident: 120,
    total: 128,
  },
  tickets: 175,
  invoices: 500,
  payments: 400,
  feedbacks: 40,
  notifications: 25,
  mediaAssets: 0,
};

// 1. Bộ số lượng hợp lệ theo cấu hình → PASS
runTest('Counts Validator: Bộ số lượng hợp lệ theo cấu hình phải PASS', () => {
  const result = checkCounts(baseValidCounts);
  assert.strictEqual(result.passed, true);
  assert.strictEqual(result.message, 'Toàn bộ số lượng bản ghi thỏa mãn quy mô đã duyệt.');
});

// 2. mediaAssets = 1 khi MAX_VERIFIED = 0 → FAIL
runTest('Counts Validator: mediaAssets = 1 khi MAX_VERIFIED = 0 phải FAIL', () => {
  const input: ModelCounts = {
    ...baseValidCounts,
    mediaAssets: 1,
  };
  const result = checkCounts(input);
  assert.strictEqual(result.passed, false);
  assert.ok(result.message.includes('Số lượng MediaAsset (1) vượt quá giới hạn cho phép'));
});

// 3. mediaAssets âm → FAIL
runTest('Counts Validator: mediaAssets âm phải FAIL', () => {
  const input: ModelCounts = {
    ...baseValidCounts,
    mediaAssets: -1,
  };
  const result = checkCounts(input);
  assert.strictEqual(result.passed, false);
  assert.ok(result.message.includes('Số lượng MediaAsset không được âm (nhận -1)'));
});

// 4. users.total không bằng tổng các role → FAIL
runTest('Counts Validator: users.total không khớp tổng các role phải FAIL', () => {
  const input: ModelCounts = {
    ...baseValidCounts,
    users: {
      ...baseValidCounts.users,
      total: 140, // 1 + 2 + 5 + 120 = 128 !== 140
    },
  };
  const result = checkCounts(input);
  assert.strictEqual(result.passed, false);
  assert.ok(result.message.includes('Tổng số User (140) không khớp với tổng các nhóm vai trò'));
});

// 5. Một role âm → FAIL
runTest('Counts Validator: Một role âm phải FAIL', () => {
  const input: ModelCounts = {
    ...baseValidCounts,
    users: {
      ...baseValidCounts.users,
      technician: -1,
      total: 122, // 1 + 2 + (-1) + 120 = 122
    },
  };
  const result = checkCounts(input);
  assert.strictEqual(result.passed, false);
  assert.ok(result.message.includes('Số lượng Thợ không được âm (nhận -1)'));
});

// 6. Một model count âm → FAIL
runTest('Counts Validator: Một model count âm phải FAIL', () => {
  const input: ModelCounts = {
    ...baseValidCounts,
    invoices: -50,
  };
  const result = checkCounts(input);
  assert.strictEqual(result.passed, false);
  assert.ok(result.message.includes('Số lượng Invoice không được âm (nhận -50)'));
});

// 7. Nhiều lỗi đồng thời → FAIL và thông báo đầy đủ từng lỗi
runTest('Counts Validator: Nhiều lỗi đồng thời phải FAIL và thông báo đầy đủ', () => {
  const input: ModelCounts = {
    rooms: -10,
    users: {
      admin: 1,
      bql: -2,
      technician: 5,
      resident: 120,
      total: 999,
    },
    tickets: 175,
    invoices: 500,
    payments: 400,
    feedbacks: 40,
    notifications: 25,
    mediaAssets: 3,
  };
  const result = checkCounts(input);
  assert.strictEqual(result.passed, false);
  assert.ok(result.message.includes('Số lượng Room không được âm (nhận -10)'));
  assert.ok(result.message.includes('Số lượng BQL không được âm (nhận -2)'));
  assert.ok(result.message.includes('Tổng số User (999) không khớp với tổng các nhóm vai trò'));
  assert.ok(result.message.includes('Số lượng MediaAsset (3) vượt quá giới hạn cho phép'));
});

console.log('======================================================');
console.log(`🎉 KẾT QUẢ KIỂM THỬ: ${passedTests}/${totalTests} TESTS PASS!`);
console.log('======================================================');

