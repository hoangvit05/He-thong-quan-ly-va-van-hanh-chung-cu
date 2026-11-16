// =========================================================================
// KIỂM THỬ ĐIỀU PHỐI SEED VÀ AN TOÀN DATABASE (M9.1 TESTS)
// Phân hệ: backend/dataset/validation/seed-orchestration.test.ts
// Đặc tả: Milestone 9.1 – Database Safety Guard & Non-Destructive Seed
// =========================================================================

import * as assert from 'assert';
import { Role } from '@prisma/client';
import { DATASET_CONFIG } from '../config/dataset.config';
import {
  assertSafeDatabaseEnvironment,
  parseDatabaseAllowlist,
  sanitizeDatabaseUrl,
  formatDatabaseTarget,
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

interface MockRecord {
  id: number;
  [key: string]: any;
}

/**
 * Mock Prisma Client có trạng thái (Stateful Mock) cho Milestone 9.1:
 * - Lưu trữ dữ liệu in-memory mô phỏng database thực tế.
 * - Hỗ trợ count() để kiểm tra dữ liệu hiện hữu trước khi seed.
 * - Mô phỏng giao dịch Stateful Transaction: Snapshot trước giao dịch, Rollback khi lỗi, Commit khi thành công.
 * - Ghi nhận mọi thao tác để đối chiếu không phá hủy (No upsert, No update, No delete, No TRUNCATE).
 *
 * [LƯU Ý]: Kiểm thử sử dụng snapshot-rollback in-memory để kiểm chứng logic transaction wrapper
 * và xử lý lỗi của Seed Orchestrator, không tuyên bố thay thế kiểm thử trên PostgreSQL Engine thực tế.
 */
class MockPrismaClient {
  public rooms: MockRecord[] = [];
  public users: MockRecord[] = [];
  public invoices: MockRecord[] = [];
  public payments: MockRecord[] = [];
  public tickets: MockRecord[] = [];
  public feedbacks: MockRecord[] = [];
  public notifications: MockRecord[] = [];
  public mediaAssets: MockRecord[] = [];

  public operations: Array<{ model: string; method: string; data: any }> = [];
  public disconnectCalled = false;
  public failAtStage?: string;
  public transactionOptions: any = null;

  public room = {
    count: async () => this.rooms.length,
    create: async (args: any) => this.recordCreate('Room', this.rooms, 1000, args.data),
    deleteMany: async (args: any) => { this.operations.push({ model: 'Room', method: 'deleteMany', data: args }); },
  };

  public user = {
    count: async () => this.users.length,
    create: async (args: any) => this.recordCreate('User', this.users, 2000, args.data),
    deleteMany: async (args: any) => { this.operations.push({ model: 'User', method: 'deleteMany', data: args }); },
  };

  public invoice = {
    count: async () => this.invoices.length,
    create: async (args: any) => this.recordCreate('Invoice', this.invoices, 3000, args.data),
    deleteMany: async (args: any) => { this.operations.push({ model: 'Invoice', method: 'deleteMany', data: args }); },
  };

  public payment = {
    count: async () => this.payments.length,
    create: async (args: any) => this.recordCreate('Payment', this.payments, 4000, args.data),
    deleteMany: async (args: any) => { this.operations.push({ model: 'Payment', method: 'deleteMany', data: args }); },
  };

  public ticket = {
    count: async () => this.tickets.length,
    create: async (args: any) => this.recordCreate('Ticket', this.tickets, 5000, args.data),
    deleteMany: async (args: any) => { this.operations.push({ model: 'Ticket', method: 'deleteMany', data: args }); },
  };

  public feedback = {
    count: async () => this.feedbacks.length,
    create: async (args: any) => this.recordCreate('Feedback', this.feedbacks, 6000, args.data),
    deleteMany: async (args: any) => { this.operations.push({ model: 'Feedback', method: 'deleteMany', data: args }); },
  };

  public notification = {
    count: async () => this.notifications.length,
    create: async (args: any) => this.recordCreate('Notification', this.notifications, 7000, args.data),
    deleteMany: async (args: any) => { this.operations.push({ model: 'Notification', method: 'deleteMany', data: args }); },
  };

  public mediaAsset = {
    count: async () => this.mediaAssets.length,
    create: async (args: any) => this.recordCreate('MediaAsset', this.mediaAssets, 8000, args.data),
    deleteMany: async (args: any) => { this.operations.push({ model: 'MediaAsset', method: 'deleteMany', data: args }); },
  };

  private recordCreate(model: string, targetArray: MockRecord[], idOffset: number, data: any) {
    this.operations.push({ model, method: 'create', data });
    if (this.failAtStage === model.toUpperCase()) {
      throw new Error(`Mock ${model} write failure at stage [${model.toUpperCase()}]`);
    }
    const record: MockRecord = { id: idOffset + targetArray.length + 1, ...data };
    targetArray.push(record);
    return record;
  }

  public $executeRaw = async (...args: any[]) => {
    this.operations.push({ model: 'RAW', method: '$executeRaw', data: args });
  };

  public $executeRawUnsafe = async (...args: any[]) => {
    this.operations.push({ model: 'RAW', method: '$executeRawUnsafe', data: args });
  };

  public $disconnect = async () => {
    this.disconnectCalled = true;
  };

  /**
   * Stateful Transaction Simulation
   */
  public $transaction = async (fn: (tx: any) => Promise<any>, options?: any) => {
    this.transactionOptions = options;

    // Snapshot trước giao dịch
    const snapshot = {
      rooms: [...this.rooms],
      users: [...this.users],
      invoices: [...this.invoices],
      payments: [...this.payments],
      tickets: [...this.tickets],
      feedbacks: [...this.feedbacks],
      notifications: [...this.notifications],
      mediaAssets: [...this.mediaAssets],
    };

    // Bộ nhớ làm việc trong giao dịch
    const txRooms: MockRecord[] = [...this.rooms];
    const txUsers: MockRecord[] = [...this.users];
    const txInvoices: MockRecord[] = [...this.invoices];
    const txPayments: MockRecord[] = [...this.payments];
    const txTickets: MockRecord[] = [...this.tickets];
    const txFeedbacks: MockRecord[] = [...this.feedbacks];
    const txNotifications: MockRecord[] = [...this.notifications];
    const txMediaAssets: MockRecord[] = [...this.mediaAssets];

    const txClient: any = {
      room: {
        count: async () => txRooms.length,
        create: async (args: any) => this.recordCreate('Room', txRooms, 1000, args.data),
      },
      user: {
        count: async () => txUsers.length,
        create: async (args: any) => this.recordCreate('User', txUsers, 2000, args.data),
      },
      invoice: {
        count: async () => txInvoices.length,
        create: async (args: any) => this.recordCreate('Invoice', txInvoices, 3000, args.data),
      },
      payment: {
        count: async () => txPayments.length,
        create: async (args: any) => this.recordCreate('Payment', txPayments, 4000, args.data),
      },
      ticket: {
        count: async () => txTickets.length,
        create: async (args: any) => this.recordCreate('Ticket', txTickets, 5000, args.data),
      },
      feedback: {
        count: async () => txFeedbacks.length,
        create: async (args: any) => this.recordCreate('Feedback', txFeedbacks, 6000, args.data),
      },
      notification: {
        count: async () => txNotifications.length,
        create: async (args: any) => this.recordCreate('Notification', txNotifications, 7000, args.data),
      },
      mediaAsset: {
        count: async () => txMediaAssets.length,
        create: async (args: any) => this.recordCreate('MediaAsset', txMediaAssets, 8000, args.data),
      },
    };

    try {
      const result = await fn(txClient);
      // Giao dịch thành công -> Commit
      this.rooms = txRooms;
      this.users = txUsers;
      this.invoices = txInvoices;
      this.payments = txPayments;
      this.tickets = txTickets;
      this.feedbacks = txFeedbacks;
      this.notifications = txNotifications;
      this.mediaAssets = txMediaAssets;
      return result;
    } catch (err) {
      // Giao dịch thất bại -> Rollback về snapshot ban đầu
      this.rooms = snapshot.rooms;
      this.users = snapshot.users;
      this.invoices = snapshot.invoices;
      this.payments = snapshot.payments;
      this.tickets = snapshot.tickets;
      this.feedbacks = snapshot.feedbacks;
      this.notifications = snapshot.notifications;
      this.mediaAssets = snapshot.mediaAssets;
      throw err;
    }
  };
}

async function runAllTests() {
  console.log('======================================================');
  console.log('🧪 BẮT ĐẦU KIỂM ĐỊNH SEED ORCHESTRATION & SAFETY (M9.1)');
  console.log('======================================================');

  const originalEnv = { ...process.env };
  const restoreEnv = () => {
    process.env = { ...originalEnv };
  };

  // =========================================================================
  // 1. KIỂM THỬ AN TOÀN DATABASE & TARGET ALLOWLIST (BLOCKER A)
  // =========================================================================
  console.log('--- 1. Kiểm thử An toàn Database & Target Allowlist (Blocker A) ---');

  await runTest('1.1 Từ chối khi NODE_ENV=production', () => {
    restoreEnv();
    process.env.NODE_ENV = 'production';
    process.env.ALLOW_DATASET_SEED = 'true';
    process.env.DATASET_DB_ALLOWLIST = 'localhost:5432/apartment_demo';
    assert.throws(
      () => assertSafeDatabaseEnvironment(),
      /Tuyệt đối từ chối chạy seed dữ liệu trên môi trường PRODUCTION!/
    );
  });

  await runTest('1.2 Từ chối khi thiếu ALLOW_DATASET_SEED', () => {
    restoreEnv();
    process.env.NODE_ENV = 'development';
    delete process.env.ALLOW_DATASET_SEED;
    process.env.DATASET_DB_ALLOWLIST = 'localhost:5432/apartment_demo';
    assert.throws(
      () => assertSafeDatabaseEnvironment(),
      /ALLOW_DATASET_SEED phải có giá trị 'true'/
    );
  });

  await runTest('1.3 Từ chối khi DATABASE_URL thiếu hoặc không hợp lệ', () => {
    restoreEnv();
    process.env.NODE_ENV = 'development';
    process.env.ALLOW_DATASET_SEED = 'true';
    process.env.DATASET_DB_ALLOWLIST = 'localhost:5432/apartment_demo';

    delete process.env.DATABASE_URL;
    assert.throws(
      () => assertSafeDatabaseEnvironment(),
      /DATABASE_URL thiếu hoặc không hợp lệ/
    );

    process.env.DATABASE_URL = 'invalid-connection-string';
    assert.throws(
      () => assertSafeDatabaseEnvironment(),
      /DATABASE_URL không thể phân tích cú pháp hợp lệ/
    );

    process.env.DATABASE_URL = 'mysql://root:pass@localhost:3306/apartment_demo';
    assert.throws(
      () => assertSafeDatabaseEnvironment(),
      /Giao thức DATABASE_URL không hợp lệ/
    );
  });

  await runTest('1.4 Từ chối khi thiếu cấu hình allowlist (DATASET_DB_ALLOWLIST undefined)', () => {
    restoreEnv();
    process.env.NODE_ENV = 'development';
    process.env.ALLOW_DATASET_SEED = 'true';
    delete process.env.DATASET_DB_ALLOWLIST;

    assert.throws(
      () =>
        assertSafeDatabaseEnvironment(
          'postgresql://postgres:pass@localhost:5432/apartment_demo'
        ),
      /Thiếu cấu hình allowlist database target/
    );
  });

  await runTest('1.5 Từ chối khi hostname không khớp allowlist', () => {
    restoreEnv();
    process.env.NODE_ENV = 'development';
    process.env.ALLOW_DATASET_SEED = 'true';
    process.env.DATASET_DB_ALLOWLIST = 'localhost:5432/apartment_demo';

    assert.throws(
      () =>
        assertSafeDatabaseEnvironment(
          'postgresql://postgres:pass@192.168.1.50:5432/apartment_demo'
        ),
      /không nằm trong allowlist được cấp phép/
    );
  });

  await runTest('1.6 Từ chối khi port không khớp allowlist', () => {
    restoreEnv();
    process.env.NODE_ENV = 'development';
    process.env.ALLOW_DATASET_SEED = 'true';
    process.env.DATASET_DB_ALLOWLIST = 'localhost:5432/apartment_demo';

    assert.throws(
      () =>
        assertSafeDatabaseEnvironment(
          'postgresql://postgres:pass@localhost:5433/apartment_demo'
        ),
      /không nằm trong allowlist được cấp phép/
    );
  });

  await runTest('1.7 Từ chối khi database name không khớp allowlist', () => {
    restoreEnv();
    process.env.NODE_ENV = 'development';
    process.env.ALLOW_DATASET_SEED = 'true';
    process.env.DATASET_DB_ALLOWLIST = 'localhost:5432/apartment_demo';

    assert.throws(
      () =>
        assertSafeDatabaseEnvironment(
          'postgresql://postgres:pass@localhost:5432/another_app_db'
        ),
      /không nằm trong allowlist được cấp phép/
    );
  });

  await runTest('1.8 Chấp nhận khi target khớp chính xác allowlist đã cấu hình', () => {
    restoreEnv();
    process.env.NODE_ENV = 'development';
    process.env.ALLOW_DATASET_SEED = 'true';
    process.env.DATASET_DB_ALLOWLIST = 'localhost:5432/apartment_demo, 127.0.0.1:5432/test_sandbox';

    const target1 = assertSafeDatabaseEnvironment(
      'postgresql://user:pass@localhost:5432/apartment_demo'
    );
    assert.strictEqual(target1.host, 'localhost');
    assert.strictEqual(target1.port, 5432);
    assert.strictEqual(target1.database, 'apartment_demo');

    const target2 = assertSafeDatabaseEnvironment(
      'postgresql://user:pass@127.0.0.1:5432/test_sandbox'
    );
    assert.strictEqual(target2.host, '127.0.0.1');
    assert.strictEqual(target2.port, 5432);
    assert.strictEqual(target2.database, 'test_sandbox');
  });

  await runTest('1.9 Từ chối target chứa từ khóa Production kể cả khi có trong allowlist', () => {
    restoreEnv();
    process.env.NODE_ENV = 'development';
    process.env.ALLOW_DATASET_SEED = 'true';
    process.env.DATASET_DB_ALLOWLIST = 'localhost:5432/prod_apartment, db-prod.corp:5432/demo';

    assert.throws(
      () =>
        assertSafeDatabaseEnvironment(
          'postgresql://user:pass@localhost:5432/prod_apartment'
        ),
      /Phát hiện dấu hiệu Production trong tên database/
    );

    assert.throws(
      () =>
        assertSafeDatabaseEnvironment(
          'postgresql://user:pass@db-prod.corp:5432/demo'
        ),
      /Phát hiện dấu hiệu Production trong hostname/
    );
  });

  await runTest('1.10 Không bao giờ mặc định localhost, postgres, apartment_db là an toàn nếu thiếu allowlist', () => {
    restoreEnv();
    process.env.NODE_ENV = 'development';
    process.env.ALLOW_DATASET_SEED = 'true';
    delete process.env.DATASET_DB_ALLOWLIST;

    assert.throws(
      () => assertSafeDatabaseEnvironment('postgresql://postgres:postgres@localhost:5432/postgres'),
      /Thiếu cấu hình allowlist database target/
    );

    assert.throws(
      () => assertSafeDatabaseEnvironment('postgresql://postgres:postgres@localhost:5432/apartment_db'),
      /Thiếu cấu hình allowlist database target/
    );
  });

  await runTest('1.11 Sanitize URL không để lộ username hoặc password', () => {
    const safeUrl = sanitizeDatabaseUrl('postgresql://admin:superSecretPassword123@myhost.internal:5432/my_demo_db');
    assert.strictEqual(safeUrl.includes('superSecretPassword123'), false, 'Không được để lộ password');
    assert.strictEqual(safeUrl.includes('admin:'), false, 'Không được để lộ username');
    assert.ok(safeUrl.includes('***:***@myhost.internal:5432/my_demo_db'));
  });

  await runTest('1.12 Không gọi Prisma write khi safety check thất bại', async () => {
    restoreEnv();
    process.env.NODE_ENV = 'production'; // Safety vi phạm
    process.env.ALLOW_DATASET_SEED = 'true';

    const mockClient = new MockPrismaClient();
    try {
      await executeSeed({
        prismaClient: mockClient,
        logger: () => {},
        databaseUrl: 'postgresql://postgres:pass@localhost:5432/apartment_demo',
        databaseAllowlist: 'localhost:5432/apartment_demo',
      });
      assert.fail('Phải ném lỗi khi safety thất bại');
    } catch {
      // Expected rejection
    }

    assert.strictEqual(mockClient.operations.length, 0, 'Tuyệt đối không có thao tác Prisma nào được gọi');
  });

  // =========================================================================
  // 2. KIỂM THỬ BẢO VỆ DỮ LIỆU HIỆN HỮU & NON-DESTRUCTIVE SEED (BLOCKER B & C)
  // =========================================================================
  console.log('--- 2. Kiểm thử Bảo vệ Dữ liệu Hiện hữu & Non-Destructive Seed (Blocker B & C) ---');

  await runTest('2.1 Từ chối seed (Fail-Closed) khi target database đã có dữ liệu trong bảng Room', async () => {
    restoreEnv();
    process.env.NODE_ENV = 'development';
    process.env.ALLOW_DATASET_SEED = 'true';

    const mockClient = new MockPrismaClient();
    // Giả lập database đã có 1 căn hộ của ứng dụng
    mockClient.rooms.push({ id: 1, roomNumber: '0101', floor: 1, area: 75, status: 'OCCUPIED' });

    await assert.rejects(
      async () => {
        await executeSeed({
          prismaClient: mockClient,
          logger: () => {},
          databaseUrl: 'postgresql://postgres:pass@localhost:5432/apartment_demo',
          databaseAllowlist: 'localhost:5432/apartment_demo',
        });
      },
      /Phát hiện dữ liệu hiện hữu trên database target.*Room: 1/
    );

    // Chứng minh không có bản ghi nào bị ghi đè hoặc tạo thêm
    assert.strictEqual(mockClient.rooms.length, 1, 'Bản ghi phòng hiện hữu không bị thay đổi');
    assert.strictEqual(mockClient.users.length, 0, 'Không có bản ghi User nào được tạo');
  });

  await runTest('2.2 Từ chối seed (Fail-Closed) khi target database đã có dữ liệu trong bảng User hoặc Invoice', async () => {
    restoreEnv();
    process.env.NODE_ENV = 'development';
    process.env.ALLOW_DATASET_SEED = 'true';

    const mockClient = new MockPrismaClient();
    // Giả lập database có 1 tài khoản quản trị viên ứng dụng
    mockClient.users.push({ id: 1, username: 'app_admin', role: Role.ADMIN });

    await assert.rejects(
      async () => {
        await executeSeed({
          prismaClient: mockClient,
          logger: () => {},
          databaseUrl: 'postgresql://postgres:pass@localhost:5432/apartment_demo',
          databaseAllowlist: 'localhost:5432/apartment_demo',
        });
      },
      /Phát hiện dữ liệu hiện hữu trên database target.*User: 1/
    );

    assert.strictEqual(mockClient.users.length, 1, 'Bản ghi User hiện hữu không bị thay đổi');
  });

  await runTest('2.3 Tuyệt đối không sử dụng upsert, update, findFirst trong quá trình seed', async () => {
    restoreEnv();
    process.env.NODE_ENV = 'development';
    process.env.ALLOW_DATASET_SEED = 'true';

    const mockClient = new MockPrismaClient();
    await executeSeed({
      prismaClient: mockClient,
      logger: () => {},
      databaseUrl: 'postgresql://postgres:pass@localhost:5432/apartment_demo',
      databaseAllowlist: 'localhost:5432/apartment_demo',
    });

    const nonCreateOps = mockClient.operations.filter(
      (o) => o.method === 'upsert' || o.method === 'update' || o.method === 'findFirst'
    );
    assert.strictEqual(
      nonCreateOps.length,
      0,
      'Tuyệt đối không dùng upsert, update, findFirst để tránh sửa nhầm dữ liệu ứng dụng'
    );
  });

  await runTest('2.4 Tuyệt đối không sử dụng deleteMany, delete hoặc TRUNCATE', async () => {
    restoreEnv();
    process.env.NODE_ENV = 'development';
    process.env.ALLOW_DATASET_SEED = 'true';

    const mockClient = new MockPrismaClient();
    await executeSeed({
      prismaClient: mockClient,
      logger: () => {},
      databaseUrl: 'postgresql://postgres:pass@localhost:5432/apartment_demo',
      databaseAllowlist: 'localhost:5432/apartment_demo',
    });

    const destructiveOps = mockClient.operations.filter(
      (o) => o.method.includes('delete') || o.method.includes('Raw')
    );
    assert.strictEqual(destructiveOps.length, 0, 'Tuyệt đối không có bất kỳ lệnh delete hoặc raw query nào');
  });

  await runTest('2.5 Mọi thao tác ghi dữ liệu chỉ sử dụng create thuần túy', async () => {
    restoreEnv();
    process.env.NODE_ENV = 'development';
    process.env.ALLOW_DATASET_SEED = 'true';

    const mockClient = new MockPrismaClient();
    await executeSeed({
      prismaClient: mockClient,
      logger: () => {},
      databaseUrl: 'postgresql://postgres:pass@localhost:5432/apartment_demo',
      databaseAllowlist: 'localhost:5432/apartment_demo',
    });

    for (const op of mockClient.operations) {
      assert.strictEqual(op.method, 'create', `Thao tác trên model ${op.model} phải là 'create'`);
    }
  });

  // =========================================================================
  // 3. KIỂM THỬ GIAO DỊCH CÓ TRẠNG THÁI & ROLLBACK (BLOCKER D)
  // =========================================================================
  console.log('--- 3. Kiểm thử Giao dịch có Trạng thái & Rollback (Blocker D) ---');

  await runTest('3.1 Xác minh tùy chọn transaction timeout: Bắt buộc đúng timeout: 60000', async () => {
    restoreEnv();
    process.env.NODE_ENV = 'development';
    process.env.ALLOW_DATASET_SEED = 'true';

    const mockClient = new MockPrismaClient();
    await executeSeed({
      prismaClient: mockClient,
      logger: () => {},
      databaseUrl: 'postgresql://postgres:pass@localhost:5432/apartment_demo',
      databaseAllowlist: 'localhost:5432/apartment_demo',
    });

    assert.ok(mockClient.transactionOptions, 'Transaction options phải được truyền vào $transaction');
    assert.strictEqual(mockClient.transactionOptions.timeout, 60000, 'Transaction timeout bắt buộc là 60000ms');
    assert.ok(mockClient.transactionOptions.maxWait >= 5000, 'maxWait phải tối thiểu 5000ms');
  });

  await runTest('3.2 Rollback khi lỗi tại Stage USER: Không để lại bản ghi Room nào trong database', async () => {
    restoreEnv();
    process.env.NODE_ENV = 'development';
    process.env.ALLOW_DATASET_SEED = 'true';

    const mockClient = new MockPrismaClient();
    mockClient.failAtStage = 'USER';

    await assert.rejects(async () => {
      await executeSeed({
        prismaClient: mockClient,
        logger: () => {},
        databaseUrl: 'postgresql://postgres:pass@localhost:5432/apartment_demo',
        databaseAllowlist: 'localhost:5432/apartment_demo',
      });
    });

    // Sau rollback: database state phải quay về rỗng
    assert.strictEqual(mockClient.rooms.length, 0, 'Bảng Room phải được rollback về 0 bản ghi');
    assert.strictEqual(mockClient.users.length, 0, 'Bảng User phải bằng 0');
  });

  await runTest('3.3 Rollback khi lỗi tại Stage INVOICE: Không để lại bản ghi Room hay User nào', async () => {
    restoreEnv();
    process.env.NODE_ENV = 'development';
    process.env.ALLOW_DATASET_SEED = 'true';

    const mockClient = new MockPrismaClient();
    mockClient.failAtStage = 'INVOICE';

    await assert.rejects(async () => {
      await executeSeed({
        prismaClient: mockClient,
        logger: () => {},
        databaseUrl: 'postgresql://postgres:pass@localhost:5432/apartment_demo',
        databaseAllowlist: 'localhost:5432/apartment_demo',
      });
    });

    assert.strictEqual(mockClient.rooms.length, 0, 'Bảng Room phải được rollback về 0 bản ghi');
    assert.strictEqual(mockClient.users.length, 0, 'Bảng User phải được rollback về 0 bản ghi');
    assert.strictEqual(mockClient.invoices.length, 0, 'Bảng Invoice phải bằng 0');
  });

  await runTest('3.4 Rollback khi lỗi tại Stage TICKET: Không để lại bản ghi rác nào', async () => {
    restoreEnv();
    process.env.NODE_ENV = 'development';
    process.env.ALLOW_DATASET_SEED = 'true';

    const mockClient = new MockPrismaClient();
    mockClient.failAtStage = 'TICKET';

    await assert.rejects(async () => {
      await executeSeed({
        prismaClient: mockClient,
        logger: () => {},
        databaseUrl: 'postgresql://postgres:pass@localhost:5432/apartment_demo',
        databaseAllowlist: 'localhost:5432/apartment_demo',
      });
    });

    assert.strictEqual(mockClient.rooms.length, 0);
    assert.strictEqual(mockClient.users.length, 0);
    assert.strictEqual(mockClient.invoices.length, 0);
    assert.strictEqual(mockClient.payments.length, 0);
    assert.strictEqual(mockClient.tickets.length, 0);
  });

  await runTest('3.5 Disconnect được gọi trong cả hai trường hợp thành công và thất bại', async () => {
    restoreEnv();
    process.env.NODE_ENV = 'development';
    process.env.ALLOW_DATASET_SEED = 'true';

    // Trường hợp 1: Thành công
    const mockClient1 = new MockPrismaClient();
    await executeSeed({
      prismaClient: mockClient1,
      logger: () => {},
      databaseUrl: 'postgresql://postgres:pass@localhost:5432/apartment_demo',
      databaseAllowlist: 'localhost:5432/apartment_demo',
    });
    assert.strictEqual(mockClient1.disconnectCalled, true, 'Disconnect phải được gọi khi thành công');

    // Trường hợp 2: Thất bại
    const mockClient2 = new MockPrismaClient();
    mockClient2.failAtStage = 'ROOM';
    try {
      await executeSeed({
        prismaClient: mockClient2,
        logger: () => {},
        databaseUrl: 'postgresql://postgres:pass@localhost:5432/apartment_demo',
        databaseAllowlist: 'localhost:5432/apartment_demo',
      });
    } catch {
      // Expected rejection
    }
    assert.strictEqual(mockClient2.disconnectCalled, true, 'Disconnect phải được gọi trong finally khi thất bại');
  });

  // =========================================================================
  // 4. KIỂM THỬ ÁNH XẠ ID TỪNG BẢN GHI (RECORD-BY-RECORD ID MAPPING - BLOCKER E)
  // =========================================================================
  console.log('--- 4. Kiểm thử Ánh xạ ID Từng Bản ghi (Record-by-Record ID Mapping - Blocker E) ---');

  await runTest('4.1 Kiểm thử ánh xạ ID từng bản ghi chi tiết trên toàn bộ 7 models', async () => {
    restoreEnv();
    process.env.NODE_ENV = 'development';
    process.env.ALLOW_DATASET_SEED = 'true';

    const mockClient = new MockPrismaClient();
    const result = await executeSeed({
      prismaClient: mockClient,
      logger: () => {},
      databaseUrl: 'postgresql://postgres:pass@localhost:5432/apartment_demo',
      databaseAllowlist: 'localhost:5432/apartment_demo',
    });

    assert.strictEqual(result.success, true);

    // Lấy lại dataset gốc nguồn để đối chiếu record-by-record
    const sourceDataset = generateEntireDataset({ seed: DATASET_CONFIG.RANDOM_SEED });

    // 1. Xây dựng bản đồ ID nguồn -> ID DB thực tế cho Room
    const roomSourceToDbMap = new Map<number, number>();
    for (let i = 0; i < sourceDataset.rooms.length; i++) {
      const src = sourceDataset.rooms[i];
      const db = mockClient.rooms[i];
      assert.strictEqual(src.roomNumber, db.roomNumber, 'roomNumber phải trùng khớp thứ tự');
      assert.strictEqual(db.id, 1000 + i + 1, 'ID DB Room phải mang ID tự tăng từ DB');
      roomSourceToDbMap.set(src.id, db.id);
    }

    // 2. Xây dựng bản đồ ID nguồn -> ID DB cho User và kiểm tra khóa ngoại roomId
    const userSourceToDbMap = new Map<number, number>();
    for (let i = 0; i < sourceDataset.users.length; i++) {
      const src = sourceDataset.users[i];
      const db = mockClient.users[i];
      assert.strictEqual(src.username, db.username);
      assert.strictEqual(db.id, 2000 + i + 1);
      userSourceToDbMap.set(src.id, db.id);

      if (src.roomId !== null) {
        const expectedDbRoomId = roomSourceToDbMap.get(src.roomId);
        assert.strictEqual(
          db.roomId,
          expectedDbRoomId,
          `User ${src.username} roomId phải trỏ chính xác DB ID của Room (${expectedDbRoomId})`
        );
      } else {
        assert.strictEqual(db.roomId, null);
      }
    }

    // 3. Xây dựng bản đồ ID nguồn -> ID DB cho Invoice và kiểm tra khóa ngoại roomId
    const invoiceSourceToDbMap = new Map<number, number>();
    for (let i = 0; i < sourceDataset.invoices.length; i++) {
      const src = sourceDataset.invoices[i];
      const db = mockClient.invoices[i];
      assert.strictEqual(db.id, 3000 + i + 1);
      invoiceSourceToDbMap.set(src.id, db.id);

      const expectedDbRoomId = roomSourceToDbMap.get(src.roomId);
      assert.strictEqual(
        db.roomId,
        expectedDbRoomId,
        `Invoice #${src.id} roomId phải trỏ chính xác DB ID của Room (${expectedDbRoomId})`
      );
    }

    // 4. Kiểm tra từng Payment: invoiceId phải khớp chính xác ID DB của Invoice tương ứng
    for (let i = 0; i < sourceDataset.payments.length; i++) {
      const src = sourceDataset.payments[i];
      const db = mockClient.payments[i];
      const expectedDbInvoiceId = invoiceSourceToDbMap.get(src.invoiceId);
      assert.strictEqual(
        db.invoiceId,
        expectedDbInvoiceId,
        `Payment #${src.id} invoiceId phải trỏ chính xác DB ID của Invoice (${expectedDbInvoiceId})`
      );
    }

    // 5. Kiểm tra từng Ticket: residentId, technicianId, roomId phải khớp chính xác ID DB
    for (let i = 0; i < sourceDataset.tickets.length; i++) {
      const src = sourceDataset.tickets[i];
      const db = mockClient.tickets[i];

      const expectedResidentId = userSourceToDbMap.get(src.residentId);
      assert.strictEqual(db.residentId, expectedResidentId, 'Ticket residentId phải khớp DB User ID');

      if (src.technicianId !== null) {
        const expectedTechId = userSourceToDbMap.get(src.technicianId);
        assert.strictEqual(db.technicianId, expectedTechId, 'Ticket technicianId phải khớp DB User ID');
      } else {
        assert.strictEqual(db.technicianId, null);
      }

      if (src.roomId !== null) {
        const expectedRoomId = roomSourceToDbMap.get(src.roomId);
        assert.strictEqual(db.roomId, expectedRoomId, 'Ticket roomId phải khớp DB Room ID');
      } else {
        assert.strictEqual(db.roomId, null);
      }
    }

    // 6. Kiểm tra từng Feedback: residentId và roomId
    for (let i = 0; i < sourceDataset.feedbacks.length; i++) {
      const src = sourceDataset.feedbacks[i];
      const db = mockClient.feedbacks[i];

      const expectedResidentId = userSourceToDbMap.get(src.residentId);
      assert.strictEqual(db.residentId, expectedResidentId, 'Feedback residentId phải khớp DB User ID');

      if (src.roomId !== null) {
        const expectedRoomId = roomSourceToDbMap.get(src.roomId);
        assert.strictEqual(db.roomId, expectedRoomId, 'Feedback roomId phải khớp DB Room ID');
      } else {
        assert.strictEqual(db.roomId, null);
      }
    }

    // 7. Kiểm tra từng Notification: authorId và targetRoom
    for (let i = 0; i < sourceDataset.notifications.length; i++) {
      const src = sourceDataset.notifications[i];
      const db = mockClient.notifications[i];

      if (src.authorId !== null) {
        const expectedAuthorId = userSourceToDbMap.get(src.authorId);
        assert.strictEqual(db.authorId, expectedAuthorId, 'Notification authorId phải khớp DB User ID');
      } else {
        assert.strictEqual(db.authorId, null);
      }

      assert.strictEqual(db.targetRoom, src.targetRoom, 'targetRoom phải giữ nguyên chuỗi roomNumber');
    }
  });

  // =========================================================================
  // 5. KIỂM THỬ TÍNH ĐƠN ĐỊNH, PRE-WRITE VALIDATION & ZERO-ASSET
  // =========================================================================
  console.log('--- 5. Kiểm thử Tính Đơn định, Pre-write Validation & Zero-Asset ---');

  await runTest('5.1 Tính đơn định: Cùng seed sinh dataset hoàn toàn giống nhau 100%', () => {
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

  await runTest('5.2 Pre-write validation chặn đứng dữ liệu sai trước khi chạm database', () => {
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
    assert.throws(
      () => validateDatasetBeforeWrite(fakeMediaDataset),
      /Số lượng MediaAsset.*vượt quá giới hạn cho phép/
    );

    // 3. Vi phạm trùng lặp username -> FAIL
    const duplicateUserDataset: EntireDataset = {
      ...validDataset,
      users: validDataset.users.map((u, idx) =>
        idx === 1 ? { ...u, username: validDataset.users[0].username } : u
      ),
    };
    assert.throws(() => validateDatasetBeforeWrite(duplicateUserDataset), /username bị trùng lặp/);
  });

  await runTest('5.3 Zero MediaAsset bảo đảm 100%: MediaAsset count = 0 và không có lệnh ghi nào', async () => {
    restoreEnv();
    process.env.NODE_ENV = 'development';
    process.env.ALLOW_DATASET_SEED = 'true';

    const mockClient = new MockPrismaClient();
    const result = await executeSeed({
      prismaClient: mockClient,
      logger: () => {},
      databaseUrl: 'postgresql://postgres:pass@localhost:5432/apartment_demo',
      databaseAllowlist: 'localhost:5432/apartment_demo',
    });

    const mediaOps = mockClient.operations.filter((o) => o.model === 'MediaAsset');
    assert.strictEqual(mediaOps.length, 0, 'Thao tác MediaAsset trên database phải bằng 0');
    assert.strictEqual(result.counts.mediaAssets, 0, 'MediaAsset count trong kết quả phải bằng 0');
    assert.strictEqual(mockClient.mediaAssets.length, 0, 'Bảng MediaAsset trong database phải rỗng');
  });

  restoreEnv();

  console.log('======================================================');
  console.log(`🎉 TOÀN BỘ ${passedTests}/${totalTests} TESTS M9.1 ĐẠT CHUẨN!`);
  console.log('======================================================');
}

runAllTests().catch(() => {
  process.exit(1);
});
