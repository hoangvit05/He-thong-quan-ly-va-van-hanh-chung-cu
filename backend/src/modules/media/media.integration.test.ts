// =========================================================================
// KIỂM THỬ TÍCH HỢP MEDIA UPLOAD TRÊN POSTGRESQL THẬT (INTEGRATION TESTS)
// Phụ trách: Việt Hoàng — Backend Lead
// Mục tiêu: Xác thực luồng cấp chữ ký, phân quyền theo Ticket và liên kết media
// =========================================================================
import express from 'express';
import { Role, TicketStatus } from '@prisma/client';
import rootRouter from '../../app.module';
import { ResourceTracker } from '../../test/integration-setup';
import { getJwtSecret } from '../../common/middleware/auth';
import jwt from 'jsonwebtoken';
import { v2 as cloudinary } from 'cloudinary';

export interface IntegrationTestResult {
  passed: number;
  failed: number;
}

const rootApp = express();
rootApp.use(express.json());
rootApp.use('/api', rootRouter);

function invokeApi(options: {
  method: 'GET' | 'POST' | 'PUT' | 'DELETE';
  url: string;
  token?: string;
  body?: any;
  query?: Record<string, string>;
}): Promise<{ statusCode: number; body: any }> {
  return new Promise((resolve) => {
    let statusCode = 200;
    let responseBody: any = null;

    let requestPath = options.url;
    let parsedQuery = { ...(options.query || {}) };

    if (requestPath.includes('?')) {
      const parts = requestPath.split('?');
      requestPath = parts[0];
      const searchParams = new URLSearchParams(parts[1]);
      const queryObj: Record<string, string> = {};
      searchParams.forEach((val, key) => {
        queryObj[key] = val;
      });
      parsedQuery = { ...queryObj, ...parsedQuery };
    }

    const headers: Record<string, string> = {};
    if (options.token) {
      headers['authorization'] = `Bearer ${options.token}`;
    }

    const req: any = {
      method: options.method,
      url: options.url,
      originalUrl: options.url,
      path: requestPath,
      headers,
      get(headerName: string) {
        return headers[headerName.toLowerCase()] || headers[headerName];
      },
      header(headerName: string) {
        return headers[headerName.toLowerCase()] || headers[headerName];
      },
      body: options.body || {},
      query: parsedQuery,
      params: {},
    };

    const res: any = {
      statusCode: 200,
      status(code: number) {
        statusCode = code;
        this.statusCode = code;
        return this;
      },
      json(data: any) {
        responseBody = data;
        resolve({ statusCode, body: responseBody });
        return this;
      },
      send(data: any) {
        responseBody = data;
        resolve({ statusCode, body: responseBody });
        return this;
      },
      setHeader() {
        return this;
      },
      getHeader() {
        return undefined;
      },
      end(data?: any) {
        if (data && !responseBody) responseBody = data;
        resolve({ statusCode, body: responseBody });
        return this;
      },
    };

    (rootApp as any).handle(req, res, (err: any) => {
      if (err) {
        resolve({ statusCode: 500, body: { error: err.message } });
      } else {
        resolve({ statusCode: 404, body: { message: 'Not Found' } });
      }
    });
  });
}

export async function runMediaIntegrationTests(
  prisma: any,
  tracker: ResourceTracker
): Promise<IntegrationTestResult> {
  let passed = 0;
  let failed = 0;

  function assertPass(condition: boolean, message: string) {
    if (condition) {
      passed++;
      console.log(`  ✅ [PASS] ${message}`);
    } else {
      failed++;
      console.error(`  ❌ [FAIL] ${message}`);
    }
  }

  console.log('\n============================================================');
  console.log('SUITE 8/8: Media Upload Integration Tests (PostgreSQL 16)');
  console.log('============================================================\n');

  const secret = getJwtSecret();
  function signToken(payload: { id: number; role: Role; username: string; fullName: string; roomId?: number | null }) {
    return jwt.sign(payload, secret, { expiresIn: '1h' });
  }

  // Thiết lập biến môi trường test Cloudinary tạm thời
  const origCloud = process.env.CLOUDINARY_CLOUD_NAME;
  const origKey = process.env.CLOUDINARY_API_KEY;
  const origSec = process.env.CLOUDINARY_API_SECRET;

  process.env.CLOUDINARY_CLOUD_NAME = 'test_apartment_cloud';
  process.env.CLOUDINARY_API_KEY = 'test_api_key_123';
  process.env.CLOUDINARY_API_SECRET = 'test_api_secret_secret_1234567890';

  // Mock Cloudinary Admin API & Uploader cho integration tests
  const origApiResource = cloudinary.api.resource;
  const origUploaderDestroy = cloudinary.uploader.destroy;

  (cloudinary.api as any).resource = async (publicId: string) => {
    return {
      public_id: publicId,
      secure_url: `https://res.cloudinary.com/test_apartment_cloud/image/upload/${publicId}.png`,
      bytes: 1024 * 500, // 500 KB
      format: 'png',
    };
  };
  (cloudinary.uploader as any).destroy = async () => ({ result: 'ok' });

  try {
    // BƯỚC 1: KHỞI TẠO FIXTURES TRÊN POSTGRESQL THẬT
    const testRoom = await prisma.room.create({
      data: {
        roomNumber: `M-${Date.now().toString().slice(-4)}`,
        floor: 12,
        area: 75.5,
      },
    });
    tracker.trackRoom(testRoom.id);

    // Cư dân 1 (gán vào testRoom)
    const resident1 = await prisma.user.create({
      data: {
        username: `res_media_${Date.now()}`,
        password: 'hashed_password_sample',
        fullName: 'Cư dân Media Test',
        role: Role.RESIDENT,
        roomId: testRoom.id,
        isApproved: true,
      },
    });
    tracker.trackUser(resident1.id);

    // Thợ kỹ thuật được phân công
    const techAssigned = await prisma.user.create({
      data: {
        username: `tech_media_${Date.now()}`,
        password: 'hashed_password_sample',
        fullName: 'Thợ Kỹ Thuật Test',
        role: Role.TECHNICIAN,
        isApproved: true,
      },
    });
    tracker.trackUser(techAssigned.id);

    // Thợ kỹ thuật khác (không được phân công)
    const techOther = await prisma.user.create({
      data: {
        username: `tech_other_${Date.now()}`,
        password: 'hashed_password_sample',
        fullName: 'Thợ Khác Test',
        role: Role.TECHNICIAN,
        isApproved: true,
      },
    });
    tracker.trackUser(techOther.id);

    // Phiếu sự cố gắn với cư dân 1 và giao cho techAssigned (IN_PROGRESS)
    const testTicket = await prisma.ticket.create({
      data: {
        title: 'Sự cố vòi nước',
        category: 'Nước',
        description: 'Vòi nước bồn rửa bát bị rò rỉ mạnh',
        roomId: testRoom.id,
        residentId: resident1.id,
        technicianId: techAssigned.id,
        status: TicketStatus.IN_PROGRESS,
      },
    });
    tracker.trackTicket(testTicket.id);

    const tokenResident1 = signToken({
      id: resident1.id,
      role: Role.RESIDENT,
      username: resident1.username,
      fullName: resident1.fullName,
      roomId: testRoom.id,
    });
    const tokenTechAssigned = signToken({
      id: techAssigned.id,
      role: Role.TECHNICIAN,
      username: techAssigned.username,
      fullName: techAssigned.fullName,
    });
    const tokenTechOther = signToken({
      id: techOther.id,
      role: Role.TECHNICIAN,
      username: techOther.username,
      fullName: techOther.fullName,
    });

    // BƯỚC 2: CHẠY CÁC KỊCH BẢN KIỂM THỬ TÍCH HỢP

    // TC-MED-01: Cấp upload intent cho cư dân khi tạo Ticket mới (chưa có ticketId)
    const resSig1 = await invokeApi({
      method: 'POST',
      url: '/api/media/signature',
      token: tokenResident1,
      body: { purpose: 'tickets', resourceType: 'image' },
    });

    assertPass(resSig1.statusCode === 200 && resSig1.body.success === true, 'Cấp upload intent cho cư dân thành công (200 OK)');
    assertPass(typeof resSig1.body.data.signature === 'string', 'Phản hồi chứa chữ ký hợp lệ do Cloudinary SDK tạo');
    assertPass(typeof resSig1.body.data.intentToken === 'string', 'Phản hồi chứa Intent Token để xác thực quyền sở hữu');
    assertPass(resSig1.body.data.apiSecret === undefined, 'BẢO MẬT: Phản hồi tuyệt đối không chứa apiSecret');

    const intentToken1 = resSig1.body.data.intentToken;
    const publicId1 = resSig1.body.data.publicId;

    // TC-MED-02: Từ chối role/purpose sai: Thợ kỹ thuật yêu cầu purpose tickets
    const resSigWrongRole = await invokeApi({
      method: 'POST',
      url: '/api/media/signature',
      token: tokenTechAssigned,
      body: { purpose: 'tickets', resourceType: 'image', ticketId: testTicket.id },
    });

    assertPass(resSigWrongRole.statusCode === 403, 'Chặn thợ kỹ thuật yêu cầu upload purpose tickets (403 Forbidden)');

    // TC-MED-03: Cư dân yêu cầu purpose materials
    const resSigResMaterials = await invokeApi({
      method: 'POST',
      url: '/api/media/signature',
      token: tokenResident1,
      body: { purpose: 'materials', resourceType: 'image', ticketId: testTicket.id },
    });

    assertPass(resSigResMaterials.statusCode === 403, 'Chặn cư dân yêu cầu upload purpose materials (403 Forbidden)');

    // TC-MED-04: Thợ kỹ thuật yêu cầu purpose materials cho Ticket được phân công
    const resSigTech = await invokeApi({
      method: 'POST',
      url: '/api/media/signature',
      token: tokenTechAssigned,
      body: { purpose: 'materials', resourceType: 'image', ticketId: testTicket.id },
    });

    assertPass(resSigTech.statusCode === 200, 'Thợ kỹ thuật được phân công yêu cầu materials thành công (200 OK)');
    assertPass(resSigTech.body.data.folder === `apartment/materials/ticket_${testTicket.id}`, 'Folder vật tư được thiết lập chính xác');

    // TC-MED-05: Thợ kỹ thuật khác (không được giao ticket) yêu cầu materials
    const resSigTechOther = await invokeApi({
      method: 'POST',
      url: '/api/media/signature',
      token: tokenTechOther,
      body: { purpose: 'materials', resourceType: 'image', ticketId: testTicket.id },
    });

    assertPass(resSigTechOther.statusCode === 403, 'Chặn thợ không được giao ticket tải ảnh vật tư (403 Forbidden)');

    // TC-MED-06: Xác nhận asset với intent hợp lệ
    const resConfirm1 = await invokeApi({
      method: 'POST',
      url: '/api/media/confirm',
      token: tokenResident1,
      body: { publicId: publicId1, intentToken: intentToken1, resourceType: 'image' },
    });

    assertPass(resConfirm1.statusCode === 200 && resConfirm1.body.success === true, 'Xác nhận asset với intent hợp lệ thành công (200 OK)');
    assertPass(resConfirm1.body.data.publicId === publicId1, 'Dữ liệu xác nhận khớp đúng publicId');
    assertPass(resConfirm1.body.data.secureUrl.startsWith('https://'), 'Trả về Secure URL hợp lệ');

    const dbAsset1 = await prisma.mediaAsset.findUnique({ where: { publicId: publicId1 } });
    if (dbAsset1) tracker.trackMediaAsset(dbAsset1.id);

    // TC-MED-07: Chặn xác nhận chéo chủ sở hữu (User B dùng token của User A)
    const resCrossConfirm = await invokeApi({
      method: 'POST',
      url: '/api/media/confirm',
      token: tokenTechAssigned, // Thợ cố xác nhận token của cư dân 1
      body: { publicId: publicId1, intentToken: intentToken1, resourceType: 'image' },
    });

    assertPass(resCrossConfirm.statusCode === 403, 'CHỐNG CHIẾM QUYỀN: Chặn xác nhận chéo chủ sở hữu (403 Forbidden)');

    // TC-MED-08: Chặn asset không khớp publicId
    const resMismatchPublicId = await invokeApi({
      method: 'POST',
      url: '/api/media/confirm',
      token: tokenResident1,
      body: { publicId: 'apartment/tickets/different_injected_id', intentToken: intentToken1, resourceType: 'image' },
    });

    assertPass(resMismatchPublicId.statusCode === 400, 'Chặn xác nhận khi publicId không khớp Intent Token (400 Bad Request)');

    // TC-MED-09: Tích hợp Tickets: Cư dân tạo Ticket với mediaUrl sau khi xác nhận
    const resCreateTicketWithMedia = await invokeApi({
      method: 'POST',
      url: '/api/tickets',
      token: tokenResident1,
      body: {
        category: 'Điện',
        description: 'Chập cầu chì phòng khách sau mưa',
        roomId: testRoom.id,
        mediaUrl: resConfirm1.body.data.secureUrl,
      },
    });

    assertPass(resCreateTicketWithMedia.statusCode === 201, 'Cư dân tạo phiếu mới gắn mediaUrl thành công (201 Created)');
    if (resCreateTicketWithMedia.body.data?.id) {
      tracker.trackTicket(resCreateTicketWithMedia.body.data.id);
    }
    assertPass(resCreateTicketWithMedia.body.data.mediaUrl === resConfirm1.body.data.secureUrl, 'Ticket lưu đúng URL ảnh đã xác nhận');

    // Kiểm tra liên kết bền vững trong PostgreSQL
    const linkedAsset1 = await prisma.mediaAsset.findUnique({ where: { publicId: publicId1 } });
    if (linkedAsset1) tracker.trackMediaAsset(linkedAsset1.id);
    assertPass(linkedAsset1?.ticketId === resCreateTicketWithMedia.body.data.id, 'MediaAsset được liên kết bền vững với Ticket vừa tạo trong PostgreSQL');

    // TC-MED-09B: Chặn tái sử dụng cùng một asset cho Ticket mới
    const resReuseTicket = await invokeApi({
      method: 'POST',
      url: '/api/tickets',
      token: tokenResident1,
      body: {
        category: 'Cửa sổ',
        description: 'Kẹt bản lề phòng ngủ',
        roomId: testRoom.id,
        mediaUrl: resConfirm1.body.data.secureUrl,
      },
    });
    assertPass(resReuseTicket.statusCode === 403, 'CHỐNG TÁI SỬ DỤNG: Chặn tái sử dụng asset đã gắn vào Ticket khác (403 Forbidden)');

    // Thợ kỹ thuật xác nhận asset vật tư qua /api/media/confirm
    const resConfirmTech = await invokeApi({
      method: 'POST',
      url: '/api/media/confirm',
      token: tokenTechAssigned,
      body: {
        publicId: resSigTech.body.data.publicId,
        intentToken: resSigTech.body.data.intentToken,
        resourceType: 'image',
      },
    });
    assertPass(resConfirmTech.statusCode === 200, 'Thợ kỹ thuật xác nhận ảnh nghiệm thu thành công qua API Backend (200 OK)');
    const dbAssetTech = await prisma.mediaAsset.findUnique({ where: { publicId: resSigTech.body.data.publicId } });
    if (dbAssetTech) tracker.trackMediaAsset(dbAssetTech.id);

    // TC-MED-10: Thợ kỹ thuật cập nhật trạng thái COMPLETED kèm completedMediaUrl đã xác nhận
    const resCompleteTicket = await invokeApi({
      method: 'PUT',
      url: `/api/tickets/${testTicket.id}/status`,
      token: tokenTechAssigned,
      body: {
        status: TicketStatus.COMPLETED,
        completedMediaUrl: resConfirmTech.body.data.secureUrl,
      },
    });

    assertPass(resCompleteTicket.statusCode === 200, 'Thợ kỹ thuật báo COMPLETED kèm ảnh nghiệm thu thành công (200 OK)');
    assertPass(resCompleteTicket.body.data.status === TicketStatus.COMPLETED, 'Trạng thái Ticket đã chuyển sang COMPLETED');
    assertPass(Boolean(resCompleteTicket.body.data.completedMediaUrl), 'Lưu trữ thành công completedMediaUrl');

    const linkedTechAsset = await prisma.mediaAsset.findUnique({ where: { publicId: resSigTech.body.data.publicId } });
    assertPass(linkedTechAsset?.ticketId === testTicket.id, 'MediaAsset nghiệm thu được liên kết bền vững với Ticket trong PostgreSQL');

    // TC-MED-11: Chặn Cư dân gắn Cloudinary URL chưa qua xác minh confirm vào Ticket
    const resCreateTicketUnconfirmed = await invokeApi({
      method: 'POST',
      url: '/api/tickets',
      token: tokenResident1,
      body: {
        category: 'Nước',
        description: 'Thử nghiệm đính kèm URL chưa confirm',
        roomId: testRoom.id,
        mediaUrl: 'https://res.cloudinary.com/test_apartment_cloud/image/upload/apartment/tickets/unconfirmed_attack.png',
      },
    });
    assertPass(resCreateTicketUnconfirmed.statusCode === 403, 'BẢO MẬT: Chặn tạo Ticket với Cloudinary URL chưa qua confirm (403 Forbidden)');

    // TC-MED-12: Chặn Cư dân gán trộm tài sản của người khác vào Ticket
    const resCreateTicketCrossUser = await invokeApi({
      method: 'POST',
      url: '/api/tickets',
      token: tokenResident1,
      body: {
        category: 'Nước',
        description: 'Cố tình gắn ảnh vật tư của thợ vào phiếu báo hỏng',
        roomId: testRoom.id,
        mediaUrl: resConfirmTech.body.data.secureUrl,
      },
    });
    assertPass(resCreateTicketCrossUser.statusCode === 403, 'CHỐNG GÁN TRỘM: Chặn gắn tài sản của người dùng khác vào Ticket (403 Forbidden)');

    // TC-MED-13: Kiểm thử Cạnh tranh Thực tế (Concurrency & Atomic Claim)
    // Gửi đồng thời hai yêu cầu tạo hai Ticket khác nhau cùng sử dụng 1 MediaAsset chưa gán
    const concurrentUser = await prisma.user.create({
      data: {
        username: `concurrent_res_${Date.now()}`,
        password: 'hashed_password_sample',
        fullName: 'Cư Dân Concurrency Test',
        role: Role.RESIDENT,
        roomId: testRoom.id,
        isApproved: true,
      },
    });
    tracker.trackUser(concurrentUser.id);

    const tokenConcurrentUser = signToken({
      id: concurrentUser.id,
      role: Role.RESIDENT,
      username: concurrentUser.username,
      fullName: concurrentUser.fullName,
      roomId: testRoom.id,
    });

    const timestampEntropy = Date.now();
    const concurrentAsset = await prisma.mediaAsset.create({
      data: {
        publicId: `apartment/tickets/concurrent_asset_${timestampEntropy}`,
        url: `https://res.cloudinary.com/test_apartment_cloud/image/authenticated/apartment/tickets/concurrent_asset_${timestampEntropy}.png`,
        purpose: 'tickets',
        bytes: 102400,
        format: 'png',
        uploaderId: concurrentUser.id,
        ticketId: null, // Chưa được claim
        isConfirmed: true,
        confirmedAt: new Date(),
      },
    });
    tracker.trackMediaAsset(concurrentAsset.id);

    // Gửi đồng thời hai yêu cầu tạo 2 Ticket với category khác nhau để bypass debounce gate
    const [resConcurrent1, resConcurrent2] = await Promise.all([
      invokeApi({
        method: 'POST',
        url: '/api/tickets',
        token: tokenConcurrentUser,
        body: {
          category: 'Điện',
          description: 'Sự cố chập điện phòng ngủ 1 (Concurrent Request 1)',
          roomId: testRoom.id,
          mediaUrl: concurrentAsset.url,
        },
      }),
      invokeApi({
        method: 'POST',
        url: '/api/tickets',
        token: tokenConcurrentUser,
        body: {
          category: 'Nước',
          description: 'Sự cố rò nước bồn rửa (Concurrent Request 2)',
          roomId: testRoom.id,
          mediaUrl: concurrentAsset.url,
        },
      }),
    ]);

    // Track ticket thành công để dọn dẹp
    if (resConcurrent1.body?.data?.id) tracker.trackTicket(resConcurrent1.body.data.id);
    if (resConcurrent2.body?.data?.id) tracker.trackTicket(resConcurrent2.body.data.id);

    const statusCodes = [resConcurrent1.statusCode, resConcurrent2.statusCode].sort();
    assertPass(
      statusCodes[0] === 201 && statusCodes[1] === 409,
      'CONCURRENCY INVARIANT: Đúng 1 request thành công (201) và 1 request thất bại (409 Conflict)'
    );

    // Kiểm tra CSDL: Bắt buộc chỉ có duy nhất 1 Ticket được tạo
    const ticketsInDb = await prisma.ticket.findMany({
      where: {
        residentId: concurrentUser.id,
        mediaUrl: concurrentAsset.url,
      },
    });
    assertPass(ticketsInDb.length === 1, 'CONCURRENCY INVARIANT: Chỉ có duy nhất 1 Ticket được tạo trong PostgreSQL');

    // Kiểm tra quan hệ MediaAsset.ticketId khớp đúng Ticket chiến thắng
    const refreshedConcurrentAsset = await prisma.mediaAsset.findUnique({
      where: { id: concurrentAsset.id },
    });
    assertPass(
      refreshedConcurrentAsset?.ticketId === ticketsInDb[0]?.id,
      'CONCURRENCY INVARIANT: MediaAsset chỉ được liên kết với duy nhất Ticket thành công'
    );
  } catch (err: any) {
    console.error('❌ Ngoại lệ trong Media Integration Tests:', err.message || err);
    failed++;
  } finally {
    // Khôi phục Cloudinary API gốc và biến môi trường
    cloudinary.api.resource = origApiResource;
    cloudinary.uploader.destroy = origUploaderDestroy;

    if (origCloud) process.env.CLOUDINARY_CLOUD_NAME = origCloud;
    else delete process.env.CLOUDINARY_CLOUD_NAME;

    if (origKey) process.env.CLOUDINARY_API_KEY = origKey;
    else delete process.env.CLOUDINARY_API_KEY;

    if (origSec) process.env.CLOUDINARY_API_SECRET = origSec;
    else delete process.env.CLOUDINARY_API_SECRET;
  }

  console.log(`\nMedia Upload Integration Suite Kết quả: ${passed} Passed, ${failed} Failed`);
  return { passed, failed };
}
