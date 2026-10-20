// =========================================================================
// PHÂN HỆ QUẢN LÝ HÓA ĐƠN & VIETQR — INTEGRATION TESTS (POSTGRESQL 16 THẬT)
// Phụ trách: Senior Backend Engineer
// Mục tiêu: Kiểm thử tích hợp thực tế toàn bộ nghiệp vụ hóa đơn, độ chính xác Decimal,
//           ràng buộc unique @@unique([roomId, month]), chống thanh toán vượt mức,
//           sinh mã VietQR và khóa chống Race Condition (SELECT ... FOR UPDATE).
// =========================================================================
import jwt from 'jsonwebtoken';
import { Role, InvoiceStatus, PaymentMethod, Prisma } from '@prisma/client';
import invoicesRouter from './invoices.controller';
import { getJwtSecret } from '../../common/middleware/auth';
import { ResourceTracker } from '../../test/integration-setup';

interface TestResult {
  name: string;
  passed: boolean;
  error?: string;
}

/**
 * Dispatch HTTP request trực tiếp qua Express Router và chuỗi Middleware thực tế (extractUser, requireAuth, requireRoles)
 */
function invokeInvoices(options: {
  method: 'GET' | 'POST' | 'PUT' | 'DELETE';
  url: string;
  token?: string;
  body?: any;
  query?: Record<string, string>;
}): Promise<{ statusCode: number; body: any }> {
  return new Promise((resolve) => {
    let statusCode = 200;
    let responseBody: any = null;

    const headers: Record<string, string> = {};
    if (options.token) {
      headers['authorization'] = `Bearer ${options.token}`;
    }

    const normalizedUrl = options.url ? (options.url.startsWith('/') ? options.url : `/${options.url}`) : '/';

    const req: any = {
      method: options.method,
      url: normalizedUrl,
      originalUrl: `/api/invoices${normalizedUrl === '/' ? '' : normalizedUrl}`,
      headers,
      body: options.body || {},
      query: options.query || {},
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
    };

    (invoicesRouter as any).handle(req, res, (err: any) => {
      if (err) {
        resolve({ statusCode: 500, body: { error: err.message } });
      } else {
        resolve({ statusCode: 404, body: { message: 'Not found' } });
      }
    });
  });
}

/**
 * Tạo token JWT chuẩn với chữ ký HS256 thật cho phiên test
 */
function createAuthToken(user: { id: number; role: Role; username: string; fullName: string; roomId?: number | null }): string {
  return jwt.sign(
    {
      id: user.id,
      role: user.role,
      username: user.username,
      fullName: user.fullName,
      roomId: user.roomId || null,
    },
    getJwtSecret(),
    { expiresIn: '1d', algorithm: 'HS256' }
  );
}

/**
 * Suite kiểm thử tích hợp phân hệ Hóa đơn & VietQR trên PostgreSQL 16 thật
 */
export async function runInvoicesIntegrationTests(
  prisma: any,
  tracker: ResourceTracker
): Promise<{ passed: number; failed: number }> {
  console.log('------------------------------------------------------');
  console.log('🧪 BẮT ĐẦU CHẠY INVOICES INTEGRATION TESTS TRÊN POSTGRESQL THẬT');
  console.log('------------------------------------------------------\n');

  const results: TestResult[] = [];

  function assert(condition: boolean, testName: string, detail?: string): void {
    if (condition) {
      console.log(`  ✅ [PASS] ${testName}`);
      results.push({ name: testName, passed: true });
    } else {
      const msg = detail ? ` -> ${detail}` : '';
      console.error(`  ❌ [FAIL] ${testName}${msg}`);
      results.push({ name: testName, passed: false, error: detail });
    }
  }

  // Khởi tạo RUN_KEY duy nhất cho phiên test chống trùng lặp
  const RUN_KEY = Date.now().toString(36) + Math.random().toString(36).substring(2, 6);

  try {
    // -----------------------------------------------------------------------
    // BƯỚC 0: TẠO DỮ LIỆU FIXTURE CĂN HỘ & NGƯỜI DÙNG (CÓ ĐĂNG KÝ TRACKER)
    // -----------------------------------------------------------------------
    console.log('1. Khởi tạo Fixtures Căn hộ & Người dùng cho phân hệ Invoices:');

    // Căn hộ 1
    const testRoom1 = await prisma.room.create({
      data: {
        roomNumber: `INV_${RUN_KEY}_101`,
        floor: 1,
        area: 75.5,
        status: 'OCCUPIED',
      },
    });
    tracker.trackRoom(testRoom1.id);
    console.log(`  -> Đã tạo Phòng test 1 (ID: ${testRoom1.id}, Số phòng: ${testRoom1.roomNumber})`);

    // Căn hộ 2 (Dùng cho kiểm thử Anti-IDOR)
    const testRoom2 = await prisma.room.create({
      data: {
        roomNumber: `INV_${RUN_KEY}_102`,
        floor: 1,
        area: 60.0,
        status: 'OCCUPIED',
      },
    });
    tracker.trackRoom(testRoom2.id);
    console.log(`  -> Đã tạo Phòng test 2 (ID: ${testRoom2.id}, Số phòng: ${testRoom2.roomNumber})`);

    // Tài khoản Ban Quản Lý (BQL) có quyền lập hóa đơn và cập nhật thanh toán
    const bqlUser = await prisma.user.create({
      data: {
        username: `bql_${RUN_KEY}`,
        password: '$2a$10$N9qo8uLOickgx2ZMRZoMyeIjZAgcfl7p92ldGxad68LJZdL17lhWy',
        fullName: 'Cán Bộ BQL Test',
        email: `bql_${RUN_KEY}@building.test`,
        role: Role.BQL,
        isApproved: true,
      },
    });
    tracker.trackUser(bqlUser.id);
    const bqlToken = createAuthToken(bqlUser);
    console.log(`  -> Đã tạo User BQL (ID: ${bqlUser.id}, Username: ${bqlUser.username})`);

    // Cư dân phòng 1
    const residentUser1 = await prisma.user.create({
      data: {
        username: `res1_${RUN_KEY}`,
        password: '$2a$10$N9qo8uLOickgx2ZMRZoMyeIjZAgcfl7p92ldGxad68LJZdL17lhWy',
        fullName: 'Cư Dân Phòng 101',
        email: `res1_${RUN_KEY}@building.test`,
        role: Role.RESIDENT,
        roomId: testRoom1.id,
        isApproved: true,
      },
    });
    tracker.trackUser(residentUser1.id);
    const resident1Token = createAuthToken(residentUser1);
    console.log(`  -> Đã tạo Cư dân phòng 1 (ID: ${residentUser1.id}, Username: ${residentUser1.username})`);

    // Cư dân phòng 2 (Căn hộ khác)
    const residentUser2 = await prisma.user.create({
      data: {
        username: `res2_${RUN_KEY}`,
        password: '$2a$10$N9qo8uLOickgx2ZMRZoMyeIjZAgcfl7p92ldGxad68LJZdL17lhWy',
        fullName: 'Cư Dân Phòng 102',
        email: `res2_${RUN_KEY}@building.test`,
        role: Role.RESIDENT,
        roomId: testRoom2.id,
        isApproved: true,
      },
    });
    tracker.trackUser(residentUser2.id);
    const resident2Token = createAuthToken(residentUser2);
    console.log(`  -> Đã tạo Cư dân phòng 2 (ID: ${residentUser2.id}, Username: ${residentUser2.username})\n`);

    // -----------------------------------------------------------------------
    // INV-INT-01: TẠO HÓA ĐƠN & ĐỘ CHÍNH XÁC DECIMAL(12, 2)
    // -----------------------------------------------------------------------
    console.log('2. Kiểm thử Lập hóa đơn & Độ chính xác Decimal (INV-INT-01):');

    const createInvoiceRes = await invokeInvoices({
      method: 'POST',
      url: '/',
      token: bqlToken,
      body: {
        roomId: testRoom1.id,
        month: '2026-10',
        managementFee: '150000.50',
        parkingFee: '80000.25',
        waterFee: '45000.00',
        otherFee: '25000.25',
        dueDate: '2026-10-25T00:00:00.000Z',
      },
    });

    assert(createInvoiceRes.statusCode === 201, 'INV-INT-01: BQL tạo hóa đơn thành công (HTTP 201 Created)', JSON.stringify(createInvoiceRes.body));
    assert(Boolean(createInvoiceRes.body?.data?.id), 'INV-INT-01: Phản hồi trả về ID hóa đơn mới');

    const createdInvoiceId = createInvoiceRes.body?.data?.id;
    if (createdInvoiceId) {
      tracker.trackInvoice(createdInvoiceId);
    }

    // Truy vấn trực tiếp PostgreSQL catalog để xác thực kiểu dữ liệu Decimal(12, 2)
    const dbInvoice = createdInvoiceId
      ? await prisma.invoice.findUnique({
          where: { id: createdInvoiceId },
        })
      : null;

    assert(Boolean(dbInvoice), 'INV-INT-01: Tìm thấy bản ghi Invoice trong PostgreSQL thật');
    assert(
      dbInvoice?.managementFee instanceof Prisma.Decimal && dbInvoice.managementFee.toFixed(2) === '150000.50',
      'INV-INT-01: Phí quản lý lưu đúng kiểu Decimal với 2 chữ số thập phân (150000.50)'
    );
    assert(
      dbInvoice?.parkingFee instanceof Prisma.Decimal && dbInvoice.parkingFee.toFixed(2) === '80000.25',
      'INV-INT-01: Phí gửi xe lưu đúng kiểu Decimal (80000.25)'
    );
    assert(
      dbInvoice?.waterFee instanceof Prisma.Decimal && dbInvoice.waterFee.toFixed(2) === '45000.00',
      'INV-INT-01: Tiền nước lưu đúng kiểu Decimal (45000.00)'
    );
    assert(
      dbInvoice?.otherFee instanceof Prisma.Decimal && dbInvoice.otherFee.toFixed(2) === '25000.25',
      'INV-INT-01: Phí khác lưu đúng kiểu Decimal (25000.25)'
    );
    // 150000.50 + 80000.25 + 45000.00 + 25000.25 = 300001.00
    assert(
      dbInvoice?.totalAmount instanceof Prisma.Decimal && dbInvoice.totalAmount.toFixed(2) === '300001.00',
      'INV-INT-01: Tổng tiền totalAmount chốt snapshot chính xác tuyệt đối không bị sai số làm tròn (300001.00)'
    );
    assert(
      dbInvoice?.paidAmount instanceof Prisma.Decimal && dbInvoice.paidAmount.toFixed(2) === '0.00',
      'INV-INT-01: Số tiền đã thanh toán khởi tạo mặc định là 0.00'
    );
    assert(dbInvoice?.status === InvoiceStatus.UNPAID, 'INV-INT-01: Trạng thái khởi tạo mặc định là UNPAID');

    // -----------------------------------------------------------------------
    // INV-INT-02: RÀNG BUỘC DUY NHẤT HÓA ĐƠN THEO PHÒNG VÀ THÁNG (UNIQUE CONSTRAINT)
    // -----------------------------------------------------------------------
    console.log('\n3. Kiểm thử Ràng buộc Unique @@unique([roomId, month]) (INV-INT-02):');

    // Kiểm tra 1: Tạo trùng lặp qua HTTP Router
    const duplicateHttpRes = await invokeInvoices({
      method: 'POST',
      url: '/',
      token: bqlToken,
      body: {
        roomId: testRoom1.id,
        month: '2026-10', // Trùng phòng và tháng đã có
        managementFee: '200000',
      },
    });

    assert(duplicateHttpRes.statusCode === 409, 'INV-INT-02: Router từ chối tạo trùng lặp với HTTP 409 Conflict');
    assert(
      duplicateHttpRes.body?.message?.includes('đã được lập hóa đơn cho tháng 2026-10') ||
        duplicateHttpRes.body?.message?.includes('chống trùng lặp'),
      'INV-INT-02: Thông báo lỗi trùng lặp hóa đơn rõ ràng theo nghiệp vụ'
    );

    // Kiểm tra 2: Cố tình ghi đè trực tiếp qua Prisma Client xuống PostgreSQL
    let p2002Caught = false;
    let p2002Code = '';
    try {
      await prisma.invoice.create({
        data: {
          roomId: testRoom1.id,
          month: '2026-10',
          totalAmount: new Prisma.Decimal('500000.00'),
          status: InvoiceStatus.UNPAID,
        },
      });
    } catch (err: any) {
      if (err instanceof Prisma.PrismaClientKnownRequestError) {
        p2002Caught = true;
        p2002Code = err.code;
      }
    }
    assert(
      p2002Caught && p2002Code === 'P2002',
      'INV-INT-02: PostgreSQL engine ném lỗi P2002 (Unique constraint failed trên cặp [roomId, month])'
    );

    // -----------------------------------------------------------------------
    // INV-INT-03: THANH TOÁN MỘT PHẦN (PARTIALLY_PAID) & GHI NHẬN PAYMENT
    // -----------------------------------------------------------------------
    console.log('\n4. Kiểm thử Thanh toán một phần & Ghi nhận Payment (INV-INT-03):');

    // Tạo hóa đơn mới riêng biệt cho luồng thanh toán: 500,000.00 VND
    const paymentInvoice = await prisma.invoice.create({
      data: {
        roomId: testRoom1.id,
        month: '2026-11',
        managementFee: new Prisma.Decimal('500000.00'),
        totalAmount: new Prisma.Decimal('500000.00'),
        paidAmount: new Prisma.Decimal('0.00'),
        status: InvoiceStatus.UNPAID,
      },
    });
    tracker.trackInvoice(paymentInvoice.id);

    // BQL cập nhật thanh toán đợt 1: 200,000.00 VND qua VietQR
    const partialPayRes = await invokeInvoices({
      method: 'PUT',
      url: `/${paymentInvoice.id}/status`,
      token: bqlToken,
      body: {
        paidAmount: '200000.00',
        paymentMethod: PaymentMethod.VIETQR,
        transactionCode: 'TX_INT_PARTIAL_01',
        note: 'Cư dân quét mã VietQR đóng đợt 1',
      },
    });

    assert(partialPayRes.statusCode === 200, 'INV-INT-03: Ghi nhận thanh toán đợt 1 thành công (HTTP 200)');
    assert(
      partialPayRes.body?.data?.status === InvoiceStatus.PARTIALLY_PAID,
      'INV-INT-03: Trạng thái hóa đơn tự động chuyển thành PARTIALLY_PAID'
    );

    // Đọc PostgreSQL xác minh liên kết hóa đơn và bản ghi thanh toán (Payment)
    const dbInvoiceAfterPartial = await prisma.invoice.findUnique({
      where: { id: paymentInvoice.id },
      include: { payments: true },
    });

    assert(
      dbInvoiceAfterPartial?.paidAmount.toFixed(2) === '200000.00',
      'INV-INT-03: Cột paidAmount trong PostgreSQL được cập nhật chính xác 200000.00 VND'
    );
    assert(dbInvoiceAfterPartial?.payments.length === 1, 'INV-INT-03: Sinh đúng 1 bản ghi Payment trong cơ sở dữ liệu');

    const firstPayment = dbInvoiceAfterPartial?.payments[0];
    if (firstPayment) {
      tracker.trackPayment(firstPayment.id);
      assert(
        firstPayment.amount.toFixed(2) === '200000.00',
        'INV-INT-03: Số tiền trong bản ghi Payment lưu đúng 200000.00 VND'
      );
      assert(
        firstPayment.paymentMethod === PaymentMethod.VIETQR,
        'INV-INT-03: Phương thức thanh toán lưu đúng VIETQR'
      );
      assert(
        firstPayment.transactionCode === 'TX_INT_PARTIAL_01',
        'INV-INT-03: Mã giao dịch ngân hàng khớp chính xác'
      );
    }

    // -----------------------------------------------------------------------
    // INV-INT-04: THANH TOÁN TOÀN PHẦN (CHUYỂN SANG TRẠNG THÁI PAID)
    // -----------------------------------------------------------------------
    console.log('\n5. Kiểm thử Thanh toán toàn phần (INV-INT-04):');

    // Nộp tiếp đợt 2: 300,000.00 VND bằng Chuyển khoản thông thường
    const fullPayRes = await invokeInvoices({
      method: 'PUT',
      url: `/${paymentInvoice.id}/status`,
      token: bqlToken,
      body: {
        paidAmount: '300000.00',
        paymentMethod: PaymentMethod.BANK_TRANSFER,
        transactionCode: 'TX_INT_FULL_02',
        note: 'Thanh toán đợt 2 hoàn tất 100%',
      },
    });

    assert(fullPayRes.statusCode === 200, 'INV-INT-04: Ghi nhận thanh toán đợt 2 thành công (HTTP 200)');
    assert(fullPayRes.body?.data?.status === InvoiceStatus.PAID, 'INV-INT-04: Hóa đơn tự động chuyển sang trạng thái PAID');

    const dbInvoiceAfterFull = await prisma.invoice.findUnique({
      where: { id: paymentInvoice.id },
      include: { payments: true },
    });

    assert(
      dbInvoiceAfterFull?.paidAmount.toFixed(2) === '500000.00',
      'INV-INT-04: Lũy kế paidAmount trong PostgreSQL đạt đúng 500000.00 VND'
    );
    assert(
      dbInvoiceAfterFull?.payments.length === 2,
      'INV-INT-04: Tổng cộng 2 giao dịch Payment được liên kết với hóa đơn này'
    );

    const secondPayment = dbInvoiceAfterFull?.payments.find((p: any) => p.id !== firstPayment?.id);
    if (secondPayment) {
      tracker.trackPayment(secondPayment.id);
      assert(
        secondPayment.amount.toFixed(2) === '300000.00',
        'INV-INT-04: Giao dịch thứ 2 lưu đúng số tiền 300000.00 VND'
      );
    }

    // -----------------------------------------------------------------------
    // INV-INT-05: TỪ CHỐI THANH TOÁN VƯỢT MỨC (OVERPAYMENT PREVENTION)
    // -----------------------------------------------------------------------
    console.log('\n6. Kiểm thử Chặn thanh toán vượt mức & Rollback Transaction (INV-INT-05):');

    // Trường hợp 1: Hóa đơn đã PAID (100%), cố tình nộp thêm tiền
    const overpayOnPaidRes = await invokeInvoices({
      method: 'PUT',
      url: `/${paymentInvoice.id}/status`,
      token: bqlToken,
      body: {
        paidAmount: '50000.00',
        paymentMethod: PaymentMethod.CASH,
      },
    });

    assert(overpayOnPaidRes.statusCode === 400, 'INV-INT-05: Từ chối nộp thêm tiền khi hóa đơn đã trả đủ 100% (HTTP 400)');
    assert(
      overpayOnPaidRes.body?.message?.includes('đã được thanh toán đầy đủ 100%'),
      'INV-INT-05: Thông báo từ chối rõ ràng: Hóa đơn đã thanh toán đầy đủ 100%'
    );

    // Trường hợp 2: Hóa đơn còn nợ 50,000 VND nhưng nộp 100,000 VND
    const invoiceOverRemaining = await prisma.invoice.create({
      data: {
        roomId: testRoom1.id,
        month: '2026-12',
        managementFee: new Prisma.Decimal('100000.00'),
        totalAmount: new Prisma.Decimal('100000.00'),
        paidAmount: new Prisma.Decimal('50000.00'), // Còn nợ 50,000.00
        status: InvoiceStatus.PARTIALLY_PAID,
      },
    });
    tracker.trackInvoice(invoiceOverRemaining.id);

    const overRemainingRes = await invokeInvoices({
      method: 'PUT',
      url: `/${invoiceOverRemaining.id}/status`,
      token: bqlToken,
      body: {
        paidAmount: '80000.00', // Vượt mức còn nợ (80,000 > 50,000)
      },
    });

    assert(overRemainingRes.statusCode === 400, 'INV-INT-05: Từ chối thanh toán khi số tiền vượt quá số dư còn lại (HTTP 400)');
    assert(
      overRemainingRes.body?.message?.includes('vượt quá số tiền còn lại cần nộp'),
      'INV-INT-05: Thông báo lỗi chỉ rõ số tiền thanh toán vượt quá số tiền còn nộp'
    );

    // Đọc lại PostgreSQL kiểm chứng tính Nguyên tử (Atomicity): Dữ liệu không bị thay đổi
    const dbInvoiceAfterOverpay = await prisma.invoice.findUnique({
      where: { id: invoiceOverRemaining.id },
      include: { payments: true },
    });

    assert(
      dbInvoiceAfterOverpay?.paidAmount.toFixed(2) === '50000.00',
      'INV-INT-05: Cột paidAmount giữ nguyên 50000.00 VND (Transaction rollback an toàn)'
    );
    assert(
      dbInvoiceAfterOverpay?.payments.length === 0,
      'INV-INT-05: Không có bản ghi Payment ma nào được tạo khi request bị từ chối'
    );

    // -----------------------------------------------------------------------
    // INV-INT-06: SINH MÃ VIETQR ĐỘNG & BẢO VỆ CHỐNG IDOR (ANTI-IDOR)
    // -----------------------------------------------------------------------
    console.log('\n7. Kiểm thử Sinh mã VietQR & Bảo vệ Room Isolation (INV-INT-06):');

    // 1. Cư dân phòng 1 xem mã VietQR hóa đơn còn nợ của phòng mình -> Thành công
    const resident1QrRes = await invokeInvoices({
      method: 'GET',
      url: `/${invoiceOverRemaining.id}/vietqr`,
      token: resident1Token,
    });

    assert(resident1QrRes.statusCode === 200, 'INV-INT-06: Cư dân xem mã VietQR phòng mình thành công (HTTP 200)');
    assert(resident1QrRes.body?.data?.isFullyPaid === false, 'INV-INT-06: Cờ isFullyPaid trả về false');
    assert(
      typeof resident1QrRes.body?.data?.vietQrUrl === 'string' &&
        resident1QrRes.body?.data?.vietQrUrl.startsWith('https://img.vietqr.io/image/'),
      'INV-INT-06: URL VietQR được sinh chuẩn xác từ chuẩn quốc gia NAPAS 24/7'
    );
    assert(
      new Prisma.Decimal(resident1QrRes.body?.data?.remainingAmount).toFixed(2) === '50000.00',
      'INV-INT-06: Số tiền VietQR tính đúng bằng số dư nợ Decimal (50000.00 VND)'
    );

    // 2. Cư dân phòng 2 xem trộm mã VietQR hóa đơn phòng 1 -> Bị chặn với HTTP 404 (Anti-IDOR)
    const resident2SpyRes = await invokeInvoices({
      method: 'GET',
      url: `/${invoiceOverRemaining.id}/vietqr`,
      token: resident2Token,
    });

    assert(
      resident2SpyRes.statusCode === 404,
      'INV-INT-06: Cư dân phòng khác bị chặn với HTTP 404 Not Found (Bảo vệ chống IDOR & Enumeration)'
    );

    // 3. Xem mã VietQR cho hóa đơn đã thanh toán 100% -> Không sinh mã VietQR
    const fullyPaidQrRes = await invokeInvoices({
      method: 'GET',
      url: `/${paymentInvoice.id}/vietqr`,
      token: resident1Token,
    });

    assert(fullyPaidQrRes.statusCode === 200, 'INV-INT-06: Tra cứu hóa đơn đã thanh toán thành công (HTTP 200)');
    assert(fullyPaidQrRes.body?.data?.isFullyPaid === true, 'INV-INT-06: Đánh dấu isFullyPaid = true');
    assert(fullyPaidQrRes.body?.data?.vietQrUrl === null, 'INV-INT-06: Không sinh mã VietQR khi hóa đơn đã trả hết (vietQrUrl: null)');

    // -----------------------------------------------------------------------
    // INV-INT-07: CONCURRENCY TEST THANH TOÁN ĐỒNG THỜI (ROW-LEVEL LOCK SELECT FOR UPDATE)
    // -----------------------------------------------------------------------
    console.log('\n8. Kiểm thử Thanh toán Đồng thời & Khóa Bi quan (INV-INT-07 Concurrency):');

    // Thiết lập kịch bản đúng yêu cầu:
    // Tổng tiền: 500,000 VND
    // Đã thanh toán sẵn: 300,000 VND
    // Số dư còn lại: 200,000 VND
    const concInvoice = await prisma.invoice.create({
      data: {
        roomId: testRoom1.id,
        month: '2027-01',
        managementFee: new Prisma.Decimal('500000.00'),
        totalAmount: new Prisma.Decimal('500000.00'),
        paidAmount: new Prisma.Decimal('300000.00'),
        status: InvoiceStatus.PARTIALLY_PAID,
      },
    });
    tracker.trackInvoice(concInvoice.id);

    // Tạo bản ghi Payment ban đầu 300,000 VND
    const initialConcPayment = await prisma.payment.create({
      data: {
        invoiceId: concInvoice.id,
        amount: new Prisma.Decimal('300000.00'),
        paymentMethod: PaymentMethod.BANK_TRANSFER,
        transactionCode: `TX_CONC_INIT_${RUN_KEY}`,
        note: 'Thanh toan ban dau 300k',
      },
    });
    tracker.trackPayment(initialConcPayment.id);

    console.log(`  -> Đã thiết lập Hóa đơn Concurrency (ID: ${concInvoice.id}): Tổng 500k, Đã trả 300k, Còn nợ 200k.`);
    console.log('  -> Phát đồng thời 2 Request thanh toán, mỗi request đòi nộp 150,000 VND qua Promise.all...');

    // Gửi 2 request thanh toán đồng thời (Race Condition scenario):
    // Cả 2 request đều yêu cầu nộp 150,000 VND.
    // Nếu không có khóa SELECT ... FOR UPDATE: Cả 2 cùng đọc currentPaid=300k, cùng chấp nhận -> Tổng tiền thành 600k (LỖI OVERPAYMENT)
    // hoặc cả 2 cùng ghi 450k làm mất 1 giao dịch (LỖI LOST UPDATE).
    // Có SELECT ... FOR UPDATE trên PostgreSQL thật:
    // Request 1 lấy khóa trước: 300k + 150k = 450k <= 500k -> Thành công (HTTP 200).
    // Request 2 lấy khóa sau: Đọc dữ liệu mới 450k -> Còn nợ 50k. Đòi nộp 150k > 50k -> Bị từ chối (HTTP 400).
    const [resA, resB] = await Promise.all([
      invokeInvoices({
        method: 'PUT',
        url: `/${concInvoice.id}/status`,
        token: bqlToken,
        body: {
          paidAmount: '150000.00',
          paymentMethod: PaymentMethod.VIETQR,
          transactionCode: `TX_CONC_A_${RUN_KEY}`,
          note: 'Giao dịch đồng thời A',
        },
      }),
      invokeInvoices({
        method: 'PUT',
        url: `/${concInvoice.id}/status`,
        token: bqlToken,
        body: {
          paidAmount: '150000.00',
          paymentMethod: PaymentMethod.VIETQR,
          transactionCode: `TX_CONC_B_${RUN_KEY}`,
          note: 'Giao dịch đồng thời B',
        },
      }),
    ]);

    const statusCodes = [resA.statusCode, resB.statusCode].sort((a, b) => a - b);

    assert(
      statusCodes[0] === 200 && statusCodes[1] === 400,
      `INV-INT-07: Chính xác 1 request thành công (HTTP 200) và 1 request bị từ chối (HTTP 400) [Thực tế: ${resA.statusCode}, ${resB.statusCode}]`
    );

    // Đọc trạng thái cuối cùng trên cơ sở dữ liệu PostgreSQL thật
    const finalConcInvoice = await prisma.invoice.findUnique({
      where: { id: concInvoice.id },
      include: { payments: true },
    });

    // 1. Bất biến: paidAmount cuối cùng phải chính xác là 450,000.00 VND
    assert(
      finalConcInvoice?.paidAmount.toFixed(2) === '450000.00',
      `INV-INT-07: Bất biến CSDL: paidAmount chính xác là 450000.00 VND (Thực tế: ${finalConcInvoice?.paidAmount.toFixed(2)})`
    );

    // 2. Bất biến: Tổng thanh toán không vượt quá totalAmount (500,000 VND)
    assert(
      finalConcInvoice?.paidAmount.lessThanOrEqualTo(finalConcInvoice.totalAmount),
      'INV-INT-07: Bất biến CSDL: Tổng tiền đã thanh toán tuyệt đối không vượt quá totalAmount (Chống Overpayment)'
    );

    // 3. Bất biến: Trạng thái hóa đơn là PARTIALLY_PAID
    assert(
      finalConcInvoice?.status === InvoiceStatus.PARTIALLY_PAID,
      'INV-INT-07: Trạng thái hóa đơn duy trì nhất quán: PARTIALLY_PAID'
    );

    // 4. Bất biến: Chính xác 2 bản ghi Payment trong DB (1 ban đầu + 1 từ request thành công)
    assert(
      finalConcInvoice?.payments.length === 2,
      `INV-INT-07: Bất biến CSDL: Chính xác 2 bản ghi Payment (1 ban đầu + 1 mới) [Thực tế: ${finalConcInvoice?.payments.length}]`
    );

    // Đăng ký tracking cho bản ghi Payment mới được tạo ra
    const newlyCreatedPayment = finalConcInvoice?.payments.find((p: any) => p.id !== initialConcPayment.id);
    if (newlyCreatedPayment) {
      tracker.trackPayment(newlyCreatedPayment.id);
      assert(
        newlyCreatedPayment.amount.toFixed(2) === '150000.00',
        'INV-INT-07: Bản ghi Payment được lưu khớp đúng số tiền 150000.00 VND của request thành công'
      );
    }

    // 5. Bất biến: Tổng tiền các bản ghi Payment khớp chính xác với paidAmount trên Invoice
    const totalPaymentsSum = finalConcInvoice?.payments.reduce(
      (sum: Prisma.Decimal, p: any) => sum.plus(new Prisma.Decimal(p.amount)),
      new Prisma.Decimal(0)
    );
    assert(
      totalPaymentsSum?.toFixed(2) === finalConcInvoice?.paidAmount.toFixed(2),
      'INV-INT-07: Bất biến Toàn vẹn: Tổng các Payment trong CSDL khớp 100% với Invoice.paidAmount'
    );
  } finally {
    // Không cleanup ở đây; cleanup được Runner quản lý tập trung trong khối finally của tiến trình
  }

  const passed = results.filter((r) => r.passed).length;
  const failed = results.filter((r) => !r.passed).length;

  console.log('\n------------------------------------------------------');
  console.log(`📊 KẾT QUẢ INVOICES INTEGRATION: ${passed} ĐẠT (PASS) | ${failed} THẤT BẠI (FAIL)`);
  console.log('------------------------------------------------------\n');

  return { passed, failed };
}
