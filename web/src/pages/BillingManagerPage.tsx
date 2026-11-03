// =========================================================================
// TRANG QUẢN LÝ HÓA ĐƠN & ĐỐI SOÁT THANH TOÁN (BILLING MANAGER PAGE)
// Phụ trách: Thành viên Đức (Senior React + TypeScript Frontend Developer)
// Phạm vi: web/src/pages/BillingManagerPage.tsx
// Đợt hoàn thiện: FINAL HARDENING (No-Tailwind Scoped CSS, Anti-Race Condition,
//                  Decimal Precision, Transparent Financial Stats, Strict Overpayment Guard)
// =========================================================================

import React, { useState, useEffect, useCallback, useMemo, useRef } from 'react';
import axiosClient from '../api/axiosClient';
import { API_ENDPOINTS } from '../api/endpoints';
import { ApiEnvelope } from '../utils/auth';

// -------------------------------------------------------------------------
// ĐỊNH NGHĨA KIỂU DỮ LIỆU CỤC BỘ (STRICT TYPESCRIPT - KHÔNG DÙNG ANY)
// -------------------------------------------------------------------------

export type InvoiceStatusType = 'UNPAID' | 'PARTIALLY_PAID' | 'PAID';
export type PaymentMethodType = 'VIETQR' | 'BANK_TRANSFER' | 'CASH';

export interface PaymentRecord {
  id: number;
  invoiceId: number;
  amount: number | string;
  paymentMethod: PaymentMethodType | string;
  transactionCode?: string | null;
  note?: string | null;
  paidAt: string;
}

export interface InvoiceItem {
  id: number;
  roomId: number;
  month: string; // YYYY-MM
  managementFee: number | string;
  parkingFee: number | string;
  waterFee: number | string;
  otherFee: number | string;
  totalAmount: number | string;
  paidAmount: number | string;
  dueDate?: string | null;
  status: InvoiceStatusType;
  createdAt: string;
  updatedAt: string;
  room?: {
    id: number;
    roomNumber: string;
    floor?: number;
    area?: number;
  } | null;
  payments?: PaymentRecord[] | null;
}

export interface VietQrData {
  invoiceId: number;
  roomNumber: string;
  totalAmount: number | string;
  paidAmount: number | string;
  remainingAmount: number | string;
  isFullyPaid: boolean;
  vietQrUrl: string | null;
}

export interface RoomOption {
  id: number;
  roomNumber: string;
  floor: number;
}

interface PaginationMeta {
  page: number;
  limit: number;
  total: number;
  totalPages: number;
}

interface ApiErrorShape {
  status?: number;
  message?: string;
  data?: unknown;
  raw?: unknown;
}

// -------------------------------------------------------------------------
// TIỆN ÍCH XỬ LÝ TIỀN TỆ DECIMAL CHÍNH XÁC TUYỆT ĐỐI (DECIMAL PRECISION HELPERS)
// Bóc tách chuỗi thập phân thành đơn vị cent nguyên (1 VND = 100 cents).
// TUYỆT ĐỐI KHÔNG dùng Math.round(Number(val) * 100) để tránh sai số dấu phẩy động (vd: 1.005).
// TÁCH BIỆT RÕ RÀNG BA GIỚI HẠN DECIMAL:
//   1. Giới hạn từng khoản phí: 999,999,999.99 VND (MAX_SAFE_FEE_CENTS)
//   2. Giới hạn tổng hóa đơn: 9,999,999,999.99 VND theo cột DECIMAL(12,2) (MAX_INVOICE_CENTS)
//   3. Giới hạn thanh toán: 9,999,999,999.99 VND theo cột DECIMAL(12,2) (MAX_PAYMENT_CENTS)
// -------------------------------------------------------------------------

// 1. Giới hạn cho từng khoản phí riêng lẻ (Phí quản lý, Phí gửi xe, Tiền nước, Phí khác) theo Backend validator
export const MAX_SAFE_FEE_CENTS = 99999999999; // 999,999,999.99 VND

// 2. Giới hạn tối đa cho tổng hóa đơn và số tiền còn thiếu (DECIMAL(12, 2) trong DB / Prisma)
// Tổng 4 khoản phí tối đa: 999,999,999.99 * 4 = 3,999,999,999.96 VND (399,999,999,996 cents)
export const MAX_INVOICE_CENTS = 999999999999; // 9,999,999,999.99 VND

// 3. Giới hạn tối đa cho khoản thanh toán (paidAmount, payment amount theo DECIMAL(12, 2))
export const MAX_PAYMENT_CENTS = 999999999999; // 9,999,999,999.99 VND

export interface DecimalParseResult {
  isValid: boolean;
  cents: number;
  error?: string;
}

/**
 * Phân tích chuỗi hoặc số thành đơn vị cents nguyên
 * Kiểm tra định dạng số, chặn số âm, chặn NaN, từ chối số có nhiều hơn 2 chữ số thập phân (như 1.005)
 * Phân biệt rõ ràng:
 *   - Giá trị 0, "0", "0.00": hợp lệ với 0 cents.
 *   - Giá trị null/undefined/rỗng: không hợp lệ nếu là trường bắt buộc (isRequired = true).
 *   - Giá trị không phải số ("abc"), số âm, quá 2 số thập phân: không hợp lệ.
 * TUYỆT ĐỐI KHÔNG tự động chuyển dữ liệu sai định dạng thành 0 cents.
 */
export function parseDecimalToCents(
  val: unknown,
  fieldName = 'Số tiền',
  isRequired = false,
  maxAllowedCents: number = MAX_INVOICE_CENTS
): DecimalParseResult {
  if (val === undefined || val === null || val === '') {
    if (!isRequired) {
      return { isValid: true, cents: 0 };
    }
    return { isValid: false, cents: 0, error: `${fieldName} không được để trống hoặc thiếu dữ liệu.` };
  }

  let strVal = '';
  if (typeof val === 'number') {
    if (!Number.isFinite(val) || Number.isNaN(val)) {
      return { isValid: false, cents: 0, error: `${fieldName} không phải là số hợp lệ.` };
    }
    strVal = val.toString();
  } else if (typeof val === 'string') {
    strVal = val.trim().replace(/,/g, '');
  } else {
    return { isValid: false, cents: 0, error: `${fieldName} không đúng định dạng.` };
  }

  if (!strVal) {
    if (!isRequired) return { isValid: true, cents: 0 };
    return { isValid: false, cents: 0, error: `${fieldName} không được để trống.` };
  }

  // Chặn số âm
  if (strVal.startsWith('-')) {
    return { isValid: false, cents: 0, error: `${fieldName} không được là số âm.` };
  }

  // Bóc tách phần nguyên và phần thập phân
  const match = strVal.match(/^(\d+)(?:\.(\d+))?$/);
  if (!match) {
    return { isValid: false, cents: 0, error: `${fieldName} phải là số thập phân hợp lệ.` };
  }

  const intPartStr = match[1];
  const decPartStr = match[2] || '';

  // Bắt buộc từ chối nếu có nhiều hơn 2 chữ số thập phân (ví dụ 1.005)
  if (decPartStr.length > 2) {
    return {
      isValid: false,
      cents: 0,
      error: `${fieldName} chỉ được có tối đa 2 chữ số thập phân (giá trị "${strVal}" không hợp lệ).`,
    };
  }

  const normalizedDecStr = decPartStr.padEnd(2, '0');
  const intPart = parseInt(intPartStr, 10);
  const decPart = parseInt(normalizedDecStr, 10);

  if (!Number.isSafeInteger(intPart) || !Number.isSafeInteger(decPart)) {
    return { isValid: false, cents: 0, error: `${fieldName} vượt quá giới hạn số nguyên an toàn.` };
  }

  const totalCents = intPart * 100 + decPart;

  if (!Number.isSafeInteger(totalCents)) {
    return { isValid: false, cents: 0, error: `${fieldName} vượt quá giới hạn an toàn.` };
  }

  if (totalCents > maxAllowedCents) {
    const maxVndStr = (maxAllowedCents / 100).toLocaleString('vi-VN');
    return {
      isValid: false,
      cents: 0,
      error: `${fieldName} vượt quá giới hạn tối đa cho phép (${maxVndStr} VND).`,
    };
  }

  return { isValid: true, cents: totalCents };
}

/**
 * Tiện ích chuyển đổi an toàn sang cents.
 * Trả về cents (number) nếu dữ liệu hợp lệ (bao gồm 0 cents khi giá trị bằng 0).
 * Trả về null nếu dữ liệu không hợp lệ, không tồn tại (khi bắt buộc), sai định dạng hoặc vượt ngưỡng.
 * TUYỆT ĐỐI KHÔNG tự động chuyển 'abc' hay dữ liệu lỗi thành 0 để bảo vệ tính toàn vẹn tài chính.
 */
export function toCents(
  val: unknown,
  isRequired = true,
  maxAllowedCents: number = MAX_INVOICE_CENTS
): number | null {
  const res = parseDecimalToCents(val, 'Số tiền', isRequired, maxAllowedCents);
  return res.isValid ? res.cents : null;
}

/**
 * Cộng 2 khoản tiền theo cents (chính xác tuyệt đối).
 * Trả về null nếu một trong hai khoản không hợp lệ (null) hoặc tràn số.
 */
export function addMoney(aCents: number | null, bCents: number | null): number | null {
  if (aCents === null || bCents === null) return null;
  if (!Number.isSafeInteger(aCents) || !Number.isSafeInteger(bCents)) return null;
  const sum = aCents + bCents;
  return Number.isSafeInteger(sum) ? sum : null;
}

/**
 * Trừ 2 khoản tiền theo cents, chặn âm.
 * Trả về null nếu một trong hai khoản không hợp lệ (null).
 */
export function subtractMoney(aCents: number | null, bCents: number | null): number | null {
  if (aCents === null || bCents === null) return null;
  if (!Number.isSafeInteger(aCents) || !Number.isSafeInteger(bCents)) return null;
  return Math.max(0, aCents - bCents);
}

/**
 * Chuyển đổi cents sang số thực number khi gửi API cho Backend.
 * Ném lỗi nếu cents là null hoặc không hữu hạn.
 */
export function centsToApiNumber(cents: number | null): number {
  if (cents === null || !Number.isFinite(cents) || Number.isNaN(cents)) {
    throw new Error('Số tiền không hợp lệ.');
  }
  return cents / 100;
}

/**
 * Định dạng tiền tệ VND từ đơn vị cents với độ chính xác tuyệt đối.
 * Trả về 'N/A' nếu cents là null, undefined, NaN hoặc không hữu hạn.
 */
export function formatCents(cents: number | null | undefined): string {
  if (cents === null || cents === undefined || !Number.isFinite(cents) || Number.isNaN(cents)) {
    return 'N/A';
  }
  const sign = cents < 0 ? '-' : '';
  const absCents = Math.abs(cents);
  const intPart = Math.floor(absCents / 100);
  const decPart = absCents % 100;

  const intFormatted = new Intl.NumberFormat('vi-VN').format(intPart);
  if (decPart === 0) {
    return `${sign}${intFormatted} ₫`;
  }
  const decFormatted = decPart < 10 ? `0${decPart}` : `${decPart}`;
  return `${sign}${intFormatted},${decFormatted} ₫`;
}

/**
 * Định dạng tiền tệ VND nhận vào giá trị bất kỳ (string | number | null | undefined).
 * Trả về 'N/A' nếu dữ liệu sai định dạng hoặc không thể phân tích.
 */
export function formatCurrency(
  val: unknown,
  isRequired = false,
  maxAllowedCents: number = MAX_INVOICE_CENTS
): string {
  if (val === undefined || val === null || val === '') {
    return isRequired ? 'N/A' : '0 ₫';
  }
  const res = parseDecimalToCents(val, 'Tiền tệ', isRequired, maxAllowedCents);
  if (res.isValid) {
    return formatCents(res.cents);
  }
  return 'N/A';
}

// -------------------------------------------------------------------------
// COMPONENT CHÍNH: BillingManagerPage
// -------------------------------------------------------------------------

export const BillingManagerPage: React.FC = () => {
  // Chống rò rỉ bộ nhớ khi unmount
  const isMountedRef = useRef<boolean>(true);
  useEffect(() => {
    isMountedRef.current = true;
    return () => {
      isMountedRef.current = false;
    };
  }, []);

  // Chống Race Condition bằng Request Sequence Counters độc lập cho từng nhóm request
  const invoicesListSeqRef = useRef<number>(0);
  const invoicesStatsSeqRef = useRef<number>(0);
  const roomsOptionsSeqRef = useRef<number>(0);

  // -----------------------------------------------------------------------
  // STATE: DANH SÁCH HÓA ĐƠN & PHÂN TRANG
  // -----------------------------------------------------------------------
  const [invoices, setInvoices] = useState<InvoiceItem[]>([]);
  const [loading, setLoading] = useState<boolean>(false);
  const [errorMessage, setErrorMessage] = useState<string>('');
  const [pagination, setPagination] = useState<PaginationMeta>({
    page: 1,
    limit: 15,
    total: 0,
    totalPages: 1,
  });

  // -----------------------------------------------------------------------
  // STATE: BỘ LỌC TÌM KIẾM HÓA ĐƠN KÈM DEBOUNCE
  // -----------------------------------------------------------------------
  const [monthFilter, setMonthFilter] = useState<string>('');
  const [roomFilter, setRoomFilter] = useState<string>('');
  const [statusFilter, setStatusFilter] = useState<string>('');
  const [availableRooms, setAvailableRooms] = useState<RoomOption[]>([]);

  // -----------------------------------------------------------------------
  // STATE: THỐNG KÊ TOÀN HỆ THỐNG ĐỘC LẬP (KHÔNG BỊ ẢNH HƯỞNG BỞI BỘ LỌC)
  // -----------------------------------------------------------------------
  const [systemStats, setSystemStats] = useState<{
    totalInvoices: number | null;
    unpaidCount: number | null;
    partiallyPaidCount: number | null;
    incompleteCount: number | null; // UNPAID + PARTIALLY_PAID
    paidCount: number | null;
  }>({
    totalInvoices: null,
    unpaidCount: null,
    partiallyPaidCount: null,
    incompleteCount: null,
    paidCount: null,
  });
  const [systemStatsLoading, setSystemStatsLoading] = useState<boolean>(false);
  const [systemStatsError, setSystemStatsError] = useState<string>('');

  // -----------------------------------------------------------------------
  // STATE: MODAL LẬP HÓA ĐƠN MỚI (POST /api/invoices)
  // -----------------------------------------------------------------------
  const [isCreateModalOpen, setIsCreateModalOpen] = useState<boolean>(false);
  const [createFormData, setCreateFormData] = useState({
    roomId: '',
    month: new Date().toISOString().slice(0, 7), // Mặc định YYYY-MM hiện tại
    dueDate: '',
    managementFee: '0',
    parkingFee: '0',
    waterFee: '0',
    otherFee: '0',
  });
  const [createSubmitting, setCreateSubmitting] = useState<boolean>(false);
  const [createError, setCreateError] = useState<string>('');
  const [createSuccess, setCreateSuccess] = useState<string>('');

  // -----------------------------------------------------------------------
  // STATE: MODAL XEM MÃ VIETQR (GET /api/invoices/:id/vietqr)
  // -----------------------------------------------------------------------
  const [isQrModalOpen, setIsQrModalOpen] = useState<boolean>(false);
  const [qrLoading, setQrLoading] = useState<boolean>(false);
  const [qrError, setQrError] = useState<string>('');
  const [qrData, setQrData] = useState<VietQrData | null>(null);
  const [currentQrInvoice, setCurrentQrInvoice] = useState<InvoiceItem | null>(null);

  // -----------------------------------------------------------------------
  // STATE: MODAL ĐỐI SOÁT & XÁC NHẬN THANH TOÁN (PUT /api/invoices/:id/status)
  // -----------------------------------------------------------------------
  const [isPayModalOpen, setIsPayModalOpen] = useState<boolean>(false);
  const [payInvoice, setPayInvoice] = useState<InvoiceItem | null>(null);
  const [payFormData, setPayFormData] = useState({
    paidAmount: '',
    paymentMethod: 'VIETQR' as PaymentMethodType,
    transactionCode: '',
    note: '',
  });
  const [paySubmitting, setPaySubmitting] = useState<boolean>(false);
  const [payError, setPayError] = useState<string>('');
  const [paySuccess, setPaySuccess] = useState<string>('');

  // -----------------------------------------------------------------------
  // STATE: MODAL XEM LỊCH SỬ THANH TOÁN
  // -----------------------------------------------------------------------
  const [viewingPaymentsInvoice, setViewingPaymentsInvoice] = useState<InvoiceItem | null>(null);

  // Thông báo phản hồi toàn cục
  const [actionNotice, setActionNotice] = useState<{ type: 'success' | 'error'; text: string } | null>(null);

  // -----------------------------------------------------------------------
  // TIỆN ÍCH TRÍCH XUẤT LỖI
  // -----------------------------------------------------------------------
  const parseErrorMessage = (err: unknown, fallback: string): string => {
    if (typeof err === 'object' && err !== null) {
      const apiErr = err as ApiErrorShape;
      if (typeof apiErr.message === 'string' && apiErr.message.trim()) {
        return apiErr.message;
      }
    }
    return fallback;
  };

  // -----------------------------------------------------------------------
  // API: NẠP DANH MỤC PHÒNG CHO SELECT TÙY CHỌN (SEQUENCE COUNTER RIÊNG)
  // -----------------------------------------------------------------------
  const fetchRooms = useCallback(async () => {
    const seq = ++roomsOptionsSeqRef.current;
    try {
      const res = (await axiosClient.get('/api/rooms?page=1&limit=100')) as unknown as ApiEnvelope<RoomOption[]>;
      if (seq === roomsOptionsSeqRef.current && isMountedRef.current) {
        if (res && Array.isArray(res.data)) {
          setAvailableRooms(res.data);
        }
      }
    } catch {
      // Bỏ qua nếu lỗi nạp phòng
    }
  }, []);

  // -----------------------------------------------------------------------
  // API: THỐNG KÊ TOÀN HỆ THỐNG ĐỘC LẬP KHÔNG PHỤ THUỘC BỘ LỌC
  // (SEQUENCE COUNTER RIÊNG: invoicesStatsSeqRef)
  // -----------------------------------------------------------------------
  const fetchSystemStats = useCallback(async () => {
    const seq = ++invoicesStatsSeqRef.current;
    setSystemStatsLoading(true);
    setSystemStatsError('');

    try {
      const [allRes, unpaidRes, partialRes, paidRes] = await Promise.allSettled([
        axiosClient.get(`${API_ENDPOINTS.INVOICES.LIST}?page=1&limit=1`),
        axiosClient.get(`${API_ENDPOINTS.INVOICES.LIST}?status=UNPAID&page=1&limit=1`),
        axiosClient.get(`${API_ENDPOINTS.INVOICES.LIST}?status=PARTIALLY_PAID&page=1&limit=1`),
        axiosClient.get(`${API_ENDPOINTS.INVOICES.LIST}?status=PAID&page=1&limit=1`),
      ]);

      if (seq !== invoicesStatsSeqRef.current || !isMountedRef.current) {
        return;
      }

      let hasFailures = false;
      const extractTotal = (res: PromiseSettledResult<unknown>): number | null => {
        if (res.status === 'fulfilled') {
          const env = res.value as unknown as ApiEnvelope<InvoiceItem[]>;
          if (
            env &&
            typeof env === 'object' &&
            typeof env.pagination?.total === 'number' &&
            Number.isFinite(env.pagination.total) &&
            env.pagination.total >= 0
          ) {
            return env.pagination.total;
          }
        }
        hasFailures = true;
        return null;
      };

      const total = extractTotal(allRes);
      const unpaid = extractTotal(unpaidRes);
      const partial = extractTotal(partialRes);
      const paid = extractTotal(paidRes);

      const incomplete = unpaid !== null && partial !== null ? unpaid + partial : null;

      if (hasFailures) {
        setSystemStatsError('Không thể nạp đầy đủ số liệu thống kê hóa đơn toàn hệ thống từ máy chủ.');
      }

      setSystemStats({
        totalInvoices: total,
        unpaidCount: unpaid,
        partiallyPaidCount: partial,
        incompleteCount: incomplete,
        paidCount: paid,
      });
    } catch (err: unknown) {
      if (seq === invoicesStatsSeqRef.current && isMountedRef.current) {
        const msg = parseErrorMessage(err, 'Lỗi nạp thống kê hóa đơn toàn hệ thống.');
        setSystemStatsError(msg);
      }
    } finally {
      if (seq === invoicesStatsSeqRef.current && isMountedRef.current) {
        setSystemStatsLoading(false);
      }
    }
  }, []);

  // -----------------------------------------------------------------------
  // API: TẢI DANH SÁCH HÓA ĐƠN (SEQUENCE COUNTER RIÊNG: invoicesListSeqRef)
  // -----------------------------------------------------------------------
  const fetchInvoices = useCallback(
    async (targetPage = 1) => {
      const currentSeq = ++invoicesListSeqRef.current;
      setLoading(true);
      setErrorMessage('');

      try {
        const queryParams = new URLSearchParams();
        queryParams.set('page', String(targetPage));
        queryParams.set('limit', String(pagination.limit));

        if (monthFilter.trim()) {
          queryParams.set('month', monthFilter.trim());
        }
        if (roomFilter) {
          queryParams.set('roomId', roomFilter);
        }
        if (statusFilter) {
          queryParams.set('status', statusFilter);
        }

        const res = (await axiosClient.get(
          `${API_ENDPOINTS.INVOICES.LIST}?${queryParams.toString()}`
        )) as unknown as ApiEnvelope<InvoiceItem[]>;

        if (currentSeq !== invoicesListSeqRef.current || !isMountedRef.current) {
          return;
        }

        let list: InvoiceItem[] = [];
        let meta: PaginationMeta = {
          page: targetPage,
          limit: pagination.limit,
          total: 0,
          totalPages: 1,
        };

        if (res && typeof res === 'object') {
          if (Array.isArray(res.data)) {
            list = res.data;
          }
          if (res.pagination) {
            meta = res.pagination;
          }
        }

        setInvoices(list);
        setPagination(meta);
      } catch (err: unknown) {
        if (currentSeq !== invoicesListSeqRef.current || !isMountedRef.current) {
          return;
        }
        const msg = parseErrorMessage(err, 'Không thể tải danh sách hóa đơn từ máy chủ.');
        setErrorMessage(msg);
        setInvoices([]);
      } finally {
        if (currentSeq === invoicesListSeqRef.current && isMountedRef.current) {
          setLoading(false);
        }
      }
    },
    [monthFilter, roomFilter, statusFilter, pagination.limit]
  );

  // -----------------------------------------------------------------------
  // TRIGGER LOAD DỮ LIỆU
  // -----------------------------------------------------------------------
  useEffect(() => {
    fetchRooms();
    fetchSystemStats();
  }, [fetchRooms, fetchSystemStats]);

  useEffect(() => {
    fetchInvoices(1);
  }, [fetchInvoices]);

  // -----------------------------------------------------------------------
  // TÍNH TOÁN CÁC CHỈ SỐ TIỀN THEO TRANG HIỆN TẠI (TRANSPARENT CURRENT PAGE SCOPE)
  // Ghi rõ phạm vi trang hiện tại, sử dụng số nguyên cents chính xác tuyệt đối
  // -----------------------------------------------------------------------
  const pageFinancials = useMemo(() => {
    let sumTotalCents = 0;
    let sumPaidCents = 0;
    let pageUnpaidCount = 0;
    let hasInvalidData = false;

    invoices.forEach((inv) => {
      const totCents = toCents(inv.totalAmount, true);
      const paidCents = toCents(inv.paidAmount, true);
      if (totCents === null || paidCents === null) {
        hasInvalidData = true;
      } else {
        sumTotalCents += totCents;
        sumPaidCents += paidCents;
      }
      if (inv.status !== 'PAID') {
        pageUnpaidCount += 1;
      }
    });

    const sumRemainingCents = Math.max(0, sumTotalCents - sumPaidCents);

    return {
      sumTotalCents,
      sumPaidCents,
      sumRemainingCents,
      pageUnpaidCount,
      hasInvalidData,
      totalFormatted: hasInvalidData ? 'N/A' : formatCents(sumTotalCents),
      paidFormatted: hasInvalidData ? 'N/A' : formatCents(sumPaidCents),
      remainingFormatted: hasInvalidData ? 'N/A' : formatCents(sumRemainingCents),
    };
  }, [invoices]);

  // -----------------------------------------------------------------------
  // TÍNH TỔNG TIỀN REALTIME KHI TẠO HÓA ĐƠN BẰNG CENTS
  // -----------------------------------------------------------------------
  const calculatedTotalNewInvoiceCents = useMemo(() => {
    const mgmt = toCents(createFormData.managementFee, false, MAX_SAFE_FEE_CENTS);
    const park = toCents(createFormData.parkingFee, false, MAX_SAFE_FEE_CENTS);
    const water = toCents(createFormData.waterFee, false, MAX_SAFE_FEE_CENTS);
    const other = toCents(createFormData.otherFee, false, MAX_SAFE_FEE_CENTS);
    if (mgmt === null || park === null || water === null || other === null) {
      return null;
    }
    const sum = mgmt + park + water + other;
    return Number.isSafeInteger(sum) && sum <= MAX_INVOICE_CENTS ? sum : null;
  }, [
    createFormData.managementFee,
    createFormData.parkingFee,
    createFormData.waterFee,
    createFormData.otherFee,
  ]);

  // -----------------------------------------------------------------------
  // XỬ LÝ MODAL LẬP HÓA ĐƠN MỚI
  // -----------------------------------------------------------------------
  const handleOpenCreateModal = () => {
    setCreateFormData({
      roomId: availableRooms.length > 0 ? String(availableRooms[0].id) : '',
      month: new Date().toISOString().slice(0, 7),
      dueDate: '',
      managementFee: '0',
      parkingFee: '0',
      waterFee: '0',
      otherFee: '0',
    });
    setCreateError('');
    setCreateSuccess('');
    setIsCreateModalOpen(true);
  };

  // Đóng modal bằng phím ESC
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        if (isCreateModalOpen && !createSubmitting) setIsCreateModalOpen(false);
        if (isQrModalOpen) setIsQrModalOpen(false);
        if (isPayModalOpen && !paySubmitting) setIsPayModalOpen(false);
        if (viewingPaymentsInvoice) setViewingPaymentsInvoice(null);
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [isCreateModalOpen, createSubmitting, isQrModalOpen, isPayModalOpen, paySubmitting, viewingPaymentsInvoice]);

  // Gửi Form Lập Hóa Đơn (Bắt lỗi 409 chuẩn mực)
  const handleSubmitCreateInvoice = async (e: React.FormEvent) => {
    e.preventDefault();
    setCreateError('');
    setCreateSuccess('');

    const parsedRoomId = parseInt(createFormData.roomId, 10);
    if (isNaN(parsedRoomId) || parsedRoomId <= 0) {
      setCreateError('Vui lòng chọn căn hộ hợp lệ.');
      return;
    }

    const monthRegex = /^\d{4}-(0[1-9]|1[0-2])$/;
    if (!monthRegex.test(createFormData.month.trim())) {
      setCreateError('Định dạng kỳ hóa đơn không hợp lệ. Vui lòng chọn theo dạng YYYY-MM.');
      return;
    }

    const mgmtRes = parseDecimalToCents(createFormData.managementFee, 'Phí quản lý', true, MAX_SAFE_FEE_CENTS);
    if (!mgmtRes.isValid) {
      setCreateError(mgmtRes.error || 'Phí quản lý không hợp lệ.');
      return;
    }
    const parkRes = parseDecimalToCents(createFormData.parkingFee, 'Phí gửi xe', true, MAX_SAFE_FEE_CENTS);
    if (!parkRes.isValid) {
      setCreateError(parkRes.error || 'Phí gửi xe không hợp lệ.');
      return;
    }
    const waterRes = parseDecimalToCents(createFormData.waterFee, 'Tiền nước', true, MAX_SAFE_FEE_CENTS);
    if (!waterRes.isValid) {
      setCreateError(waterRes.error || 'Tiền nước không hợp lệ.');
      return;
    }
    const otherRes = parseDecimalToCents(createFormData.otherFee, 'Phí khác', true, MAX_SAFE_FEE_CENTS);
    if (!otherRes.isValid) {
      setCreateError(otherRes.error || 'Phí khác không hợp lệ.');
      return;
    }

    // Kiểm tra tổng 4 khoản phí theo giới hạn MAX_INVOICE_CENTS
    const totalNewInvoiceCents = mgmtRes.cents + parkRes.cents + waterRes.cents + otherRes.cents;
    if (!Number.isSafeInteger(totalNewInvoiceCents) || totalNewInvoiceCents > MAX_INVOICE_CENTS) {
      const maxVndStr = (MAX_INVOICE_CENTS / 100).toLocaleString('vi-VN');
      setCreateError(`Tổng hóa đơn vượt quá giới hạn tối đa cho phép (${maxVndStr} VND).`);
      return;
    }

    setCreateSubmitting(true);
    try {
      await axiosClient.post(API_ENDPOINTS.INVOICES.CREATE, {
        roomId: parsedRoomId,
        month: createFormData.month.trim(),
        dueDate: createFormData.dueDate ? new Date(createFormData.dueDate).toISOString() : undefined,
        managementFee: centsToApiNumber(mgmtRes.cents),
        parkingFee: centsToApiNumber(parkRes.cents),
        waterFee: centsToApiNumber(waterRes.cents),
        otherFee: centsToApiNumber(otherRes.cents),
      });

      if (isMountedRef.current) {
        setCreateSuccess(`Lập hóa đơn tháng [${createFormData.month}] thành công!`);
        await fetchInvoices(1);
        fetchSystemStats();

        setTimeout(() => {
          if (isMountedRef.current) {
            setIsCreateModalOpen(false);
            setCreateSuccess('');
          }
        }, 800);
      }
    } catch (err: unknown) {
      if (isMountedRef.current) {
        const apiErr = err as ApiErrorShape;
        // BẮT LỖI 409 VỚI THÔNG ĐIỆP BẮT BUỘC CHÍNH XÁC:
        // "Căn hộ này đã được lập hóa đơn tháng này rồi"
        if (
          apiErr?.status === 409 ||
          apiErr?.message?.includes('đã được lập hóa đơn') ||
          apiErr?.message?.includes('P2002') ||
          apiErr?.message?.includes('trùng lặp')
        ) {
          setCreateError('Căn hộ này đã được lập hóa đơn tháng này rồi');
        } else {
          const msg = parseErrorMessage(err, 'Lỗi khi lập biểu phí định kỳ.');
          setCreateError(msg);
        }
      }
    } finally {
      if (isMountedRef.current) {
        setCreateSubmitting(false);
      }
    }
  };

  // -----------------------------------------------------------------------
  // XỬ LÝ MỞ MODAL XEM MÃ VIETQR
  // -----------------------------------------------------------------------
  const handleOpenVietQrModal = async (invoice: InvoiceItem) => {
    setCurrentQrInvoice(invoice);
    setQrData(null);
    setQrError('');
    setQrLoading(true);
    setIsQrModalOpen(true);

    try {
      const res = (await axiosClient.get(
        API_ENDPOINTS.INVOICES.VIETQR(invoice.id)
      )) as unknown as ApiEnvelope<VietQrData>;

      if (res && res.data && isMountedRef.current) {
        setQrData(res.data);
      } else if (isMountedRef.current) {
        setQrError('Không nhận được dữ liệu mã VietQR từ máy chủ.');
      }
    } catch (err: unknown) {
      if (isMountedRef.current) {
        const msg = parseErrorMessage(err, 'Không thể tạo mã VietQR thanh toán.');
        setQrError(msg);
      }
    } finally {
      if (isMountedRef.current) {
        setQrLoading(false);
      }
    }
  };

  // -----------------------------------------------------------------------
  // XỬ LÝ MỞ MODAL ĐỐI SOÁT & XÁC NHẬN THANH TOÁN
  // -----------------------------------------------------------------------
  const handleOpenPayModal = (invoice: InvoiceItem) => {
    if (invoice.status === 'PAID') {
      setActionNotice({
        type: 'error',
        text: 'Hóa đơn này đã được thanh toán đầy đủ 100%. Không cần đối soát thêm.',
      });
      return;
    }

    const totalCents = toCents(invoice.totalAmount, true);
    const paidCents = toCents(invoice.paidAmount, true);

    if (totalCents === null || paidCents === null) {
      setActionNotice({
        type: 'error',
        text: 'Hóa đơn này chứa dữ liệu tài chính không hợp lệ từ máy chủ. Không thể mở đối soát.',
      });
      return;
    }

    const remainingCents = subtractMoney(totalCents, paidCents);
    if (remainingCents === null) {
      setActionNotice({
        type: 'error',
        text: 'Không thể tính toán số tiền còn thiếu do dữ liệu không hợp lệ.',
      });
      return;
    }
    const remainingAmount = remainingCents / 100;

    setPayInvoice(invoice);
    setPayFormData({
      paidAmount: String(remainingAmount),
      paymentMethod: 'VIETQR',
      transactionCode: '',
      note: '',
    });
    setPayError('');
    setPaySuccess('');
    setIsPayModalOpen(true);
  };

  // -----------------------------------------------------------------------
  // XỬ LÝ GỬI YÊU CẦU ĐỐI SOÁT / XÁC NHẬN THANH TOÁN (CHỐNG NỘP THỪA)
  // -----------------------------------------------------------------------
  const handleSubmitPayment = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!payInvoice) return;

    setPayError('');
    setPaySuccess('');

    const totalCents = toCents(payInvoice.totalAmount, true);
    const currentPaidCents = toCents(payInvoice.paidAmount, true);

    if (totalCents === null || currentPaidCents === null) {
      setPayError('Dữ liệu hóa đơn từ máy chủ không hợp lệ. Không thể xác nhận thanh toán.');
      return;
    }

    const remainingCents = subtractMoney(totalCents, currentPaidCents);
    if (remainingCents === null) {
      setPayError('Không thể xác định số tiền còn thiếu của hóa đơn.');
      return;
    }

    const payRes = parseDecimalToCents(payFormData.paidAmount, 'Số tiền thanh toán', true, MAX_PAYMENT_CENTS);
    if (!payRes.isValid) {
      setPayError(payRes.error || 'Số tiền thanh toán không hợp lệ.');
      return;
    }

    const inputCents = payRes.cents;
    if (inputCents <= 0) {
      setPayError('Số tiền thanh toán phải lớn hơn 0.');
      return;
    }

    // CHỐNG NỘP THỪA (OVERPAYMENT PROTECTION) - THÔNG ĐIỆP BẮT BUỘC CHÍNH XÁC:
    // "Số tiền thanh toán vượt quá số tiền còn thiếu. Vui lòng kiểm tra lại."
    if (inputCents > remainingCents) {
      setPayError('Số tiền thanh toán vượt quá số tiền còn thiếu. Vui lòng kiểm tra lại.');
      return;
    }

    setPaySubmitting(true);
    try {
      const payload: {
        paidAmount: number;
        paymentMethod: PaymentMethodType;
        transactionCode?: string;
        note?: string;
      } = {
        paidAmount: centsToApiNumber(inputCents),
        paymentMethod: payFormData.paymentMethod,
        transactionCode: payFormData.transactionCode.trim() || undefined,
        note: payFormData.note.trim() || undefined,
      };

      const res = (await axiosClient.put(
        API_ENDPOINTS.INVOICES.UPDATE_STATUS(payInvoice.id),
        payload
      )) as unknown as ApiEnvelope<InvoiceItem>;

      const updated = res?.data;

      if (isMountedRef.current) {
        setInvoices((prev) =>
          prev.map((inv) =>
            inv.id === payInvoice.id
              ? updated || {
                  ...inv,
                  paidAmount: (currentPaidCents + inputCents) / 100,
                  status: currentPaidCents + inputCents >= totalCents ? 'PAID' : 'PARTIALLY_PAID',
                }
              : inv
          )
        );

        setPaySuccess('Xác nhận thanh toán và ghi nhận giao dịch thành công!');
        fetchInvoices(pagination.page);
        fetchSystemStats();

        setTimeout(() => {
          if (isMountedRef.current) {
            setIsPayModalOpen(false);
            setPaySuccess('');
            setPayInvoice(null);
          }
        }, 800);
      }
    } catch (err: unknown) {
      if (isMountedRef.current) {
        const apiErr = err as ApiErrorShape;
        if (apiErr?.status === 409) {
          setPayError('Xảy ra xung đột giao dịch đồng thời trên hóa đơn này. Vui lòng tải lại dữ liệu.');
          fetchInvoices(pagination.page);
        } else {
          const msg = parseErrorMessage(err, 'Lỗi khi cập nhật thanh toán cho hóa đơn.');
          setPayError(msg);
        }
      }
    } finally {
      if (isMountedRef.current) {
        setPaySubmitting(false);
      }
    }
  };

  return (
    <div className="billing-manager-container">
      {/* ================================================================= */}
      {/* TOÀN BỘ CSS THỰC SỰ - HOÀN TOÀN ĐỘC LẬP VỚI TAILWIND (NO TAILWIND) */}
      {/* ================================================================= */}
      <style>{`
        .billing-manager-container {
          width: 100%;
          max-width: 1200px;
          margin: 0 auto;
          padding: 1.5rem 1rem 3rem 1rem;
          color: #1e293b;
          font-family: inherit;
        }
        .billing-manager-header {
          display: flex;
          justify-content: space-between;
          align-items: center;
          flex-wrap: wrap;
          gap: 1rem;
          margin-bottom: 1.5rem;
        }
        .billing-manager-title {
          font-size: 1.5rem;
          font-weight: 700;
          color: #0f172a;
          margin: 0;
          letter-spacing: -0.025em;
        }
        .billing-manager-subtitle {
          font-size: 0.875rem;
          color: #64748b;
          margin: 0.25rem 0 0 0;
        }
        .billing-manager-btn {
          display: inline-flex;
          align-items: center;
          justify-content: center;
          padding: 0.5rem 1rem;
          font-size: 0.875rem;
          font-weight: 600;
          border-radius: 0.5rem;
          cursor: pointer;
          transition: background-color 0.15s ease, border-color 0.15s ease;
          border: 1px solid transparent;
          text-decoration: none;
        }
        .billing-manager-btn:disabled {
          opacity: 0.5;
          cursor: not-allowed;
        }
        .billing-manager-btn-primary {
          background-color: #4f46e5;
          color: #ffffff;
        }
        .billing-manager-btn-primary:hover:not(:disabled) {
          background-color: #4338ca;
        }
        .billing-manager-btn-secondary {
          background-color: #ffffff;
          color: #334155;
          border-color: #cbd5e1;
        }
        .billing-manager-btn-secondary:hover:not(:disabled) {
          background-color: #f8fafc;
        }
        .billing-manager-btn-success {
          background-color: #059669;
          color: #ffffff;
        }
        .billing-manager-btn-success:hover:not(:disabled) {
          background-color: #047857;
        }
        .billing-manager-btn-sm {
          padding: 0.25rem 0.5rem;
          font-size: 0.75rem;
          border-radius: 0.375rem;
        }
        .billing-manager-stats-grid {
          display: grid;
          grid-template-columns: repeat(auto-fit, minmax(200px, 1fr));
          gap: 0.75rem;
          margin-bottom: 0.5rem;
        }
        .billing-manager-stat-card {
          background-color: #ffffff;
          border: 1px solid #e2e8f0;
          border-radius: 0.75rem;
          padding: 1rem;
          box-shadow: 0 1px 3px rgba(0, 0, 0, 0.05);
        }
        .billing-manager-stat-card-slate { border-left: 4px solid #334155; }
        .billing-manager-stat-card-indigo { border-left: 4px solid #4f46e5; }
        .billing-manager-stat-card-emerald { border-left: 4px solid #059669; }
        .billing-manager-stat-card-rose { border-left: 4px solid #e11d48; }
        .billing-manager-stat-card-amber { border-left: 4px solid #d97706; }
        .billing-manager-stat-label {
          font-size: 0.6875rem;
          font-weight: 700;
          color: #64748b;
          text-transform: uppercase;
          letter-spacing: 0.05em;
          margin: 0;
        }
        .billing-manager-stat-value {
          font-size: 1.375rem;
          font-weight: 700;
          color: #0f172a;
          margin: 0.25rem 0 0 0;
        }
        .billing-manager-stat-helper {
          font-size: 0.6875rem;
          color: #94a3b8;
          margin-top: 0.25rem;
          display: block;
        }
        .billing-manager-stats-notice {
          font-size: 0.6875rem;
          color: #64748b;
          font-style: italic;
          margin-bottom: 1.25rem;
        }
        .billing-manager-card {
          background-color: #ffffff;
          border: 1px solid #e2e8f0;
          border-radius: 0.75rem;
          box-shadow: 0 1px 3px rgba(0, 0, 0, 0.05);
          margin-bottom: 1.25rem;
        }
        .billing-manager-filter-box {
          padding: 1rem;
        }
        .billing-manager-filter-grid {
          display: grid;
          grid-template-columns: repeat(auto-fit, minmax(180px, 1fr));
          gap: 0.75rem;
          align-items: flex-end;
        }
        .billing-manager-form-group {
          display: flex;
          flex-direction: column;
          gap: 0.25rem;
        }
        .billing-manager-form-label {
          font-size: 0.75rem;
          font-weight: 600;
          color: #475569;
        }
        .billing-manager-input, .billing-manager-select, .billing-manager-textarea {
          width: 100%;
          padding: 0.4375rem 0.625rem;
          font-size: 0.875rem;
          border: 1px solid #cbd5e1;
          border-radius: 0.375rem;
          color: #0f172a;
          background-color: #ffffff;
          outline: none;
          box-sizing: border-box;
        }
        .billing-manager-input:focus, .billing-manager-select:focus, .billing-manager-textarea:focus {
          border-color: #4f46e5;
          box-shadow: 0 0 0 2px rgba(79, 70, 229, 0.1);
        }
        .billing-manager-alert {
          padding: 0.875rem 1rem;
          border-radius: 0.5rem;
          font-size: 0.875rem;
          margin-bottom: 1rem;
          display: flex;
          justify-content: space-between;
          align-items: center;
        }
        .billing-manager-alert-success {
          background-color: #ecfdf5;
          color: #065f46;
          border: 1px solid #a7f3d0;
        }
        .billing-manager-alert-error {
          background-color: #fef2f2;
          color: #991b1b;
          border: 1px solid #fecaca;
        }
        .billing-manager-table-wrap {
          overflow-x: auto;
          width: 100%;
        }
        .billing-manager-table {
          width: 100%;
          border-collapse: collapse;
          font-size: 0.8125rem;
          text-align: left;
        }
        .billing-manager-table th {
          background-color: #f8fafc;
          color: #475569;
          font-size: 0.6875rem;
          font-weight: 700;
          text-transform: uppercase;
          letter-spacing: 0.05em;
          padding: 0.75rem 0.75rem;
          border-bottom: 1px solid #e2e8f0;
          white-space: nowrap;
        }
        .billing-manager-table td {
          padding: 0.75rem 0.75rem;
          border-bottom: 1px solid #f1f5f9;
          color: #1e293b;
          vertical-align: middle;
        }
        .billing-manager-table tr:hover td {
          background-color: #f8fafc;
        }
        .billing-manager-badge {
          display: inline-flex;
          align-items: center;
          padding: 0.2rem 0.5rem;
          font-size: 0.6875rem;
          font-weight: 700;
          border-radius: 9999px;
          white-space: nowrap;
        }
        .billing-manager-badge-unpaid {
          background-color: #ffe4e6;
          color: #be123c;
          border: 1px solid #fecdd3;
        }
        .billing-manager-badge-partially {
          background-color: #fffbeb;
          color: #b45309;
          border: 1px solid #fde68a;
        }
        .billing-manager-badge-paid {
          background-color: #ecfdf5;
          color: #047857;
          border: 1px solid #a7f3d0;
        }
        .billing-manager-pagination {
          display: flex;
          justify-content: space-between;
          align-items: center;
          padding: 0.75rem 1rem;
          border-top: 1px solid #e2e8f0;
          font-size: 0.75rem;
          color: #64748b;
          flex-wrap: wrap;
          gap: 0.5rem;
        }
        .billing-manager-modal-overlay {
          position: fixed;
          top: 0;
          left: 0;
          right: 0;
          bottom: 0;
          width: 100vw;
          height: 100vh;
          background-color: rgba(15, 23, 42, 0.6);
          backdrop-filter: blur(2px);
          z-index: 9999;
          display: flex;
          align-items: center;
          justify-content: center;
          padding: 1rem;
          box-sizing: border-box;
        }
        .billing-manager-modal-box {
          background-color: #ffffff;
          border-radius: 0.75rem;
          border: 1px solid #e2e8f0;
          box-shadow: 0 20px 25px -5px rgba(0, 0, 0, 0.1);
          width: 100%;
          max-width: 500px;
          max-height: 90vh;
          overflow-y: auto;
        }
        .billing-manager-modal-header {
          display: flex;
          justify-content: space-between;
          align-items: center;
          padding: 1rem 1.25rem;
          background-color: #f8fafc;
          border-bottom: 1px solid #e2e8f0;
        }
        .billing-manager-modal-title {
          font-size: 1rem;
          font-weight: 700;
          color: #0f172a;
          margin: 0;
        }
        .billing-manager-modal-close {
          background: none;
          border: none;
          font-size: 1.25rem;
          color: #94a3b8;
          cursor: pointer;
          padding: 0;
          line-height: 1;
        }
        .billing-manager-modal-body {
          padding: 1.25rem;
          display: flex;
          flex-direction: column;
          gap: 1rem;
        }
        .billing-manager-modal-footer {
          display: flex;
          justify-content: flex-end;
          gap: 0.5rem;
          padding-top: 1rem;
          border-top: 1px solid #f1f5f9;
        }
      `}</style>

      {/* HEADER TRANG */}
      <div className="billing-manager-header">
        <div>
          <h1 className="billing-manager-title">Quản Lý Hóa Đơn & Đối Soát Thanh Toán</h1>
          <p className="billing-manager-subtitle">
            Phát hành biểu phí định kỳ hàng tháng, xuất mã VietQR chuyển khoản và đối soát gạch nợ
          </p>
        </div>
        <div style={{ display: 'flex', gap: '0.5rem' }}>
          <button
            onClick={() => {
              fetchInvoices(pagination.page);
              fetchSystemStats();
            }}
            className="billing-manager-btn billing-manager-btn-secondary"
            title="Làm mới danh sách hóa đơn"
          >
            🔄 Tải lại dữ liệu
          </button>
          <button onClick={handleOpenCreateModal} className="billing-manager-btn billing-manager-btn-primary">
            + Lập Biểu Phí Tháng Mới
          </button>
        </div>
      </div>

      {/* THÔNG BÁO TOÀN TRANG */}
      {actionNotice && (
        <div
          className={`billing-manager-alert ${
            actionNotice.type === 'success'
              ? 'billing-manager-alert-success'
              : 'billing-manager-alert-error'
          }`}
        >
          <span>{actionNotice.text}</span>
          <button
            onClick={() => setActionNotice(null)}
            style={{
              background: 'none',
              border: 'none',
              cursor: 'pointer',
              fontWeight: 700,
              textDecoration: 'underline',
              color: 'inherit',
            }}
          >
            Đóng
          </button>
        </div>
      )}

      {/* THÔNG BÁO LỖI NẾU THỐNG KÊ TOÀN HỆ THỐNG THẤT BẠI */}
      {systemStatsError && (
        <div className="billing-manager-alert billing-manager-alert-error" style={{ marginBottom: '1rem' }}>
          <span>{systemStatsError}</span>
        </div>
      )}

      {/* BẢNG THỐNG KÊ TÀI CHÍNH - PHÂN ĐỊNH RÕ RÀNG BA PHẠM VI DỮ LIỆU */}
      <div className="billing-manager-stats-grid">
        {/* NHÓM A: DỮ LIỆU TOÀN HỆ THỐNG (TRUY VẤN ĐỘC LẬP KHÔNG LỌC) */}
        <div className="billing-manager-stat-card billing-manager-stat-card-slate">
          <p className="billing-manager-stat-label">Tổng hóa đơn (Toàn hệ thống)</p>
          <p className="billing-manager-stat-value">
            {systemStatsLoading ? '...' : systemStats.totalInvoices !== null ? systemStats.totalInvoices : 'N/A'}
          </p>
          <span className="billing-manager-stat-helper">Toàn bộ hệ thống (không lọc)</span>
        </div>

        <div className="billing-manager-stat-card billing-manager-stat-card-amber">
          <p className="billing-manager-stat-label" style={{ color: '#d97706' }}>
            Chưa thanh toán (Toàn hệ thống)
          </p>
          <p className="billing-manager-stat-value" style={{ color: '#d97706' }}>
            {systemStatsLoading ? '...' : systemStats.unpaidCount !== null ? systemStats.unpaidCount : 'N/A'}
          </p>
          <span className="billing-manager-stat-helper">Trạng thái UNPAID</span>
        </div>

        <div className="billing-manager-stat-card billing-manager-stat-card-rose">
          <p className="billing-manager-stat-label" style={{ color: '#e11d48' }}>
            Hóa đơn chưa thu đủ (Toàn hệ thống)
          </p>
          <p className="billing-manager-stat-value" style={{ color: '#e11d48' }}>
            {systemStatsLoading ? '...' : systemStats.incompleteCount !== null ? systemStats.incompleteCount : 'N/A'}
          </p>
          <span className="billing-manager-stat-helper">UNPAID + PARTIALLY_PAID</span>
        </div>

        {/* NHÓM B: DỮ LIỆU THEO BỘ LỌC HIỆN TẠI (NẾU ĐANG LỌC) */}
        {(Boolean(monthFilter) || Boolean(roomFilter) || Boolean(statusFilter)) && (
          <div className="billing-manager-stat-card" style={{ borderLeft: '4px solid #0284c7' }}>
            <p className="billing-manager-stat-label" style={{ color: '#0284c7' }}>
              Hóa đơn theo bộ lọc
            </p>
            <p className="billing-manager-stat-value" style={{ color: '#0284c7' }}>
              {loading ? '...' : pagination.total}
            </p>
            <span className="billing-manager-stat-helper">Khớp điều kiện tìm kiếm</span>
          </div>
        )}

        {/* NHÓM C: CHỈ SỐ TIỀN THEO TRANG HIỆN TẠI */}
        <div className="billing-manager-stat-card billing-manager-stat-card-indigo">
          <p className="billing-manager-stat-label" style={{ color: '#4f46e5' }}>
            Tổng phải thu (Trang hiện tại)
          </p>
          <p className="billing-manager-stat-value" style={{ color: '#4f46e5', fontSize: '1.25rem' }}>
            {pageFinancials.totalFormatted}
          </p>
          <span className="billing-manager-stat-helper">Trang {pagination.page}/{pagination.totalPages}</span>
        </div>

        <div className="billing-manager-stat-card billing-manager-stat-card-emerald">
          <p className="billing-manager-stat-label" style={{ color: '#059669' }}>
            Đã thu (Trang hiện tại)
          </p>
          <p className="billing-manager-stat-value" style={{ color: '#059669', fontSize: '1.25rem' }}>
            {pageFinancials.paidFormatted}
          </p>
          <span className="billing-manager-stat-helper">Trang {pagination.page}/{pagination.totalPages}</span>
        </div>

        <div className="billing-manager-stat-card billing-manager-stat-card-rose">
          <p className="billing-manager-stat-label" style={{ color: '#be123c' }}>
            Công nợ còn thiếu (Trang hiện tại)
          </p>
          <p className="billing-manager-stat-value" style={{ color: '#be123c', fontSize: '1.25rem' }}>
            {pageFinancials.remainingFormatted}
          </p>
          <span className="billing-manager-stat-helper">Trang {pagination.page}/{pagination.totalPages}</span>
        </div>
      </div>
      <p className="billing-manager-stats-notice">
        * Ghi chú: Chỉ số tiền được tính từ các hóa đơn đang hiển thị trên trang hiện tại ({invoices.length} hóa đơn, trang {pagination.page}/{pagination.totalPages}). Các chỉ số số lượng được thống kê độc lập trên toàn bộ hệ thống.
      </p>

      {/* BỘ LỌC HÓA ĐƠN */}
      <div className="billing-manager-card billing-manager-filter-box">
        <div className="billing-manager-filter-grid">
          <div className="billing-manager-form-group">
            <label className="billing-manager-form-label">Kỳ hóa đơn (tháng)</label>
            <input
              type="month"
              value={monthFilter}
              onChange={(e) => setMonthFilter(e.target.value)}
              className="billing-manager-input"
            />
          </div>

          <div className="billing-manager-form-group">
            <label className="billing-manager-form-label">Căn hộ</label>
            <select
              value={roomFilter}
              onChange={(e) => setRoomFilter(e.target.value)}
              className="billing-manager-select"
            >
              <option value="">Tất cả căn hộ</option>
              {availableRooms.map((r) => (
                <option key={r.id} value={r.id}>
                  Phòng {r.roomNumber} (Tầng {r.floor})
                </option>
              ))}
            </select>
          </div>

          <div className="billing-manager-form-group">
            <label className="billing-manager-form-label">Trạng thái thanh toán</label>
            <select
              value={statusFilter}
              onChange={(e) => setStatusFilter(e.target.value)}
              className="billing-manager-select"
            >
              <option value="">Tất cả trạng thái</option>
              <option value="UNPAID">Chưa thanh toán (UNPAID)</option>
              <option value="PARTIALLY_PAID">Thanh toán một phần (PARTIALLY_PAID)</option>
              <option value="PAID">Đã thanh toán đủ (PAID)</option>
            </select>
          </div>

          <div>
            <button
              type="button"
              onClick={() => {
                setMonthFilter('');
                setRoomFilter('');
                setStatusFilter('');
              }}
              className="billing-manager-btn billing-manager-btn-secondary"
              style={{ width: '100%' }}
            >
              Xóa bộ lọc
            </button>
          </div>
        </div>
      </div>

      {/* LỖI NẾU CÓ */}
      {errorMessage && (
        <div className="billing-manager-alert billing-manager-alert-error">
          <span>{errorMessage}</span>
          <button
            onClick={() => fetchInvoices(pagination.page)}
            className="billing-manager-btn billing-manager-btn-sm billing-manager-btn-secondary"
          >
            Thử lại
          </button>
        </div>
      )}

      {/* BẢNG DANH SÁCH HÓA ĐƠN */}
      <div className="billing-manager-card">
        <div className="billing-manager-table-wrap">
          <table className="billing-manager-table">
            <thead>
              <tr>
                <th>Mã</th>
                <th>Căn Hộ</th>
                <th>Kỳ Tháng</th>
                <th>Phí QL</th>
                <th>Phí Xe</th>
                <th>Tiền Nước</th>
                <th>Phí Khác</th>
                <th>Tổng Tiền</th>
                <th>Đã Nộp</th>
                <th>Còn Thiếu</th>
                <th>Hạn Nộp</th>
                <th>Trạng Thái</th>
                <th style={{ textAlign: 'right' }}>Thao Tác</th>
              </tr>
            </thead>
            <tbody>
              {loading ? (
                <tr>
                  <td colSpan={13} style={{ textAlign: 'center', padding: '2.5rem', color: '#94a3b8' }}>
                    ⏳ Đang tải danh sách hóa đơn...
                  </td>
                </tr>
              ) : invoices.length === 0 ? (
                <tr>
                  <td colSpan={13} style={{ textAlign: 'center', padding: '3rem', color: '#94a3b8' }}>
                    <p style={{ margin: 0, fontWeight: 600, color: '#475569' }}>
                      Chưa có hóa đơn nào phù hợp
                    </p>
                    <p style={{ margin: '0.25rem 0 0 0', fontSize: '0.75rem' }}>
                      Bấm "+ Lập Biểu Phí Tháng Mới" để bắt đầu phát hành hóa đơn
                    </p>
                  </td>
                </tr>
              ) : (
                invoices.map((invoice) => {
                  const totalCents = toCents(invoice.totalAmount, true);
                  const paidCents = toCents(invoice.paidAmount, true);
                  const remainingCents = subtractMoney(totalCents, paidCents);

                  const dueFormatted = invoice.dueDate
                    ? new Date(invoice.dueDate).toLocaleDateString('vi-VN')
                    : '-';

                  return (
                    <tr key={invoice.id}>
                      <td style={{ fontFamily: 'monospace', fontWeight: 700, color: '#475569' }}>
                        #{invoice.id}
                      </td>
                      <td>
                        <span style={{ fontWeight: 700, color: '#4f46e5' }}>
                          P.{invoice.room?.roomNumber || invoice.roomId}
                        </span>
                        {invoice.room?.floor !== undefined && (
                          <span style={{ fontSize: '0.6875rem', color: '#94a3b8', display: 'block' }}>
                            Tầng {invoice.room.floor}
                          </span>
                        )}
                      </td>
                      <td style={{ fontWeight: 600, color: '#0f172a' }}>{invoice.month}</td>
                      <td>{formatCurrency(invoice.managementFee, true, MAX_SAFE_FEE_CENTS)}</td>
                      <td>{formatCurrency(invoice.parkingFee, true, MAX_SAFE_FEE_CENTS)}</td>
                      <td>{formatCurrency(invoice.waterFee, true, MAX_SAFE_FEE_CENTS)}</td>
                      <td>{formatCurrency(invoice.otherFee, true, MAX_SAFE_FEE_CENTS)}</td>
                      <td style={{ fontWeight: 700, color: '#0f172a' }}>{formatCents(totalCents)}</td>
                      <td style={{ fontWeight: 600, color: '#059669' }}>{formatCents(paidCents)}</td>
                      <td style={{ fontWeight: 700, color: '#e11d48' }}>{formatCents(remainingCents)}</td>
                      <td style={{ fontSize: '0.75rem', color: '#64748b', whiteSpace: 'nowrap' }}>
                        {dueFormatted}
                      </td>
                      <td>
                        {invoice.status === 'UNPAID' && (
                          <span className="billing-manager-badge billing-manager-badge-unpaid">
                            Chưa thanh toán
                          </span>
                        )}
                        {invoice.status === 'PARTIALLY_PAID' && (
                          <span className="billing-manager-badge billing-manager-badge-partially">
                            Trả một phần
                          </span>
                        )}
                        {invoice.status === 'PAID' && (
                          <span className="billing-manager-badge billing-manager-badge-paid">
                            ✓ Đã thanh toán
                          </span>
                        )}
                      </td>
                      <td style={{ textAlign: 'right', whiteSpace: 'nowrap' }}>
                        <div style={{ display: 'flex', gap: '0.375rem', justifyContent: 'flex-end' }}>
                          <button
                            onClick={() => handleOpenVietQrModal(invoice)}
                            className="billing-manager-btn billing-manager-btn-sm billing-manager-btn-secondary"
                            title="Xuất mã VietQR thanh toán"
                          >
                            QR VietQR
                          </button>

                          {invoice.status !== 'PAID' ? (
                            <button
                              onClick={() => handleOpenPayModal(invoice)}
                              className="billing-manager-btn billing-manager-btn-sm billing-manager-btn-success"
                              title="Đối soát và thu tiền"
                            >
                              Thu tiền
                            </button>
                          ) : (
                            <span
                              style={{
                                fontSize: '0.6875rem',
                                color: '#059669',
                                fontWeight: 700,
                                padding: '0.25rem 0.5rem',
                              }}
                            >
                              Đã thu đủ
                            </span>
                          )}

                          {invoice.payments && invoice.payments.length > 0 && (
                            <button
                              onClick={() => setViewingPaymentsInvoice(invoice)}
                              className="billing-manager-btn billing-manager-btn-sm billing-manager-btn-secondary"
                              title="Xem các lần nộp tiền"
                            >
                              Lịch sử ({invoice.payments.length})
                            </button>
                          )}
                        </div>
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>

        {/* PHÂN TRANG HÓA ĐƠN */}
        {pagination.totalPages > 1 && (
          <div className="billing-manager-pagination">
            <span>
              Trang {pagination.page} / {pagination.totalPages} (Tổng số {pagination.total} hóa đơn)
            </span>
            <div style={{ display: 'flex', gap: '0.5rem' }}>
              <button
                disabled={pagination.page <= 1}
                onClick={() => fetchInvoices(pagination.page - 1)}
                className="billing-manager-btn billing-manager-btn-sm billing-manager-btn-secondary"
              >
                Trang trước
              </button>
              <button
                disabled={pagination.page >= pagination.totalPages}
                onClick={() => fetchInvoices(pagination.page + 1)}
                className="billing-manager-btn billing-manager-btn-sm billing-manager-btn-secondary"
              >
                Trang sau
              </button>
            </div>
          </div>
        )}
      </div>

      {/* =================================================================== */}
      {/* MODAL 1: LẬP BIỂU PHÍ MỚI (POST /api/invoices - BẮT 409 CHUẨN MỰC) */}
      {/* =================================================================== */}
      {isCreateModalOpen && (
        <div
          className="billing-manager-modal-overlay"
          onClick={(e) => {
            if (e.target === e.currentTarget && !createSubmitting) {
              setIsCreateModalOpen(false);
            }
          }}
        >
          <div className="billing-manager-modal-box">
            <div className="billing-manager-modal-header">
              <h3 className="billing-manager-modal-title">Lập Biểu Phí Hóa Đơn Định Kỳ Mới</h3>
              <button
                type="button"
                onClick={() => !createSubmitting && setIsCreateModalOpen(false)}
                className="billing-manager-modal-close"
              >
                ✕
              </button>
            </div>

            <form onSubmit={handleSubmitCreateInvoice}>
              <div className="billing-manager-modal-body">
                {createError && (
                  <div className="billing-manager-alert billing-manager-alert-error" style={{ margin: 0 }}>
                    {createError}
                  </div>
                )}
                {createSuccess && (
                  <div
                    className="billing-manager-alert billing-manager-alert-success"
                    style={{ margin: 0 }}
                  >
                    {createSuccess}
                  </div>
                )}

                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0.75rem' }}>
                  <div className="billing-manager-form-group">
                    <label className="billing-manager-form-label">
                      Căn hộ áp dụng <span style={{ color: '#ef4444' }}>*</span>
                    </label>
                    <select
                      required
                      value={createFormData.roomId}
                      onChange={(e) => setCreateFormData({ ...createFormData, roomId: e.target.value })}
                      className="billing-manager-select"
                    >
                      <option value="">-- Chọn căn hộ --</option>
                      {availableRooms.map((r) => (
                        <option key={r.id} value={r.id}>
                          Phòng {r.roomNumber} (Tầng {r.floor})
                        </option>
                      ))}
                    </select>
                  </div>

                  <div className="billing-manager-form-group">
                    <label className="billing-manager-form-label">
                      Kỳ hóa đơn (tháng) <span style={{ color: '#ef4444' }}>*</span>
                    </label>
                    <input
                      type="month"
                      required
                      value={createFormData.month}
                      onChange={(e) => setCreateFormData({ ...createFormData, month: e.target.value })}
                      className="billing-manager-input"
                    />
                  </div>
                </div>

                <div className="billing-manager-form-group">
                  <label className="billing-manager-form-label">Hạn nộp tiền (dueDate)</label>
                  <input
                    type="date"
                    value={createFormData.dueDate}
                    onChange={(e) => setCreateFormData({ ...createFormData, dueDate: e.target.value })}
                    className="billing-manager-input"
                  />
                </div>

                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0.75rem' }}>
                  <div className="billing-manager-form-group">
                    <label className="billing-manager-form-label">Phí quản lý (VND)</label>
                    <input
                      type="number"
                      min="0"
                      step="any"
                      value={createFormData.managementFee}
                      onChange={(e) =>
                        setCreateFormData({ ...createFormData, managementFee: e.target.value })
                      }
                      className="billing-manager-input"
                    />
                  </div>

                  <div className="billing-manager-form-group">
                    <label className="billing-manager-form-label">Phí gửi xe (VND)</label>
                    <input
                      type="number"
                      min="0"
                      step="any"
                      value={createFormData.parkingFee}
                      onChange={(e) =>
                        setCreateFormData({ ...createFormData, parkingFee: e.target.value })
                      }
                      className="billing-manager-input"
                    />
                  </div>

                  <div className="billing-manager-form-group">
                    <label className="billing-manager-form-label">Tiền nước sinh hoạt (VND)</label>
                    <input
                      type="number"
                      min="0"
                      step="any"
                      value={createFormData.waterFee}
                      onChange={(e) =>
                        setCreateFormData({ ...createFormData, waterFee: e.target.value })
                      }
                      className="billing-manager-input"
                    />
                  </div>

                  <div className="billing-manager-form-group">
                    <label className="billing-manager-form-label">Chi phí khác (VND)</label>
                    <input
                      type="number"
                      min="0"
                      step="any"
                      value={createFormData.otherFee}
                      onChange={(e) =>
                        setCreateFormData({ ...createFormData, otherFee: e.target.value })
                      }
                      className="billing-manager-input"
                    />
                  </div>
                </div>

                {/* TÍNH TOÁN REALTIME TỔNG TIỀN BẰNG CENTS */}
                <div
                  style={{
                    padding: '0.75rem',
                    backgroundColor: '#eef2ff',
                    borderRadius: '0.5rem',
                    border: '1px solid #c7d2fe',
                    display: 'flex',
                    justifyContent: 'space-between',
                    alignItems: 'center',
                  }}
                >
                  <span style={{ fontSize: '0.75rem', fontWeight: 700, color: '#312e81' }}>
                    Tổng tiền dự kiến:
                  </span>
                  <span style={{ fontSize: '1rem', fontWeight: 700, color: '#4f46e5' }}>
                    {formatCents(calculatedTotalNewInvoiceCents)}
                  </span>
                </div>

                <div className="billing-manager-modal-footer">
                  <button
                    type="button"
                    onClick={() => setIsCreateModalOpen(false)}
                    disabled={createSubmitting}
                    className="billing-manager-btn billing-manager-btn-secondary"
                  >
                    Hủy bỏ
                  </button>
                  <button
                    type="submit"
                    disabled={createSubmitting}
                    className="billing-manager-btn billing-manager-btn-primary"
                  >
                    {createSubmitting ? 'Đang tạo...' : 'Xác Nhận Lập Hóa Đơn'}
                  </button>
                </div>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* =================================================================== */}
      {/* MODAL 2: XEM MÃ VIETQR (GET /api/invoices/:id/vietqr) */}
      {/* =================================================================== */}
      {isQrModalOpen && (
        <div
          className="billing-manager-modal-overlay"
          onClick={(e) => {
            if (e.target === e.currentTarget) {
              setIsQrModalOpen(false);
            }
          }}
        >
          <div className="billing-manager-modal-box">
            <div className="billing-manager-modal-header">
              <h3 className="billing-manager-modal-title">Mã VietQR Thanh Toán Hóa Đơn</h3>
              <button
                type="button"
                onClick={() => setIsQrModalOpen(false)}
                className="billing-manager-modal-close"
              >
                ✕
              </button>
            </div>

            <div className="billing-manager-modal-body">
              {qrLoading ? (
                <div style={{ textAlign: 'center', padding: '2.5rem', color: '#94a3b8' }}>
                  ⏳ Đang kết nối cổng VietQR sinh mã thanh toán...
                </div>
              ) : qrError ? (
                <div className="billing-manager-alert billing-manager-alert-error" style={{ margin: 0 }}>
                  {qrError}
                </div>
              ) : qrData ? (
                <div style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem' }}>
                  <div
                    style={{
                      backgroundColor: '#f8fafc',
                      padding: '0.75rem',
                      borderRadius: '0.5rem',
                      border: '1px solid #e2e8f0',
                      fontSize: '0.75rem',
                      lineHeight: '1.6',
                    }}
                  >
                    <div>
                      <strong>Hóa đơn:</strong> #{qrData.invoiceId} - Căn hộ:{' '}
                      <span style={{ fontWeight: 700, color: '#4f46e5' }}>P.{qrData.roomNumber}</span>
                    </div>
                    <div>
                      <strong>Tổng tiền:</strong> {formatCurrency(qrData.totalAmount, true)}
                    </div>
                    <div>
                      <strong>Đã nộp:</strong> {formatCurrency(qrData.paidAmount, true)}
                    </div>
                    <div>
                      <strong>Số tiền còn lại cần nộp:</strong>{' '}
                      <span style={{ fontWeight: 700, color: '#e11d48' }}>
                        {formatCurrency(qrData.remainingAmount, true)}
                      </span>
                    </div>
                  </div>

                  {qrData.isFullyPaid ? (
                    <div
                      style={{
                        padding: '1.25rem',
                        backgroundColor: '#ecfdf5',
                        borderRadius: '0.5rem',
                        textAlign: 'center',
                        border: '1px solid #a7f3d0',
                        color: '#065f46',
                      }}
                    >
                      <strong style={{ fontSize: '1rem', display: 'block' }}>
                        ✓ Hóa đơn đã được thanh toán 100%
                      </strong>
                      <span style={{ fontSize: '0.75rem' }}>Căn hộ không còn công nợ kỳ này.</span>
                    </div>
                  ) : qrData.vietQrUrl && qrData.vietQrUrl.startsWith('https://') ? (
                    <div style={{ textAlign: 'center', padding: '0.5rem 0' }}>
                      <div
                        style={{
                          display: 'inline-block',
                          padding: '0.75rem',
                          backgroundColor: '#ffffff',
                          border: '2px solid #e0e7ff',
                          borderRadius: '0.75rem',
                          boxShadow: '0 4px 6px -1px rgba(0, 0, 0, 0.1)',
                        }}
                      >
                        <img
                          src={qrData.vietQrUrl}
                          alt="Mã VietQR Thanh Toán"
                          style={{ width: '220px', height: 'auto', display: 'block' }}
                        />
                      </div>
                      <span
                        style={{
                          fontSize: '0.6875rem',
                          color: '#64748b',
                          display: 'block',
                          marginTop: '0.5rem',
                        }}
                      >
                        Quét mã trên ứng dụng ngân hàng để chuyển khoản nhanh 24/7
                      </span>
                    </div>
                  ) : (
                    <div
                      style={{
                        padding: '1rem',
                        backgroundColor: '#fffbeb',
                        color: '#92400e',
                        borderRadius: '0.5rem',
                        fontSize: '0.75rem',
                        textAlign: 'center',
                        border: '1px solid #fde68a',
                      }}
                    >
                      Cổng sinh mã VietQR tạm thời không phản hồi. Vui lòng chuyển khoản thông thường tới số tài khoản BQL.
                    </div>
                  )}

                  {/* CẢNH BÁO BẮT BUỘC NGUYÊN VĂN THEO CHỈ THỊ */}
                  <div
                    style={{
                      padding: '0.75rem',
                      backgroundColor: '#fffbeb',
                      border: '1px solid #fde68a',
                      borderRadius: '0.5rem',
                      fontSize: '0.75rem',
                      color: '#92400e',
                      lineHeight: '1.5',
                      fontWeight: 600,
                    }}
                  >
                    ⚠️ Lưu ý: Quét mã VietQR chỉ hỗ trợ điền thông tin chuyển khoản tự động, không tự động gạch nợ. Ban quản lý cần đối soát sao kê ngân hàng trước khi bấm xác nhận thanh toán.
                  </div>
                </div>
              ) : null}

              <div className="billing-manager-modal-footer">
                <button
                  type="button"
                  onClick={() => setIsQrModalOpen(false)}
                  className="billing-manager-btn billing-manager-btn-secondary"
                >
                  Đóng
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* =================================================================== */}
      {/* MODAL 3: ĐỐI SOÁT & XÁC NHẬN THANH TOÁN (CHỐNG NỘP THỪA) */}
      {/* =================================================================== */}
      {isPayModalOpen && payInvoice && (
        <div
          className="billing-manager-modal-overlay"
          onClick={(e) => {
            if (e.target === e.currentTarget && !paySubmitting) {
              setIsPayModalOpen(false);
            }
          }}
        >
          <div className="billing-manager-modal-box">
            <div className="billing-manager-modal-header">
              <h3 className="billing-manager-modal-title">
                Đối Soát & Xác Nhận Thu Tiền [Hóa đơn #{payInvoice.id}]
              </h3>
              <button
                type="button"
                onClick={() => !paySubmitting && setIsPayModalOpen(false)}
                className="billing-manager-modal-close"
              >
                ✕
              </button>
            </div>

            <form onSubmit={handleSubmitPayment}>
              <div className="billing-manager-modal-body">
                {payError && (
                  <div className="billing-manager-alert billing-manager-alert-error" style={{ margin: 0 }}>
                    {payError}
                  </div>
                )}
                {paySuccess && (
                  <div
                    className="billing-manager-alert billing-manager-alert-success"
                    style={{ margin: 0 }}
                  >
                    {paySuccess}
                  </div>
                )}

                <div
                  style={{
                    backgroundColor: '#f8fafc',
                    padding: '0.75rem',
                    borderRadius: '0.5rem',
                    border: '1px solid #e2e8f0',
                    fontSize: '0.75rem',
                    lineHeight: '1.6',
                  }}
                >
                  <div>
                    <strong>Căn hộ:</strong> P.{payInvoice.room?.roomNumber || payInvoice.roomId} - Kỳ:{' '}
                    <span style={{ fontWeight: 700, color: '#4f46e5' }}>{payInvoice.month}</span>
                  </div>
                  <div>
                    <strong>Tổng tiền:</strong> {formatCurrency(payInvoice.totalAmount, true)}
                  </div>
                  <div>
                    <strong>Đã nộp trước:</strong> {formatCurrency(payInvoice.paidAmount, true)}
                  </div>
                  <div>
                    <strong>Số tiền còn thiếu:</strong>{' '}
                    <span style={{ fontWeight: 700, color: '#e11d48' }}>
                      {formatCents(
                        subtractMoney(
                          toCents(payInvoice.totalAmount, true),
                          toCents(payInvoice.paidAmount, true)
                        )
                      )}
                    </span>
                  </div>
                </div>

                <div className="billing-manager-form-group">
                  <label className="billing-manager-form-label">
                    Số tiền thực thu lần này (VND) <span style={{ color: '#ef4444' }}>*</span>
                  </label>
                  <input
                    type="number"
                    required
                    min="0.01"
                    step="any"
                    value={payFormData.paidAmount}
                    onChange={(e) => setPayFormData({ ...payFormData, paidAmount: e.target.value })}
                    className="billing-manager-input"
                  />
                </div>

                <div className="billing-manager-form-group">
                  <label className="billing-manager-form-label">
                    Phương thức thanh toán <span style={{ color: '#ef4444' }}>*</span>
                  </label>
                  <select
                    value={payFormData.paymentMethod}
                    onChange={(e) =>
                      setPayFormData({
                        ...payFormData,
                        paymentMethod: e.target.value as PaymentMethodType,
                      })
                    }
                    className="billing-manager-select"
                  >
                    <option value="VIETQR">Quét mã VietQR ngân hàng</option>
                    <option value="BANK_TRANSFER">Chuyển khoản trực tiếp</option>
                    <option value="CASH">Tiền mặt tại quầy Ban quản lý</option>
                  </select>
                </div>

                <div className="billing-manager-form-group">
                  <label className="billing-manager-form-label">
                    Mã chuẩn chi / Mã giao dịch ngân hàng (transactionCode)
                  </label>
                  <input
                    type="text"
                    maxLength={100}
                    placeholder="Ví dụ: FT2610..., VCB987..."
                    value={payFormData.transactionCode}
                    onChange={(e) =>
                      setPayFormData({ ...payFormData, transactionCode: e.target.value })
                    }
                    className="billing-manager-input"
                  />
                </div>

                <div className="billing-manager-form-group">
                  <label className="billing-manager-form-label">Ghi chú đối soát sao kê (note)</label>
                  <textarea
                    rows={2}
                    maxLength={500}
                    placeholder="Ghi chú xác nhận khớp tiền..."
                    value={payFormData.note}
                    onChange={(e) => setPayFormData({ ...payFormData, note: e.target.value })}
                    className="billing-manager-textarea"
                  />
                </div>

                <div className="billing-manager-modal-footer">
                  <button
                    type="button"
                    onClick={() => setIsPayModalOpen(false)}
                    disabled={paySubmitting}
                    className="billing-manager-btn billing-manager-btn-secondary"
                  >
                    Hủy bỏ
                  </button>
                  <button
                    type="submit"
                    disabled={paySubmitting}
                    className="billing-manager-btn billing-manager-btn-success"
                  >
                    {paySubmitting ? 'Đang đối soát...' : 'Xác Nhận Đã Thu Tiền'}
                  </button>
                </div>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* =================================================================== */}
      {/* MODAL 4: XEM LỊCH SỬ THANH TOÁN (PAYMENTS HISTORY) */}
      {/* =================================================================== */}
      {viewingPaymentsInvoice && (
        <div
          className="billing-manager-modal-overlay"
          onClick={(e) => {
            if (e.target === e.currentTarget) {
              setViewingPaymentsInvoice(null);
            }
          }}
        >
          <div className="billing-manager-modal-box">
            <div className="billing-manager-modal-header">
              <h3 className="billing-manager-modal-title">
                Lịch Sử Thanh Toán [Hóa Đơn #{viewingPaymentsInvoice.id}]
              </h3>
              <button
                type="button"
                onClick={() => setViewingPaymentsInvoice(null)}
                className="billing-manager-modal-close"
              >
                ✕
              </button>
            </div>

            <div className="billing-manager-modal-body">
              <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem', maxHeight: '280px', overflowY: 'auto' }}>
                {viewingPaymentsInvoice.payments?.map((payment) => (
                  <div
                    key={payment.id}
                    style={{
                      padding: '0.75rem',
                      backgroundColor: '#f8fafc',
                      borderRadius: '0.5rem',
                      border: '1px solid #e2e8f0',
                      fontSize: '0.75rem',
                      lineHeight: '1.5',
                    }}
                  >
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                      <span style={{ fontWeight: 700, color: '#059669', fontSize: '0.875rem' }}>
                        +{formatCurrency(payment.amount, true, MAX_PAYMENT_CENTS)}
                      </span>
                      <span style={{ color: '#94a3b8' }}>
                        {payment.paidAt ? new Date(payment.paidAt).toLocaleString('vi-VN') : '-'}
                      </span>
                    </div>
                    <div>
                      <strong>Phương thức:</strong> {payment.paymentMethod}
                    </div>
                    {payment.transactionCode && (
                      <div>
                        <strong>Mã chuẩn chi:</strong>{' '}
                        <span style={{ fontFamily: 'monospace' }}>{payment.transactionCode}</span>
                      </div>
                    )}
                    {payment.note && (
                      <div>
                        <strong>Ghi chú:</strong> {payment.note}
                      </div>
                    )}
                  </div>
                ))}
              </div>

              <div className="billing-manager-modal-footer">
                <button
                  type="button"
                  onClick={() => setViewingPaymentsInvoice(null)}
                  className="billing-manager-btn billing-manager-btn-secondary"
                >
                  Đóng
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
