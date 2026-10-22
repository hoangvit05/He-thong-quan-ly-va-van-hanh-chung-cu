// =========================================================================
// KIỂM THỬ TOÀN DIỆN CHO PHÂN HỆ MEDIA UPLOAD (CLOUDINARY SIGNED UPLOAD)
// Phụ trách: Việt Hoàng — Backend Lead
// =========================================================================
import assert from 'assert';
import jwt from 'jsonwebtoken';
import { Role, TicketStatus } from '@prisma/client';
import { v2 as cloudinary } from 'cloudinary';
import {
  isCloudinaryConfigured,
  getCloudinaryConfig,
  WHITELISTED_PURPOSES,
  MEDIA_LIMITS,
} from './media.config';
import {
  validateSignatureRequest,
  validateConfirmRequest,
  isValidCloudinaryUrl,
  extractPublicIdFromCloudinaryUrl,
} from './media.validator';
import {
  generateIntentToken,
  verifyIntentToken,
  createUploadSignature,
  confirmUploadedAsset,
  generateSignedAccessUrl,
  verifyTicketMediaOwnership,
  confirmedAssetsStore,
} from './media.service';
import prisma from '../../database/prisma';

let totalAssertions = 0;

function check(condition: boolean, message: string) {
  assert(condition, message);
  totalAssertions++;
  console.log(`  ✅ [PASS] ${message}`);
}

const JWT_SECRET = process.env.JWT_SECRET || 'super-secret-jwt-key';

function generateTestToken(payload: { id: number; role: Role; username: string; fullName: string; roomId?: number | null }): string {
  return jwt.sign(payload, JWT_SECRET, { expiresIn: '1h' });
}

async function runMediaUnitTests() {
  console.log('\n======================================================');
  console.log('🧪 BẮT ĐẦU CHẠY KIỂM THỬ TOÀN DIỆN CHO MEDIA UPLOAD MODULE');
  console.log('======================================================\n');

  // Lưu trữ môi trường gốc
  const origCloudName = process.env.CLOUDINARY_CLOUD_NAME;
  const origApiKey = process.env.CLOUDINARY_API_KEY;
  const origApiSecret = process.env.CLOUDINARY_API_SECRET;
  const origMediaAsset = (prisma as any).mediaAsset;

  // -------------------------------------------------------------------
  // NHÓM 1: CẤU HÌNH CLOUDINARY & GIỚI HẠN TỆP
  // -------------------------------------------------------------------
  console.log('1. Kiểm thử Cấu hình Môi trường & Giới hạn Tệp:');
  {
    // A. Kiểm tra khi thiếu biến môi trường
    delete process.env.CLOUDINARY_CLOUD_NAME;
    delete process.env.CLOUDINARY_API_KEY;
    delete process.env.CLOUDINARY_API_SECRET;

    check(isCloudinaryConfigured() === false, 'Nhận diện chính xác khi thiếu cấu hình Cloudinary');
    check(getCloudinaryConfig() === null, 'getCloudinaryConfig trả về null an toàn khi chưa cấu hình');

    // B. Kiểm tra khi cấu hình placeholder
    process.env.CLOUDINARY_CLOUD_NAME = 'your_cloud_name_here';
    process.env.CLOUDINARY_API_KEY = 'your_api_key_here';
    process.env.CLOUDINARY_API_SECRET = 'your_api_secret_here';

    check(isCloudinaryConfigured() === false, 'Chặn giá trị cấu hình placeholder mặc định');

    // C. Kiểm tra khi cấu hình hợp lệ
    process.env.CLOUDINARY_CLOUD_NAME = 'apartment_cloud_test';
    process.env.CLOUDINARY_API_KEY = '123456789012345';
    process.env.CLOUDINARY_API_SECRET = 'abcdefghijklmnopqrstuvwxyz123456';

    check(isCloudinaryConfigured() === true, 'Xác nhận hợp lệ khi biến môi trường Cloudinary đầy đủ');
    const conf = getCloudinaryConfig();
    check(conf !== null && conf.cloudName === 'apartment_cloud_test', 'Đọc đúng CLOUDINARY_CLOUD_NAME');
    check(conf?.apiKey === '123456789012345', 'Đọc đúng CLOUDINARY_API_KEY');

    // D. Giới hạn dung lượng và định dạng
    check(MEDIA_LIMITS.IMAGE.MAX_BYTES === 5 * 1024 * 1024, 'Giới hạn kích thước ảnh tối đa đúng 5 MB');
    check(MEDIA_LIMITS.VIDEO.MAX_BYTES === 20 * 1024 * 1024, 'Giới hạn kích thước video tối đa đúng 20 MB');
    check(MEDIA_LIMITS.IMAGE.ALLOWED_FORMATS.includes('webp'), 'Định dạng WebP được phép cho ảnh');
    check(MEDIA_LIMITS.VIDEO.ALLOWED_FORMATS.includes('mp4'), 'Định dạng MP4 được phép cho video');
  }

  // -------------------------------------------------------------------
  // NHÓM 2: VALIDATOR DỮ LIỆU ĐẦU VÀO
  // -------------------------------------------------------------------
  console.log('\n2. Kiểm thử Validator Dữ liệu Đầu vào (Signature & Confirm):');
  {
    // A. Signature Request
    const validSig = validateSignatureRequest({ purpose: 'tickets', resourceType: 'image' });
    check(validSig.isValid === true, 'Dữ liệu cấp chữ ký hợp lệ được chấp nhận');
    check(validSig.data?.purpose === 'tickets', 'Trích xuất đúng purpose');

    const invalidPurpose = validateSignatureRequest({ purpose: 'malicious_folder' });
    check(invalidPurpose.isValid === false, 'Từ chối mục đích (purpose) không nằm trong Whitelist');
    check(invalidPurpose.error?.includes('không được chấp nhận') || false, 'Thông báo lỗi từ chối purpose chuẩn');

    const customFolder = validateSignatureRequest({ purpose: 'tickets', folder: 'custom/injected/path' });
    check(customFolder.isValid === false, 'CHỐNG INJECTION: Chặn tuyệt đối khi client tự ý gửi trường folder');

    const invalidResourceType = validateSignatureRequest({ purpose: 'tickets', resourceType: 'executable' });
    check(invalidResourceType.isValid === false, 'Từ chối resourceType không phải image hoặc video');

    const invalidTicketId = validateSignatureRequest({ purpose: 'tickets', ticketId: -5 });
    check(invalidTicketId.isValid === false, 'Từ chối ticketId không phải số nguyên dương');

    // B. Confirm Request
    const validConf = validateConfirmRequest({ publicId: 'apartment/tickets/ticket_1/img_123', intentToken: 'abc.def' });
    check(validConf.isValid === true, 'Dữ liệu xác nhận hợp lệ được chấp nhận');

    const missingPublicId = validateConfirmRequest({ intentToken: 'abc.def' });
    check(missingPublicId.isValid === false, 'Từ chối xác nhận khi thiếu publicId');

    const missingToken = validateConfirmRequest({ publicId: 'img_123' });
    check(missingToken.isValid === false, 'Từ chối xác nhận khi thiếu intentToken');

    const traversalPublicId = validateConfirmRequest({ publicId: '../../etc/passwd', intentToken: 'abc.def' });
    check(traversalPublicId.isValid === false, 'CHỐNG PATH TRAVERSAL: Chặn publicId chứa ký tự điều hướng thư mục');
  }

  // -------------------------------------------------------------------
  // NHÓM 3: TIỆN ÍCH KIỂM TRA CLOUDINARY URL
  // -------------------------------------------------------------------
  console.log('\n3. Kiểm thử Tiện ích Kiểm tra URL Cloudinary & Trích xuất Public ID:');
  {
    const validUrl = 'https://res.cloudinary.com/apartment_cloud_test/image/upload/v1729600000/apartment/tickets/img_sample.png';
    check(isValidCloudinaryUrl(validUrl, 'apartment_cloud_test') === true, 'Nhận diện đúng URL Cloudinary hợp lệ');
    check(isValidCloudinaryUrl(validUrl, 'other_cloud') === false, 'Từ chối URL của cloud_name khác');

    const badProtocol = 'http://res.cloudinary.com/apartment_cloud_test/image/upload/sample.jpg';
    check(isValidCloudinaryUrl(badProtocol) === false, 'Từ chối URL không dùng giao thức bảo mật HTTPS');

    const phishingUrl = 'https://res.cloudinary.com.fake-domain.com/sample.jpg';
    check(isValidCloudinaryUrl(phishingUrl) === false, 'Từ chối URL giả mạo domain Cloudinary');

    const base64Url = 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAE=';
    check(isValidCloudinaryUrl(base64Url) === false, 'Chặn tuyệt đối chuỗi Base64');

    const extractedId = extractPublicIdFromCloudinaryUrl(validUrl);
    check(extractedId === 'apartment/tickets/img_sample', 'Trích xuất chính xác publicId bỏ qua version và extension');
  }

  // -------------------------------------------------------------------
  // NHÓM 4: MẬT MÃ INTENT TOKEN (HMAC-SHA256 & EXPIRATION)
  // -------------------------------------------------------------------
  console.log('\n4. Kiểm thử Upload Intent Token (Toàn vẹn Dữ liệu & Chống Giả mạo):');
  {
    const now = Math.floor(Date.now() / 1000);
    const token = generateIntentToken({
      userId: 42,
      userRole: Role.RESIDENT,
      purpose: 'tickets',
      ticketId: 10,
      publicId: 'tickets_u42_test_1',
      folder: 'apartment/tickets/ticket_10',
      resourceType: 'image',
      deliveryType: 'authenticated',
      allowedFormats: ['jpg', 'png'],
      maxBytes: 5242880,
      timestamp: now,
      exp: now + 900,
    });

    check(typeof token === 'string' && token.includes('.'), 'Tạo Intent Token chuẩn định dạng payload.signature');

    const verified = verifyIntentToken(token);
    check(verified.userId === 42, 'Giải mã chính xác userId từ Intent Token');
    check(verified.publicId === 'tickets_u42_test_1', 'Khớp chính xác publicId');

    // Chống giả mạo chữ ký
    const tamperedToken = token.substring(0, token.length - 4) + 'zzzz';
    let tamperCaught = false;
    try {
      verifyIntentToken(tamperedToken);
    } catch (err: any) {
      tamperCaught = err.message.includes('INVALID_INTENT_SIGNATURE');
    }
    check(tamperCaught === true, 'CHỐNG GIẢ MẠO: Phát hiện và từ chối Intent Token bị chỉnh sửa trái phép');

    // Kiểm tra hết hạn
    const expiredToken = generateIntentToken({
      userId: 42,
      userRole: Role.RESIDENT,
      purpose: 'tickets',
      publicId: 'tickets_expired',
      folder: 'apartment/tickets',
      resourceType: 'image',
      deliveryType: 'authenticated',
      allowedFormats: ['jpg'],
      maxBytes: 1000,
      timestamp: now - 1000,
      exp: now - 100, // Đã hết hạn
    });

    let expiredCaught = false;
    try {
      verifyIntentToken(expiredToken);
    } catch (err: any) {
      expiredCaught = err.message.includes('EXPIRED_INTENT_TOKEN');
    }
    check(expiredCaught === true, 'Từ chối Intent Token đã hết hạn (> 15 phút)');
  }

  // -------------------------------------------------------------------
  // NHÓM 5: RBAC & TẠO CHỮ KÝ TẢI LÊN (POST /api/media/signature)
  // -------------------------------------------------------------------
  console.log('\n5. Kiểm thử RBAC & Phân quyền Mục đích Tải lên (createUploadSignature):');
  {
    // Giả lập mock prisma.ticket.findUnique
    const origTicketFind = prisma.ticket.findUnique;
    (prisma.ticket as any).findUnique = async ({ where }: any) => {
      if (where.id === 1) {
        return {
          id: 1,
          residentId: 101, // Thuộc cư dân 101
          roomId: 1,
          technicianId: 801, // Phân công cho thợ 801
          status: TicketStatus.IN_PROGRESS,
        };
      }
      if (where.id === 2) {
        return {
          id: 2,
          residentId: 202, // Thuộc cư dân 202
          roomId: 2,
          technicianId: null,
          status: TicketStatus.PENDING,
        };
      }
      return null;
    };

    // A. Cư dân yêu cầu purpose tickets cho phiếu của mình -> Thành công
    const resSig = await createUploadSignature(
      { id: 101, role: Role.RESIDENT, roomId: 1 },
      { purpose: 'tickets', resourceType: 'image', ticketId: 1 }
    );

    check(resSig.cloudName === 'apartment_cloud_test', 'Trả về đúng Cloud Name');
    check(resSig.apiKey === '123456789012345', 'Trả về đúng API Key');
    check(typeof resSig.signature === 'string' && resSig.signature.length > 0, 'Sinh chữ ký hợp lệ bằng Cloudinary SDK');
    check(resSig.folder === 'apartment/tickets/ticket_1', 'Máy chủ ép chuẩn thư mục lưu trữ theo ticketId');
    check(resSig.publicId.startsWith('tickets_u101_'), 'Public ID có prefix purpose và userId');
    check((resSig as any).apiSecret === undefined, 'BẢO MẬT TUYỆT ĐỐI: Không bao giờ để lộ API Secret trong response');
    check(typeof resSig.intentToken === 'string', 'Cung cấp Intent Token để xác nhận sau upload');

    // B. Cư dân yêu cầu purpose materials (kê khai vật tư) -> Bị chặn 403
    let residentMaterialsBlocked = false;
    try {
      await createUploadSignature(
        { id: 101, role: Role.RESIDENT, roomId: 1 },
        { purpose: 'materials', resourceType: 'image', ticketId: 1 }
      );
    } catch (err: any) {
      residentMaterialsBlocked = err.message.includes('FORBIDDEN_PURPOSE') || err.message.includes('FORBIDDEN_RESIDENT_MATERIALS');
    }
    check(residentMaterialsBlocked === true, 'RBAC: Cư dân bị chặn yêu cầu tải ảnh kê khai vật tư (materials)');

    // C. Thợ kỹ thuật yêu cầu purpose tickets (báo hỏng) -> Bị chặn 403
    let techTicketsBlocked = false;
    try {
      await createUploadSignature(
        { id: 801, role: Role.TECHNICIAN },
        { purpose: 'tickets', resourceType: 'image', ticketId: 1 }
      );
    } catch (err: any) {
      techTicketsBlocked = err.message.includes('FORBIDDEN_PURPOSE') || err.message.includes('FORBIDDEN_TECH_PURPOSE');
    }
    check(techTicketsBlocked === true, 'RBAC: Thợ kỹ thuật bị chặn yêu cầu tải ảnh báo hỏng (tickets)');

    // D. Thợ kỹ thuật yêu cầu purpose materials cho phiếu được giao (IN_PROGRESS) -> Thành công
    const techSig = await createUploadSignature(
      { id: 801, role: Role.TECHNICIAN },
      { purpose: 'materials', resourceType: 'image', ticketId: 1 }
    );
    check(techSig.folder === 'apartment/materials/ticket_1', 'Folder vật tư được thiết lập chính xác');

    // E. Thợ kỹ thuật yêu cầu materials cho phiếu giao cho thợ khác / chưa gán -> Bị chặn 403
    let techOtherTicketBlocked = false;
    try {
      await createUploadSignature(
        { id: 801, role: Role.TECHNICIAN },
        { purpose: 'materials', resourceType: 'image', ticketId: 2 } // Phiếu 2 chưa gán thợ
      );
    } catch (err: any) {
      techOtherTicketBlocked = err.message.includes('FORBIDDEN_TECH_TICKET');
    }
    check(techOtherTicketBlocked === true, 'BẢO VỆ PHẠM VI XỬ LÝ: Thợ không được tải ảnh vật tư cho phiếu mình không phụ trách');

    // F. Cư dân yêu cầu tải ảnh cho phiếu của cư dân phòng khác -> Bị chặn 403
    let residentOtherTicketBlocked = false;
    try {
      await createUploadSignature(
        { id: 101, role: Role.RESIDENT, roomId: 1 },
        { purpose: 'tickets', resourceType: 'image', ticketId: 2 } // Phiếu 2 của phòng 2
      );
    } catch (err: any) {
      residentOtherTicketBlocked = err.message.includes('FORBIDDEN_TICKET_ACCESS');
    }
    check(residentOtherTicketBlocked === true, 'DATA ISOLATION: Cư dân không thể tải ảnh vào phiếu sự cố của phòng khác');

    // G. Ban Quản Lý yêu cầu announcements (thông báo tòa nhà) -> Thành công
    const bqlSig = await createUploadSignature(
      { id: 900, role: Role.BQL },
      { purpose: 'announcements', resourceType: 'image' }
    );
    check(bqlSig.folder === 'apartment/announcements', 'Folder thông báo chung được cấp đúng');

    prisma.ticket.findUnique = origTicketFind;
  }

  // -------------------------------------------------------------------
  // NHÓM 6: XÁC NHẬN TÀI SẢN ĐÃ TẢI LÊN (POST /api/media/confirm)
  // -------------------------------------------------------------------
  console.log('\n6. Kiểm thử Xác nhận Tài sản & Thu hồi Vi phạm (confirmUploadedAsset):');
  {
    const now = Math.floor(Date.now() / 1000);
    const validIntentToken = generateIntentToken({
      userId: 101,
      userRole: Role.RESIDENT,
      purpose: 'tickets',
      ticketId: 1,
      publicId: 'tickets_u101_sample_asset',
      folder: 'apartment/tickets/ticket_1',
      resourceType: 'image',
      deliveryType: 'authenticated',
      allowedFormats: ['jpg', 'jpeg', 'png', 'webp'],
      maxBytes: 5 * 1024 * 1024,
      timestamp: now,
      exp: now + 900,
    });

    // Mock cloudinary.api.resource & cloudinary.uploader.destroy & prisma.mediaAsset
    let destroyedPublicId: string | null = null;
    const origApiResource = cloudinary.api.resource;
    const origUploaderDestroy = cloudinary.uploader.destroy;

    (prisma as any).mediaAsset = {
      upsert: async (args: any) => ({ id: 1, ...args.create }),
      findFirst: async ({ where }: any) => {
        if (where.url?.includes('tickets_u101_sample')) {
          return { id: 101, uploaderId: 101, purpose: 'tickets', ticketId: 1, isConfirmed: true };
        }
        if (where.url?.includes('ann_sample')) {
          return { id: 102, uploaderId: 101, purpose: 'announcements', isConfirmed: true };
        }
        return null;
      },
    };

    // A. Xác nhận thành công asset hợp lệ
    (cloudinary.api as any).resource = async (publicId: string) => {
      return {
        public_id: publicId,
        secure_url: `https://res.cloudinary.com/apartment_cloud_test/image/upload/${publicId}.png`,
        bytes: 1024 * 1024, // 1 MB
        format: 'png',
        width: 1920,
        height: 1080,
      };
    };

    const confirmed = await confirmUploadedAsset(
      { id: 101, role: Role.RESIDENT },
      { publicId: 'tickets_u101_sample_asset', intentToken: validIntentToken, resourceType: 'image' }
    );

    check(confirmed.publicId === 'tickets_u101_sample_asset', 'Xác nhận đúng publicId');
    check(confirmed.bytes === 1024 * 1024, 'Đọc đúng kích thước thực tế từ Cloudinary Admin API');
    check(confirmed.format === 'png', 'Đọc đúng định dạng thực tế từ Cloudinary');
    check(confirmed.secureUrl.includes('https://'), 'Trả về Secure URL an toàn');

    // B. Chống xác nhận chéo tài sản người khác
    let crossConfirmBlocked = false;
    try {
      await confirmUploadedAsset(
        { id: 999, role: Role.RESIDENT }, // User 999 cố xác nhận token của User 101
        { publicId: 'tickets_u101_sample_asset', intentToken: validIntentToken, resourceType: 'image' }
      );
    } catch (err: any) {
      crossConfirmBlocked = err.message.includes('FORBIDDEN_OWNERSHIP');
    }
    check(crossConfirmBlocked === true, 'CHỐNG CHIẾM QUYỀN: Người dùng khác không thể xác nhận tài sản không thuộc về mình');

    // C. Chống tráo đổi publicId
    let mismatchedPublicIdBlocked = false;
    try {
      await confirmUploadedAsset(
        { id: 101, role: Role.RESIDENT },
        { publicId: 'different_injected_public_id', intentToken: validIntentToken, resourceType: 'image' }
      );
    } catch (err: any) {
      mismatchedPublicIdBlocked = err.message.includes('MISMATCHED_PUBLIC_ID');
    }
    check(mismatchedPublicIdBlocked === true, 'Khóa trần publicId: Chỉ cho phép xác nhận đúng publicId đã cấp phép');

    // D. Tệp vượt quá kích thước cho phép (8 MB > 5 MB) -> Bị hủy và thu hồi
    (cloudinary.api as any).resource = async (publicId: string) => {
      return {
        public_id: publicId,
        secure_url: `https://res.cloudinary.com/test/${publicId}.png`,
        bytes: 8 * 1024 * 1024, // 8 MB (Vượt trần 5 MB)
        format: 'png',
      };
    };
    (cloudinary.uploader as any).destroy = async (publicId: string) => {
      destroyedPublicId = publicId;
      return { result: 'ok' };
    };

    let oversizeBlocked = false;
    try {
      await confirmUploadedAsset(
        { id: 101, role: Role.RESIDENT },
        { publicId: 'tickets_u101_sample_asset', intentToken: validIntentToken, resourceType: 'image' }
      );
    } catch (err: any) {
      oversizeBlocked = err.message.includes('FILE_TOO_LARGE');
    }
    check(oversizeBlocked === true, 'GIỚI HẠN TỆP: Từ chối tài sản vượt quá 5 MB');
    check(destroyedPublicId === 'tickets_u101_sample_asset', 'CLEANUP/RETENTION: Tự động thu hồi và xóa tệp vi phạm khỏi Cloudinary');

    // E. Tệp sai định dạng (ví dụ tệp .exe giả mạo) -> Bị hủy và thu hồi
    destroyedPublicId = null;
    (cloudinary.api as any).resource = async (publicId: string) => {
      return {
        public_id: publicId,
        secure_url: `https://res.cloudinary.com/test/${publicId}.exe`,
        bytes: 500 * 1024,
        format: 'exe', // Định dạng cấm
      };
    };

    let badFormatBlocked = false;
    try {
      await confirmUploadedAsset(
        { id: 101, role: Role.RESIDENT },
        { publicId: 'tickets_u101_sample_asset', intentToken: validIntentToken, resourceType: 'image' }
      );
    } catch (err: any) {
      badFormatBlocked = err.message.includes('INVALID_FORMAT');
    }
    check(badFormatBlocked === true, 'BẢO MẬT ĐỊNH DẠNG: Từ chối định dạng tệp không nằm trong danh sách whitelist');
    check(destroyedPublicId === 'tickets_u101_sample_asset', 'CLEANUP: Tự động xóa tệp sai định dạng khỏi Cloudinary');

    // F. Asset không tồn tại trên Cloudinary (404)
    (cloudinary.api as any).resource = async () => {
      const err: any = new Error('Resource not found');
      err.http_code = 404;
      throw err;
    };

    let notFoundCaught = false;
    try {
      await confirmUploadedAsset(
        { id: 101, role: Role.RESIDENT },
        { publicId: 'tickets_u101_sample_asset', intentToken: validIntentToken, resourceType: 'image' }
      );
    } catch (err: any) {
      notFoundCaught = err.message.includes('ASSET_NOT_FOUND');
    }
    check(notFoundCaught === true, 'Báo lỗi 404 chuẩn khi tệp chưa tải lên hoặc không tồn tại trên Cloudinary');

    // Khôi phục Cloudinary API gốc
    cloudinary.api.resource = origApiResource;
    cloudinary.uploader.destroy = origUploaderDestroy;
  }

  // -------------------------------------------------------------------
  // NHÓM 7: BẢO VỆ QUYỀN RIÊNG TƯ & TẠO URL TRUY CẬP CÓ THỜI HẠN
  // -------------------------------------------------------------------
  console.log('\n7. Kiểm thử Bảo vệ Quyền Riêng tư & Signed Expiring URLs:');
  {
    const accessUrl = generateSignedAccessUrl('apartment/tickets/ticket_1/private_photo', 'image', 3600);
    check(typeof accessUrl === 'string' && accessUrl.length > 0, 'Tạo đường dẫn truy cập có chữ ký có thời hạn thành công');
    check(decodeURIComponent(accessUrl).includes('apartment/tickets/ticket_1/private_photo'), 'URL chứa đúng publicId');
  }

  // -------------------------------------------------------------------
  // NHÓM 7B: KIỂM THỬ XÁC MINH QUYỀN SỞ HỮU MEDIA GẮN VỚI TICKET
  // -------------------------------------------------------------------
  console.log('\n7B. Kiểm thử Xác minh Quyền Sở hữu & Mục đích Media Gắn với Ticket (verifyTicketMediaOwnership):');
  {
    // A. URL rỗng / null -> Cho qua
    const emptyCheck = await verifyTicketMediaOwnership({ mediaUrl: null, userId: 101, purpose: 'tickets' });
    check(emptyCheck.isValid === true, 'URL rỗng/null được chấp nhận (phiếu không kèm ảnh)');

    // B. URL không phải Cloudinary (Mock / Local test) -> Tương thích ngược
    const nonCloudCheck = await verifyTicketMediaOwnership({
      mediaUrl: 'https://example.com/mock-image.png',
      userId: 101,
      purpose: 'tickets',
    });
    check(nonCloudCheck.isValid === true, 'Cho phép URL không phải Cloudinary để bảo toàn tương thích ngược cho unit test');

    // C. URL Cloudinary CHƯA CONFIRM -> Bị từ chối an toàn
    const unconfirmedCheck = await verifyTicketMediaOwnership({
      mediaUrl: 'https://res.cloudinary.com/apartment_cloud_test/image/upload/apartment/tickets/unconfirmed_attack.png',
      userId: 101,
      purpose: 'tickets',
    });
    check(unconfirmedCheck.isValid === false, 'BẢO MẬT: Từ chối tuyệt đối tệp Cloudinary chưa qua bước xác minh confirm');

    // D. Đăng ký tài sản đã confirm hợp lệ
    confirmedAssetsStore.set('apartment/tickets/ticket_1/tickets_u101_sample', {
      publicId: 'apartment/tickets/ticket_1/tickets_u101_sample',
      secureUrl: 'https://res.cloudinary.com/apartment_cloud_test/image/upload/apartment/tickets/ticket_1/tickets_u101_sample.png',
      purpose: 'tickets',
      ticketId: 1,
      bytes: 1024,
      format: 'png',
      resourceType: 'image',
      confirmedAt: new Date().toISOString(),
    });

    const validOwnershipCheck = await verifyTicketMediaOwnership({
      mediaUrl: 'https://res.cloudinary.com/apartment_cloud_test/image/upload/apartment/tickets/ticket_1/tickets_u101_sample.png',
      userId: 101,
      purpose: 'tickets',
      ticketId: 1,
    });
    check(validOwnershipCheck.isValid === true, 'Chấp nhận tệp đính kèm đã xác minh đúng tài khoản và đúng mục đích');

    // E. Đăng ký tài sản announcements -> Cố tình gắn vào ticket -> Bị chặn
    confirmedAssetsStore.set('apartment/announcements/ann_sample', {
      publicId: 'apartment/announcements/ann_sample',
      secureUrl: 'https://res.cloudinary.com/apartment_cloud_test/image/upload/apartment/announcements/ann_sample.png',
      purpose: 'announcements',
      bytes: 2048,
      format: 'png',
      resourceType: 'image',
      confirmedAt: new Date().toISOString(),
    });

    const wrongPurposeCheck = await verifyTicketMediaOwnership({
      mediaUrl: 'https://res.cloudinary.com/apartment_cloud_test/image/upload/apartment/announcements/ann_sample.png',
      userId: 101,
      purpose: 'tickets',
    });
    check(wrongPurposeCheck.isValid === false, 'Từ chối gán tệp sai mục đích (ví dụ gắn ảnh thông báo vào phiếu sự cố)');

    // F. CHỐNG TÁI SỬ DỤNG: Tệp đã gắn vào phiếu sự cố #1 -> Cố tình tạo phiếu mới với tệp này -> Bị chặn
    const reuseCheck = await verifyTicketMediaOwnership({
      mediaUrl: 'https://res.cloudinary.com/apartment_cloud_test/image/upload/apartment/tickets/ticket_1/tickets_u101_sample.png',
      userId: 101,
      purpose: 'tickets',
    });
    check(reuseCheck.isValid === false, 'CHỐNG TÁI SỬ DỤNG: Chặn tái sử dụng tệp đã gắn vào phiếu khác khi tạo phiếu mới');

    // G. CHỐNG GÁN CHÉO PHIẾU: Tệp cấp cho phiếu #1 cố gán vào phiếu #2 -> Bị chặn
    const wrongTicketCheck = await verifyTicketMediaOwnership({
      mediaUrl: 'https://res.cloudinary.com/apartment_cloud_test/image/upload/apartment/tickets/ticket_1/tickets_u101_sample.png',
      userId: 101,
      purpose: 'tickets',
      ticketId: 2,
    });
    check(wrongTicketCheck.isValid === false, 'CHỐNG GÁN CHÉO: Chặn gán tệp của phiếu sự cố #1 vào phiếu sự cố #2');

    // Khôi phục mock prisma.mediaAsset
    (prisma as any).mediaAsset = origMediaAsset;
  }

  // Khôi phục biến môi trường gốc sau khi kết thúc unit tests
  if (origCloudName) process.env.CLOUDINARY_CLOUD_NAME = origCloudName;
  else delete process.env.CLOUDINARY_CLOUD_NAME;

  if (origApiKey) process.env.CLOUDINARY_API_KEY = origApiKey;
  else delete process.env.CLOUDINARY_API_KEY;

  if (origApiSecret) process.env.CLOUDINARY_API_SECRET = origApiSecret;
  else delete process.env.CLOUDINARY_API_SECRET;

  console.log('\n======================================================');
  console.log(`📊 TỔNG KẾT KIỂM THỬ MEDIA UPLOAD (UNIT TESTS): ${totalAssertions} ĐẠT (PASS) | 0 THẤT BẠI (FAIL)`);
  console.log('======================================================\n');
}

runMediaUnitTests().catch((err) => {
  console.error('❌ Thất bại trong kiểm thử Media Module:', err);
  process.exit(1);
});
