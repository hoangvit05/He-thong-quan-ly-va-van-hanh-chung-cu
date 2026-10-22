// =========================================================================
// KIỂM THỬ KHÓI TRỰC TIẾP VỚI CLOUDINARY CDN THẬT (LIVE SMOKE TESTS)
// Phụ trách: Senior Backend Engineer / Test Infrastructure Reviewer
// Mục tiêu: Cô lập các bài kiểm thử gửi request thật tới Cloudinary CDN,
//           bảo đảm tự dọn dẹp tài nguyên và tuyệt đối không lộ credentials.
// =========================================================================
import assert from 'assert';
import 'dotenv/config';
import { Role } from '@prisma/client';
import { v2 as cloudinary } from 'cloudinary';
import { isCloudinaryConfigured, getCloudinaryConfig } from './media.config';
import { createUploadSignature } from './media.service';

let totalAssertions = 0;

function check(condition: boolean, message: string) {
  assert(condition, message);
  totalAssertions++;
  console.log(`  ✅ [PASS] ${message}`);
}

async function runCloudinaryLiveSmokeTest() {
  console.log('\n======================================================');
  console.log('🌐 BẮT ĐẦU CHẠY KIỂM THỬ TRỰC TIẾP CLOUDINARY (LIVE SMOKE TESTS)');
  console.log('======================================================\n');

  // 1. Kiểm tra cấu hình môi trường trước khi gửi bất kỳ request nào
  if (!isCloudinaryConfigured()) {
    console.log('  ⚠️  [STATUS] Cloudinary Live Smoke Test: BỎ QUA (Chưa cấu hình credentials thật hoặc đang dùng placeholder)');
    console.log('      Vui lòng thiết lập CLOUDINARY_CLOUD_NAME, CLOUDINARY_API_KEY, CLOUDINARY_API_SECRET hợp lệ trong .env để chạy live test.');
    process.exit(0);
  }

  const conf = getCloudinaryConfig()!;
  cloudinary.config({
    cloud_name: conf.cloudName,
    api_key: conf.apiKey,
    api_secret: conf.apiSecret,
    secure: true,
  });

  console.log('  ℹ️  [STATUS] Cấu hình hợp lệ. Đang khởi tạo kết nối thực tế tới Cloudinary CDN...');

  let uploadedPublicId: string | null = null;
  const timestamp = Date.now();
  const livePublicId = `test_smoke_asset_${timestamp}`;

  try {
    // 2. Tạo chữ ký upload thực tế từ Cloudinary SDK
    const sigData = await createUploadSignature(
      { id: 99, role: Role.ADMIN },
      { purpose: 'announcements', resourceType: 'image' }
    );
    check(
      typeof sigData.signature === 'string' && sigData.signature.length > 0,
      '[LIVE] Cấp chữ ký upload thành công từ Cloudinary SDK'
    );

    // 3. Upload asset thử nghiệm 1x1 PNG không chứa dữ liệu cá nhân
    const testBase64Png =
      'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==';

    const uploadRes = await cloudinary.uploader.upload(testBase64Png, {
      folder: 'apartment/test',
      public_id: livePublicId,
      overwrite: true,
      resource_type: 'image',
    });

    uploadedPublicId = uploadRes.public_id;

    check(
      uploadRes && uploadRes.public_id.includes(livePublicId),
      '[LIVE] Upload thực tế asset thử nghiệm lên Cloudinary CDN thành công'
    );
    check(uploadRes.format === 'png', '[LIVE] Định dạng asset thực tế là PNG');
    check(uploadRes.bytes > 0, `[LIVE] Dung lượng asset thực tế: ${uploadRes.bytes} bytes`);

    // 4. Xác minh metadata qua Cloudinary Admin API
    const adminRes = await cloudinary.api.resource(uploadedPublicId, { resource_type: 'image' });
    check(
      adminRes && adminRes.public_id === uploadedPublicId,
      '[LIVE] Xác minh metadata thành công qua Cloudinary Admin API'
    );
    check(
      adminRes.secure_url && adminRes.secure_url.startsWith('https://res.cloudinary.com'),
      '[LIVE] URL trả về là HTTPS Cloudinary CDN an toàn'
    );
    check(adminRes.type === 'upload', '[LIVE] Delivery type của announcements đúng chuẩn public upload');
  } finally {
    // 5. Luôn luôn dọn dẹp asset thử nghiệm trong finally (kể cả khi test thất bại)
    if (uploadedPublicId) {
      try {
        const destroyRes = await cloudinary.uploader.destroy(uploadedPublicId, {
          resource_type: 'image',
          invalidate: true,
        });
        check(destroyRes.result === 'ok', '[LIVE] Dọn dẹp (destroy) asset thử nghiệm khỏi Cloudinary CDN hoàn tất (result: ok)');
      } catch (err: any) {
        console.error('  ❌ [ERROR] Lỗi dọn dẹp asset thử nghiệm:', err.message || err);
      }
    }
  }

  console.log('\n======================================================');
  console.log(`📊 TỔNG KẾT LIVE TESTS: ${totalAssertions} ĐẠT (PASS) | 0 THẤT BẠI (FAIL)`);
  console.log('======================================================\n');
}

runCloudinaryLiveSmokeTest().catch((err) => {
  console.error('❌ Thất bại trong kiểm thử Cloudinary Live:', err.message || err);
  process.exit(1);
});
