// =========================================================================
// INTEGRATION TEST SETUP & SAFETY HARNESS
// Phụ trách: Senior Backend Engineer
// Mục đích: Xác minh an toàn tuyệt đối kết nối Database trước khi chạy test,
//           cung cấp ResourceTracker để theo dõi và dọn dẹp dữ liệu fixture.
// =========================================================================
import { URL } from 'url';

/**
 * Lớp theo dõi và dọn dẹp tài nguyên (ResourceTracker)
 * Theo dõi chính xác ID của mọi bản ghi do test sinh ra,
 * bảo đảm dọn dẹp theo đúng thứ tự phân cấp khóa ngoại (Foreign Key Hierarchy).
 */
export class ResourceTracker {
  private paymentIds: number[] = [];
  private invoiceIds: number[] = [];
  private ticketIds: number[] = [];
  private feedbackIds: number[] = [];
  private notificationIds: number[] = [];
  private userIds: number[] = [];
  private roomIds: number[] = [];

  trackPayment(id: number): void {
    if (id && !this.paymentIds.includes(id)) {
      this.paymentIds.push(id);
    }
  }

  trackInvoice(id: number): void {
    if (id && !this.invoiceIds.includes(id)) {
      this.invoiceIds.push(id);
    }
  }

  trackTicket(id: number): void {
    if (id && !this.ticketIds.includes(id)) {
      this.ticketIds.push(id);
    }
  }

  trackFeedback(id: number): void {
    if (id && !this.feedbackIds.includes(id)) {
      this.feedbackIds.push(id);
    }
  }

  trackNotification(id: number): void {
    if (id && !this.notificationIds.includes(id)) {
      this.notificationIds.push(id);
    }
  }

  trackUser(id: number): void {
    if (id && !this.userIds.includes(id)) {
      this.userIds.push(id);
    }
  }

  trackRoom(id: number): void {
    if (id && !this.roomIds.includes(id)) {
      this.roomIds.push(id);
    }
  }

  getTrackedCount(): { payments: number; invoices: number; tickets: number; feedbacks: number; notifications: number; users: number; rooms: number } {
    return {
      payments: this.paymentIds.length,
      invoices: this.invoiceIds.length,
      tickets: this.ticketIds.length,
      feedbacks: this.feedbackIds.length,
      notifications: this.notificationIds.length,
      users: this.userIds.length,
      rooms: this.roomIds.length,
    };
  }

  /**
   * Dọn dẹp dữ liệu an toàn theo thứ tự ngược của cây khóa ngoại (Foreign Key Hierarchy):
   * 1. Payment (phụ thuộc Invoice qua invoiceId)
   * 2. Invoice (phụ thuộc Room qua roomId)
   * 3. Ticket (phụ thuộc Room qua roomId, User qua residentId và technicianId)
   * 4. Feedback (phụ thuộc Room qua roomId, User qua residentId)
   * 5. User (phụ thuộc Room qua roomId)
   * 6. Room (gốc của quan hệ)
   */
  async cleanup(prisma: any): Promise<{
    cleanedPayments: number;
    cleanedInvoices: number;
    cleanedTickets: number;
    cleanedFeedbacks: number;
    cleanedNotifications: number;
    cleanedUsers: number;
    cleanedRooms: number;
    failed: any[];
  }> {
    const failed: any[] = [];
    let cleanedPayments = 0;
    let cleanedInvoices = 0;
    let cleanedTickets = 0;
    let cleanedFeedbacks = 0;
    let cleanedNotifications = 0;
    let cleanedUsers = 0;
    let cleanedRooms = 0;

    // 1. Xóa Payments trước
    for (const id of [...this.paymentIds].reverse()) {
      try {
        await prisma.payment.delete({ where: { id } });
        cleanedPayments++;
      } catch (err: any) {
        if (err.code !== 'P2025') {
          failed.push({ type: 'Payment', id, error: err.message });
        }
      }
    }

    // 2. Xóa Invoices tiếp theo
    for (const id of [...this.invoiceIds].reverse()) {
      try {
        await prisma.invoice.delete({ where: { id } });
        cleanedInvoices++;
      } catch (err: any) {
        if (err.code !== 'P2025') {
          failed.push({ type: 'Invoice', id, error: err.message });
        }
      }
    }

    // 3. Xóa Tickets trước khi xóa User và Room
    for (const id of [...this.ticketIds].reverse()) {
      try {
        await prisma.ticket.delete({ where: { id } });
        cleanedTickets++;
      } catch (err: any) {
        if (err.code !== 'P2025') {
          failed.push({ type: 'Ticket', id, error: err.message });
        }
      }
    }

    // 4. Xóa Feedbacks trước khi xóa User và Room
    for (const id of [...this.feedbackIds].reverse()) {
      try {
        await prisma.feedback.delete({ where: { id } });
        cleanedFeedbacks++;
      } catch (err: any) {
        if (err.code !== 'P2025') {
          failed.push({ type: 'Feedback', id, error: err.message });
        }
      }
    }

    // 5. Xóa Notifications trước khi xóa User
    for (const id of [...this.notificationIds].reverse()) {
      try {
        await prisma.notification.delete({ where: { id } });
        cleanedNotifications++;
      } catch (err: any) {
        if (err.code !== 'P2025') {
          failed.push({ type: 'Notification', id, error: err.message });
        }
      }
    }

    // 6. Xóa Users
    for (const id of [...this.userIds].reverse()) {
      try {
        await prisma.user.delete({ where: { id } });
        cleanedUsers++;
      } catch (err: any) {
        if (err.code !== 'P2025') {
          failed.push({ type: 'User', id, error: err.message });
        }
      }
    }

    // 7. Xóa Rooms sau cùng
    for (const id of [...this.roomIds].reverse()) {
      try {
        await prisma.room.delete({ where: { id } });
        cleanedRooms++;
      } catch (err: any) {
        if (err.code !== 'P2025') {
          failed.push({ type: 'Room', id, error: err.message });
        }
      }
    }

    this.paymentIds = [];
    this.invoiceIds = [];
    this.ticketIds = [];
    this.feedbackIds = [];
    this.notificationIds = [];
    this.userIds = [];
    this.roomIds = [];

    if (failed.length > 0) {
      throw new Error(`[SAFETY CLEANUP FAILURE] Có lỗi khi dọn dẹp bản ghi test: ${JSON.stringify(failed)}`);
    }

    return { cleanedPayments, cleanedInvoices, cleanedTickets, cleanedFeedbacks, cleanedNotifications, cleanedUsers, cleanedRooms, failed };
  }
}

/**
 * Safety Guard (Fail-Closed):
 * Xác minh URL trong biến môi trường và kết nối thực tế tới PostgreSQL container
 * trước khi cho phép nạp router hoặc thực hiện bất kỳ thao tác ghi nào.
 */
export async function runSafetyGuard(): Promise<any> {
  const rawUrl = process.env.DATABASE_URL;

  // 1. Kiểm tra sự tồn tại của biến môi trường
  if (!rawUrl || typeof rawUrl !== 'string' || !rawUrl.trim()) {
    console.error('❌ [SAFETY GUARD FAILED]: DATABASE_URL chưa được thiết lập trong biến môi trường của tiến trình!');
    console.error('   Yêu cầu thiết lập DATABASE_URL trỏ vào apartment_test trước khi chạy integration test.');
    process.exit(1);
  }

  if (rawUrl !== rawUrl.trim()) {
    console.error('❌ [SAFETY GUARD FAILED]: DATABASE_URL chứa khoảng trắng không hợp lệ!');
    process.exit(1);
  }

  // 2. Phân tích cấu trúc URL bằng URL Parser tiêu chuẩn
  let parsed: URL;
  try {
    parsed = new URL(rawUrl);
  } catch (err: any) {
    console.error('❌ [SAFETY GUARD FAILED]: DATABASE_URL không đúng định dạng URL hợp lệ!');
    process.exit(1);
  }

  // 3. Rà soát nghiêm ngặt từng thành phần kết nối (Không in mật khẩu ra log)
  const isProtocolValid = parsed.protocol === 'postgresql:' || parsed.protocol === 'postgres:';
  const isHostValid = parsed.hostname === '127.0.0.1' || parsed.hostname === 'localhost';
  const isPortValid = parsed.port === '5432';
  const isDatabaseValid = parsed.pathname === '/apartment_test';
  const isUserValid = parsed.username === 'test_app_user';

  // Chống Parameter Pollution: Tham số schema chỉ được xuất hiện đúng 1 lần và không có tham số lạ
  const schemaValues = parsed.searchParams.getAll('schema');
  const isSchemaSingle = schemaValues.length === 1 && schemaValues[0] === 'public';
  const searchKeys = Array.from(parsed.searchParams.keys());
  const hasOnlyAllowedParams = searchKeys.every((key) => key === 'schema');
  const isSchemaValid = isSchemaSingle && hasOnlyAllowedParams;

  if (!isProtocolValid || !isHostValid || !isPortValid || !isDatabaseValid || !isUserValid || !isSchemaValid) {
    console.error('❌ [SAFETY GUARD FAILED]: Cấu hình kết nối KHÔNG khớp với PostgreSQL test container được phê duyệt!');
    console.error(`   - Protocol hợp lệ: ${isProtocolValid}`);
    console.error(`   - Hostname hợp lệ (127.0.0.1/localhost): ${isHostValid} [${parsed.hostname}]`);
    console.error(`   - Port hợp lệ (5432): ${isPortValid} [${parsed.port}]`);
    console.error(`   - Database hợp lệ (/apartment_test): ${isDatabaseValid} [${parsed.pathname}]`);
    console.error(`   - Username hợp lệ (test_app_user - Least Privilege): ${isUserValid} [${parsed.username}]`);
    console.error(`   - Schema hợp lệ (duy nhất schema=public, không có tham số lạ): ${isSchemaValid} [params: ${searchKeys.join(',')}]`);
    console.error('   Dừng toàn bộ tiến trình test ngay lập tức để bảo vệ dữ liệu!');
    process.exit(1);
  }

  // 4. Chỉ sau khi URL đạt chuẩn, mới dynamic import PrismaClient Singleton
  const prisma = (await import('../database/prisma')).default;

  // 5. Xác minh qua kết nối thực tế trên PostgreSQL Catalog (Xác nhận Least Privilege)
  try {
    await prisma.$connect();
    const rows = await prisma.$queryRaw<Array<{ current_database: string; current_user: string; is_superuser: boolean }>>`
      SELECT current_database(), current_user, (SELECT rolsuper FROM pg_roles WHERE rolname = current_user) AS is_superuser;
    `;

    const liveDb = rows[0]?.current_database;
    const liveUser = rows[0]?.current_user;
    const isSuperuser = rows[0]?.is_superuser;

    if (liveDb !== 'apartment_test' || liveUser !== 'test_app_user' || isSuperuser === true) {
      console.error(
        `❌ [SAFETY GUARD FAILED]: Kết nối thực tế không đạt yêu cầu Least Privilege! (Thực tế: DB=${liveDb}, User=${liveUser}, Superuser=${isSuperuser})`
      );
      await prisma.$disconnect();
      process.exit(1);
    }
  } catch (dbErr: any) {
    console.error('❌ [SAFETY GUARD FAILED]: Không thể kết nối hoặc xác minh PostgreSQL container:', dbErr.message);
    try {
      await prisma.$disconnect();
    } catch {}
    process.exit(1);
  }

  return prisma;
}
