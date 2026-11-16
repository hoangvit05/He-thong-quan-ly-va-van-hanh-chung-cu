// =========================================================================
// KIỂU DỮ LIỆU & GIAO DIỆN KIỂM ĐỊNH DATASET (VALIDATION CHECK TYPES)
// Phân hệ: backend/dataset/validation/checks/types.ts
// Đặc tả: Milestone 10 — Hỗ trợ 8 nhóm kiểm định tính toàn vẹn và bảo mật dữ liệu
// =========================================================================

import { Role, TicketStatus, InvoiceStatus, RoomStatus, PaymentMethod, Prisma } from '@prisma/client';

export interface CheckResult {
  name: string;
  passed: boolean;
  message: string;
  violationsCount?: number;
  errors?: string[];
  details?: Record<string, any>;
}

export interface ModelCounts {
  rooms: number;
  users: {
    total: number;
    admin: number;
    bql: number;
    technician: number;
    resident: number;
  };
  tickets: number;
  invoices: number;
  payments: number;
  feedbacks: number;
  notifications: number;
  mediaAssets: number;
}

export interface SnapshotRoom {
  id: number;
  roomNumber: string;
  floor: number;
  area: number;
  status: RoomStatus;
  createdAt: Date;
  updatedAt?: Date;
}

export interface SnapshotUser {
  id: number;
  username: string;
  password: string;
  fullName: string;
  phone: string | null;
  email: string | null;
  role: Role;
  roomId: number | null;
  isApproved: boolean;
  createdAt: Date;
  updatedAt?: Date;
}

export interface SnapshotInvoice {
  id: number;
  roomId: number;
  month: string;
  managementFee: Prisma.Decimal | number | string;
  parkingFee: Prisma.Decimal | number | string;
  waterFee: Prisma.Decimal | number | string;
  otherFee: Prisma.Decimal | number | string;
  totalAmount: Prisma.Decimal | number | string;
  paidAmount: Prisma.Decimal | number | string;
  dueDate: Date | null;
  status: InvoiceStatus;
  createdAt: Date;
  updatedAt?: Date;
}

export interface SnapshotPayment {
  id: number;
  invoiceId: number;
  amount: Prisma.Decimal | number | string;
  paymentMethod: PaymentMethod;
  transactionCode: string | null;
  note: string | null;
  paidAt: Date;
}

export interface SnapshotTicket {
  id: number;
  title: string | null;
  category: string;
  description: string;
  mediaUrl: string | null;
  status: TicketStatus;
  roomId: number | null;
  residentId: number;
  technicianId: number | null;
  materials: string | null;
  completedMediaUrl: string | null;
  rating: number | null;
  ratingComment: string | null;
  isDuplicate: boolean;
  createdAt: Date;
  updatedAt?: Date;
}

export interface SnapshotFeedback {
  id: number;
  residentId: number;
  roomId: number | null;
  title: string;
  content: string;
  reply: string | null;
  isResolved: boolean;
  repliedAt: Date | null;
  createdAt: Date;
  updatedAt?: Date;
}

export interface SnapshotNotification {
  id: number;
  title: string;
  content: string;
  targetRoom: string | null;
  authorId: number | null;
  createdAt: Date;
}

export interface SnapshotMediaAsset {
  id?: number;
  publicId?: string;
  url?: string;
  resourceType?: string;
  deliveryType?: string;
  purpose?: string;
  bytes?: number;
  format?: string;
  width?: number | null;
  height?: number | null;
  duration?: number | null;
  uploaderId?: number;
  ticketId?: number | null;
  isConfirmed?: boolean;
  confirmedAt?: Date | null;
  createdAt?: Date;
  updatedAt?: Date;
}

export interface DatasetSnapshot {
  rooms: SnapshotRoom[];
  users: SnapshotUser[];
  invoices: SnapshotInvoice[];
  payments: SnapshotPayment[];
  tickets: SnapshotTicket[];
  feedbacks: SnapshotFeedback[];
  notifications: SnapshotNotification[];
  mediaAssets: SnapshotMediaAsset[];
}
