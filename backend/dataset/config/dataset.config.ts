// =========================================================================
// CẤU HÌNH BỘ DỮ LIỆU DATASET (DATASET CONFIGURATION)
// Phân hệ: backend/dataset/config/dataset.config.ts
// Đặc tả: Khóa quy mô dữ liệu đã phê duyệt, seed ngẫu nhiên đơn định, và tỷ lệ phân bổ tham khảo
// =========================================================================

import { Role, TicketStatus, InvoiceStatus, RoomStatus, PaymentMethod } from '@prisma/client';

export interface UserRoleCounts {
  ADMIN: number;
  BQL: number;
  TECHNICIAN: number;
  RESIDENT_MIN: number;
  RESIDENT_MAX: number;
}

export interface DatasetTargetCounts {
  ROOMS: number;
  USERS: UserRoleCounts;
  TICKETS: { MIN: number; MAX: number };
  INVOICES: { MIN: number; MAX: number };
  PAYMENTS: { MIN: number; MAX: number };
  FEEDBACKS: { MIN: number; MAX: number };
  NOTIFICATIONS: { MIN: number; MAX: number };
  MEDIA_ASSETS: { MAX_VERIFIED: number };
}

export interface DistributionRatio<T extends string> {
  type: T;
  weight: number; // Tỷ lệ trọng số (tổng = 1.0 hoặc 100)
}

export interface DatasetConfig {
  /**
   * Seed ngẫu nhiên cố định (Deterministic Seed)
   * Đảm bảo mọi lượt chạy sinh dữ liệu luôn cho ra kết quả nhất quán 100%
   */
  RANDOM_SEED: number;

  /**
   * Quy mô số lượng bản ghi đã được phê duyệt chính thức
   */
  TARGET_COUNTS: DatasetTargetCounts;

  /**
   * Tỷ lệ phân bổ trạng thái Căn hộ (RoomStatus)
   * LƯU Ý: Đây là cấu hình đề xuất tham khảo cho dữ liệu sinh phong phú, KHÔNG PHẢI ràng buộc nghiệp vụ bắt buộc.
   */
  ROOM_STATUS_REFERENCE: DistributionRatio<RoomStatus>[];

  /**
   * Tỷ lệ phân bổ trạng thái Phiếu sự cố (TicketStatus)
   */
  TICKET_STATUS_DISTRIBUTION: DistributionRatio<TicketStatus>[];

  /**
   * Tỷ lệ phân bổ trạng thái Hóa đơn (InvoiceStatus)
   */
  INVOICE_STATUS_DISTRIBUTION: DistributionRatio<InvoiceStatus>[];

  /**
   * Tỷ lệ phân bổ phương thức thanh toán (PaymentMethod)
   */
  PAYMENT_METHOD_DISTRIBUTION: DistributionRatio<PaymentMethod>[];

  /**
   * Cấu hình định giá dịch vụ và thời gian mặc định
   */
  FINANCIAL: {
    MANAGEMENT_FEE_PER_M2: number; // Đơn giá phí quản lý VND/m2
    MOTORBIKE_PARKING_FEE: number;  // Phí xe máy VND/tháng
    CAR_PARKING_FEE: number;        // Phí ô tô VND/tháng
    WATER_FEE_MIN: number;          // Tiền nước tối thiểu
    WATER_FEE_MAX: number;          // Tiền nước tối đa
    OTHER_FEE_MIN: number;
    OTHER_FEE_MAX: number;
  };

  /**
   * Kiểm tra an toàn môi trường database
   */
  SAFETY: {
    REJECT_PRODUCTION: boolean;
    REQUIRED_OPT_IN_ENV: string;
  };
}

export const DATASET_CONFIG: DatasetConfig = {
  RANDOM_SEED: 20261111,

  TARGET_COUNTS: {
    ROOMS: 100,
    USERS: {
      ADMIN: 1,
      BQL: 2,
      TECHNICIAN: 5,
      RESIDENT_MIN: 100,
      RESIDENT_MAX: 150,
    },
    TICKETS: {
      MIN: 150,
      MAX: 200,
    },
    INVOICES: {
      MIN: 400,
      MAX: 600,
    },
    PAYMENTS: {
      MIN: 300,
      MAX: 500,
    },
    FEEDBACKS: {
      MIN: 30,
      MAX: 50,
    },
    NOTIFICATIONS: {
      MIN: 20,
      MAX: 30,
    },
    MEDIA_ASSETS: {
      MAX_VERIFIED: 0, // Mặc định 0; không sinh dữ liệu MediaAsset giả mạo
    },
  },

  // Phân bổ trạng thái phòng mang tính tham khảo (không phải ràng buộc cứng)
  ROOM_STATUS_REFERENCE: [
    { type: RoomStatus.OCCUPIED, weight: 0.7 },    // ~70 phòng có người ở
    { type: RoomStatus.VACANT, weight: 0.2 },      // ~20 phòng trống
    { type: RoomStatus.MAINTENANCE, weight: 0.1 }, // ~10 phòng bảo trì
  ],

  TICKET_STATUS_DISTRIBUTION: [
    { type: TicketStatus.PENDING, weight: 0.15 },
    { type: TicketStatus.ASSIGNED, weight: 0.15 },
    { type: TicketStatus.IN_PROGRESS, weight: 0.25 },
    { type: TicketStatus.COMPLETED, weight: 0.2 },
    { type: TicketStatus.CLOSED, weight: 0.25 },
  ],

  INVOICE_STATUS_DISTRIBUTION: [
    { type: InvoiceStatus.PAID, weight: 0.65 },           // Đa số các tháng cũ đã thanh toán xong
    { type: InvoiceStatus.PARTIALLY_PAID, weight: 0.15 }, // Đóng một phần
    { type: InvoiceStatus.UNPAID, weight: 0.2 },          // Chưa đóng (tháng hiện tại)
  ],

  PAYMENT_METHOD_DISTRIBUTION: [
    { type: PaymentMethod.VIETQR, weight: 0.7 },         // Quét mã VietQR chiếm chủ đạo
    { type: PaymentMethod.BANK_TRANSFER, weight: 0.2 },  // Chuyển khoản thông thường
    { type: PaymentMethod.CASH, weight: 0.1 },           // Tiền mặt tại văn phòng BQL
  ],

  FINANCIAL: {
    MANAGEMENT_FEE_PER_M2: 12000,
    MOTORBIKE_PARKING_FEE: 100000,
    CAR_PARKING_FEE: 1200000,
    WATER_FEE_MIN: 120000,
    WATER_FEE_MAX: 550000,
    OTHER_FEE_MIN: 50000,
    OTHER_FEE_MAX: 200000,
  },

  SAFETY: {
    REJECT_PRODUCTION: true,
    REQUIRED_OPT_IN_ENV: 'ALLOW_DATASET_SEED',
  },
};

