// =========================================================================
// KIỂM THỬ ĐƠN VỊ RESOURCE TRACKER (CLEANUP & TRACKING HARNESS)
// Phụ trách: Senior Backend Engineer
// Mục tiêu:
// 1. Xác minh ResourceTracker theo dõi chính xác mediaAssets và 7 thực thể khác
// 2. getTrackedCount() báo cáo đầy đủ cả 8 loại tài nguyên bao gồm mediaAssets
// 3. cleanup() dọn dẹp theo đúng thứ tự phân cấp khóa ngoại (MediaAssets trước Tickets, Users)
// 4. cleanup() trả về cleanedMediaAssets và danh sách failed đúng cấu trúc
// =========================================================================
import { ResourceTracker } from './integration-setup';

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
console.log('🧪 BẮT ĐẦU CHẠY KIỂM THỬ CHO RESOURCE TRACKER');
console.log('======================================================\n');

async function runAllTests() {
  // -------------------------------------------------------------------------
  // 1. KIỂM THỬ THEO DÕI & ĐẾM TÀI NGUYÊN (TRACKING & DEDUPLICATION)
  // -------------------------------------------------------------------------
  console.log('1. Kiểm thử Đăng Ký Tài Nguyên & getTrackedCount:');
  {
    const tracker = new ResourceTracker();

    // Ban đầu tất cả phải bằng 0
    const initialCounts = tracker.getTrackedCount();
    assert(initialCounts.mediaAssets === 0, 'Ban đầu mediaAssets = 0');
    assert(initialCounts.payments === 0, 'Ban đầu payments = 0');
    assert(initialCounts.invoices === 0, 'Ban đầu invoices = 0');
    assert(initialCounts.tickets === 0, 'Ban đầu tickets = 0');
    assert(initialCounts.feedbacks === 0, 'Ban đầu feedbacks = 0');
    assert(initialCounts.notifications === 0, 'Ban đầu notifications = 0');
    assert(initialCounts.users === 0, 'Ban đầu users = 0');
    assert(initialCounts.rooms === 0, 'Ban đầu rooms = 0');

    // Đăng ký các tài nguyên
    tracker.trackPayment(101);
    tracker.trackPayment(102);
    tracker.trackInvoice(201);
    tracker.trackMediaAsset(301);
    tracker.trackMediaAsset(302);
    tracker.trackMediaAsset(303);
    tracker.trackTicket(401);
    tracker.trackFeedback(501);
    tracker.trackNotification(601);
    tracker.trackUser(701);
    tracker.trackRoom(801);

    const counts = tracker.getTrackedCount();
    assert(counts.mediaAssets === 3, 'getTrackedCount() báo cáo chính xác mediaAssets = 3');
    assert(counts.payments === 2, 'payments = 2');
    assert(counts.invoices === 1, 'invoices = 1');
    assert(counts.tickets === 1, 'tickets = 1');
    assert(counts.feedbacks === 1, 'feedbacks = 1');
    assert(counts.notifications === 1, 'notifications = 1');
    assert(counts.users === 1, 'users = 1');
    assert(counts.rooms === 1, 'rooms = 1');

    // Kiểm thử chống trùng lặp (Deduplication)
    tracker.trackMediaAsset(301);
    tracker.trackMediaAsset(302);
    const dedupCounts = tracker.getTrackedCount();
    assert(dedupCounts.mediaAssets === 3, 'Chống trùng: Đăng ký lại ID đã tồn tại không làm tăng mediaAssets');

    // Kiểm thử bỏ qua ID không hợp lệ (0 hoặc null/undefined)
    tracker.trackMediaAsset(0);
    tracker.trackMediaAsset(null as any);
    tracker.trackMediaAsset(undefined as any);
    const filteredCounts = tracker.getTrackedCount();
    assert(filteredCounts.mediaAssets === 3, 'Bỏ qua ID không hợp lệ (0, null, undefined)');
  }

  // -------------------------------------------------------------------------
  // 2. KIỂM THỬ QUY TRÌNH CLEANUP & THỨ TỰ PHÂN CẤP KHÓA NGOẠI
  // -------------------------------------------------------------------------
  console.log('\n2. Kiểm thử Cleanup & Phân Cấp Khóa Ngoại (Foreign Key Hierarchy):');
  {
    const tracker = new ResourceTracker();
    tracker.trackPayment(1);
    tracker.trackInvoice(10);
    tracker.trackMediaAsset(100);
    tracker.trackMediaAsset(101);
    tracker.trackTicket(1000);
    tracker.trackFeedback(2000);
    tracker.trackNotification(3000);
    tracker.trackUser(4000);
    tracker.trackRoom(5000);

    const deletionOrder: string[] = [];

    // Tạo mock prisma để ghi nhận thứ tự gọi hàm delete
    const mockPrisma: any = {
      payment: {
        delete: async ({ where }: any) => {
          deletionOrder.push(`Payment:${where.id}`);
          return { id: where.id };
        },
      },
      invoice: {
        delete: async ({ where }: any) => {
          deletionOrder.push(`Invoice:${where.id}`);
          return { id: where.id };
        },
      },
      mediaAsset: {
        delete: async ({ where }: any) => {
          deletionOrder.push(`MediaAsset:${where.id}`);
          return { id: where.id };
        },
      },
      ticket: {
        delete: async ({ where }: any) => {
          deletionOrder.push(`Ticket:${where.id}`);
          return { id: where.id };
        },
      },
      feedback: {
        delete: async ({ where }: any) => {
          deletionOrder.push(`Feedback:${where.id}`);
          return { id: where.id };
        },
      },
      notification: {
        delete: async ({ where }: any) => {
          deletionOrder.push(`Notification:${where.id}`);
          return { id: where.id };
        },
      },
      user: {
        delete: async ({ where }: any) => {
          deletionOrder.push(`User:${where.id}`);
          return { id: where.id };
        },
      },
      room: {
        delete: async ({ where }: any) => {
          deletionOrder.push(`Room:${where.id}`);
          return { id: where.id };
        },
      },
    };

    const cleanupSummary = await tracker.cleanup(mockPrisma);

    // Kiểm tra số lượng đã dọn dẹp trả về trong kết quả
    assert(cleanupSummary.cleanedMediaAssets === 2, 'cleanup() trả về đúng cleanedMediaAssets = 2');
    assert(cleanupSummary.cleanedPayments === 1, 'cleanedPayments = 1');
    assert(cleanupSummary.cleanedInvoices === 1, 'cleanedInvoices = 1');
    assert(cleanupSummary.cleanedTickets === 1, 'cleanedTickets = 1');
    assert(cleanupSummary.cleanedFeedbacks === 1, 'cleanedFeedbacks = 1');
    assert(cleanupSummary.cleanedNotifications === 1, 'cleanedNotifications = 1');
    assert(cleanupSummary.cleanedUsers === 1, 'cleanedUsers = 1');
    assert(cleanupSummary.cleanedRooms === 1, 'cleanedRooms = 1');
    assert(cleanupSummary.failed.length === 0, 'failed rỗng khi dọn dẹp thành công');

    // Kiểm tra thứ tự dọn dẹp:
    // Payments -> Invoices -> MediaAssets -> Tickets -> Feedbacks -> Notifications -> Users -> Rooms
    const paymentIdx = deletionOrder.findIndex((x) => x.startsWith('Payment:'));
    const invoiceIdx = deletionOrder.findIndex((x) => x.startsWith('Invoice:'));
    const mediaAssetIdx = deletionOrder.findIndex((x) => x.startsWith('MediaAsset:'));
    const ticketIdx = deletionOrder.findIndex((x) => x.startsWith('Ticket:'));
    const userIdx = deletionOrder.findIndex((x) => x.startsWith('User:'));
    const roomIdx = deletionOrder.findIndex((x) => x.startsWith('Room:'));

    assert(paymentIdx < invoiceIdx, 'Payment được xóa trước Invoice');
    assert(invoiceIdx < mediaAssetIdx, 'Invoice được xóa trước MediaAsset');
    assert(mediaAssetIdx < ticketIdx, 'MediaAsset được xóa trước Ticket (tránh FK violation)');
    assert(ticketIdx < userIdx, 'Ticket được xóa trước User');
    assert(userIdx < roomIdx, 'User được xóa trước Room');

    // Sau cleanup, toàn bộ ID được reset về 0
    const postCleanupCounts = tracker.getTrackedCount();
    assert(postCleanupCounts.mediaAssets === 0, 'Sau cleanup: mediaAssets = 0');
    assert(postCleanupCounts.tickets === 0, 'Sau cleanup: tickets = 0');
    assert(postCleanupCounts.rooms === 0, 'Sau cleanup: rooms = 0');
  }

  // -------------------------------------------------------------------------
  // 3. KIỂM THỬ XỬ LÝ LỖI P2025 VÀ NGOẠI LỆ KHI CLEANUP
  // -------------------------------------------------------------------------
  console.log('\n3. Kiểm thử Xử Lý Lỗi P2025 (Record Already Deleted) & Exception:');
  {
    const tracker = new ResourceTracker();
    tracker.trackMediaAsset(999);

    // Mock prisma ném lỗi P2025 (Bản ghi đã được xóa trước đó)
    const mockPrismaP2025: any = {
      payment: { delete: async () => {} },
      invoice: { delete: async () => {} },
      mediaAsset: {
        delete: async () => {
          const err: any = new Error('Record to delete does not exist.');
          err.code = 'P2025';
          throw err;
        },
      },
      ticket: { delete: async () => {} },
      feedback: { delete: async () => {} },
      notification: { delete: async () => {} },
      user: { delete: async () => {} },
      room: { delete: async () => {} },
    };

    const summary = await tracker.cleanup(mockPrismaP2025);
    assert(summary.cleanedMediaAssets === 0, 'P2025 không tăng cleanedMediaAssets');
    assert(summary.failed.length === 0, 'P2025 được bỏ qua an toàn, không tính vào failed');

    // Mock prisma ném lỗi không phải P2025 (ví dụ lỗi kết nối hoặc DB)
    tracker.trackMediaAsset(888);
    const mockPrismaFatal: any = {
      payment: { delete: async () => {} },
      invoice: { delete: async () => {} },
      mediaAsset: {
        delete: async () => {
          const err: any = new Error('Database connection lost during cleanup');
          err.code = 'P1001';
          throw err;
        },
      },
      ticket: { delete: async () => {} },
      feedback: { delete: async () => {} },
      notification: { delete: async () => {} },
      user: { delete: async () => {} },
      room: { delete: async () => {} },
    };

    let caughtError: any = null;
    try {
      await tracker.cleanup(mockPrismaFatal);
    } catch (err: any) {
      caughtError = err;
    }

    assert(caughtError !== null, 'Ném ngoại lệ khi có lỗi xóa thực sự (không phải P2025)');
    assert(
      caughtError.message.includes('[SAFETY CLEANUP FAILURE]'),
      'Thông điệp lỗi chứa [SAFETY CLEANUP FAILURE]'
    );
  }

  // -------------------------------------------------------------------------
  // TỔNG KẾT
  // -------------------------------------------------------------------------
  console.log('\n======================================================');
  console.log(`📊 TỔNG KẾT KIỂM THỬ RESOURCE TRACKER: ${passCount} ĐẠT (PASS) | ${failCount} THẤT BẠI (FAIL)`);
  console.log('======================================================\n');

  if (failCount > 0) {
    process.exit(1);
  }
}

runAllTests().catch((err) => {
  console.error('Lỗi không xử lý được trong bộ kiểm thử ResourceTracker:', err);
  process.exit(1);
});
