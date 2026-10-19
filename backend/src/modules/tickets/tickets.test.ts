// =========================================================================
// KIỂM THỬ ĐƠN VỊ & BẢO ĐẢM TÍNH TOÀN VẸN MODULE TICKETS
// Chạy bằng: npx ts-node src/modules/tickets/tickets.test.ts
// =========================================================================
import { TicketStatus, Role } from '@prisma/client';
import {
  isValidTicketStatus,
  canTransitionTicketStatus,
  validateTicketInput,
  validateRatingInput,
} from './tickets.validator';
import { isValidMediaUrl, sanitizeMaterials, containsBase64Payload } from '../../common/utils/validation';

let passCount = 0;
let failCount = 0;

function assert(condition: boolean, testName: string) {
  if (condition) {
    console.log(`  ✅ [PASS] ${testName}`);
    passCount++;
  } else {
    console.error(`  ❌ [FAIL] ${testName}`);
    failCount++;
  }
}

console.log('\n======================================================');
console.log('🧪 BẮT ĐẦU CHẠY KIỂM THỬ CHO TICKETS MODULE');
console.log('======================================================\n');

// -------------------------------------------------------------------------
// 1. KIỂM THỬ TÍNH HỢP LỆ CỦA ENUM STATUS
// -------------------------------------------------------------------------
console.log('1. Kiểm thử Enum TicketStatus:');
assert(isValidTicketStatus('PENDING'), 'Nhận diện đúng PENDING');
assert(isValidTicketStatus('ASSIGNED'), 'Nhận diện đúng ASSIGNED');
assert(isValidTicketStatus('IN_PROGRESS'), 'Nhận diện đúng IN_PROGRESS');
assert(isValidTicketStatus('COMPLETED'), 'Nhận diện đúng COMPLETED');
assert(isValidTicketStatus('CLOSED'), 'Nhận diện đúng CLOSED');
assert(!isValidTicketStatus('RESOLVED'), 'Chặn đúng trạng thái lạ "RESOLVED" không có trong Enum');
assert(!isValidTicketStatus(''), 'Chặn chuỗi rỗng');
assert(!isValidTicketStatus(null), 'Chặn null');

// -------------------------------------------------------------------------
// 2. KIỂM THỬ MA TRẬN CHUYỂN TRẠNG THÁI (STATE MACHINE) & PHÂN QUYỀN
// -------------------------------------------------------------------------
console.log('\n2. Kiểm thử Ma trận chuyển trạng thái (State Machine Transitions):');

// PENDING
assert(
  canTransitionTicketStatus(TicketStatus.PENDING, TicketStatus.ASSIGNED, Role.BQL).allowed,
  'PENDING -> ASSIGNED: BQL được phép gán việc'
);
assert(
  !canTransitionTicketStatus(TicketStatus.PENDING, TicketStatus.ASSIGNED, Role.RESIDENT).allowed,
  'PENDING -> ASSIGNED: Cư dân KHÔNG được tự ý gán việc'
);
assert(
  !canTransitionTicketStatus(TicketStatus.PENDING, TicketStatus.COMPLETED, Role.BQL).allowed,
  'PENDING -> COMPLETED: Chặn nhảy cóc trạng thái khi chưa gán thợ'
);
assert(
  canTransitionTicketStatus(TicketStatus.PENDING, TicketStatus.CLOSED, Role.RESIDENT, false, true).allowed,
  'PENDING -> CLOSED: Cư dân tạo phiếu được phép tự hủy phiếu của mình'
);

// ASSIGNED
assert(
  canTransitionTicketStatus(TicketStatus.ASSIGNED, TicketStatus.IN_PROGRESS, Role.TECHNICIAN, true).allowed,
  'ASSIGNED -> IN_PROGRESS: Thợ được chỉ định được phép nhận việc'
);
assert(
  !canTransitionTicketStatus(TicketStatus.ASSIGNED, TicketStatus.IN_PROGRESS, Role.TECHNICIAN, false).allowed,
  'ASSIGNED -> IN_PROGRESS: Thợ KHÁC (chưa được gán) KHÔNG được nhận việc'
);
assert(
  !canTransitionTicketStatus(TicketStatus.ASSIGNED, TicketStatus.IN_PROGRESS, Role.RESIDENT).allowed,
  'ASSIGNED -> IN_PROGRESS: Cư dân KHÔNG thể tự chuyển thành đang sửa'
);

// IN_PROGRESS
assert(
  canTransitionTicketStatus(TicketStatus.IN_PROGRESS, TicketStatus.COMPLETED, Role.TECHNICIAN, true).allowed,
  'IN_PROGRESS -> COMPLETED: Thợ phụ trách được phép báo đã sửa xong'
);
assert(
  !canTransitionTicketStatus(TicketStatus.IN_PROGRESS, TicketStatus.CLOSED, Role.TECHNICIAN, true).allowed,
  'IN_PROGRESS -> CLOSED: Thợ KHÔNG được tự ý đóng phiếu (phải qua nghiệm thu)'
);

// COMPLETED
assert(
  canTransitionTicketStatus(TicketStatus.COMPLETED, TicketStatus.CLOSED, Role.RESIDENT, false, true).allowed,
  'COMPLETED -> CLOSED: Cư dân tạo phiếu được phép nghiệm thu và đóng phiếu'
);
assert(
  !canTransitionTicketStatus(TicketStatus.COMPLETED, TicketStatus.CLOSED, Role.RESIDENT, false, false).allowed,
  'COMPLETED -> CLOSED: Cư dân KHÁC KHÔNG được nghiệm thu đóng phiếu thay'
);
assert(
  canTransitionTicketStatus(TicketStatus.COMPLETED, TicketStatus.IN_PROGRESS, Role.RESIDENT, false, true).allowed,
  'COMPLETED -> IN_PROGRESS: Cư dân từ chối nghiệm thu, yêu cầu thợ sửa lại'
);

// CLOSED (Terminal State)
assert(
  !canTransitionTicketStatus(TicketStatus.CLOSED, TicketStatus.PENDING, Role.RESIDENT).allowed,
  'CLOSED -> PENDING: Phiếu đã đóng là trạng thái kết thúc, cư dân không thể mở lại'
);
assert(
  canTransitionTicketStatus(TicketStatus.CLOSED, TicketStatus.IN_PROGRESS, Role.ADMIN).allowed,
  'CLOSED -> IN_PROGRESS: Chỉ Quản trị viên/BQL mới có quyền mở lại sự cố đặc biệt'
);

// -------------------------------------------------------------------------
// 3. KIỂM THỬ XÁC THỰC ĐẦU VÀO & CHỐNG PHÌNH TO DB (ANTI-BLOAT)
// -------------------------------------------------------------------------
console.log('\n3. Kiểm thử Xác thực dữ liệu đầu vào & Chặn Base64:');

// Test URL media
assert(
  isValidMediaUrl('https://res.cloudinary.com/demo/image/upload/sample.jpg'),
  'Chấp nhận URL ảnh Cloudinary hợp lệ'
);
assert(
  isValidMediaUrl('http://s3.ap-southeast-1.amazonaws.com/apartment/door.png'),
  'Chấp nhận URL ảnh AWS S3 hợp lệ'
);
assert(
  !isValidMediaUrl('data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAUAAAAFCAYAAACNbyblAAAAHElEQVQI12P4//8/w38GIAXDIBKE0DHxgljNBAAO9TXL0Y4OHwAAAABJRU5ErkJggg=='),
  'Chặn TUYỆT ĐỐI chuỗi ảnh Base64'
);
assert(
  !isValidMediaUrl('javascript:alert(1)'),
  'Chặn URL độc hại javascript:'
);
assert(!isValidMediaUrl(''), 'Chặn chuỗi URL rỗng');

// Test Ticket Input
const validTicket = {
  category: 'Điện',
  description: 'Bóng đèn hành lang tầng 3 bị nhấp nháy liên tục',
  mediaUrl: 'https://cloudinary.com/sample.jpg',
};
assert(validateTicketInput(validTicket).isValid, 'Dữ liệu phiếu hợp lệ được thông qua');

const emptyCategoryTicket = {
  category: '   ',
  description: 'Bóng đèn bị cháy',
};
assert(!validateTicketInput(emptyCategoryTicket).isValid, 'Chặn phiếu thiếu danh mục category');

const shortDescriptionTicket = {
  category: 'Nước',
  description: 'Rò',
};
assert(!validateTicketInput(shortDescriptionTicket).isValid, 'Chặn mô tả quá ngắn (< 5 ký tự)');

const base64Ticket = {
  category: 'Nước',
  description: 'Vỡ ống nước bồn rửa mặt',
  mediaUrl: 'data:image/jpeg;base64,/9j/4AAQSkZJRgABAQEASABIAAD/2wBD...',
};
assert(!validateTicketInput(base64Ticket).isValid, 'Chặn phiếu gửi kèm ảnh Base64');

// Test Materials Input
assert(
  sanitizeMaterials('Đã thay 01 Aptomat Panasonic 32A và 2m dây điện CADIVI').isValid,
  'Kê khai vật tư hợp lệ'
);
assert(
  !sanitizeMaterials('Vật tư kèm ảnh: data:image/png;base64,iVBORw0KGgoAAA...').isValid,
  'Chặn kê khai vật tư có nhúng Base64'
);
assert(
  !sanitizeMaterials('A'.repeat(2500)).isValid,
  'Chặn kê khai vật tư vượt quá 2000 ký tự'
);

// Test Rating Input
assert(validateRatingInput(5, 'Thợ nhiệt tình, sửa chữa rất nhanh!').isValid, 'Chấp nhận đánh giá 5 sao hợp lệ');
assert(validateRatingInput(1, 'Đến muộn').isValid, 'Chấp nhận đánh giá 1 sao hợp lệ');
assert(!validateRatingInput(0).isValid, 'Chặn đánh giá 0 sao');
assert(!validateRatingInput(6).isValid, 'Chặn đánh giá 6 sao');
assert(!validateRatingInput(3.5).isValid, 'Chặn đánh giá số thập phân');
assert(!validateRatingInput('năm sao').isValid, 'Chặn đánh giá chuỗi không phải số');

console.log('\n======================================================');
console.log(`📊 TỔNG KẾT KIỂM THỬ: ${passCount} ĐẠT (PASS) | ${failCount} THẤT BẠI (FAIL)`);
console.log('======================================================\n');

if (failCount > 0) {
  process.exit(1);
} else {
  console.log('🎉 TẤT CẢ CÁC BÀI KIỂM THỬ ĐÃ VƯỢT QUA XUẤT SẮC!\n');
  process.exit(0);
}
