// =========================================================================
// RUNNER KIỂM THỬ TÍCH HỢP TOÀN HỆ THỐNG (INTEGRATION TEST RUNNER)
// Phụ trách: Senior Backend Engineer
// Mục tiêu: Entry point duy nhất chạy Integration Tests an toàn trên PostgreSQL thật.
// Nguyên tắc: Chạy Safety Guard kiểm tra fail-closed TRƯỚC TIÊN,
//             tuyệt đối không static import Prisma/Router trước khi Guard hoàn thành.
// =========================================================================
import { runSafetyGuard, ResourceTracker } from './integration-setup';

async function main() {
  console.log('\n===================================================================');
  console.log('🚀 KHỞI ĐỘNG INTEGRATION TEST RUNNER TRÊN POSTGRESQL 16 THẬT');
  console.log('===================================================================\n');

  // BƯỚC 1: CHẠY SAFETY GUARD KIỂM TRA MÔI TRƯỜNG & KẾT NỐI (FAIL-CLOSED)
  console.log('🛡️  BƯỚC 1: Thực thi Safety Guard kiểm tra an toàn kết nối...');
  const prisma = await runSafetyGuard();
  console.log('✅ Safety Guard xác thực thành công: Đang kết nối tới đúng PostgreSQL test container (apartment_test)!\n');

  const tracker = new ResourceTracker();
  let totalPassed = 0;
  let totalFailed = 0;

  try {
    // BƯỚC 2: DYNAMIC IMPORT VÀ CHẠY AUTH INTEGRATION TESTS
    console.log('📦 BƯỚC 2A: Nạp và chạy phân hệ Auth Integration Tests...');
    const { runAuthIntegrationTests } = await import('../modules/auth/auth.integration.test');
    const authResult = await runAuthIntegrationTests(prisma, tracker);

    totalPassed += authResult.passed;
    totalFailed += authResult.failed;

    // BƯỚC 2B: DYNAMIC IMPORT VÀ CHẠY INVOICES INTEGRATION TESTS
    console.log('📦 BƯỚC 2B: Nạp và chạy phân hệ Invoices Integration Tests...');
    const { runInvoicesIntegrationTests } = await import('../modules/invoices/invoices.integration.test');
    const invoicesResult = await runInvoicesIntegrationTests(prisma, tracker);

    totalPassed += invoicesResult.passed;
    totalFailed += invoicesResult.failed;

    // BƯỚC 2C: DYNAMIC IMPORT VÀ CHẠY TICKETS INTEGRATION TESTS
    console.log('📦 BƯỚC 2C: Nạp và chạy phân hệ Tickets Integration Tests...');
    const { runTicketsIntegrationTests } = await import('../modules/tickets/tickets.integration.test');
    const ticketsResult = await runTicketsIntegrationTests(prisma, tracker);

    totalPassed += ticketsResult.passed;
    totalFailed += ticketsResult.failed;

    // BƯỚC 2D: DYNAMIC IMPORT VÀ CHẠY FEEDBACK INTEGRATION TESTS
    console.log('📦 BƯỚC 2D: Nạp và chạy phân hệ Feedback Integration Tests...');
    const { runFeedbackIntegrationTests } = await import('../modules/feedback/feedback.integration.test');
    const feedbackResult = await runFeedbackIntegrationTests(prisma, tracker);

    totalPassed += feedbackResult.passed;
    totalFailed += feedbackResult.failed;

    // BƯỚC 2E: DYNAMIC IMPORT VÀ CHẠY USERS INTEGRATION TESTS
    console.log('📦 BƯỚC 2E: Nạp và chạy phân hệ Users Integration Tests...');
    const { runUsersIntegrationTests } = await import('../modules/users/users.integration.test');
    const usersResult = await runUsersIntegrationTests(prisma, tracker);

    totalPassed += usersResult.passed;
    totalFailed += usersResult.failed;

    // BƯỚC 2F: DYNAMIC IMPORT VÀ CHẠY ROOMS INTEGRATION TESTS
    console.log('📦 BƯỚC 2F: Nạp và chạy phân hệ Rooms Integration Tests...');
    const { runRoomsIntegrationTests } = await import('../modules/rooms/rooms.integration.test');
    const roomsResult = await runRoomsIntegrationTests(prisma, tracker);

    totalPassed += roomsResult.passed;
    totalFailed += roomsResult.failed;

    // BƯỚC 2G: DYNAMIC IMPORT VÀ CHẠY NOTIFICATIONS INTEGRATION TESTS
    console.log('📦 BƯỚC 2G: Nạp và chạy phân hệ Notifications Integration Tests...');
    const { runNotificationsIntegrationTests } = await import('../modules/notifications/notifications.integration.test');
    const notificationsResult = await runNotificationsIntegrationTests(prisma, tracker);

    totalPassed += notificationsResult.passed;
    totalFailed += notificationsResult.failed;

    // BƯỚC 2H: DYNAMIC IMPORT VÀ CHẠY MEDIA UPLOAD INTEGRATION TESTS
    console.log('📦 BƯỚC 2H: Nạp và chạy phân hệ Media Upload Integration Tests...');
    const { runMediaIntegrationTests } = await import('../modules/media/media.integration.test');
    const mediaResult = await runMediaIntegrationTests(prisma, tracker);

    totalPassed += mediaResult.passed;
    totalFailed += mediaResult.failed;
  } catch (testError: any) {
    console.error('❌ Ngoại lệ nghiêm trọng trong quá trình chạy test:', testError);
    totalFailed++;
  } finally {
    // BƯỚC 3: DỌN DẸP TOÀN BỘ FIXTURE DỮ LIỆU ĐÃ TẠO THEO THỨ TỰ KHÓA NGOẠI
    console.log('🧹 BƯỚC 3: Thực hiện dọn dẹp dữ liệu fixtures (Cleanup)...');
    try {
      const cleanupSummary = await tracker.cleanup(prisma);
      console.log(
        `✅ Cleanup hoàn tất: Đã xóa an toàn ${cleanupSummary.cleanedPayments} Payments, ${cleanupSummary.cleanedInvoices} Invoices, ${cleanupSummary.cleanedTickets} Tickets, ${cleanupSummary.cleanedFeedbacks} Feedbacks, ${cleanupSummary.cleanedNotifications} Notifications, ${cleanupSummary.cleanedUsers} Users, và ${cleanupSummary.cleanedRooms} Rooms do test tạo ra.`
      );
    } catch (cleanupError: any) {
      console.error('❌ LỖI TRONG QUÁ TRÌNH CLEANUP:', cleanupError.message);
      totalFailed++;
    }

    // Đóng kết nối Prisma
    try {
      await prisma.$disconnect();
    } catch {
      // Bỏ qua lỗi đóng kết nối
    }
  }

  // TỔNG KẾT
  console.log('\n===================================================================');
  console.log(`🏁 TỔNG KẾT INTEGRATION TESTS: ${totalPassed} ĐẠT (PASS) | ${totalFailed} THẤT BẠI (FAIL)`);
  console.log('===================================================================\n');

  if (totalFailed > 0) {
    process.exit(1);
  } else {
    process.exit(0);
  }
}

main().catch((fatalError) => {
  console.error('❌ Lỗi không xử lý được tại Entry Point Runner:', fatalError);
  process.exit(1);
});
