// =========================================================================
// KIỂM ĐỊNH CHÍNH SÁCH MEDIA ASSET & ZERO-ASSET POLICY (M8.1 TESTS)
// Phân hệ: backend/dataset/validation/media-asset-generator.test.ts
// Đặc tả: Khóa chặt chính sách Zero-Asset, loại bỏ ingestion không an toàn
// =========================================================================

import * as assert from 'assert';
import { Role } from '@prisma/client';
import { DATASET_CONFIG } from '../config/dataset.config';
import {
  generateMediaAssets,
  MEDIA_POLICY_LIMITS,
  WHITELISTED_MEDIA_PURPOSES,
  MEDIA_PURPOSE_ROLE_PERMISSIONS,
  MEDIA_DELIVERY_TYPE_BY_PURPOSE,
  GeneratedMediaAsset,
} from '../seed/generators/media-asset.generator';
import {
  WHITELISTED_PURPOSES as BACKEND_WHITELISTED_PURPOSES,
  PURPOSE_ROLE_PERMISSIONS as BACKEND_PURPOSE_ROLE_PERMISSIONS,
  DELIVERY_TYPE_BY_PURPOSE as BACKEND_DELIVERY_TYPE_BY_PURPOSE,
  MEDIA_LIMITS as BACKEND_MEDIA_LIMITS,
} from '../../src/modules/media/media.config';
import { generateRooms } from '../seed/generators/room.generator';
import { generateUsers } from '../seed/generators/user.generator';
import { generateTickets } from '../seed/generators/ticket.generator';
import { checkMediaIntegrity } from './checks/media.check';
import { checkCounts } from './checks/counts.check';

let passedTests = 0;
let totalTests = 0;

function runTest(name: string, fn: () => void) {
  totalTests++;
  try {
    fn();
    passedTests++;
    console.log(`  ✅ [PASS] ${name}`);
  } catch (error: any) {
    console.error(`  ❌ [FAIL] ${name}`);
    console.error(`     Nguyên nhân: ${error?.message || error}`);
    throw error;
  }
}

console.log('======================================================');
console.log('🧪 BẮT ĐẦU KIỂM ĐỊNH MEDIAASSET ZERO-ASSET POLICY (M8.1)');
console.log('======================================================');

// Khởi tạo fixture người dùng và ticket từ các milestone đã kiểm chứng
const sampleRooms = generateRooms({ seed: 20261111 });
const sampleUsers = generateUsers(sampleRooms, { seed: 20261111 });
const sampleTickets = generateTickets(sampleUsers, sampleRooms, { seed: 20261111 });

// =========================================================================
// 1. KIỂM THỬ CHẾ ĐỘ ZERO-ASSET & KHÔNG CÓ INGESTION TỰ KHAI BÁO
// =========================================================================
console.log('--- 1. Kiểm thử Chế độ Zero-Asset & Khóa API Ingestion ---');

runTest('1.1 Generator luôn trả về mảng rỗng [] (0 MediaAsset) trong mọi cấu hình', () => {
  // Không truyền tham số
  const resEmpty = generateMediaAssets();
  assert.strictEqual(Array.isArray(resEmpty), true);
  assert.strictEqual(resEmpty.length, 0, 'Mặc định không tham số phải là []');

  // Truyền users và tickets
  const resWithData = generateMediaAssets(sampleUsers, sampleTickets);
  assert.strictEqual(resWithData.length, 0, 'Truyền users và tickets vẫn phải là []');

  // Truyền options seed
  const resWithSeed = generateMediaAssets(sampleUsers, sampleTickets, { seed: 20261111 });
  assert.strictEqual(resWithSeed.length, 0, 'Truyền options seed vẫn phải là []');
});

runTest('1.2 Generator không có API nhận object giả lập để tạo MediaAsset', () => {
  // Generator không nhận verifiedAssets hay maxVerified
  // Ngay cả khi truyền thuộc tính lạ vào options (bypass type), generator vẫn kiên định trả []
  const resBypassAttempt = (generateMediaAssets as any)(sampleUsers, sampleTickets, {
    verifiedAssets: [{ publicId: 'fake/id' }],
    maxVerified: 10,
  });
  assert.strictEqual(resBypassAttempt.length, 0, 'Tuyệt đối không xử lý caller-controlled asset inputs');
});

runTest('1.3 Không có bất kỳ code path nào tự tạo bản ghi có isConfirmed = true', () => {
  const allGenerated = generateMediaAssets(sampleUsers, sampleTickets);
  const confirmedList = allGenerated.filter((a) => a.isConfirmed === true);
  assert.strictEqual(confirmedList.length, 0, 'Số bản ghi isConfirmed = true phải là 0');
});

runTest('1.4 Không tự sinh Cloudinary URL, publicId hoặc metadata giả mạo', () => {
  const assets = generateMediaAssets(sampleUsers, sampleTickets);
  assert.strictEqual(assets.length, 0);

  // Xác minh không có bất kỳ chuỗi URL/publicId nào được sinh ra từ generator
  const hasCloudinaryUrl = assets.some((a) => a.url.includes('res.cloudinary.com'));
  assert.strictEqual(hasCloudinaryUrl, false);
});

runTest('1.5 Cấu hình DATASET_CONFIG.TARGET_COUNTS.MEDIA_ASSETS.MAX_VERIFIED bằng 0', () => {
  assert.strictEqual(
    DATASET_CONFIG.TARGET_COUNTS.MEDIA_ASSETS.MAX_VERIFIED,
    0,
    'MAX_VERIFIED trong dataset.config.ts bắt buộc bằng 0'
  );
});

runTest('1.6 checkMediaIntegrity PASS với 0 MediaAsset giả mạo', () => {
  const checkResult = checkMediaIntegrity({
    fakeCloudinaryAssets: 0,
    unconfirmedAssetsCount: 0,
    invalidMediaUrls: 0,
  });
  assert.strictEqual(checkResult.passed, true);
  assert.strictEqual(checkResult.name, 'Media Integrity Check');
});

runTest('1.7 checkCounts PASS với mediaAssets = 0', () => {
  const countsCheck = checkCounts({
    rooms: 100,
    users: {
      total: sampleUsers.length,
      admin: 1,
      bql: 2,
      technician: 5,
      resident: sampleUsers.length - 8,
    },
    tickets: sampleTickets.length,
    invoices: 450,
    payments: 350,
    feedbacks: 40,
    notifications: 25,
    mediaAssets: 0,
  });
  assert.strictEqual(countsCheck.passed, true);
});

// =========================================================================
// 2. KIỂM THỬ CHÍNH SÁCH MEDIA ĐỐI CHIẾU TRỰC TIẾP VỚI BACKEND
// =========================================================================
console.log('--- 2. Kiểm thử Chính sách Media đối chiếu trực tiếp Backend ---');

runTest('2.1 Giới hạn dung lượng và định dạng ảnh khớp trực tiếp BACKEND_MEDIA_LIMITS.IMAGE', () => {
  assert.strictEqual(
    MEDIA_POLICY_LIMITS.IMAGE.MAX_BYTES,
    BACKEND_MEDIA_LIMITS.IMAGE.MAX_BYTES,
    'Giới hạn dung lượng ảnh (MAX_BYTES) phải khớp trực tiếp backend (5MB)'
  );
  assert.deepStrictEqual(
    Array.from(MEDIA_POLICY_LIMITS.IMAGE.ALLOWED_FORMATS),
    BACKEND_MEDIA_LIMITS.IMAGE.ALLOWED_FORMATS,
    'Định dạng ảnh hợp lệ (ALLOWED_FORMATS) phải khớp trực tiếp backend [jpg, jpeg, png, webp]'
  );
});

runTest('2.2 Giới hạn dung lượng và định dạng video khớp trực tiếp BACKEND_MEDIA_LIMITS.VIDEO', () => {
  assert.strictEqual(
    MEDIA_POLICY_LIMITS.VIDEO.MAX_BYTES,
    BACKEND_MEDIA_LIMITS.VIDEO.MAX_BYTES,
    'Giới hạn dung lượng video (MAX_BYTES) phải khớp trực tiếp backend (20MB)'
  );
  assert.deepStrictEqual(
    Array.from(MEDIA_POLICY_LIMITS.VIDEO.ALLOWED_FORMATS),
    BACKEND_MEDIA_LIMITS.VIDEO.ALLOWED_FORMATS,
    'Định dạng video hợp lệ (ALLOWED_FORMATS) phải khớp trực tiếp backend [mp4, mov]'
  );
});

runTest('2.3 Danh sách mục đích Whitelist khớp trực tiếp BACKEND_WHITELISTED_PURPOSES', () => {
  assert.deepStrictEqual(
    Array.from(WHITELISTED_MEDIA_PURPOSES),
    Array.from(BACKEND_WHITELISTED_PURPOSES),
    'Danh sách mục đích phải khớp trực tiếp [tickets, materials, announcements] của backend'
  );
});

runTest('2.4 Phân quyền vai trò (RBAC) khớp trực tiếp BACKEND_PURPOSE_ROLE_PERMISSIONS', () => {
  assert.deepStrictEqual(
    MEDIA_PURPOSE_ROLE_PERMISSIONS.tickets,
    BACKEND_PURPOSE_ROLE_PERMISSIONS.tickets,
    'Quyền tickets khớp trực tiếp backend: RESIDENT, BQL, ADMIN'
  );
  assert.deepStrictEqual(
    MEDIA_PURPOSE_ROLE_PERMISSIONS.materials,
    BACKEND_PURPOSE_ROLE_PERMISSIONS.materials,
    'Quyền materials khớp trực tiếp backend: TECHNICIAN, BQL, ADMIN'
  );
  assert.deepStrictEqual(
    MEDIA_PURPOSE_ROLE_PERMISSIONS.announcements,
    BACKEND_PURPOSE_ROLE_PERMISSIONS.announcements,
    'Quyền announcements khớp trực tiếp backend: BQL, ADMIN'
  );
});

runTest('2.5 Chính sách phân phối CDN (Delivery Type) khớp trực tiếp BACKEND_DELIVERY_TYPE_BY_PURPOSE', () => {
  assert.strictEqual(
    MEDIA_DELIVERY_TYPE_BY_PURPOSE.announcements,
    BACKEND_DELIVERY_TYPE_BY_PURPOSE.announcements,
    'announcements khớp trực tiếp backend: upload'
  );
  assert.strictEqual(
    MEDIA_DELIVERY_TYPE_BY_PURPOSE.tickets,
    BACKEND_DELIVERY_TYPE_BY_PURPOSE.tickets,
    'tickets khớp trực tiếp backend: authenticated'
  );
  assert.strictEqual(
    MEDIA_DELIVERY_TYPE_BY_PURPOSE.materials,
    BACKEND_DELIVERY_TYPE_BY_PURPOSE.materials,
    'materials khớp trực tiếp backend: authenticated'
  );
});

runTest('2.6 Thời hạn Intent Token khớp chính xác backend/src/modules/media/media.service.ts (15 phút)', () => {
  assert.strictEqual(MEDIA_POLICY_LIMITS.INTENT_TOKEN_EXPIRY_SECONDS, 15 * 60, 'Token hết hạn sau 15 phút (900s)');
});

// =========================================================================
// 3. KIỂM THỬ ĐỘC LẬP & KHÔNG ẢNH HƯỞNG CÁC GENERATOR M3–M7
// =========================================================================
console.log('--- 3. Kiểm thử Độc lập & Không ảnh hưởng Generator khác ---');

runTest('3.1 Ticket generator không sinh URL Cloudinary giả mạo trong mediaUrl và completedMediaUrl', () => {
  for (const t of sampleTickets) {
    if (t.mediaUrl !== null) {
      assert.ok(!t.mediaUrl.includes('res.cloudinary.com'), `Ticket ${t.id} chứa mediaUrl Cloudinary: ${t.mediaUrl}`);
    }
    if (t.completedMediaUrl !== null) {
      assert.ok(
        !t.completedMediaUrl.includes('res.cloudinary.com'),
        `Ticket ${t.id} chứa completedMediaUrl Cloudinary: ${t.completedMediaUrl}`
      );
    }
  }
});

runTest('3.2 Tính đơn định (Deterministic) của generator qua nhiều lần gọi độc lập', () => {
  const call1 = generateMediaAssets(sampleUsers, sampleTickets, { seed: 12345 });
  const call2 = generateMediaAssets(sampleUsers, sampleTickets, { seed: 12345 });
  const call3 = generateMediaAssets(sampleUsers, sampleTickets, { seed: 99999 });

  assert.deepStrictEqual(call1, call2);
  assert.deepStrictEqual(call1, call3);
  assert.strictEqual(call1.length, 0);
});

runTest('3.3 Không làm đột biến dữ liệu đầu vào (Immutable)', () => {
  const usersSnapshot = JSON.stringify(sampleUsers);
  const ticketsSnapshot = JSON.stringify(sampleTickets);

  generateMediaAssets(sampleUsers, sampleTickets);

  assert.strictEqual(JSON.stringify(sampleUsers), usersSnapshot, 'sampleUsers không được bị thay đổi');
  assert.strictEqual(JSON.stringify(sampleTickets), ticketsSnapshot, 'sampleTickets không được bị thay đổi');
});

console.log('======================================================');
console.log(`🎉 TOÀN BỘ ${passedTests}/${totalTests} TESTS M8.1 ĐẠT CHUẨN!`);
console.log('======================================================');
