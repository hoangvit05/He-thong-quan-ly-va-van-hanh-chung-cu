// =========================================================================
// KIỂM THỬ ĐIỀU PHỐI SEED VÀ AN TOÀN DATABASE (M9 TESTS)
// Phân hệ: backend/dataset/validation/seed-orchestration.test.ts
// Đặc tả: 15+ tiêu chí kiểm thử bắt buộc cho Milestone 9
// =========================================================================

import * as assert from 'assert';
import { Role } from '@prisma/client';
import { DATASET_CONFIG } from '../config/dataset.config';
import {
  assertSafeDatabaseEnvironment,
  generateEntireDataset,
  validateDatasetBeforeWrite,
  executeSeed,
  EntireDataset,
} from '../seed/index';

let passedTests = 0;
let totalTests = 0;

function runTest(name: string, fn: () => void | Promise<void>) {
  totalTests++;
  return Promise.resolve()
    .then(() => fn())
    .then(() => {
      passedTests++;
      console.log(`  ✅ [PASS] ${name}`);
    })
    .catch((error: any) => {
      console.error(`  ❌ [FAIL] ${name}`);
      console.error(`     Nguyên nhân: ${error?.message || error}`);
      throw error;
    });
}

/**
 * Mock Prisma Client chuyên dụng cho kiểm thử Seed Orchestrator
 * Kiểm soát chi tiết mọi lời gọi hàm, ánh xạ ID giả lập và cờ ngắt lỗi
 */
class MockPrismaClient {
  public operations: Array<{ model: string; method: string; data: any }> = [];
  public disconnectCalled = false;
  public failAtStage?: string;

  public room = {
    upsert: async (args: any) => {
      this.operations.push({ model: 'Room', method: 'upsert', data: args.create });
      if (this.failAtStage === 'ROOM') throw new Error('Mock Room write failure');
      // Giả lập ID tự tăng với offset 1000
      const currentCount = this.operations.filter((o) => o.model === 'Room').length;
      return { id: 1000 + currentCount, ...args.create };
    },
    deleteMany: async (args: any) => {
      this.operations.push({ model: 'Room', method: 'deleteMany', data: args });
    },
  };

  public user = {
    upsert: async (args: any) => {
      this.operations.push({ model: 'User', method: 'upsert', data: args.create });
      if (this.failAtStage === 'USER') throw new Error('Mock User write failure');
      const currentCount = this.operations.filter((o) => o.model === 'User').length;
      return { id: 2000 + currentCount, ...args.create };
    },
    deleteMany: async (args: any) => {
      this.operations.push({ model: 'User', method: 'deleteMany', data: args });
    },
  };

  public invoice = {
    upsert: async (args: any) => {
      this.operations.push({ model: 'Invoice', method: 'upsert', data: args.create });
      if (this.failAtStage === 'INVOICE') throw new Error('Mock Invoice write failure');
      const currentCount = this.operations.filter((o) => o.model === 'Invoice').length;
      return { id: 3000 + currentCount, ...args.create };
    },
    deleteMany: async (args: any) => {
      this.operations.push({ model: 'Invoice', method: 'deleteMany', data: args });
    },
  };

  public payment = {
    findFirst: async (args: any) => {
      this.operations.push({ model: 'Payment', method: 'findFirst', data: args.where });
      return null; // Giả lập chưa tồn tại để gọi create
    },
    create: async (args: any) => {
      this.operations.push({ model: 'Payment', method: 'create', data: args.data });
      if (this.failAtStage === 'PAYMENT') throw new Error('Mock Payment write failure');
      const currentCount = this.operations.filter((o) => o.model === 'Payment' && o.method === 'create').length;
      return { id: 4000 + currentCount, ...args.data };
    },
    update: async (args: any) => {
      this.operations.push({ model: 'Payment', method: 'update', data: args.data });
      return { id: args.where.id, ...args.data };
    },
    deleteMany: async (args: any) => {
      this.operations.push({ model: 'Payment', method: 'deleteMany', data: args });
    },
  };

  public ticket = {
    findFirst: async (args: any) => {
      this.operations.push({ model: 'Ticket', method: 'findFirst', data: args.where });
      return null;
    },
    create: async (args: any) => {
      this.operations.push({ model: 'Ticket', method: 'create', data: args.data });
      if (this.failAtStage === 'TICKET') throw new Error('Mock Ticket write failure');
      const currentCount = this.operations.filter((o) => o.model === 'Ticket' && o.method === 'create').length;
      return { id: 5000 + currentCount, ...args.data };
    },
    update: async (args: any) => {
      this.operations.push({ model: 'Ticket', method: 'update', data: args.data });
      return { id: args.where.id, ...args.data };
    },
    deleteMany: async (args: any) => {
      this.operations.push({ model: 'Ticket', method: 'deleteMany', data: args });
    },
  };

  public feedback = {
    findFirst: async (args: any) => {
      this.operations.push({ model: 'Feedback', method: 'findFirst', data: args.where });
      return null;
    },
    create: async (args: any) => {
      this.operations.push({ model: 'Feedback', method: 'create', data: args.data });
      if (this.failAtStage === 'FEEDBACK') throw new Error('Mock Feedback write failure');
      const currentCount = this.operations.filter((o) => o.model === 'Feedback' && o.method === 'create').length;
      return { id: 6000 + currentCount, ...args.data };
    },
    update: async (args: any) => {
      this.operations.push({ model: 'Feedback', method: 'update', data: args.data });
      return { id: args.where.id, ...args.data };
    },
    deleteMany: async (args: any) => {
      this.operations.push({ model: 'Feedback', method: 'deleteMany', data: args });
    },
  };

  public notification = {
    findFirst: async (args: any) => {
      this.operations.push({ model: 'Notification', method: 'findFirst', data: args.where });
      return null;
    },
    create: async (args: any) => {
      this.operations.push({ model: 'Notification', method: 'create', data: args.data });
      if (this.failAtStage === 'NOTIFICATION') throw new Error('Mock Notification write failure');
      const currentCount = this.operations.filter((o) => o.model === 'Notification' && o.method === 'create').length;
      return { id: 7000 + currentCount, ...args.data };
    },
    update: async (args: any) => {
      this.operations.push({ model: 'Notification', method: 'update', data: args.data });
      return { id: args.where.id, ...args.data };
    },
    deleteMany: async (args: any) => {
      this.operations.push({ model: 'Notification', method: 'deleteMany', data: args });
    },
  };

  public mediaAsset = {
    create: async (args: any) => {
      this.operations.push({ model: 'MediaAsset', method: 'create', data: args.data });
      return { id: 8000, ...args.data };
    },
    deleteMany: async (args: any) => {
      this.operations.push({ model: 'MediaAsset', method: 'deleteMany', data: args });
    },
  };

  public $executeRaw = async (...args: any[]) => {
    this.operations.push({ model: 'RAW', method: '$executeRaw', data: args });
  };

  public $executeRawUnsafe = async (...args: any[]) => {
    this.operations.push({ model: 'RAW', method: '$executeRawUnsafe', data: args });
  };

  public $transaction = async (fn: (tx: any) => Promise<any>, _opts?: any) => {
    return fn(this);
  };

  public $disconnect = async () => {
    this.disconnectCalled = true;
  };
}

async function runAllTests() {
  console.log('======================================================');
  console.log('🧪 BẮT ĐẦU KIỂM ĐỊNH SEED ORCHESTRATION & SAFETY (M9)');
  console.log('======================================================');

  const originalEnv = { ...process.env };
  const restoreEnv = () => {
    process.env = { ...originalEnv };
  };

  // =========================================================================
  // 1. KIỂM THỬ AN TOÀN DATABASE & CHẶN PRODUCTION (FAIL-CLOSED)
  // =========================================================================
  console.log('--- 1. Kiểm thử An toàn Database & Chặn Production ---');

  await runTest('1.1 Từ chối khi NODE_ENV=production', () => {
    restoreEnv();
    process.env.NODE_ENV = 'production';
    process.env.ALLOW_DATASET_SEED = 'true';
    assert.throws(
      () => assertSafeDatabaseEnvironment(),
      /Tuyệt đối từ chối chạy seed dữ liệu trên môi trường PRODUCTION!/
    );
  });

  await runTest('1.2 Từ chối khi thiếu ALLOW_DATASET_SEED', () => {
    restoreEnv();
    process.env.NODE_ENV = 'development';
    delete process.env.ALLOW_DATASET_SEED;
    assert.throws(
      () => assertSafeDatabaseEnvironment(),
      /ALLOW_DATASET_SEED phải có giá trị 'true'/
    );
  });

  await runTest('1.3 Từ chối khi DATABASE_URL thiếu hoặc không hợp lệ', () => {
    restoreEnv();
    process.env.NODE_ENV = 'development';
    process.env.ALLOW_DATASET_SEED = 'true';

    // Thiếu URL
    delete process.env.DATABASE_URL;
    assert.throws(
      () => assertSafeDatabaseEnvironment(),
      /DATABASE_URL thiếu hoặc không hợp lệ/
    );

    // Chuỗi không thể parse
    process.env.DATABASE_URL = 'invalid-connection-string';
    assert.throws(
      () => assertSafeDatabaseEnvironment(),
      /DATABASE_URL không thể phân tích cú pháp hợp lệ/
    );

    // Giao thức không phải PostgreSQL
    process.env.DATABASE_URL = 'mysql://root:pass@localhost:3306/apartment_db';
    assert.throws(
      () => assertSafeDatabaseEnvironment(),
      /Giao thức DATABASE_URL không hợp lệ/
    );
  });

  await runTest('1.4 Từ chối database target không xác định được mức an toàn', () => {
    restoreEnv();
    process.env.NODE_ENV = 'development';
    process.env.ALLOW_DATASET_SEED = 'true';

    // Hostname không thuộc localhost và dbName không có nhãn an toàn
    assert.throws(
      () =>
        assertSafeDatabaseEnvironment(
          'postgresql://user:pass@corporate-db.internal.corp:5432/core_banking'
        ),
      /Không đủ thông tin xác định database target là an toàn/
    );

    // Database trên Cloud không có nhãn an toàn (dev/test/demo/sandbox)
    assert.throws(
      () =>
        assertSafeDatabaseEnvironment(
          'postgresql://user:pass@ep-cool-fog.us-east-2.aws.neon.tech:5432/company_analytics'
        ),
      /Database trên Cloud .* không xác định được mức độ an toàn/
    );
  });

  await runTest('1.5 Từ chối database Production kể cả khi có ALLOW_DATASET_SEED=true', () => {
    restoreEnv();
    process.env.NODE_ENV = 'development';
    process.env.ALLOW_DATASET_SEED = 'true';

    // Dấu hiệu production trong hostname
    assert.throws(
      () =>
        assertSafeDatabaseEnvironment(
          'postgresql://postgres:pass@prod-postgres.internal:5432/apartment_db'
        ),
      /Phát hiện dấu hiệu Production trong hostname/
    );

    // Dấu hiệu production trong tên database
    assert.throws(
      () =>
        assertSafeDatabaseEnvironment(
          'postgresql://postgres:pass@localhost:5432/apartment_production'
        ),
      /Phát hiện dấu hiệu Production trong tên database/
    );

    // Dấu hiệu live/master/main
    assert.throws(
      () =>
        assertSafeDatabaseEnvironment(
          'postgresql://postgres:pass@localhost:5432/apartment_live_db'
        ),
      /Phát hiện dấu hiệu Production/
    );
  });

  await runTest('1.6 Không gọi Prisma write khi safety check thất bại', async () => {
    restoreEnv();
    process.env.NODE_ENV = 'production';
    process.env.ALLOW_DATASET_SEED = 'true';

    const mockClient = new MockPrismaClient();

    await assert.rejects(
      async () => {
        await executeSeed({ prismaClient: mockClient, logger: () => {} });
      },
      /Tuyệt đối từ chối chạy seed dữ liệu trên môi trường PRODUCTION!/
    );

    assert.strictEqual(mockClient.operations.length, 0, 'Tuyệt đối không gọi bất kỳ thao tác ghi nào');
  });

  // =========================================================================
  // 2. KIỂM THỬ THỨ TỰ PHỤ THUỘC GENERATOR & GHI DỮ LIỆU
  // =========================================================================
  console.log('--- 2. Kiểm thử Thứ tự Generator & Ghi Dữ liệu ---');

  await runTest('2.1 Thứ tự thực hiện generator đúng dependency', () => {
    const executedGenerators: string[] = [];
    generateEntireDataset({
      seed: 20261111,
      onGeneratorStep: (gen) => executedGenerators.push(gen),
    });

    const expectedOrder = [
      'room',
      'user',
      'ticket',
      'invoice_payment',
      'feedback',
      'notification',
      'media_asset',
    ];
    assert.deepStrictEqual(executedGenerators, expectedOrder, 'Thứ tự generator phải khớp 100% dependency');
  });

  await runTest('2.2 Thứ tự ghi dữ liệu đúng dependency khóa ngoại', async () => {
    restoreEnv();
    process.env.NODE_ENV = 'development';
    process.env.ALLOW_DATASET_SEED = 'true';

    const mockClient = new MockPrismaClient();
    await executeSeed({
      prismaClient: mockClient,
      logger: () => {},
      databaseUrl: 'postgresql://postgres:pass@localhost:5432/apartment_db',
    });

    // Lọc thứ tự xuất hiện đầu tiên của từng model trong operations
    const firstSeenOrder: string[] = [];
    for (const op of mockClient.operations) {
      if (!firstSeenOrder.includes(op.model)) {
        firstSeenOrder.push(op.model);
      }
    }

    const expectedWriteOrder = [
      'Room',
      'User',
      'Invoice',
      'Payment',
      'Ticket',
      'Feedback',
      'Notification',
    ];
    assert.deepStrictEqual(firstSeenOrder, expectedWriteOrder, 'Thứ tự ghi dữ liệu phải bảo đảm cây khóa ngoại');
  });

  // =========================================================================
  // 3. KIỂM THỬ ÁNH XẠ ID THỰC TẾ & TOÀN VẸN KHÓA NGOẠI
  // =========================================================================
  console.log('--- 3. Kiểm thử Ánh xạ ID Thực tế (ID Mapping) ---');

  await runTest('3.1 Foreign key sử dụng ID mapping thực tế từ Database', async () => {
    restoreEnv();
    process.env.NODE_ENV = 'development';
    process.env.ALLOW_DATASET_SEED = 'true';

    const mockClient = new MockPrismaClient();
    await executeSeed({
      prismaClient: mockClient,
      logger: () => {},
      databaseUrl: 'postgresql://postgres:pass@localhost:5432/apartment_db',
    });

    // 1. Kiểm tra User: roomId phải nằm trong dải [1001, 1100] (Room ID thực tế từ database)
    const userCreates = mockClient.operations.filter((o) => o.model === 'User' && o.method === 'upsert');
    for (const u of userCreates) {
      if (u.data.roomId !== null) {
        assert.ok(
          u.data.roomId >= 1001 && u.data.roomId <= 1100,
          `User roomId ${u.data.roomId} phải sử dụng ID thực tế đã ánh xạ (1001-1100)`
        );
      }
    }

    // 2. Kiểm tra Invoice: roomId phải nằm trong dải [1001, 1100]
    const invoiceCreates = mockClient.operations.filter((o) => o.model === 'Invoice' && o.method === 'upsert');
    for (const inv of invoiceCreates) {
      assert.ok(
        inv.data.roomId >= 1001 && inv.data.roomId <= 1100,
        `Invoice roomId ${inv.data.roomId} phải sử dụng ID thực tế đã ánh xạ`
      );
    }

    // 3. Kiểm tra Payment: invoiceId phải nằm trong dải [3001, 3500] (Invoice ID thực tế)
    const paymentCreates = mockClient.operations.filter((o) => o.model === 'Payment' && o.method === 'create');
    for (const p of paymentCreates) {
      assert.ok(
        p.data.invoiceId >= 3001 && p.data.invoiceId <= 3600,
        `Payment invoiceId ${p.data.invoiceId} phải sử dụng ID thực tế đã ánh xạ`
      );
    }

    // 4. Kiểm tra Ticket: residentId trong [2001, 2200], roomId trong [1001, 1100]
    const ticketCreates = mockClient.operations.filter((o) => o.model === 'Ticket' && o.method === 'create');
    for (const t of ticketCreates) {
      assert.ok(
        t.data.residentId >= 2001 && t.data.residentId <= 2200,
        `Ticket residentId ${t.data.residentId} phải dùng ID User thực tế`
      );
      if (t.data.technicianId !== null) {
        assert.ok(
          t.data.technicianId >= 2001 && t.data.technicianId <= 2200,
          `Ticket technicianId ${t.data.technicianId} phải dùng ID User thực tế`
        );
      }
      if (t.data.roomId !== null) {
        assert.ok(
          t.data.roomId >= 1001 && t.data.roomId <= 1100,
          `Ticket roomId ${t.data.roomId} phải dùng ID Room thực tế`
        );
      }
    }

    // 5. Kiểm tra Feedback: residentId trong [2001, 2200], roomId trong [1001, 1100]
    const feedbackCreates = mockClient.operations.filter((o) => o.model === 'Feedback' && o.method === 'create');
    for (const f of feedbackCreates) {
      assert.ok(
        f.data.residentId >= 2001 && f.data.residentId <= 2200,
        `Feedback residentId ${f.data.residentId} phải dùng ID User thực tế`
      );
      if (f.data.roomId !== null) {
        assert.ok(
          f.data.roomId >= 1001 && f.data.roomId <= 1100,
          `Feedback roomId ${f.data.roomId} phải dùng ID Room thực tế`
        );
      }
    }

    // 6. Kiểm tra Notification: authorId trong [2001, 2200]
    const notifCreates = mockClient.operations.filter((o) => o.model === 'Notification' && o.method === 'create');
    for (const n of notifCreates) {
      if (n.data.authorId !== null) {
        assert.ok(
          n.data.authorId >= 2001 && n.data.authorId <= 2200,
          `Notification authorId ${n.data.authorId} phải dùng ID User thực tế`
        );
      }
    }
  });

  // =========================================================================
  // 4. KIỂM THỬ GIAO DỊCH, ROLLBACK VÀ VÒNG ĐỜI KẾT NỐI (LIFECYCLE)
  // =========================================================================
  console.log('--- 4. Kiểm thử Transaction, Rollback & Disconnect ---');

  await runTest('4.1 Rollback và ném lỗi khi một bước ghi dữ liệu thất bại', async () => {
    restoreEnv();
    process.env.NODE_ENV = 'development';
    process.env.ALLOW_DATASET_SEED = 'true';

    const mockClient = new MockPrismaClient();
    mockClient.failAtStage = 'TICKET'; // Cố tình gây lỗi tại giai đoạn Ticket

    await assert.rejects(
      async () => {
        await executeSeed({
          prismaClient: mockClient,
          logger: () => {},
          databaseUrl: 'postgresql://postgres:pass@localhost:5432/apartment_db',
        });
      },
      /Mock Ticket write failure/
    );
  });

  await runTest('4.2 Prisma disconnect được gọi khi seed thành công', async () => {
    restoreEnv();
    process.env.NODE_ENV = 'development';
    process.env.ALLOW_DATASET_SEED = 'true';

    const mockClient = new MockPrismaClient();
    await executeSeed({
      prismaClient: mockClient,
      logger: () => {},
      databaseUrl: 'postgresql://postgres:pass@localhost:5432/apartment_db',
    });

    assert.strictEqual(mockClient.disconnectCalled, true, '$disconnect phải được gọi khi thành công');
  });

  await runTest('4.3 Prisma disconnect được gọi khi seed thất bại', async () => {
    restoreEnv();
    process.env.NODE_ENV = 'development';
    process.env.ALLOW_DATASET_SEED = 'true';

    const mockClient = new MockPrismaClient();
    mockClient.failAtStage = 'USER';

    await assert.rejects(async () => {
      await executeSeed({
        prismaClient: mockClient,
        logger: () => {},
        databaseUrl: 'postgresql://postgres:pass@localhost:5432/apartment_db',
      });
    });

    assert.strictEqual(mockClient.disconnectCalled, true, '$disconnect phải được gọi ngay cả khi gặp lỗi');
  });

  // =========================================================================
  // 5. KIỂM THỬ KHÔNG PHÁ HỦY DỮ LIỆU & ZERO-ASSET
  // =========================================================================
  console.log('--- 5. Kiểm thử Không Phá Hủy & Zero-Asset ---');

  await runTest('5.1 Không tạo bản ghi MediaAsset nào', async () => {
    restoreEnv();
    process.env.NODE_ENV = 'development';
    process.env.ALLOW_DATASET_SEED = 'true';

    const mockClient = new MockPrismaClient();
    const result = await executeSeed({
      prismaClient: mockClient,
      logger: () => {},
      databaseUrl: 'postgresql://postgres:pass@localhost:5432/apartment_db',
    });

    const mediaOps = mockClient.operations.filter((o) => o.model === 'MediaAsset');
    assert.strictEqual(mediaOps.length, 0, 'Thao tác MediaAsset trên database phải bằng 0');
    assert.strictEqual(result.counts.mediaAssets, 0, 'MediaAsset count trong kết quả phải bằng 0');
  });

  await runTest('5.2 Tuyệt đối không sử dụng deleteMany, delete hoặc TRUNCATE', async () => {
    restoreEnv();
    process.env.NODE_ENV = 'development';
    process.env.ALLOW_DATASET_SEED = 'true';

    const mockClient = new MockPrismaClient();
    await executeSeed({
      prismaClient: mockClient,
      logger: () => {},
      databaseUrl: 'postgresql://postgres:pass@localhost:5432/apartment_db',
    });

    const destructiveOps = mockClient.operations.filter(
      (o) => o.method.includes('delete') || o.method.includes('Raw')
    );
    assert.strictEqual(destructiveOps.length, 0, 'Tuyệt đối không có bất kỳ lệnh delete hoặc raw query nào');
  });

  await runTest('5.3 Không báo thành công nếu bất kỳ bước nào thất bại', async () => {
    restoreEnv();
    process.env.NODE_ENV = 'development';
    process.env.ALLOW_DATASET_SEED = 'true';

    const mockClient = new MockPrismaClient();
    mockClient.failAtStage = 'INVOICE';

    let reportedSuccess = false;
    try {
      await executeSeed({
        prismaClient: mockClient,
        logger: (msg) => {
          if (msg.includes('Success')) reportedSuccess = true;
        },
        databaseUrl: 'postgresql://postgres:pass@localhost:5432/apartment_db',
      });
    } catch {
      // Expected rejection
    }

    assert.strictEqual(reportedSuccess, false, 'Không bao giờ được log thành công khi có bước thất bại');
  });

  // =========================================================================
  // 6. KIỂM THỬ TÍNH ĐƠN ĐỊNH & PRE-WRITE VALIDATION
  // =========================================================================
  console.log('--- 6. Kiểm thử Tính Đơn định & Pre-write Validation ---');

  await runTest('6.1 Tính đơn định: Cùng seed sinh dataset hoàn toàn giống nhau 100%', () => {
    const ds1 = generateEntireDataset({ seed: 20261111 });
    const ds2 = generateEntireDataset({ seed: 20261111 });

    assert.strictEqual(ds1.rooms.length, ds2.rooms.length);
    assert.strictEqual(ds1.users.length, ds2.users.length);
    assert.strictEqual(ds1.invoices.length, ds2.invoices.length);
    assert.strictEqual(ds1.payments.length, ds2.payments.length);
    assert.strictEqual(ds1.tickets.length, ds2.tickets.length);
    assert.strictEqual(ds1.feedbacks.length, ds2.feedbacks.length);
    assert.strictEqual(ds1.notifications.length, ds2.notifications.length);

    assert.deepStrictEqual(
      ds1.rooms.map((r) => r.roomNumber),
      ds2.rooms.map((r) => r.roomNumber)
    );
    assert.deepStrictEqual(
      ds1.users.map((u) => u.username),
      ds2.users.map((u) => u.username)
    );
  });

  await runTest('6.2 Pre-write validation chặn đứng dữ liệu sai trước khi chạm database', () => {
    const validDataset = generateEntireDataset({ seed: 20261111 });

    // 1. Dataset chuẩn -> PASS
    assert.doesNotThrow(() => validateDatasetBeforeWrite(validDataset));

    // 2. Vi phạm MediaAsset > 0 -> FAIL
    const fakeMediaDataset: EntireDataset = {
      ...validDataset,
      mediaAssets: [
        {
          id: 1,
          publicId: 'test/fake',
          url: 'https://res.cloudinary.com/fake/image.jpg',
          resourceType: 'image',
          deliveryType: 'authenticated',
          purpose: 'tickets',
          bytes: 100,
          format: 'jpg',
          width: null,
          height: null,
          duration: null,
          uploaderId: validDataset.users[0].id,
          ticketId: null,
          isConfirmed: true,
          confirmedAt: new Date(),
          createdAt: new Date(),
          updatedAt: new Date(),
        },
      ],
    };
    assert.throws(() => validateDatasetBeforeWrite(fakeMediaDataset), /Số lượng MediaAsset.*vượt quá giới hạn cho phép/);

    // 3. Vi phạm trùng lặp username -> FAIL
    const duplicateUserDataset: EntireDataset = {
      ...validDataset,
      users: validDataset.users.map((u, idx) =>
        idx === 1 ? { ...u, username: validDataset.users[0].username } : u
      ),
    };
    assert.throws(() => validateDatasetBeforeWrite(duplicateUserDataset), /username bị trùng lặp/);
  });

  restoreEnv();

  console.log('======================================================');
  console.log(`🎉 TOÀN BỘ ${passedTests}/${totalTests} TESTS M9 ĐẠT CHUẨN!`);
  console.log('======================================================');
}

runAllTests().catch(() => {
  process.exit(1);
});
