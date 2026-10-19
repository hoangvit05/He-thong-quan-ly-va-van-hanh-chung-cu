// =========================================================================
// KIỂM THỬ ĐƠN VỊ & BẢO ĐẢM TÍNH TOÀN VẸN MODULE HÓA ĐƠN & VIETQR
// Phụ trách: Hiếu (Bảo vệ tính toàn vẹn tài chính, RBAC, Room Isolation, Anti-IDOR, VietQR)
// Chạy bằng: npx ts-node src/modules/invoices/invoices.test.ts
// =========================================================================
import { Prisma, Role, InvoiceStatus, PaymentMethod } from '@prisma/client';
import {
  isValidMonthFormat,
  normalizeMonth,
  parseSafeDecimal,
  validateCreateInvoiceInput,
  validatePaymentUpdateInput,
  MAX_SAFE_FEE_DECIMAL,
} from './invoices.validator';
import { generateVietQRUrl } from '../../common/utils/vietqr';
import invoicesRouter from './invoices.controller';
import prisma from '../../database/prisma';

let passCount = 0;
let failCount = 0;

function assert(condition: boolean, testName: string, detail?: string) {
  if (condition) {
    console.log(`  ✅ [PASS] ${testName}`);
    passCount++;
  } else {
    console.error(`  ❌ [FAIL] ${testName}${detail ? ` -> ${detail}` : ''}`);
    failCount++;
  }
}

/**
 * Helper thực thi yêu cầu HTTP trực tiếp qua Express Router và toàn bộ Middleware pipeline
 */
function invokeInvoicesRouter(options: {
  method: 'GET' | 'POST' | 'PUT' | 'DELETE';
  url: string;
  user?: any;
  headers?: Record<string, string>;
  body?: any;
  query?: Record<string, string>;
  params?: Record<string, string>;
}): Promise<{ statusCode: number; body: any }> {
  return new Promise((resolve) => {
    let statusCode = 200;
    let responseBody: any = null;

    const req: any = {
      method: options.method,
      url: options.url,
      originalUrl: `/api/invoices${options.url}`,
      headers: options.headers || {},
      user: options.user,
      body: options.body || {},
      query: options.query || {},
      params: options.params || {},
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

console.log('\n======================================================');
console.log('🧪 BẮT ĐẦU CHẠY KIỂM THỬ TOÀN DIỆN CHO INVOICES & VIETQR');
console.log('======================================================\n');

async function runAllTests() {
  // -------------------------------------------------------------------------
  // 1. KIỂM THỬ ĐỊNH DẠNG THÁNG (MONTH FORMAT INTEGRITY & NORMALIZATION)
  // -------------------------------------------------------------------------
  console.log('1. Kiểm thử Định dạng Tháng (isValidMonthFormat & normalizeMonth):');

  assert(isValidMonthFormat('2026-10'), 'Chấp nhận định dạng chuẩn ISO YYYY-MM: 2026-10');
  assert(isValidMonthFormat('2026-01'), 'Chấp nhận định dạng chuẩn ISO YYYY-MM: 2026-01');
  assert(isValidMonthFormat('2026-12'), 'Chấp nhận định dạng chuẩn ISO YYYY-MM: 2026-12');
  assert(isValidMonthFormat('10/2026'), 'Chấp nhận định dạng MM/YYYY: 10/2026');
  assert(isValidMonthFormat('05/2026'), 'Chấp nhận định dạng MM/YYYY: 05/2026');

  assert(!isValidMonthFormat('2026-2'), 'Từ chối tháng thiếu số 0 dẫn đầu: 2026-2');
  assert(!isValidMonthFormat('2026-13'), 'Từ chối tháng vượt quá 12: 2026-13');
  assert(!isValidMonthFormat('2026-00'), 'Từ chối tháng bằng 0: 2026-00');
  assert(!isValidMonthFormat('2026-99'), 'Từ chối tháng không tưởng: 2026-99');
  assert(!isValidMonthFormat('invalid-month'), 'Từ chối chuỗi văn bản không phải tháng');
  assert(!isValidMonthFormat(''), 'Từ chối chuỗi rỗng');

  assert(normalizeMonth('2026-10') === '2026-10', 'normalizeMonth giữ nguyên chuẩn ISO 2026-10');
  assert(normalizeMonth('10/2026') === '2026-10', 'normalizeMonth chuyển đổi 10/2026 sang chuẩn ISO 2026-10');

  let monthErrorCaught = false;
  try {
    normalizeMonth('2026-13');
  } catch {
    monthErrorCaught = true;
  }
  assert(monthErrorCaught, 'normalizeMonth ném lỗi từ chối khi gặp tháng không hợp lệ (2026-13)');

  // -------------------------------------------------------------------------
  // 2. KIỂM THỬ TIỀN TỆ DECIMAL & CHỐNG TRÀN CỘT DECIMAL(12, 2)
  // -------------------------------------------------------------------------
  console.log('\n2. Kiểm thử Tiền tệ Decimal & Chống Tràn Cột (parseSafeDecimal):');

  const validFee = parseSafeDecimal('150000.5', 'Phí quản lý');
  assert(validFee.equals(new Prisma.Decimal('150000.50')), 'Chuyển đổi đúng số tiền sang Decimal với 2 chữ số thập phân');

  const zeroFee = parseSafeDecimal(0, 'Phí gửi xe');
  assert(zeroFee.isZero(), 'Chấp nhận số tiền 0');

  const defaultFee = parseSafeDecimal(undefined, 'Phí khác', '0');
  assert(defaultFee.isZero(), 'Giá trị undefined tự động nhận giá trị mặc định 0');

  let negativeCaught = false;
  try {
    parseSafeDecimal('-50000', 'Tiền nước');
  } catch (err: any) {
    if (err.message.includes('không được âm')) negativeCaught = true;
  }
  assert(negativeCaught, 'Chặn TUYỆT ĐỐI số tiền âm');

  let nanCaught = false;
  try {
    parseSafeDecimal('abc_not_a_number', 'Phí quản lý');
  } catch {
    nanCaught = true;
  }
  assert(nanCaught, 'Chặn giá trị không phải số (NaN)');

  let overflowCaught = false;
  try {
    parseSafeDecimal('10000000000.00', 'Phí quản lý'); // 10 tỷ VND > MAX_SAFE_FEE_DECIMAL
  } catch (err: any) {
    if (err.message.includes('vượt quá giới hạn')) overflowCaught = true;
  }
  assert(overflowCaught, 'Chặn số tiền vượt ngưỡng tối đa (999,999,999.99 VND) để chống tràn cột DECIMAL(12, 2)');

  // -------------------------------------------------------------------------
  // 3. KIỂM THỬ TẠO BIỂU PHÍ & SNAPSHOT TỔNG TIỀN (INVOICE CREATION VALIDATOR)
  // -------------------------------------------------------------------------
  console.log('\n3. Kiểm thử Tạo Biểu phí & Snapshot Tổng tiền (validateCreateInvoiceInput):');

  const validCreateInput = {
    roomId: 101,
    month: '2026-10',
    managementFee: '500000',
    parkingFee: '120000',
    waterFee: '85000.5',
    otherFee: '20000',
  };
  const createVal = validateCreateInvoiceInput(validCreateInput);
  assert(createVal.isValid && createVal.parsed !== undefined, 'Dữ liệu lập hóa đơn hợp lệ được phê duyệt');

  const expectedTotal = new Prisma.Decimal('500000')
    .plus(new Prisma.Decimal('120000'))
    .plus(new Prisma.Decimal('85000.50'))
    .plus(new Prisma.Decimal('20000'));

  assert(
    Boolean(createVal.parsed?.totalAmount.equals(expectedTotal)),
    'Chốt Snapshot tổng tiền chính xác tuyệt đối bằng phép tính Decimal: 725,000.50 VND'
  );

  const missingRoomVal = validateCreateInvoiceInput({ month: '2026-10' });
  assert(!missingRoomVal.isValid && missingRoomVal.errors.some(e => e.includes('roomId')), 'Chặn lập hóa đơn thiếu roomId');

  const invalidMonthVal = validateCreateInvoiceInput({ roomId: 101, month: '2026-99' });
  assert(!invalidMonthVal.isValid && invalidMonthVal.errors.some(e => e.includes('tháng')), 'Chặn lập hóa đơn với tháng sai');

  const invalidDueDateVal = validateCreateInvoiceInput({ roomId: 101, month: '2026-10', dueDate: 'invalid-date' });
  assert(!invalidDueDateVal.isValid && invalidDueDateVal.errors.some(e => e.includes('dueDate')), 'Chặn dueDate sai định dạng ngày');

  // -------------------------------------------------------------------------
  // 4. KIỂM THỬ VALIDATOR CẬP NHẬT THANH TOÁN (PAYMENT UPDATE VALIDATOR)
  // -------------------------------------------------------------------------
  console.log('\n4. Kiểm thử Dữ liệu Cập nhật Thanh toán (validatePaymentUpdateInput):');

  const validPayUpdate = validatePaymentUpdateInput({
    status: 'PAID',
    paymentMethod: 'VIETQR',
    paidAmount: '500000',
    transactionCode: 'FT261019123456',
    note: 'Cư dân quét mã VietQR thành công',
  });
  assert(validPayUpdate.isValid && validPayUpdate.parsed?.status === InvoiceStatus.PAID, 'Chấp nhận dữ liệu cập nhật thanh toán hợp lệ');

  const emptyPayloadVal = validatePaymentUpdateInput({});
  assert(
    !emptyPayloadVal.isValid && emptyPayloadVal.errors.some(e => e.includes('ít nhất')),
    'Chặn payload rỗng (yêu cầu ít nhất status hoặc paidAmount)'
  );

  const invalidStatusVal = validatePaymentUpdateInput({ status: 'INVALID_STATUS' });
  assert(!invalidStatusVal.isValid && invalidStatusVal.errors.some(e => e.includes('trạng thái')), 'Chặn trạng thái hóa đơn lạ không có trong Enum');

  const invalidMethodVal = validatePaymentUpdateInput({ status: 'PAID', paymentMethod: 'BITCOIN' });
  assert(!invalidMethodVal.isValid && invalidMethodVal.errors.some(e => e.includes('Phương thức')), 'Chặn phương thức thanh toán lạ');

  const zeroPaidVal = validatePaymentUpdateInput({ paidAmount: 0 });
  assert(!zeroPaidVal.isValid && zeroPaidVal.errors.some(e => e.includes('lớn hơn 0')), 'Chặn paidAmount bằng 0');

  const base64NoteVal = validatePaymentUpdateInput({ status: 'PAID', note: 'data:image/png;base64,iVBORw0KGgo...' });
  assert(!base64NoteVal.isValid && base64NoteVal.errors.some(e => e.includes('Base64')), 'Chặn mã Base64 trong ghi chú thanh toán');

  const longCodeVal = validatePaymentUpdateInput({ status: 'PAID', transactionCode: 'A'.repeat(101) });
  assert(!longCodeVal.isValid && longCodeVal.errors.some(e => e.includes('100 ký tự')), 'Chặn mã giao dịch vượt quá 100 ký tự');

  // -------------------------------------------------------------------------
  // 5. KIỂM THỬ EXPRESS ROUTER & MIDDLEWARE INTEGRATION (AUTHENTICATION & RBAC)
  // -------------------------------------------------------------------------
  console.log('\n5. Kiểm thử Tích hợp Express Router - Xác thực & RBAC Thực tế:');

  // 5.1 Từ chối yêu cầu không có token (401 Unauthorized) trên TOÀN BỘ endpoint
  const unauthGet = await invokeInvoicesRouter({ method: 'GET', url: '/' });
  assert(unauthGet.statusCode === 401, 'Router từ chối GET / không có token (401 Unauthorized)');

  const unauthPost = await invokeInvoicesRouter({ method: 'POST', url: '/' });
  assert(unauthPost.statusCode === 401, 'Router từ chối POST / không có token (401 Unauthorized)');

  const unauthMyInvoice = await invokeInvoicesRouter({ method: 'GET', url: '/my-invoice' });
  assert(unauthMyInvoice.statusCode === 401, 'Router từ chối GET /my-invoice không có token (401 Unauthorized)');

  const unauthVietQr = await invokeInvoicesRouter({ method: 'GET', url: '/1/vietqr' });
  assert(unauthVietQr.statusCode === 401, 'Router từ chối GET /:id/vietqr không có token (401 Unauthorized)');

  const unauthPutStatus = await invokeInvoicesRouter({ method: 'PUT', url: '/1/status' });
  assert(unauthPutStatus.statusCode === 401, 'Router từ chối PUT /:id/status không có token (401 Unauthorized)');

  // 5.2 Phân quyền Thợ kỹ thuật: Bị cấm truy cập toàn bộ quản lý tài chính/hóa đơn (403 Forbidden)
  const techUser = { id: 20, role: Role.TECHNICIAN };

  const techGet = await invokeInvoicesRouter({ method: 'GET', url: '/', user: techUser });
  assert(techGet.statusCode === 403, 'Router chặn Thợ kỹ thuật truy cập danh sách hóa đơn GET / (403 Forbidden)');

  const techPost = await invokeInvoicesRouter({ method: 'POST', url: '/', user: techUser });
  assert(techPost.statusCode === 403, 'Router chặn Thợ kỹ thuật lập hóa đơn POST / (403 Forbidden)');

  const techMy = await invokeInvoicesRouter({ method: 'GET', url: '/my-invoice', user: techUser });
  assert(techMy.statusCode === 403, 'Router chặn Thợ kỹ thuật xem GET /my-invoice (403 Forbidden)');

  const techQr = await invokeInvoicesRouter({ method: 'GET', url: '/1/vietqr', user: techUser });
  assert(techQr.statusCode === 403, 'Router chặn Thợ kỹ thuật sinh mã VietQR GET /:id/vietqr (403 Forbidden)');

  const techPut = await invokeInvoicesRouter({ method: 'PUT', url: '/1/status', user: techUser });
  assert(techPut.statusCode === 403, 'Router chặn Thợ kỹ thuật cập nhật trạng thái thanh toán PUT /:id/status (403 Forbidden)');

  // 5.3 Phân quyền Cư dân: Bị cấm tạo hóa đơn và cấm cập nhật trạng thái thanh toán (403 Forbidden)
  const residentUser = { id: 10, role: Role.RESIDENT, roomId: 101 };

  const residentPost = await invokeInvoicesRouter({ method: 'POST', url: '/', user: residentUser, body: validCreateInput });
  assert(residentPost.statusCode === 403, 'Router chặn Cư dân lập hóa đơn POST / (403 Forbidden)');

  const residentPut = await invokeInvoicesRouter({ method: 'PUT', url: '/1/status', user: residentUser, body: { status: 'PAID' } });
  assert(residentPut.statusCode === 403, 'Router chặn Cư dân tự ý xác nhận thanh toán PUT /:id/status (403 Forbidden)');

  // -------------------------------------------------------------------------
  // 6. KIỂM THỬ CÔ LẬP CĂN HỘ & CHỐNG IDOR TRÊN EXPRESS ROUTER
  // -------------------------------------------------------------------------
  console.log('\n6. Kiểm thử Cô lập Căn hộ & Chống IDOR (Express Router Integration):');

  // Stub Prisma findMany và count để kiểm tra điều kiện truy vấn thực tế
  let capturedFindManyWhere: any = null;
  const originalFindMany = prisma.invoice.findMany;
  const originalCount = prisma.invoice.count;
  const originalFindUnique = prisma.invoice.findUnique;

  (prisma.invoice as any).count = async () => 1;
  (prisma.invoice as any).findMany = async (args: any) => {
    capturedFindManyWhere = args?.where;
    return [{ id: 1, roomId: 101, month: '2026-10', totalAmount: '500000', paidAmount: '0', status: 'UNPAID', room: { roomNumber: '101' }, payments: [] }];
  };

  // 6.1 Cư dân gọi GET /: query ?roomId=999 bị phớt lờ, luôn khóa chặt theo token roomId
  await invokeInvoicesRouter({
    method: 'GET',
    url: '/',
    user: residentUser,
    query: { roomId: '999' }, // Kẻ xấu cố xem phòng 999
  });
  assert(
    capturedFindManyWhere?.roomId === 101,
    'GET /: Cư dân gửi query ?roomId=999 bị router phớt lờ, ép chặt theo token roomId=101 của mình'
  );

  // 6.2 Cư dân chưa được gán phòng gọi GET / -> trả về danh sách rỗng an toàn
  const unassignedResident = { id: 11, role: Role.RESIDENT, roomId: null };
  const unassignedGet = await invokeInvoicesRouter({
    method: 'GET',
    url: '/',
    user: unassignedResident,
  });
  assert(
    unassignedGet.statusCode === 200 && Array.isArray(unassignedGet.body?.data) && unassignedGet.body.data.length === 0,
    'GET /: Cư dân chưa gán căn hộ nhận danh sách rỗng [] an toàn mà không lỗi máy chủ'
  );

  // 6.3 BQL gọi GET / có thể lọc theo roomId bất kỳ
  const bqlUser = { id: 2, role: Role.BQL };
  await invokeInvoicesRouter({
    method: 'GET',
    url: '/',
    user: bqlUser,
    query: { roomId: '202' },
  });
  assert(capturedFindManyWhere?.roomId === 202, 'GET /: BQL có toàn quyền lọc theo roomId bất kỳ');

  // 6.4 GET /my-invoice: Cư dân gửi ?roomId=999 vẫn bị ép về token roomId
  await invokeInvoicesRouter({
    method: 'GET',
    url: '/my-invoice',
    user: residentUser,
    query: { roomId: '999' },
  });
  assert(
    capturedFindManyWhere?.roomId === 101,
    'GET /my-invoice: Chống IDOR - Cư dân gửi query ?roomId=999 bị ép về đúng token roomId=101'
  );

  // 6.5 GET /my-invoice: Cư dân chưa được gán phòng bị từ chối 400 Bad Request
  const unassignedMyInvoice = await invokeInvoicesRouter({
    method: 'GET',
    url: '/my-invoice',
    user: unassignedResident,
  });
  assert(
    unassignedMyInvoice.statusCode === 400,
    'GET /my-invoice: Cư dân chưa gán phòng bị trả về 400 Bad Request kèm thông báo rõ ràng'
  );

  // 6.6 GET /:id/vietqr Anti-Enumeration 404:
  // Cư dân phòng 101 yêu cầu VietQR của hóa đơn thuộc phòng 202 -> 404 Not Found (chống rò rỉ ID)
  (prisma.invoice as any).findUnique = async (args: any) => {
    if (args?.where?.id === 999) return null; // Hóa đơn không tồn tại
    if (args?.where?.id === 200) {
      return { id: 200, roomId: 202, month: '2026-10', totalAmount: '1200000', paidAmount: '0', status: 'UNPAID', room: { roomNumber: '202' } };
    }
    if (args?.where?.id === 100) {
      return { id: 100, roomId: 101, month: '2026-10', totalAmount: '500000', paidAmount: '0', status: 'UNPAID', room: { roomNumber: '101' } };
    }
    return null;
  };

  const idorQrRes = await invokeInvoicesRouter({
    method: 'GET',
    url: '/200/vietqr',
    user: residentUser, // phòng 101
    params: { id: '200' },
  });
  assert(
    idorQrRes.statusCode === 404,
    'GET /:id/vietqr: Cư dân phòng 101 yêu cầu QR của phòng 202 bị trả 404 Not Found (Anti-Enumeration)'
  );

  const nonExistentQrRes = await invokeInvoicesRouter({
    method: 'GET',
    url: '/999/vietqr',
    user: residentUser,
    params: { id: '999' },
  });
  assert(
    nonExistentQrRes.statusCode === 404 && nonExistentQrRes.body.message === idorQrRes.body.message,
    'GET /:id/vietqr: Thông báo lỗi giữa hóa đơn không tồn tại và hóa đơn phòng khác hoàn toàn đồng nhất (chống enumeration)'
  );

  const ownQrRes = await invokeInvoicesRouter({
    method: 'GET',
    url: '/100/vietqr',
    user: residentUser, // phòng 101
    params: { id: '100' },
  });
  assert(
    ownQrRes.statusCode === 200 && Boolean(ownQrRes.body?.data?.vietQrUrl),
    'GET /:id/vietqr: Cư dân truy cập QR của đúng phòng mình thành công (200 OK)'
  );

  // -------------------------------------------------------------------------
  // 7. KIỂM THỬ AN TOÀN VIETQR & TÍNH TOÀN VẸN GIAO DỊCH TÀI CHÍNH
  // -------------------------------------------------------------------------
  console.log('\n7. Kiểm thử An toàn VietQR & Tính toàn vẹn Giao dịch Tài chính:');

  // 7.1 Cấu trúc VietQR động chuẩn quốc gia NAPAS 24/7
  const vietQrUrl = generateVietQRUrl({
    amount: 500000,
    description: 'HOA DON PHONG 101 T2026-10',
  });
  assert(vietQrUrl.startsWith('https://img.vietqr.io/image/'), 'Link sinh từ máy chủ VietQR chuẩn quốc gia');
  assert(vietQrUrl.includes('amount=500000'), 'Số tiền trong VietQR khớp chính xác số tiền cần nộp');
  assert(vietQrUrl.includes('addInfo=HOA%20DON%20PHONG%20101%20T2026-10'), 'Nội dung chuyển khoản được URL-encode an toàn');

  // 7.2 Hóa đơn đã thanh toán 100% không sinh link VietQR
  (prisma.invoice as any).findUnique = async () => ({
    id: 100,
    roomId: 101,
    month: '2026-10',
    totalAmount: '500000',
    paidAmount: '500000',
    status: InvoiceStatus.PAID,
    room: { roomNumber: '101' },
  });

  const paidQrRes = await invokeInvoicesRouter({
    method: 'GET',
    url: '/100/vietqr',
    user: residentUser,
    params: { id: '100' },
  });
  assert(
    paidQrRes.statusCode === 200 && paidQrRes.body?.data?.isFullyPaid === true && paidQrRes.body?.data?.vietQrUrl === null,
    'Hóa đơn đã thanh toán 100% trả về isFullyPaid: true và vietQrUrl: null'
  );

  // 7.3 Kiểm thử BQL cập nhật thanh toán - Chống overpayment và kiểm soát state transitions
  const originalTx = prisma.$transaction;

  // Giả lập transaction
  let mockInvoiceInDb: any = {
    id: 100,
    roomId: 101,
    month: '2026-10',
    totalAmount: new Prisma.Decimal('500000'),
    paidAmount: new Prisma.Decimal('300000'), // Còn lại 200,000 VND
    status: InvoiceStatus.PARTIALLY_PAID,
    room: { roomNumber: '101' },
    payments: [],
  };

  (prisma as any).$transaction = async (fn: any) => {
    const mockTx = {
      $executeRawUnsafe: async () => {},
      $queryRaw: async () => [{ id: 100 }],
      invoice: {
        findUnique: async () => mockInvoiceInDb,
        update: async (args: any) => {
          mockInvoiceInDb = { ...mockInvoiceInDb, ...args.data };
          return mockInvoiceInDb;
        },
      },
      payment: {
        create: async (args: any) => ({ id: 1, ...args.data }),
      },
    };
    return fn(mockTx);
  };

  // 7.3.1 Nộp vượt quá số tiền còn lại (Overpayment Prevention)
  const overpayRes = await invokeInvoicesRouter({
    method: 'PUT',
    url: '/100/status',
    user: bqlUser,
    params: { id: '100' },
    body: { paidAmount: '250000' }, // Còn thiếu 200k nhưng cố nộp 250k
  });
  assert(
    overpayRes.statusCode === 400 && overpayRes.body.message.includes('vượt quá số tiền còn lại'),
    'Chống Overpayment: Từ chối thanh toán 250k khi số tiền còn lại chỉ là 200k (400 Bad Request)'
  );

  // 7.3.2 Cố tình chuyển trạng thái về UNPAID khi đã có tiền nộp
  const invalidUnpaidRes = await invokeInvoicesRouter({
    method: 'PUT',
    url: '/100/status',
    user: bqlUser,
    params: { id: '100' },
    body: { status: 'UNPAID' },
  });
  assert(
    invalidUnpaidRes.statusCode === 400 && invalidUnpaidRes.body.message.includes('Không thể chuyển trạng thái về UNPAID'),
    'Chặn Invalid Transition: Từ chối chuyển về UNPAID khi hóa đơn đã có khoản nộp lũy kế 300k'
  );

  // 7.3.3 Nộp đúng số tiền còn lại (200,000 VND) -> chuyển thành PAID
  const settleRes = await invokeInvoicesRouter({
    method: 'PUT',
    url: '/100/status',
    user: bqlUser,
    params: { id: '100' },
    body: { paidAmount: '200000', paymentMethod: 'VIETQR' },
  });
  assert(
    settleRes.statusCode === 200 && mockInvoiceInDb.status === InvoiceStatus.PAID,
    'Nộp đúng 200k còn lại -> hóa đơn được tự động chuyển thành PAID và chốt đủ 500k'
  );

  // 7.3.4 Khi hóa đơn đã PAID 100%, từ chối nộp thêm tiền
  const payAlreadyPaidRes = await invokeInvoicesRouter({
    method: 'PUT',
    url: '/100/status',
    user: bqlUser,
    params: { id: '100' },
    body: { paidAmount: '50000' },
  });
  assert(
    payAlreadyPaidRes.statusCode === 400 && payAlreadyPaidRes.body.message.includes('đã được thanh toán đầy đủ 100%'),
    'Hóa đơn đã PAID 100% từ chối nhận thêm bất kỳ khoản tiền nào (400 Bad Request)'
  );

  // 7.3.5 Khi câu lệnh SELECT FOR UPDATE thất bại trên môi trường production -> trả về 409 Conflict an toàn
  const originalNodeEnv = process.env.NODE_ENV;
  process.env.NODE_ENV = 'production';
  (prisma as any).$transaction = async (fn: any) => {
    const mockTx = {
      $queryRaw: async () => { throw new Error('deadlock detected on row lock'); },
      invoice: { findUnique: async () => mockInvoiceInDb },
    };
    return fn(mockTx);
  };
  const lockFailRes = await invokeInvoicesRouter({
    method: 'PUT',
    url: '/100/status',
    user: bqlUser,
    params: { id: '100' },
    body: { status: 'PAID' },
  });
  assert(
    lockFailRes.statusCode === 409 && lockFailRes.body.message.includes('xử lý giao dịch thanh toán khác'),
    'PostgreSQL lỗi khóa dòng ở production -> trả về 409 Conflict an toàn, không chạy thiếu bảo vệ'
  );
  process.env.NODE_ENV = originalNodeEnv;

  // 7.4 Xử lý lỗi trùng lặp P2002 do Race Condition khi tạo hóa đơn
  (prisma.room as any).findUnique = async () => ({ id: 101, roomNumber: '101' });
  (prisma.invoice as any).findUnique = async () => null; // findUnique ban đầu chưa thấy
  (prisma.invoice as any).create = async () => {
    const err: any = new Error('Unique constraint failed on the fields: (`roomId`,`month`)');
    err.code = 'P2002';
    throw err;
  };

  const p2002Res = await invokeInvoicesRouter({
    method: 'POST',
    url: '/',
    user: bqlUser,
    body: validCreateInput,
  });
  assert(
    p2002Res.statusCode === 409 && p2002Res.body.message.includes('chống trùng lặp'),
    'Bắt lỗi Race Condition Prisma P2002 và trả về HTTP 409 Conflict an toàn'
  );

  // Khôi phục stubs
  (prisma.invoice as any).findMany = originalFindMany;
  (prisma.invoice as any).count = originalCount;
  (prisma.invoice as any).findUnique = originalFindUnique;
  (prisma as any).$transaction = originalTx;

  console.log('\n======================================================');
  console.log(`📊 TỔNG KẾT KIỂM THỬ: ${passCount} ĐẠT (PASS) | ${failCount} THẤT BẠI (FAIL)`);
  console.log('======================================================\n');

  if (failCount > 0) {
    process.exit(1);
  } else {
    console.log('🎉 TẤT CẢ CÁC BÀI KIỂM THỬ INVOICES ĐÃ VƯỢT QUA XUẤT SẮC!\n');
    process.exit(0);
  }
}

runAllTests().catch((err) => {
  console.error('Lỗi ngoại lệ trong quá trình chạy kiểm thử:', err);
  process.exit(1);
});
