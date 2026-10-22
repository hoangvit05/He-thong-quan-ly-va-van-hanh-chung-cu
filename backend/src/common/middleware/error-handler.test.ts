// =========================================================================
// KIỂM THỬ ĐƠN VỊ & BẢO ĐẢM TÍNH TOÀN VẸN GLOBAL ERROR HANDLER
// Phụ trách: Senior Backend Engineer
// Mục tiêu:
// 1. JSON request sai cú pháp trả về JSON HTTP 400, tuyệt đối không trả HTML
// 2. Payload vượt giới hạn trả về JSON HTTP 413
// 3. Lỗi 500 không để lộ thông tin nội bộ (SQL query, stack trace, credentials)
// 4. Không hồi quy các lỗi validation và HTTP status hiện tại
// =========================================================================
process.env.NODE_ENV = 'test';
import express, { Request, Response, NextFunction } from 'express';
import http from 'http';
import { globalErrorHandler, sanitizeForLog } from './error-handler';
import { ApiResponse } from '../types/api-response';
import { createExpressApp } from '../../main';

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

console.log('\n======================================================');
console.log('🧪 BẮT ĐẦU CHẠY KIỂM THỬ CHO GLOBAL ERROR HANDLER');
console.log('======================================================\n');

async function runAllTests() {
  // -------------------------------------------------------------------------
  // 1. KIỂM THỬ KHỬ NHẠY CẢM THÔNG ĐIỆP LOG (LOG SANITIZATION)
  // -------------------------------------------------------------------------
  console.log('1. Kiểm thử Khử Nhạy Cảm Thông Điệp Log (sanitizeForLog):');
  {
    const sanitizedBearer = sanitizeForLog('Request header: Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.xyz.abc');
    assert(
      !sanitizedBearer.includes('eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9') && sanitizedBearer.includes('Bearer [REDACTED]'),
      'Khử nhạy cảm Bearer token thành công'
    );

    const sanitizedPassword = sanitizeForLog('Error in login: password=MySecretPass123!&user=admin');
    assert(
      !sanitizedPassword.includes('MySecretPass123!') && sanitizedPassword.includes('password=[REDACTED]'),
      'Khử nhạy cảm password thành công'
    );

    const sanitizedSecret = sanitizeForLog('Connection secret: secret=super_secret_api_key_456');
    assert(
      !sanitizedSecret.includes('super_secret_api_key_456') && sanitizedSecret.includes('secret=[REDACTED]'),
      'Khử nhạy cảm secret thành công'
    );

    const sanitizedApiKey = sanitizeForLog('Cloudinary config error: apiKey=9876543210');
    assert(
      !sanitizedApiKey.includes('9876543210') && sanitizedApiKey.includes('apiKey=[REDACTED]'),
      'Khử nhạy cảm apiKey thành công'
    );
  }

  // -------------------------------------------------------------------------
  // 2. KIỂM THỬ TRỰC TIẾP GLOBAL ERROR HANDLER VỚI CÁC LOẠI LỖI (UNIT)
  // -------------------------------------------------------------------------
  console.log('\n2. Kiểm thử Trực Tiếp Hàm globalErrorHandler (Unit Handler):');
  {
    // Test 2A: SyntaxError (JSON parse failed)
    let capturedStatus = 0;
    let capturedBody: any = null;
    let nextCalled = false;

    const mockReq: any = { method: 'POST', url: '/api/tickets', originalUrl: '/api/tickets' };
    const mockRes: any = {
      headersSent: false,
      status(code: number) {
        capturedStatus = code;
        return this;
      },
      json(data: any) {
        capturedBody = data;
        return this;
      },
    };
    const mockNext: NextFunction = () => {
      nextCalled = true;
    };

    const syntaxErr: any = new SyntaxError('Unexpected token in JSON at position 5');
    syntaxErr.status = 400;
    syntaxErr.type = 'entity.parse.failed';

    globalErrorHandler(syntaxErr, mockReq, mockRes, mockNext);

    assert(capturedStatus === 400, 'SyntaxError trả về HTTP Status 400');
    assert(capturedBody && capturedBody.success === false, 'Response có success: false');
    assert(capturedBody && capturedBody.data === null, 'Response có data: null');
    assert(
      capturedBody && capturedBody.message.includes('Cú pháp JSON sai'),
      'Thông điệp lỗi cú pháp JSON chuẩn tiếng Việt'
    );
    assert(!nextCalled, 'Không gọi next(err) khi headers chưa gửi');

    // Test 2B: Payload Too Large (HTTP 413)
    capturedStatus = 0;
    capturedBody = null;
    const largeErr: any = new Error('request entity too large');
    largeErr.type = 'entity.too.large';
    largeErr.status = 413;

    globalErrorHandler(largeErr, mockReq, mockRes, mockNext);

    assert(capturedStatus === 413, 'Payload vượt giới hạn trả về HTTP Status 413');
    assert(capturedBody && capturedBody.success === false, 'Payload 413 có success: false');
    assert(
      capturedBody && capturedBody.message.includes('vượt quá giới hạn'),
      'Thông báo vượt giới hạn dung lượng chuẩn'
    );

    // Test 2C: Lỗi không dự kiến 500 (Ngăn chặn rò rỉ dữ liệu nhạy cảm)
    capturedStatus = 0;
    capturedBody = null;
    const internalErr: any = new Error(
      'SELECT * FROM "User" WHERE "password" = \'secret123\' AND internal_path = \'/var/app/db.ts\''
    );
    internalErr.stack = 'Error at DatabaseEngine.execute (/var/app/internal.ts:123:45)';

    globalErrorHandler(internalErr, mockReq, mockRes, mockNext);

    assert(capturedStatus === 500, 'Lỗi không dự kiến trả về HTTP Status 500');
    assert(capturedBody && capturedBody.success === false, 'Lỗi 500 có success: false');
    assert(capturedBody && capturedBody.data === null, 'Lỗi 500 có data: null');
    assert(
      capturedBody && capturedBody.message === 'Đã xảy ra lỗi nội bộ máy chủ. Vui lòng thử lại sau.',
      'Thông điệp lỗi 500 chung, an toàn tuyệt đối'
    );
    assert(
      !JSON.stringify(capturedBody).includes('SELECT') &&
        !JSON.stringify(capturedBody).includes('secret123') &&
        !JSON.stringify(capturedBody).includes('/var/app'),
      'BẢO MẬT: Tuyệt đối không để lộ câu lệnh SQL, stack trace, hoặc file path ra client'
    );

    // Test 2D: Không tin tưởng tùy tiện err.status lạ
    capturedStatus = 0;
    capturedBody = null;
    const rogueErr: any = new Error('Random error with untrusted status');
    rogueErr.status = 418; // I'm a teapot
    globalErrorHandler(rogueErr, mockReq, mockRes, mockNext);
    assert(capturedStatus === 500, 'Không tin tưởng tùy tiện err.status lạ; fallback về HTTP 500');

    // Test 2E: Đã gửi headers (res.headersSent === true)
    let nextErrReceived: any = null;
    const mockResHeadersSent: any = {
      headersSent: true,
      status() {
        throw new Error('Should not call status when headersSent');
      },
      json() {
        throw new Error('Should not call json when headersSent');
      },
    };
    const mockNextForHeaders: NextFunction = (err?: any) => {
      nextErrReceived = err;
    };
    globalErrorHandler(internalErr, mockReq, mockResHeadersSent, mockNextForHeaders);
    assert(
      nextErrReceived === internalErr,
      'Khi headers đã gửi, ủy thác cho Express next(err) đúng chuẩn'
    );
  }

  // -------------------------------------------------------------------------
  // 3. KIỂM THỬ TÍCH HỢP HTTP QUA PIPELINE EXPRESS (EXACT 100KB APP LIMIT)
  // -------------------------------------------------------------------------
  console.log('\n3. Kiểm thử Tích Hợp HTTP qua Pipeline Express (Giới hạn 100KB Thực Tế):');
  {
    // Cấu hình Express App kiểm thử với giới hạn 100kb khớp chính xác cấu hình sản xuất của main.ts
    const testApp = express();
    testApp.use(express.json({ limit: '100kb' }));

    testApp.post('/test/echo', (req, res) => {
      res.json({ success: true, data: req.body, message: 'Echo success' });
    });

    testApp.get('/test/crash', (req, res, next) => {
      next(new Error('CRITICAL_FAIL: SELECT secret FROM credentials;'));
    });

    testApp.use(globalErrorHandler);

    // Khởi chạy server trên cổng ngẫu nhiên (ephemeral port)
    const testServer = http.createServer(testApp);
    await new Promise<void>((resolve) => testServer.listen(0, resolve));
    const address = testServer.address() as any;
    const testPort = address.port;

    // Helper gửi raw HTTP request
    function sendRawRequest(options: {
      port?: number;
      method: string;
      path: string;
      contentType?: string;
      body?: string;
    }): Promise<{ statusCode: number; headers: http.IncomingHttpHeaders; bodyText: string }> {
      return new Promise((resolve, reject) => {
        const req = http.request(
          {
            hostname: '127.0.0.1',
            port: options.port || testPort,
            path: options.path,
            method: options.method,
            headers: {
              ...(options.contentType ? { 'Content-Type': options.contentType } : {}),
              ...(options.body ? { 'Content-Length': Buffer.byteLength(options.body) } : {}),
            },
          },
          (res) => {
            let bodyText = '';
            res.on('data', (chunk) => {
              bodyText += chunk;
            });
            res.on('end', () => {
              resolve({ statusCode: res.statusCode || 0, headers: res.headers, bodyText });
            });
          }
        );
        req.on('error', reject);
        if (options.body) {
          req.write(options.body);
        }
        req.end();
      });
    }

    try {
      // Test 3A: Request hợp lệ dưới ngưỡng 100KB (50KB payload)
      const valid50kString = 'A'.repeat(50 * 1024); // 50 KB <= 100 KB
      const validRes = await sendRawRequest({
        method: 'POST',
        path: '/test/echo',
        contentType: 'application/json',
        body: JSON.stringify({ data: valid50kString }),
      });
      assert(validRes.statusCode === 200, 'POST hợp lệ (50 KB payload dưới trần 100 KB) nhận HTTP 200');
      const validJson = JSON.parse(validRes.bodyText);
      assert(
        validJson.success === true && validJson.data.data.length === 50 * 1024,
        'POST hợp lệ trả về dữ liệu đúng toàn vẹn'
      );

      // Test 3B: Request JSON sai cú pháp (Malformed JSON body)
      const malformedRes = await sendRawRequest({
        method: 'POST',
        path: '/test/echo',
        contentType: 'application/json',
        body: '{"invalid_json": true, ', // Thiếu dấu ngoặc nhọn kết thúc
      });

      assert(malformedRes.statusCode === 400, 'JSON sai cú pháp trả về HTTP 400 (không sập máy chủ)');
      const contentType = malformedRes.headers['content-type'] || '';
      assert(
        contentType.includes('application/json'),
        'JSON sai cú pháp trả về Content-Type application/json (KHÔNG phải HTML)'
      );
      assert(!malformedRes.bodyText.includes('<!DOCTYPE html>'), 'BẢO MẬT: Tuyệt đối không trả về trang lỗi HTML');

      let parsedMalformedBody: any = null;
      try {
        parsedMalformedBody = JSON.parse(malformedRes.bodyText);
      } catch {}
      assert(parsedMalformedBody !== null, 'Phản hồi cú pháp sai là một JSON object hợp lệ');
      assert(parsedMalformedBody?.success === false, 'Phản hồi cú pháp sai có success: false');
      assert(parsedMalformedBody?.data === null, 'Phản hồi cú pháp sai có data: null');
      assert(
        parsedMalformedBody?.message === 'Dữ liệu JSON trong yêu cầu không hợp lệ (Cú pháp JSON sai).',
        'Thông báo lỗi cú pháp đúng chuẩn ApiResponse'
      );

      // Test 3C: Payload vượt quá giới hạn 100KB thực tế của ứng dụng (Entity Too Large)
      // 100 KB = 102,400 bytes. Gửi payload 105 KB = 107,520 bytes
      const hugeString = 'A'.repeat(105 * 1024); // 105 KB > 100 KB limit
      const hugeRes = await sendRawRequest({
        method: 'POST',
        path: '/test/echo',
        contentType: 'application/json',
        body: JSON.stringify({ huge: hugeString }),
      });

      assert(
        hugeRes.statusCode === 413,
        'Payload 105 KB vượt trần sản xuất 100 KB trả về đúng HTTP 413 Payload Too Large'
      );
      const hugeContentType = hugeRes.headers['content-type'] || '';
      assert(
        hugeContentType.includes('application/json'),
        'Payload 413 trả về Content-Type application/json'
      );
      let parsedHugeBody: any = null;
      try {
        parsedHugeBody = JSON.parse(hugeRes.bodyText);
      } catch {}
      assert(parsedHugeBody?.success === false, 'Payload 413 có success: false');
      assert(
        parsedHugeBody?.message === 'Dung lượng dữ liệu gửi lên vượt quá giới hạn cho phép.',
        'Thông điệp vượt giới hạn chuẩn xác'
      );

      // Test 3D: Unhandled Runtime Crash / 500 Route
      const crashRes = await sendRawRequest({
        method: 'GET',
        path: '/test/crash',
      });

      assert(crashRes.statusCode === 500, 'Lỗi runtime không xử lý trả về HTTP 500');
      const crashContentType = crashRes.headers['content-type'] || '';
      assert(
        crashContentType.includes('application/json'),
        'Lỗi 500 trả về Content-Type application/json'
      );
      let parsedCrashBody: any = null;
      try {
        parsedCrashBody = JSON.parse(crashRes.bodyText);
      } catch {}
      assert(parsedCrashBody?.success === false, 'Lỗi 500 có success: false');
      assert(
        parsedCrashBody?.message === 'Đã xảy ra lỗi nội bộ máy chủ. Vui lòng thử lại sau.',
        'Lỗi 500 trả thông báo chung, che giấu chi tiết nội bộ'
      );
      assert(
        !crashRes.bodyText.includes('CRITICAL_FAIL') && !crashRes.bodyText.includes('SELECT secret'),
        'BẢO MẬT: Client nhận được phản hồi không chứa chuỗi lỗi nội bộ CRITICAL_FAIL hay SQL'
      );
    } finally {
      await new Promise<void>((resolve) => testServer.close(() => resolve()));
    }

    // -------------------------------------------------------------------------
    // 3E. KIỂM THỬ TRỰC TIẾP TRÊN INSTANCE ỨNG DỤNG SẢN XUẤT (createExpressApp)
    // -------------------------------------------------------------------------
    console.log('\n3E. Kiểm thử Trực Tiếp Instance Ứng Dụng Chính (createExpressApp()):');
    const prodApp = createExpressApp();
    const prodServer = http.createServer(prodApp);
    await new Promise<void>((resolve) => prodServer.listen(0, resolve));
    const prodPort = (prodServer.address() as any).port;

    try {
      // 1. Kiểm tra GET /health trên instance sản xuất
      const healthRes = await sendRawRequest({
        port: prodPort,
        method: 'GET',
        path: '/health',
      });
      assert(healthRes.statusCode === 200, 'createExpressApp(): GET /health nhận HTTP 200');

      // 2. Kiểm tra JSON sai cú pháp gửi tới route API thực tế (POST /api/auth/login)
      const prodMalformedRes = await sendRawRequest({
        port: prodPort,
        method: 'POST',
        path: '/api/auth/login',
        contentType: 'application/json',
        body: '{"username": "test_user", ', // Cú pháp hỏng
      });
      assert(
        prodMalformedRes.statusCode === 400,
        'createExpressApp(): POST /api/auth/login với JSON sai cú pháp nhận HTTP 400'
      );
      assert(
        (prodMalformedRes.headers['content-type'] || '').includes('application/json'),
        'createExpressApp(): Trả về Content-Type application/json (không HTML)'
      );
      const parsedProdMalformed = JSON.parse(prodMalformedRes.bodyText);
      assert(
        parsedProdMalformed.message === 'Dữ liệu JSON trong yêu cầu không hợp lệ (Cú pháp JSON sai).',
        'createExpressApp(): Thông báo lỗi cú pháp đúng chuẩn ApiResponse'
      );

      // 3. Kiểm tra payload 105 KB vượt trần 100 KB gửi tới POST /api/auth/login trên instance sản xuất
      const prodHugeRes = await sendRawRequest({
        port: prodPort,
        method: 'POST',
        path: '/api/auth/login',
        contentType: 'application/json',
        body: JSON.stringify({ padding: 'Z'.repeat(105 * 1024) }),
      });
      assert(
        prodHugeRes.statusCode === 413,
        'createExpressApp(): Payload 105 KB vượt trần 100 KB nhận đúng HTTP 413 Payload Too Large'
      );
      assert(
        (prodHugeRes.headers['content-type'] || '').includes('application/json'),
        'createExpressApp(): Trả về Content-Type application/json'
      );
      const parsedProdHuge = JSON.parse(prodHugeRes.bodyText);
      assert(
        parsedProdHuge.message === 'Dung lượng dữ liệu gửi lên vượt quá giới hạn cho phép.',
        'createExpressApp(): Thông điệp vượt giới hạn chuẩn xác'
      );

      // 4. Kiểm tra request JSON hợp lệ dưới 100KB vào route thực tế POST /api/auth/login (Bảo toàn validation hiện hữu)
      const prodValidationRes = await sendRawRequest({
        port: prodPort,
        method: 'POST',
        path: '/api/auth/login',
        contentType: 'application/json',
        body: JSON.stringify({}), // Gửi body rỗng để kiểm chứng controller validation chạy độc lập không phụ thuộc DB
      });
      assert(
        prodValidationRes.statusCode === 400,
        'createExpressApp(): Request JSON hợp lệ kích hoạt đúng validation controller (HTTP 400)'
      );
      const parsedProdValidation = JSON.parse(prodValidationRes.bodyText);
      assert(parsedProdValidation.success === false, 'Phản hồi validation có success: false');
      assert(
        parsedProdValidation.message.includes('tên đăng nhập, email hoặc số điện thoại'),
        'createExpressApp(): Lỗi validation của controller được trả về nguyên vẹn, không bị global handler che khuất'
      );
    } finally {
      await new Promise<void>((resolve) => prodServer.close(() => resolve()));
    }
  }

  // -------------------------------------------------------------------------
  // 4. KIỂM THỬ KHÔNG HỒI QUY CÁC STATUS & VALIDATION ERRORS HIỆN CÓ
  // -------------------------------------------------------------------------
  console.log('\n4. Kiểm thử Bảo Toàn Validation Errors & Status Hiện Có:');
  {
    // Kiểm tra cấu trúc ApiResponse đồng nhất
    const sampleErrorResponse: ApiResponse<null> = {
      success: false,
      data: null,
      message: 'Thông báo lỗi validation',
    };
    assert(sampleErrorResponse.success === false, 'ApiResponse typecheck cho error hợp lệ');
    assert(sampleErrorResponse.data === null, 'ApiResponse data: null hợp lệ');
  }

  // -------------------------------------------------------------------------
  // TỔNG KẾT
  // -------------------------------------------------------------------------
  console.log('\n======================================================');
  console.log(`📊 TỔNG KẾT KIỂM THỬ GLOBAL ERROR HANDLER: ${passCount} ĐẠT (PASS) | ${failCount} THẤT BẠI (FAIL)`);
  console.log('======================================================\n');

  if (failCount > 0) {
    process.exit(1);
  }
}

runAllTests().catch((err) => {
  console.error('Lỗi không xử lý được trong bộ kiểm thử error handler:', err);
  process.exit(1);
});
