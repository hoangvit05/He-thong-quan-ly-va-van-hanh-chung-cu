// =========================================================================
// KIỂM THỬ XÁC MINH SỬA LỖI MILESTONE 2 (DATABASE SAFETY & TICKET VALIDATOR)
// =========================================================================

import assert from 'assert';
import { assertSafeDatabaseEnvironment } from '../seed/index';
import { checkTicketIntegrity, TicketValidationInput } from './checks/ticket.check';

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
console.log(`🎉 KẾT QUẢ KIỂM THỬ: ${passedTests}/${totalTests} TESTS PASS!`);
console.log('======================================================');

