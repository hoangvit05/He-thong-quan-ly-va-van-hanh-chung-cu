// =========================================================================
// KIỂM ĐỊNH CHÍNH SÁCH MEDIA ASSET & GENERATOR (MILESTONE 8 TESTS)
// Phân hệ: backend/dataset/validation/media-asset-generator.test.ts
// Đặc tả: Xác minh chính sách Zero-Asset, chống tài nguyên giả và tính toàn vẹn
// =========================================================================

import * as assert from 'assert';
import { Role } from '@prisma/client';
import { DATASET_CONFIG } from '../config/dataset.config';
import {
  generateMediaAssets,
  validateVerifiedAssetInput,
  MEDIA_POLICY_LIMITS,
  WHITELISTED_MEDIA_PURPOSES,
  MEDIA_PURPOSE_ROLE_PERMISSIONS,
  MEDIA_DELIVERY_TYPE_BY_PURPOSE,
  VerifiedRealAssetInput,
  GeneratedMediaAsset,
} from '../seed/generators/media-asset.generator';
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
console.log('🧪 BẮT ĐẦU KIỂM ĐỊNH MEDIAASSET POLICY & INTEGRATION (M8)');
console.log('======================================================');

// Khởi tạo fixture người dùng và ticket từ các milestone đã kiểm chứng
const sampleRooms = generateRooms({ seed: 20261111 });
const sampleUsers = generateUsers(sampleRooms, { seed: 20261111 });
const sampleTickets = generateTickets(sampleUsers, sampleRooms, { seed: 20261111 });

const residentUser = sampleUsers.find((u) => u.role === Role.RESIDENT)!;
const techUser = sampleUsers.find((u) => u.role === Role.TECHNICIAN)!;
const bqlUser = sampleUsers.find((u) => u.role === Role.BQL)!;
const sampleTicket = sampleTickets[0];

// =========================================================================
// 1. KIỂM THỬ CHẾ ĐỘ ZERO-ASSET MẶC ĐỊNH
// =========================================================================
console.log('--- 1. Kiểm thử Chế độ Zero-Asset Mặc định ---');

runTest('1.1 Default generator trả về mảng rỗng [] (0 MediaAsset)', () => {
  const assetsDefault = generateMediaAssets();
  assert.strictEqual(Array.isArray(assetsDefault), true);
  assert.strictEqual(assetsDefault.length, 0, 'Mặc định khi không truyền tham số phải là 0 asset');

  const assetsWithUsers = generateMediaAssets(sampleUsers, sampleTickets);
  assert.strictEqual(assetsWithUsers.length, 0, 'Khi truyền users/tickets mà không có verifiedAssets phải là 0 asset');

  const assetsWithOptions = generateMediaAssets(sampleUsers, sampleTickets, { seed: 20261111 });
  assert.strictEqual(assetsWithOptions.length, 0, 'Có seed nhưng không có verifiedAssets vẫn phải là 0 asset');
});

runTest('1.2 Cấu hình DATASET_CONFIG.TARGET_COUNTS.MEDIA_ASSETS.MAX_VERIFIED bằng 0', () => {
  assert.strictEqual(
    DATASET_CONFIG.TARGET_COUNTS.MEDIA_ASSETS.MAX_VERIFIED,
    0,
    'MAX_VERIFIED trong dataset.config.ts phải bằng 0 trong cấu hình tiêu chuẩn'
  );
});

runTest('1.3 checkMediaIntegrity vượt qua với 0 MediaAsset giả mạo', () => {
  const checkResult = checkMediaIntegrity({
    fakeCloudinaryAssets: 0,
    unconfirmedAssetsCount: 0,
    invalidMediaUrls: 0,
  });
  assert.strictEqual(checkResult.passed, true);
  assert.strictEqual(checkResult.name, 'Media Integrity Check');
});

// =========================================================================
// 2. KIỂM THỬ CHÍNH SÁCH CHỐNG TÀI NGUYÊN GIẢ MẠO (ANTI-FAKE ASSET POLICY)
// =========================================================================
console.log('--- 2. Kiểm thử Chính sách Chống Tài nguyên Giả mạo ---');

runTest('2.1 Từ chối publicId chứa chuỗi giả mạo (fake, mock, dummy)', () => {
  const fakeAsset: VerifiedRealAssetInput = {
    publicId: 'tickets/fake_image_123',
    url: 'https://res.cloudinary.com/demo/image/upload/v1234/tickets/image123.jpg',
    resourceType: 'image',
    purpose: 'tickets',
    bytes: 500000,
    format: 'jpg',
    uploaderId: residentUser.id,
    ticketId: sampleTicket.id,
    isConfirmed: true,
    confirmedAt: new Date(),
  };

  const validation = validateVerifiedAssetInput(fakeAsset, sampleUsers, sampleTickets);
  assert.strictEqual(validation.isValid, false);
  assert.ok(validation.error?.includes('vi phạm chính sách cấm asset giả mạo'));
});

runTest('2.2 Từ chối publicId vi phạm bảo mật đường dẫn (Path Traversal: .., /, \\)', () => {
  const traversalAsset: VerifiedRealAssetInput = {
    publicId: '../etc/passwd',
    url: 'https://res.cloudinary.com/demo/image/upload/v1234/test.jpg',
    resourceType: 'image',
    purpose: 'tickets',
    bytes: 100000,
    format: 'jpg',
    uploaderId: residentUser.id,
    isConfirmed: true,
    confirmedAt: new Date(),
  };

  const validation = validateVerifiedAssetInput(traversalAsset, sampleUsers, sampleTickets);
  assert.strictEqual(validation.isValid, false);
  assert.ok(validation.error?.includes('Path Traversal'));
});

runTest('2.3 Từ chối URL giả mạo (example.com, mock URL, HTTP không bảo mật)', () => {
  const httpAsset: VerifiedRealAssetInput = {
    publicId: 'tickets/img_valid_123',
    url: 'http://insecure.site/test.jpg',
    resourceType: 'image',
    purpose: 'tickets',
    bytes: 100000,
    format: 'jpg',
    uploaderId: residentUser.id,
    isConfirmed: true,
    confirmedAt: new Date(),
  };
  assert.strictEqual(validateVerifiedAssetInput(httpAsset, sampleUsers, sampleTickets).isValid, false);

  const exampleAsset: VerifiedRealAssetInput = {
    publicId: 'tickets/img_valid_456',
    url: 'https://example.com/fake.jpg',
    resourceType: 'image',
    purpose: 'tickets',
    bytes: 100000,
    format: 'jpg',
    uploaderId: residentUser.id,
    isConfirmed: true,
    confirmedAt: new Date(),
  };
  assert.strictEqual(validateVerifiedAssetInput(exampleAsset, sampleUsers, sampleTickets).isValid, false);
});

runTest('2.4 Từ chối tài sản chưa được xác minh (isConfirmed !== true hoặc confirmedAt không hợp lệ)', () => {
  const unconfirmedAsset = {
    publicId: 'tickets/img_valid_789',
    url: 'https://res.cloudinary.com/realcloud/image/upload/v123/tickets/img789.jpg',
    resourceType: 'image' as const,
    purpose: 'tickets' as const,
    bytes: 200000,
    format: 'jpg',
    uploaderId: residentUser.id,
    isConfirmed: false as any,
    confirmedAt: null as any,
  };

  const validation = validateVerifiedAssetInput(unconfirmedAsset, sampleUsers, sampleTickets);
  assert.strictEqual(validation.isValid, false);
  assert.ok(validation.error?.includes('isConfirmed = true'));
});

// =========================================================================
// 3. KIỂM THỬ GIỚI HẠN DUNG LƯỢNG & ĐỊNH DẠNG TỆP (LIMITS & FORMATS)
// =========================================================================
console.log('--- 3. Kiểm thử Giới hạn Dung lượng & Định dạng Tệp ---');

runTest('3.1 Giới hạn ảnh: tối đa 5MB (5,242,880 bytes) và định dạng [jpg, jpeg, png, webp]', () => {
  assert.strictEqual(MEDIA_POLICY_LIMITS.IMAGE.MAX_BYTES, 5 * 1024 * 1024);
  assert.deepStrictEqual(MEDIA_POLICY_LIMITS.IMAGE.ALLOWED_FORMATS, ['jpg', 'jpeg', 'png', 'webp']);

  // Vượt quá 5MB
  const overSizeImage: VerifiedRealAssetInput = {
    publicId: 'tickets/real_img_large',
    url: 'https://res.cloudinary.com/realcloud/image/upload/v123/tickets/large.jpg',
    resourceType: 'image',
    purpose: 'tickets',
    bytes: 5 * 1024 * 1024 + 1, // 5MB + 1 byte
    format: 'jpg',
    uploaderId: residentUser.id,
    isConfirmed: true,
    confirmedAt: new Date(),
  };
  const valOver = validateVerifiedAssetInput(overSizeImage, sampleUsers, sampleTickets);
  assert.strictEqual(valOver.isValid, false);
  assert.ok(valOver.error?.includes('vượt quá giới hạn 5MB'));

  // Sai định dạng ảnh (ví dụ gif, bmp, exe)
  const invalidFormatImage: VerifiedRealAssetInput = {
    publicId: 'tickets/real_img_gif',
    url: 'https://res.cloudinary.com/realcloud/image/upload/v123/tickets/anim.gif',
    resourceType: 'image',
    purpose: 'tickets',
    bytes: 100000,
    format: 'gif',
    uploaderId: residentUser.id,
    isConfirmed: true,
    confirmedAt: new Date(),
  };
  const valFormat = validateVerifiedAssetInput(invalidFormatImage, sampleUsers, sampleTickets);
  assert.strictEqual(valFormat.isValid, false);
  assert.ok(valFormat.error?.includes('không được hỗ trợ'));
});

runTest('3.2 Giới hạn video: tối đa 20MB (20,971,520 bytes) và định dạng [mp4, mov]', () => {
  assert.strictEqual(MEDIA_POLICY_LIMITS.VIDEO.MAX_BYTES, 20 * 1024 * 1024);
  assert.deepStrictEqual(MEDIA_POLICY_LIMITS.VIDEO.ALLOWED_FORMATS, ['mp4', 'mov']);

  // Vượt quá 20MB
  const overSizeVideo: VerifiedRealAssetInput = {
    publicId: 'tickets/real_vid_large',
    url: 'https://res.cloudinary.com/realcloud/video/upload/v123/tickets/large.mp4',
    resourceType: 'video',
    purpose: 'tickets',
    bytes: 20 * 1024 * 1024 + 1024,
    format: 'mp4',
    uploaderId: residentUser.id,
    isConfirmed: true,
    confirmedAt: new Date(),
  };
  const valOverVid = validateVerifiedAssetInput(overSizeVideo, sampleUsers, sampleTickets);
  assert.strictEqual(valOverVid.isValid, false);
  assert.ok(valOverVid.error?.includes('vượt quá giới hạn 20MB'));

  // Sai định dạng video (ví dụ avi, mkv)
  const invalidFormatVideo: VerifiedRealAssetInput = {
    publicId: 'tickets/real_vid_avi',
    url: 'https://res.cloudinary.com/realcloud/video/upload/v123/tickets/movie.avi',
    resourceType: 'video',
    purpose: 'tickets',
    bytes: 1000000,
    format: 'avi',
    uploaderId: residentUser.id,
    isConfirmed: true,
    confirmedAt: new Date(),
  };
  const valFormatVid = validateVerifiedAssetInput(invalidFormatVideo, sampleUsers, sampleTickets);
  assert.strictEqual(valFormatVid.isValid, false);
  assert.ok(valFormatVid.error?.includes('không được hỗ trợ'));
});

// =========================================================================
// 4. KIỂM THỬ PHÂN QUYỀN VAI TRÒ & KHÓA NGOẠI (RBAC & RELATIONAL)
// =========================================================================
console.log('--- 4. Kiểm thử Phân quyền Vai trò & Toàn vẹn Khóa ngoại ---');

runTest('4.1 Phân quyền vai trò theo từng mục đích (Whitelisted Purposes & RBAC)', () => {
  assert.deepStrictEqual(Array.from(WHITELISTED_MEDIA_PURPOSES), ['tickets', 'materials', 'announcements']);

  // Cư dân (RESIDENT) không được phép upload cho 'materials' hoặc 'announcements'
  const residentMaterialAsset: VerifiedRealAssetInput = {
    publicId: 'materials/res_mat_01',
    url: 'https://res.cloudinary.com/realcloud/image/upload/v123/materials/mat1.jpg',
    resourceType: 'image',
    purpose: 'materials',
    bytes: 200000,
    format: 'jpg',
    uploaderId: residentUser.id,
    isConfirmed: true,
    confirmedAt: new Date(),
  };
  const resMatVal = validateVerifiedAssetInput(residentMaterialAsset, sampleUsers, sampleTickets);
  assert.strictEqual(resMatVal.isValid, false);
  assert.ok(resMatVal.error?.includes('không có quyền tải lên'));

  // Thợ kỹ thuật (TECHNICIAN) được upload 'materials'
  const techMaterialAsset: VerifiedRealAssetInput = {
    publicId: 'materials/tech_mat_01',
    url: 'https://res.cloudinary.com/realcloud/image/upload/v123/materials/mat1.jpg',
    resourceType: 'image',
    purpose: 'materials',
    bytes: 200000,
    format: 'jpg',
    uploaderId: techUser.id,
    ticketId: sampleTicket.id,
    isConfirmed: true,
    confirmedAt: new Date(),
  };
  assert.strictEqual(validateVerifiedAssetInput(techMaterialAsset, sampleUsers, sampleTickets).isValid, true);

  // BQL được upload 'announcements'
  const bqlAnnouncementAsset: VerifiedRealAssetInput = {
    publicId: 'announcements/bql_ann_01',
    url: 'https://res.cloudinary.com/realcloud/image/upload/v123/announcements/ann1.png',
    resourceType: 'image',
    purpose: 'announcements',
    bytes: 350000,
    format: 'png',
    uploaderId: bqlUser.id,
    isConfirmed: true,
    confirmedAt: new Date(),
  };
  assert.strictEqual(validateVerifiedAssetInput(bqlAnnouncementAsset, sampleUsers, sampleTickets).isValid, true);
});

runTest('4.2 Kiểm tra khóa ngoại uploaderId và ticketId không tồn tại bị từ chối', () => {
  const invalidUserAsset: VerifiedRealAssetInput = {
    publicId: 'tickets/valid_id_001',
    url: 'https://res.cloudinary.com/realcloud/image/upload/v123/tickets/pic1.jpg',
    resourceType: 'image',
    purpose: 'tickets',
    bytes: 150000,
    format: 'jpg',
    uploaderId: 999999, // Không tồn tại
    isConfirmed: true,
    confirmedAt: new Date(),
  };
  const valUser = validateVerifiedAssetInput(invalidUserAsset, sampleUsers, sampleTickets);
  assert.strictEqual(valUser.isValid, false);
  assert.ok(valUser.error?.includes('không tồn tại trong danh sách User'));

  const invalidTicketAsset: VerifiedRealAssetInput = {
    publicId: 'tickets/valid_id_002',
    url: 'https://res.cloudinary.com/realcloud/image/upload/v123/tickets/pic2.jpg',
    resourceType: 'image',
    purpose: 'tickets',
    bytes: 150000,
    format: 'jpg',
    uploaderId: residentUser.id,
    ticketId: 888888, // Không tồn tại
    isConfirmed: true,
    confirmedAt: new Date(),
  };
  const valTicket = validateVerifiedAssetInput(invalidTicketAsset, sampleUsers, sampleTickets);
  assert.strictEqual(valTicket.isValid, false);
  assert.ok(valTicket.error?.includes('không tồn tại trong danh sách Ticket'));
});

// =========================================================================
// 5. KIỂM THỬ KHẢ NĂNG TÍCH HỢP TÀI SẢN THẬT & SCHEMA COMPLIANCE
// =========================================================================
console.log('--- 5. Kiểm thử Tích hợp Tài sản Thật & Schema Compliance ---');

runTest('5.1 Kiểm tra cấu trúc bản ghi sinh ra tương thích hoàn toàn 100% Prisma MediaAsset schema', () => {
  const realAssetSample: VerifiedRealAssetInput = {
    publicId: 'tickets/real_leak_pipe_001',
    url: 'https://res.cloudinary.com/mycloud/image/upload/v1700000000/tickets/real_leak_pipe_001.jpg',
    resourceType: 'image',
    purpose: 'tickets',
    bytes: 450000,
    format: 'jpg',
    width: 1920,
    height: 1080,
    duration: null,
    uploaderId: residentUser.id,
    ticketId: sampleTicket.id,
    isConfirmed: true,
    confirmedAt: new Date('2026-10-15T08:30:00.000Z'),
  };

  // Cấu hình maxVerified = 1 phục vụ test cấu trúc khi có asset thật được xác minh
  const generated = generateMediaAssets(sampleUsers, sampleTickets, {
    verifiedAssets: [realAssetSample],
    maxVerified: 1,
  });

  assert.strictEqual(generated.length, 1);
  const item = generated[0];

  assert.strictEqual(item.id, 1);
  assert.strictEqual(item.publicId, 'tickets/real_leak_pipe_001');
  assert.strictEqual(item.url, 'https://res.cloudinary.com/mycloud/image/upload/v1700000000/tickets/real_leak_pipe_001.jpg');
  assert.strictEqual(item.resourceType, 'image');
  assert.strictEqual(item.deliveryType, 'authenticated'); // Tự suy luận từ purpose 'tickets'
  assert.strictEqual(item.purpose, 'tickets');
  assert.strictEqual(item.bytes, 450000);
  assert.strictEqual(item.format, 'jpg');
  assert.strictEqual(item.width, 1920);
  assert.strictEqual(item.height, 1080);
  assert.strictEqual(item.duration, null);
  assert.strictEqual(item.uploaderId, residentUser.id);
  assert.strictEqual(item.ticketId, sampleTicket.id);
  assert.strictEqual(item.isConfirmed, true);
  assert.ok(item.confirmedAt instanceof Date);
  assert.ok(item.createdAt instanceof Date);
  assert.ok(item.updatedAt instanceof Date);
});

runTest('5.2 generateMediaAssets ném lỗi khi số asset vượt quá MAX_VERIFIED (0)', () => {
  const realAssetSample: VerifiedRealAssetInput = {
    publicId: 'tickets/real_leak_pipe_002',
    url: 'https://res.cloudinary.com/mycloud/image/upload/v1700000000/tickets/real_leak_pipe_002.jpg',
    resourceType: 'image',
    purpose: 'tickets',
    bytes: 450000,
    format: 'jpg',
    uploaderId: residentUser.id,
    isConfirmed: true,
    confirmedAt: new Date('2026-10-15T08:30:00.000Z'),
  };

  assert.throws(
    () =>
      generateMediaAssets(sampleUsers, sampleTickets, {
        verifiedAssets: [realAssetSample],
      }),
    /vượt quá giới hạn MAX_VERIFIED/
  );
});

// =========================================================================
// 6. KIỂM THỬ TÁC ĐỘNG TỚI CÁC GENERATOR KHÁC (NO SIDE-EFFECTS)
// =========================================================================
console.log('--- 6. Kiểm thử Tác động Độc lập (Không ảnh hưởng M3-M7) ---');

runTest('6.1 Ticket generator không sinh URL Cloudinary giả mạo', () => {
  for (const t of sampleTickets) {
    if (t.mediaUrl !== null) {
      assert.ok(!t.mediaUrl.includes('res.cloudinary.com'), `Ticket ${t.id} chứa mediaUrl Cloudinary giả: ${t.mediaUrl}`);
    }
    if (t.completedMediaUrl !== null) {
      assert.ok(
        !t.completedMediaUrl.includes('res.cloudinary.com'),
        `Ticket ${t.id} chứa completedMediaUrl Cloudinary giả: ${t.completedMediaUrl}`
      );
    }
  }
});

runTest('6.2 Tính đơn định (Deterministic) của generator qua nhiều lần gọi', () => {
  const run1 = generateMediaAssets(sampleUsers, sampleTickets, { seed: 12345 });
  const run2 = generateMediaAssets(sampleUsers, sampleTickets, { seed: 12345 });
  assert.deepStrictEqual(run1, run2, 'Hai lần gọi cùng seed phải cho kết quả giống hệt nhau');
});

console.log('======================================================');
console.log(`🎉 TOÀN BỘ ${passedTests}/${totalTests} TESTS M8 ĐẠT CHUẨN!`);
console.log('======================================================');
