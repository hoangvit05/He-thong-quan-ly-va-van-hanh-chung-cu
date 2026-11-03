// =========================================================================
// TRANG QUẢN LÝ HÓA ĐƠN & ĐỐI SOÁT THANH TOÁN (BILLING MANAGER PAGE)
// Phụ trách: Thành viên Đức (Senior React + TypeScript Frontend Developer)
// Phạm vi: web/src/pages/BillingManagerPage.tsx
// Chuẩn hóa: Civic Clarity + Warm Modern Design System (WCAG 2.2 AA)
// Đặc tả an toàn:
//   1. Decimal Precision: Tính toán tiền tệ chính xác qua cents (chặn sai số float).
//   2. Anti-Race Condition: Request Sequence Counters độc lập.
//   3. Chống nộp thừa (Overpayment Guard) & Kiểm soát chuyển trạng thái.
//   4. Chống trùng lặp: Bắt lỗi 409 chuẩn: "Căn hộ này đã được lập hóa đơn tháng này rồi".
//   5. Đối soát thanh toán minh bạch: Không tự động chuyển PAID chỉ vì có mã QR.
// =========================================================================

import React, { useState, useEffect, useCallback, useMemo, useRef } from 'react';
import axiosClient from '../api/axiosClient';
import { API_ENDPOINTS } from '../api/endpoints';
import { ApiEnvelope } from '../utils/auth';
import {
  Button,
  Card,
  CardHeader,
  CardTitle,
  StatCard,
  Badge,
  Modal,
  Pagination,
  LoadingSpinner,
  EmptyState,
  AlertBanner,
} from '../components/common';

// -------------------------------------------------------------------------
// ĐỊNH NGHĨA KIỂU DỮ LIỆU CỤC BỘ (STRICT TYPESCRIPT)
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
// -------------------------------------------------------------------------

export const MAX_SAFE_FEE_CENTS = 99999999999; // 999,999,999.99 VND
export const MAX_INVOICE_CENTS = 999999999999; // 9,999,999,999.99 VND
export const MAX_PAYMENT_CENTS = 999999999999; // 9,999,999,999.99 VND

export interface DecimalParseResult {
  isValid: boolean;
  cents: number;
  error?: string;
}

export function parseDecimalToCents(
  val: unknown,
  fieldName = 'Số tiền',
  isRequired = true,
  maxAllowedCents: number = MAX_INVOICE_CENTS
): DecimalParseResult {
  if (val === undefined || val === null || val === '') {
    if (isRequired) {
      return { isValid: false, cents: 0, error: `${fieldName} không được để trống.` };
    }
    return { isValid: true, cents: 0 };
  }

  let str = '';
  if (typeof val === 'number') {
    if (!Number.isFinite(val) || Number.isNaN(val)) {
      return { isValid: false, cents: 0, error: `${fieldName} không phải là số hợp lệ.` };
    }
    if (val < 0) {
      return { isValid: false, cents: 0, error: `${fieldName} không được âm.` };
    }
    str = val.toString();
  } else if (typeof val === 'string') {
    str = val.trim();
    if (str === '') {
      if (isRequired) {
        return { isValid: false, cents: 0, error: `${fieldName} không được để trống.` };
      }
      return { isValid: true, cents: 0 };
    }
  } else {
    return { isValid: false, cents: 0, error: `${fieldName} có kiểu dữ liệu không hợp lệ.` };
  }

  const parts = str.split('.');
  if (parts.length > 2) {
    return { isValid: false, cents: 0, error: `${fieldName} sai định dạng số thập phân.` };
  }

  const intPartStr = parts[0];
  const decPartStr = parts.length === 2 ? parts[1] : '';

  if (!/^\d+$/.test(intPartStr)) {
    return { isValid: false, cents: 0, error: `${fieldName} chứa ký tự không hợp lệ.` };
  }

  if (parts.length === 2) {
    if (!/^\d+$/.test(decPartStr)) {
      return { isValid: false, cents: 0, error: `Phần thập phân của ${fieldName} không hợp lệ.` };
    }
    if (decPartStr.length > 2) {
      return { isValid: false, cents: 0, error: `${fieldName} chỉ được tối đa 2 chữ số thập phân.` };
    }
  }

  const intVal = parseInt(intPartStr, 10);
  const decVal = decPartStr.length === 0 ? 0 : decPartStr.length === 1 ? parseInt(decPartStr, 10) * 10 : parseInt(decPartStr, 10);

  const totalCents = intVal * 100 + decVal;

  if (!Number.isSafeInteger(totalCents)) {
    return { isValid: false, cents: 0, error: `${fieldName} vượt quá giới hạn tính toán an toàn của hệ thống.` };
  }

  if (totalCents > maxAllowedCents) {
    const maxVndFormatted = (maxAllowedCents / 100).toLocaleString('vi-VN');
    return { isValid: false, cents: 0, error: `${fieldName} vượt quá giới hạn tối đa cho phép (${maxVndFormatted} VND).` };
  }

  return { isValid: true, cents: totalCents };
}

export function toCents(
  val: unknown,
  isRequired = true,
  maxAllowedCents: number = MAX_INVOICE_CENTS
): number | null {
  const res = parseDecimalToCents(val, 'Số tiền', isRequired, maxAllowedCents);
  return res.isValid ? res.cents : null;
}

export function addMoney(aCents: number | null, bCents: number | null): number | null {
  if (aCents === null || bCents === null) return null;
  if (!Number.isSafeInteger(aCents) || !Number.isSafeInteger(bCents)) return null;
  const sum = aCents + bCents;
  return Number.isSafeInteger(sum) ? sum : null;
}

export function subtractMoney(aCents: number | null, bCents: number | null): number | null {
  if (aCents === null || bCents === null) return null;
  if (!Number.isSafeInteger(aCents) || !Number.isSafeInteger(bCents)) return null;
  return Math.max(0, aCents - bCents);
}

export function centsToApiNumber(cents: number | null): number {
  if (cents === null || !Number.isFinite(cents) || Number.isNaN(cents)) {
    throw new Error('Số tiền không hợp lệ.');
  }
  return cents / 100;
}

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
  const isMountedRef = useRef<boolean>(true);
  useEffect(() => {
    isMountedRef.current = true;
    return () => {
      isMountedRef.current = false;
    };
  }, []);

  // Request Sequence Counters độc lập
  const invoicesListSeqRef = useRef<number>(0);
  const invoicesStatsSeqRef = useRef<number>(0);
  const roomsOptionsSeqRef = useRef<number>(0);

  // STATE: Danh sách & phân trang
  const [invoices, setInvoices] = useState<InvoiceItem[]>([]);
  const [loading, setLoading] = useState<boolean>(false);
  const [errorMessage, setErrorMessage] = useState<string>('');
  const [pagination, setPagination] = useState<PaginationMeta>({
    page: 1,
    limit: 15,
    total: 0,
    totalPages: 1,
  });

  // STATE: Bộ lọc
  const [monthFilter, setMonthFilter] = useState<string>('');
  const [roomFilter, setRoomFilter] = useState<string>('');
  const [statusFilter, setStatusFilter] = useState<string>('');
  const [availableRooms, setAvailableRooms] = useState<RoomOption[]>([]);

  // STATE: Thống kê hệ thống độc lập
  const [systemStats, setSystemStats] = useState<{
    totalInvoices: number | null;
    unpaidCount: number | null;
    partiallyPaidCount: number | null;
    incompleteCount: number | null;
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

  // STATE: Modal Tạo hóa đơn mới
  const [isCreateModalOpen, setIsCreateModalOpen] = useState<boolean>(false);
  const [createFormData, setCreateFormData] = useState({
    roomId: '',
    month: new Date().toISOString().slice(0, 7),
    dueDate: '',
    managementFee: '0',
    parkingFee: '0',
    waterFee: '0',
    otherFee: '0',
  });
  const [createSubmitting, setCreateSubmitting] = useState<boolean>(false);
  const [createError, setCreateError] = useState<string>('');
  const [createSuccess, setCreateSuccess] = useState<string>('');

  // STATE: Modal Xem mã VietQR
  const [isQrModalOpen, setIsQrModalOpen] = useState<boolean>(false);
  const [qrLoading, setQrLoading] = useState<boolean>(false);
  const [qrError, setQrError] = useState<string>('');
  const [qrData, setQrData] = useState<VietQrData | null>(null);
  const [currentQrInvoice, setCurrentQrInvoice] = useState<InvoiceItem | null>(null);

  // STATE: Modal Đối soát thanh toán
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

  // STATE: Modal Xem lịch sử thanh toán
  const [viewingPaymentsInvoice, setViewingPaymentsInvoice] = useState<InvoiceItem | null>(null);

  // Thông báo toàn trang
  const [actionNotice, setActionNotice] = useState<{ type: 'success' | 'error'; text: string } | null>(null);

  const parseErrorMessage = (err: unknown, fallback: string): string => {
    if (typeof err === 'object' && err !== null) {
      const apiErr = err as ApiErrorShape;
      if (typeof apiErr.message === 'string' && apiErr.message.trim()) {
        return apiErr.message;
      }
    }
    return fallback;
  };

  // Nạp danh sách căn hộ phục vụ dropdown
  const fetchRoomsForFilter = useCallback(async () => {
    const seq = ++roomsOptionsSeqRef.current;
    try {
      const res = (await axiosClient.get(
        `${API_ENDPOINTS.ROOMS.LIST}?page=1&limit=200`
      )) as unknown as ApiEnvelope<RoomOption[]>;

      if (seq !== roomsOptionsSeqRef.current || !isMountedRef.current) return;
      if (res && Array.isArray(res.data)) {
        setAvailableRooms(res.data);
      }
    } catch {
      // Giữ danh sách cũ
    }
  }, []);

  // Nạp thống kê độc lập toàn hệ thống
  const fetchSystemStats = useCallback(async () => {
    const seq = ++invoicesStatsSeqRef.current;
    setSystemStatsLoading(true);
    setSystemStatsError('');

    try {
      const [totalRes, unpaidRes, partialRes, paidRes] = await Promise.allSettled([
        axiosClient.get(`${API_ENDPOINTS.INVOICES.LIST}?page=1&limit=1`),
        axiosClient.get(`${API_ENDPOINTS.INVOICES.LIST}?status=UNPAID&page=1&limit=1`),
        axiosClient.get(`${API_ENDPOINTS.INVOICES.LIST}?status=PARTIALLY_PAID&page=1&limit=1`),
        axiosClient.get(`${API_ENDPOINTS.INVOICES.LIST}?status=PAID&page=1&limit=1`),
      ]);

      if (seq !== invoicesStatsSeqRef.current || !isMountedRef.current) return;

      let hasFailures = false;
      const extractTotal = (res: PromiseSettledResult<unknown>): number | null => {
        if (res.status === 'fulfilled') {
          const env = res.value as unknown as ApiEnvelope<unknown[]>;
          if (
            typeof env?.pagination?.total === 'number' &&
            Number.isFinite(env.pagination.total) &&
            env.pagination.total >= 0
          ) {
            return env.pagination.total;
          }
        }
        hasFailures = true;
        return null;
      };

      const total = extractTotal(totalRes);
      const unpaid = extractTotal(unpaidRes);
      const partial = extractTotal(partialRes);
      const paid = extractTotal(paidRes);

      let incomplete: number | null = null;
      if (unpaid !== null && partial !== null) {
        incomplete = unpaid + partial;
      }

      if (hasFailures) {
        setSystemStatsError('Không thể nạp đầy đủ số liệu thống kê hóa đơn từ máy chủ.');
      } else {
        setSystemStatsError('');
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
        setSystemStatsError(parseErrorMessage(err, 'Lỗi nạp thống kê hóa đơn.'));
      }
    } finally {
      if (seq === invoicesStatsSeqRef.current && isMountedRef.current) {
        setSystemStatsLoading(false);
      }
    }
  }, []);

  // Nạp danh sách hóa đơn theo trang và bộ lọc
  const fetchInvoices = useCallback(
    async (targetPage = 1) => {
      const currentSeq = ++invoicesListSeqRef.current;
      setLoading(true);
      setErrorMessage('');

      try {
        const queryParams = new URLSearchParams();
        queryParams.set('page', String(targetPage));
        queryParams.set('limit', String(pagination.limit));

        if (monthFilter) {
          queryParams.set('month', monthFilter);
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

        if (currentSeq !== invoicesListSeqRef.current || !isMountedRef.current) return;

        let list: InvoiceItem[] = [];
        let meta: PaginationMeta = {
          page: targetPage,
          limit: pagination.limit,
          total: 0,
          totalPages: 1,
        };

        if (res && typeof res === 'object') {
          if (Array.isArray(res.data)) list = res.data;
          if (res.pagination) meta = res.pagination;
        }

        setInvoices(list);
        setPagination(meta);
      } catch (err: unknown) {
        if (currentSeq !== invoicesListSeqRef.current || !isMountedRef.current) return;
        setErrorMessage(parseErrorMessage(err, 'Không thể nạp danh sách hóa đơn từ máy chủ.'));
        setInvoices([]);
      } finally {
        if (currentSeq === invoicesListSeqRef.current && isMountedRef.current) {
          setLoading(false);
        }
      }
    },
    [monthFilter, roomFilter, statusFilter, pagination.limit]
  );

  useEffect(() => {
    fetchRoomsForFilter();
    fetchSystemStats();
  }, [fetchRoomsForFilter, fetchSystemStats]);

  useEffect(() => {
    fetchInvoices(1);
  }, [fetchInvoices]);

  // Tính tổng tài chính trên trang hiện tại bằng cents
  const pageFinancialSummary = useMemo(() => {
    let sumTotalCents = 0;
    let sumPaidCents = 0;
    let sumRemainingCents = 0;
    let hasInvalidData = false;

    for (const inv of invoices) {
      const totalC = toCents(inv.totalAmount, true);
      const paidC = toCents(inv.paidAmount, true);

      if (totalC === null || paidC === null) {
        hasInvalidData = true;
        break;
      }

      const remC = subtractMoney(totalC, paidC);
      if (remC === null) {
        hasInvalidData = true;
        break;
      }

      sumTotalCents += totalC;
      sumPaidCents += paidC;
      sumRemainingCents += remC;
    }

    return {
      hasInvalidData,
      totalFormatted: hasInvalidData ? 'N/A' : formatCents(sumTotalCents),
      paidFormatted: hasInvalidData ? 'N/A' : formatCents(sumPaidCents),
      remainingFormatted: hasInvalidData ? 'N/A' : formatCents(sumRemainingCents),
    };
  }, [invoices]);

  // Tính tổng tiền realtime khi tạo hóa đơn
  const calculatedTotalNewInvoiceCents = useMemo(() => {
    const mgmt = toCents(createFormData.managementFee, false, MAX_SAFE_FEE_CENTS);
    const park = toCents(createFormData.parkingFee, false, MAX_SAFE_FEE_CENTS);
    const water = toCents(createFormData.waterFee, false, MAX_SAFE_FEE_CENTS);
    const other = toCents(createFormData.otherFee, false, MAX_SAFE_FEE_CENTS);
    if (mgmt === null || park === null || water === null || other === null) return null;
    const sum = mgmt + park + water + other;
    return Number.isSafeInteger(sum) && sum <= MAX_INVOICE_CENTS ? sum : null;
  }, [
    createFormData.managementFee,
    createFormData.parkingFee,
    createFormData.waterFee,
    createFormData.otherFee,
  ]);

  // Mở modal tạo hóa đơn mới
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

  // Gửi form tạo hóa đơn - Bắt lỗi 409 chuẩn: "Căn hộ này đã được lập hóa đơn tháng này rồi"
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
        }, 700);
      }
    } catch (err: unknown) {
      if (isMountedRef.current) {
        const apiErr = err as ApiErrorShape;
        // Bắt lỗi 409 trùng lặp với thông điệp chuẩn xác
        if (
          apiErr?.status === 409 ||
          apiErr?.message?.includes('đã được lập hóa đơn') ||
          apiErr?.message?.includes('P2002') ||
          apiErr?.message?.includes('trùng lặp')
        ) {
          setCreateError('Căn hộ này đã được lập hóa đơn tháng này rồi');
        } else {
          setCreateError(parseErrorMessage(err, 'Lỗi khi lập biểu phí định kỳ.'));
        }
      }
    } finally {
      if (isMountedRef.current) {
        setCreateSubmitting(false);
      }
    }
  };

  // Mở modal VietQR
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
        setQrError(parseErrorMessage(err, 'Không thể tạo mã VietQR thanh toán.'));
      }
    } finally {
      if (isMountedRef.current) {
        setQrLoading(false);
      }
    }
  };

  // Mở modal đối soát thanh toán
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

  // Gửi xác nhận đối soát thanh toán (Chống nộp thừa)
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

    // Chặn nộp thừa
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
        }, 700);
      }
    } catch (err: unknown) {
      if (isMountedRef.current) {
        const apiErr = err as ApiErrorShape;
        if (apiErr?.status === 409) {
          setPayError('Xảy ra xung đột giao dịch đồng thời trên hóa đơn này. Vui lòng tải lại dữ liệu.');
          fetchInvoices(pagination.page);
        } else {
          setPayError(parseErrorMessage(err, 'Lỗi khi cập nhật thanh toán cho hóa đơn.'));
        }
      }
    } finally {
      if (isMountedRef.current) {
        setPaySubmitting(false);
      }
    }
  };

  const renderStatusBadge = (status: InvoiceStatusType) => {
    switch (status) {
      case 'UNPAID':
        return <Badge variant="warning">Chưa nộp</Badge>;
      case 'PARTIALLY_PAID':
        return <Badge variant="info">Nộp một phần</Badge>;
      case 'PAID':
        return <Badge variant="success">Đã hoàn tất</Badge>;
      default:
        return <Badge variant="neutral">{status}</Badge>;
    }
  };

  return (
    <div style={{ width: '100%', maxWidth: '1280px', margin: '0 auto', display: 'flex', flexDirection: 'column', gap: '1.5rem' }}>
      {/* HEADER TRANG & NÚT TẠO MỚI */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '1rem' }}>
        <div>
          <h1 style={{ fontSize: '1.5rem', fontWeight: 700, color: 'var(--text-primary)', margin: 0 }}>
            Quản Lý Hóa Đơn & Đối Soát Thanh Toán
          </h1>
          <p style={{ fontSize: '0.875rem', color: 'var(--text-secondary)', margin: '0.25rem 0 0 0' }}>
            Lập biểu phí định kỳ, kiểm tra thanh toán qua VietQR và đối soát sổ sách kế toán chung cư
          </p>
        </div>
        <div style={{ display: 'flex', gap: '0.75rem' }}>
          <Button
            variant="secondary"
            onClick={() => {
              fetchInvoices(pagination.page);
              fetchSystemStats();
            }}
            isLoading={loading}
          >
            🔄 Tải lại dữ liệu
          </Button>
          <Button variant="primary" onClick={handleOpenCreateModal}>
            ➕ Lập hóa đơn mới
          </Button>
        </div>
      </div>

      {actionNotice && (
        <AlertBanner
          type={actionNotice.type}
          message={actionNotice.text}
          onClose={() => setActionNotice(null)}
        />
      )}

      {/* THỐNG KÊ TỔNG QUAN 6 CHỈ SỐ BẰNG STATCARD */}
      <div
        style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))',
          gap: '0.75rem',
        }}
      >
        <StatCard
          title="Tổng hóa đơn hệ thống"
          value={systemStats.totalInvoices !== null ? systemStats.totalInvoices : (systemStatsLoading ? '...' : '0')}
          colorScheme="slate"
        />
        <StatCard
          title="Chưa thanh toán"
          value={systemStats.unpaidCount !== null ? systemStats.unpaidCount : (systemStatsLoading ? '...' : '0')}
          colorScheme="amber"
        />
        <StatCard
          title="Đã nộp một phần"
          value={systemStats.partiallyPaidCount !== null ? systemStats.partiallyPaidCount : (systemStatsLoading ? '...' : '0')}
          colorScheme="indigo"
        />
        <StatCard
          title="Đã thanh toán 100%"
          value={systemStats.paidCount !== null ? systemStats.paidCount : (systemStatsLoading ? '...' : '0')}
          colorScheme="emerald"
        />
        <StatCard
          title="Đã thu (Trang hiện tại)"
          value={pageFinancialSummary.paidFormatted}
          colorScheme="emerald"
        />
        <StatCard
          title="Công nợ (Trang hiện tại)"
          value={pageFinancialSummary.remainingFormatted}
          colorScheme="rose"
        />
      </div>

      {systemStatsError && <AlertBanner type="warning" message={systemStatsError} />}

      {/* BỘ LỌC TÌM KIẾM */}
      <Card>
        <div style={{ padding: '1rem', display: 'flex', flexDirection: 'column', gap: '0.75rem' }}>
          <div
            style={{
              display: 'grid',
              gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))',
              gap: '0.75rem',
              alignItems: 'flex-end',
            }}
          >
            <div>
              <label style={{ display: 'block', fontSize: '0.75rem', fontWeight: 600, color: 'var(--text-secondary)', marginBottom: '0.25rem' }}>
                Kỳ hóa đơn (tháng)
              </label>
              <input
                type="month"
                value={monthFilter}
                onChange={(e) => setMonthFilter(e.target.value)}
                style={{
                  width: '100%',
                  padding: '0.5rem 0.75rem',
                  fontSize: '0.875rem',
                  borderRadius: '0.375rem',
                  border: '1px solid var(--border-color)',
                  backgroundColor: 'var(--bg-surface)',
                  color: 'var(--text-primary)',
                  boxSizing: 'border-box',
                }}
              />
            </div>

            <div>
              <label style={{ display: 'block', fontSize: '0.75rem', fontWeight: 600, color: 'var(--text-secondary)', marginBottom: '0.25rem' }}>
                Căn hộ
              </label>
              <select
                value={roomFilter}
                onChange={(e) => setRoomFilter(e.target.value)}
                style={{
                  width: '100%',
                  padding: '0.5rem 0.75rem',
                  fontSize: '0.875rem',
                  borderRadius: '0.375rem',
                  border: '1px solid var(--border-color)',
                  backgroundColor: 'var(--bg-surface)',
                  color: 'var(--text-primary)',
                  boxSizing: 'border-box',
                }}
              >
                <option value="">Tất cả căn hộ</option>
                {availableRooms.map((r) => (
                  <option key={r.id} value={String(r.id)}>
                    Phòng {r.roomNumber} (Tầng {r.floor})
                  </option>
                ))}
              </select>
            </div>

            <div>
              <label style={{ display: 'block', fontSize: '0.75rem', fontWeight: 600, color: 'var(--text-secondary)', marginBottom: '0.25rem' }}>
                Trạng thái thanh toán
              </label>
              <select
                value={statusFilter}
                onChange={(e) => setStatusFilter(e.target.value)}
                style={{
                  width: '100%',
                  padding: '0.5rem 0.75rem',
                  fontSize: '0.875rem',
                  borderRadius: '0.375rem',
                  border: '1px solid var(--border-color)',
                  backgroundColor: 'var(--bg-surface)',
                  color: 'var(--text-primary)',
                  boxSizing: 'border-box',
                }}
              >
                <option value="">Tất cả trạng thái</option>
                <option value="UNPAID">Chưa thanh toán (UNPAID)</option>
                <option value="PARTIALLY_PAID">Thanh toán một phần (PARTIALLY_PAID)</option>
                <option value="PAID">Đã thanh toán đầy đủ (PAID)</option>
              </select>
            </div>
          </div>

          {(monthFilter || roomFilter || statusFilter) && (
            <div style={{ display: 'flex', justifyContent: 'flex-end', paddingTop: '0.5rem' }}>
              <Button
                variant="ghost"
                size="sm"
                onClick={() => {
                  setMonthFilter('');
                  setRoomFilter('');
                  setStatusFilter('');
                }}
              >
                ✕ Xóa bộ lọc
              </Button>
            </div>
          )}
        </div>
      </Card>

      {/* DANH SÁCH HÓA ĐƠN */}
      <Card>
        <CardHeader>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <CardTitle>
              Danh Mục Hóa Đơn ({pagination.total} bản ghi)
            </CardTitle>
            {loading && <LoadingSpinner size="sm" />}
          </div>
        </CardHeader>

        {errorMessage && (
          <div style={{ padding: '0 1.25rem 1rem 1.25rem' }}>
            <AlertBanner type="error" message={errorMessage} />
          </div>
        )}

        {loading ? (
          <div style={{ padding: '3rem', textAlign: 'center' }}>
            <LoadingSpinner size="lg" text="Đang nạp dữ liệu hóa đơn..." />
          </div>
        ) : invoices.length === 0 ? (
          <div style={{ padding: '2rem' }}>
            <EmptyState
              title="Không có hóa đơn nào"
              description={
                monthFilter || roomFilter || statusFilter
                  ? 'Không tìm thấy hóa đơn nào phù hợp với bộ lọc đã chọn.'
                  : 'Hiện tại hệ thống chưa lập hóa đơn nào cho tòa nhà.'
              }
              actionLabel={
                (monthFilter || roomFilter || statusFilter)
                  ? 'Xóa bộ lọc'
                  : 'Lập hóa đơn đầu tiên'
              }
              onAction={
                (monthFilter || roomFilter || statusFilter)
                  ? () => {
                      setMonthFilter('');
                      setRoomFilter('');
                      setStatusFilter('');
                    }
                  : handleOpenCreateModal
              }
            />
          </div>
        ) : (
          <>
            <div style={{ overflowX: 'auto', width: '100%' }}>
              <table style={{ width: '100%', borderCollapse: 'collapse', textAlign: 'left', fontSize: '0.875rem' }}>
                <thead>
                  <tr style={{ backgroundColor: 'var(--bg-muted, #f8fafc)', borderBottom: '1px solid var(--border-color)' }}>
                    <th style={{ padding: '0.75rem 1rem', fontWeight: 600, color: 'var(--text-secondary)', fontSize: '0.75rem', textTransform: 'uppercase' }}>
                      Mã HĐ / Kỳ
                    </th>
                    <th style={{ padding: '0.75rem 1rem', fontWeight: 600, color: 'var(--text-secondary)', fontSize: '0.75rem', textTransform: 'uppercase' }}>
                      Căn hộ
                    </th>
                    <th style={{ padding: '0.75rem 1rem', fontWeight: 600, color: 'var(--text-secondary)', fontSize: '0.75rem', textTransform: 'uppercase' }}>
                      Chi tiết biểu phí
                    </th>
                    <th style={{ padding: '0.75rem 1rem', fontWeight: 600, color: 'var(--text-secondary)', fontSize: '0.75rem', textTransform: 'uppercase' }}>
                      Tổng tiền
                    </th>
                    <th style={{ padding: '0.75rem 1rem', fontWeight: 600, color: 'var(--text-secondary)', fontSize: '0.75rem', textTransform: 'uppercase' }}>
                      Đã nộp / Còn thiếu
                    </th>
                    <th style={{ padding: '0.75rem 1rem', fontWeight: 600, color: 'var(--text-secondary)', fontSize: '0.75rem', textTransform: 'uppercase' }}>
                      Trạng thái
                    </th>
                    <th style={{ padding: '0.75rem 1rem', fontWeight: 600, color: 'var(--text-secondary)', fontSize: '0.75rem', textTransform: 'uppercase', textAlign: 'right' }}>
                      Thao tác
                    </th>
                  </tr>
                </thead>
                <tbody>
                  {invoices.map((inv) => {
                    const totalCents = toCents(inv.totalAmount, true);
                    const paidCents = toCents(inv.paidAmount, true);
                    const remainingCents = totalCents !== null && paidCents !== null ? subtractMoney(totalCents, paidCents) : null;

                    return (
                      <tr key={inv.id} style={{ borderBottom: '1px solid var(--border-color)' }}>
                        <td style={{ padding: '0.875rem 1rem', verticalAlign: 'middle' }}>
                          <div style={{ display: 'flex', flexDirection: 'column' }}>
                            <span style={{ fontWeight: 700, color: 'var(--text-primary)' }}>
                              #{inv.id}
                            </span>
                            <span style={{ fontSize: '0.8125rem', color: 'var(--primary-color, #2563eb)', fontWeight: 600 }}>
                              Kỳ: {inv.month}
                            </span>
                            {inv.dueDate && (
                              <span style={{ fontSize: '0.75rem', color: 'var(--text-secondary)' }}>
                                Hạn: {new Date(inv.dueDate).toLocaleDateString('vi-VN')}
                              </span>
                            )}
                          </div>
                        </td>

                        <td style={{ padding: '0.875rem 1rem', verticalAlign: 'middle' }}>
                          <span style={{ fontWeight: 600, color: 'var(--text-primary)' }}>
                            {inv.room?.roomNumber ? `Phòng ${inv.room.roomNumber}` : `Phòng #${inv.roomId}`}
                          </span>
                        </td>

                        <td style={{ padding: '0.875rem 1rem', verticalAlign: 'middle', fontSize: '0.8125rem' }}>
                          <div style={{ display: 'flex', flexDirection: 'column', gap: '0.125rem', color: 'var(--text-secondary)' }}>
                            <span>Quản lý: {formatCurrency(inv.managementFee)}</span>
                            <span>Gửi xe: {formatCurrency(inv.parkingFee)}</span>
                            <span>Nước: {formatCurrency(inv.waterFee)}</span>
                            {Number(inv.otherFee) > 0 && <span>Khác: {formatCurrency(inv.otherFee)}</span>}
                          </div>
                        </td>

                        <td style={{ padding: '0.875rem 1rem', verticalAlign: 'middle' }}>
                          <span style={{ fontWeight: 700, color: 'var(--text-primary)', fontSize: '0.9375rem' }}>
                            {formatCurrency(inv.totalAmount, true)}
                          </span>
                        </td>

                        <td style={{ padding: '0.875rem 1rem', verticalAlign: 'middle' }}>
                          <div style={{ display: 'flex', flexDirection: 'column', gap: '0.125rem' }}>
                            <span style={{ color: '#059669', fontWeight: 600 }}>
                              Đã nộp: {formatCurrency(inv.paidAmount, true)}
                            </span>
                            <span style={{ color: remainingCents === 0 ? '#059669' : '#e11d48', fontWeight: 600 }}>
                              Thiếu: {formatCents(remainingCents)}
                            </span>
                          </div>
                        </td>

                        <td style={{ padding: '0.875rem 1rem', verticalAlign: 'middle' }}>
                          {renderStatusBadge(inv.status)}
                        </td>

                        <td style={{ padding: '0.875rem 1rem', verticalAlign: 'middle', textAlign: 'right' }}>
                          <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '0.5rem', flexWrap: 'nowrap' }}>
                            <Button
                              variant="secondary"
                              size="sm"
                              onClick={() => handleOpenVietQrModal(inv)}
                              title="Xem mã VietQR ngân hàng"
                            >
                              📱 VietQR
                            </Button>
                            {inv.status !== 'PAID' && (
                              <Button
                                variant="primary"
                                size="sm"
                                onClick={() => handleOpenPayModal(inv)}
                                title="Đối soát và ghi nhận thu tiền"
                              >
                                💵 Thu tiền
                              </Button>
                            )}
                            {inv.payments && inv.payments.length > 0 && (
                              <Button
                                variant="ghost"
                                size="sm"
                                onClick={() => setViewingPaymentsInvoice(inv)}
                                title="Xem lịch sử các đợt nộp tiền"
                              >
                                📋 Lịch sử
                              </Button>
                            )}
                          </div>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>

            {pagination.totalPages > 1 && (
              <div style={{ padding: '1rem', borderTop: '1px solid var(--border-color)' }}>
                <Pagination
                  currentPage={pagination.page}
                  totalPages={pagination.totalPages}
                  totalRecords={pagination.total}
                  onPageChange={(p) => fetchInvoices(p)}
                />
              </div>
            )}
          </>
        )}
      </Card>

      {/* =================================================================== */}
      {/* MODAL 1: LẬP HÓA ĐƠN MỚI (CREATE INVOICE)                           */}
      {/* =================================================================== */}
      {isCreateModalOpen && (
        <Modal
          isOpen={isCreateModalOpen}
          onClose={() => {
            if (!createSubmitting) setIsCreateModalOpen(false);
          }}
          title="Lập Biểu Phí Định Kỳ Cho Căn Hộ"
        >
          <form onSubmit={handleSubmitCreateInvoice} style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
            {createError && <AlertBanner type="error" message={createError} />}
            {createSuccess && <AlertBanner type="success" message={createSuccess} />}

            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0.75rem' }}>
              <div>
                <label style={{ display: 'block', fontSize: '0.875rem', fontWeight: 600, color: 'var(--text-primary)', marginBottom: '0.375rem' }}>
                  Căn hộ áp dụng <span style={{ color: '#ef4444' }}>*</span>
                </label>
                <select
                  required
                  value={createFormData.roomId}
                  onChange={(e) => setCreateFormData({ ...createFormData, roomId: e.target.value })}
                  disabled={createSubmitting}
                  style={{
                    width: '100%',
                    padding: '0.5rem 0.75rem',
                    fontSize: '0.875rem',
                    borderRadius: '0.375rem',
                    border: '1px solid var(--border-color)',
                    backgroundColor: 'var(--bg-surface)',
                    color: 'var(--text-primary)',
                    boxSizing: 'border-box',
                  }}
                >
                  <option value="">-- Chọn căn hộ --</option>
                  {availableRooms.map((r) => (
                    <option key={r.id} value={r.id}>
                      Phòng {r.roomNumber} (Tầng {r.floor})
                    </option>
                  ))}
                </select>
              </div>

              <div>
                <label style={{ display: 'block', fontSize: '0.875rem', fontWeight: 600, color: 'var(--text-primary)', marginBottom: '0.375rem' }}>
                  Kỳ hóa đơn (tháng) <span style={{ color: '#ef4444' }}>*</span>
                </label>
                <input
                  type="month"
                  required
                  value={createFormData.month}
                  onChange={(e) => setCreateFormData({ ...createFormData, month: e.target.value })}
                  disabled={createSubmitting}
                  style={{
                    width: '100%',
                    padding: '0.5rem 0.75rem',
                    fontSize: '0.875rem',
                    borderRadius: '0.375rem',
                    border: '1px solid var(--border-color)',
                    backgroundColor: 'var(--bg-surface)',
                    color: 'var(--text-primary)',
                    boxSizing: 'border-box',
                  }}
                />
              </div>
            </div>

            <div>
              <label style={{ display: 'block', fontSize: '0.875rem', fontWeight: 600, color: 'var(--text-primary)', marginBottom: '0.375rem' }}>
                Hạn nộp tiền (dueDate)
              </label>
              <input
                type="date"
                value={createFormData.dueDate}
                onChange={(e) => setCreateFormData({ ...createFormData, dueDate: e.target.value })}
                disabled={createSubmitting}
                style={{
                  width: '100%',
                  padding: '0.5rem 0.75rem',
                  fontSize: '0.875rem',
                  borderRadius: '0.375rem',
                  border: '1px solid var(--border-color)',
                  backgroundColor: 'var(--bg-surface)',
                  color: 'var(--text-primary)',
                  boxSizing: 'border-box',
                }}
              />
            </div>

            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0.75rem' }}>
              <div>
                <label style={{ display: 'block', fontSize: '0.875rem', fontWeight: 600, color: 'var(--text-primary)', marginBottom: '0.375rem' }}>
                  Phí quản lý (VND)
                </label>
                <input
                  type="number"
                  min="0"
                  step="any"
                  value={createFormData.managementFee}
                  onChange={(e) => setCreateFormData({ ...createFormData, managementFee: e.target.value })}
                  disabled={createSubmitting}
                  style={{
                    width: '100%',
                    padding: '0.5rem 0.75rem',
                    fontSize: '0.875rem',
                    borderRadius: '0.375rem',
                    border: '1px solid var(--border-color)',
                    backgroundColor: 'var(--bg-surface)',
                    color: 'var(--text-primary)',
                    boxSizing: 'border-box',
                  }}
                />
              </div>

              <div>
                <label style={{ display: 'block', fontSize: '0.875rem', fontWeight: 600, color: 'var(--text-primary)', marginBottom: '0.375rem' }}>
                  Phí gửi xe (VND)
                </label>
                <input
                  type="number"
                  min="0"
                  step="any"
                  value={createFormData.parkingFee}
                  onChange={(e) => setCreateFormData({ ...createFormData, parkingFee: e.target.value })}
                  disabled={createSubmitting}
                  style={{
                    width: '100%',
                    padding: '0.5rem 0.75rem',
                    fontSize: '0.875rem',
                    borderRadius: '0.375rem',
                    border: '1px solid var(--border-color)',
                    backgroundColor: 'var(--bg-surface)',
                    color: 'var(--text-primary)',
                    boxSizing: 'border-box',
                  }}
                />
              </div>

              <div>
                <label style={{ display: 'block', fontSize: '0.875rem', fontWeight: 600, color: 'var(--text-primary)', marginBottom: '0.375rem' }}>
                  Tiền nước sinh hoạt (VND)
                </label>
                <input
                  type="number"
                  min="0"
                  step="any"
                  value={createFormData.waterFee}
                  onChange={(e) => setCreateFormData({ ...createFormData, waterFee: e.target.value })}
                  disabled={createSubmitting}
                  style={{
                    width: '100%',
                    padding: '0.5rem 0.75rem',
                    fontSize: '0.875rem',
                    borderRadius: '0.375rem',
                    border: '1px solid var(--border-color)',
                    backgroundColor: 'var(--bg-surface)',
                    color: 'var(--text-primary)',
                    boxSizing: 'border-box',
                  }}
                />
              </div>

              <div>
                <label style={{ display: 'block', fontSize: '0.875rem', fontWeight: 600, color: 'var(--text-primary)', marginBottom: '0.375rem' }}>
                  Chi phí khác (VND)
                </label>
                <input
                  type="number"
                  min="0"
                  step="any"
                  value={createFormData.otherFee}
                  onChange={(e) => setCreateFormData({ ...createFormData, otherFee: e.target.value })}
                  disabled={createSubmitting}
                  style={{
                    width: '100%',
                    padding: '0.5rem 0.75rem',
                    fontSize: '0.875rem',
                    borderRadius: '0.375rem',
                    border: '1px solid var(--border-color)',
                    backgroundColor: 'var(--bg-surface)',
                    color: 'var(--text-primary)',
                    boxSizing: 'border-box',
                  }}
                />
              </div>
            </div>

            {/* TỔNG TIỀN DỰ KIẾN REALTIME */}
            <div
              style={{
                padding: '0.75rem 1rem',
                backgroundColor: 'rgba(79, 70, 229, 0.08)',
                borderRadius: '0.5rem',
                border: '1px solid rgba(79, 70, 229, 0.25)',
                display: 'flex',
                justifyContent: 'space-between',
                alignItems: 'center',
              }}
            >
              <span style={{ fontSize: '0.875rem', fontWeight: 600, color: 'var(--text-primary)' }}>
                Tổng tiền dự kiến:
              </span>
              <span style={{ fontSize: '1.125rem', fontWeight: 700, color: '#4f46e5' }}>
                {formatCents(calculatedTotalNewInvoiceCents)}
              </span>
            </div>

            <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '0.75rem', paddingTop: '0.75rem', borderTop: '1px solid var(--border-color)' }}>
              <Button
                variant="secondary"
                disabled={createSubmitting}
                onClick={() => setIsCreateModalOpen(false)}
              >
                Hủy bỏ
              </Button>
              <Button
                variant="primary"
                isLoading={createSubmitting}
                type="submit"
              >
                Xác nhận tạo hóa đơn
              </Button>
            </div>
          </form>
        </Modal>
      )}

      {/* =================================================================== */}
      {/* MODAL 2: XEM MÃ THANH TOÁN VIETQR NGÂN HÀNG                        */}
      {/* =================================================================== */}
      {isQrModalOpen && currentQrInvoice && (
        <Modal
          isOpen={isQrModalOpen}
          onClose={() => setIsQrModalOpen(false)}
          title={`Mã VietQR Thanh Toán [Phòng ${currentQrInvoice.room?.roomNumber || currentQrInvoice.roomId} - Kỳ ${currentQrInvoice.month}]`}
        >
          <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '1rem' }}>
            {qrLoading ? (
              <div style={{ padding: '2rem 0' }}>
                <LoadingSpinner size="lg" text="Đang sinh mã VietQR từ ngân hàng..." />
              </div>
            ) : qrError ? (
              <AlertBanner type="error" message={qrError} />
            ) : qrData ? (
              <>
                {qrData.isFullyPaid ? (
                  <div style={{ padding: '1.5rem', textAlign: 'center' }}>
                    <div style={{ fontSize: '2.5rem', marginBottom: '0.5rem' }}>✅</div>
                    <div style={{ fontWeight: 700, color: '#059669', fontSize: '1.125rem' }}>
                      Hóa đơn đã được thanh toán 100%!
                    </div>
                    <p style={{ color: 'var(--text-secondary)', fontSize: '0.875rem', margin: '0.25rem 0 0 0' }}>
                      Không cần quét mã chuyển khoản thêm.
                    </p>
                  </div>
                ) : (
                  <>
                    <div
                      style={{
                        padding: '0.5rem',
                        backgroundColor: '#ffffff',
                        border: '2px solid #e2e8f0',
                        borderRadius: '0.75rem',
                        boxShadow: '0 4px 6px -1px rgba(0, 0, 0, 0.1)',
                      }}
                    >
                      {qrData.vietQrUrl ? (
                        <img
                          src={qrData.vietQrUrl}
                          alt="Mã VietQR thanh toán"
                          style={{ width: '280px', height: '280px', display: 'block', objectFit: 'contain' }}
                        />
                      ) : (
                        <div style={{ width: '280px', height: '280px', display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#94a3b8' }}>
                          Không có URL ảnh QR
                        </div>
                      )}
                    </div>

                    <div
                      style={{
                        width: '100%',
                        padding: '0.75rem',
                        backgroundColor: 'var(--bg-muted, #f8fafc)',
                        borderRadius: '0.5rem',
                        border: '1px solid var(--border-color)',
                        fontSize: '0.875rem',
                        display: 'flex',
                        flexDirection: 'column',
                        gap: '0.25rem',
                      }}
                    >
                      <div>
                        <strong>Số tiền còn phải nộp:</strong>{' '}
                        <span style={{ fontWeight: 700, color: '#e11d48' }}>
                          {formatCurrency(qrData.remainingAmount, true)}
                        </span>
                      </div>
                      <div style={{ fontSize: '0.75rem', color: 'var(--text-secondary)' }}>
                        Nội dung chuyển khoản tự động tích hợp thông tin phòng và kỳ hóa đơn để đối soát tức thời 24/7.
                      </div>
                    </div>
                  </>
                )}
              </>
            ) : null}

            <div style={{ width: '100%', display: 'flex', justifyContent: 'flex-end', paddingTop: '0.5rem', borderTop: '1px solid var(--border-color)' }}>
              <Button variant="secondary" onClick={() => setIsQrModalOpen(false)}>
                Đóng
              </Button>
            </div>
          </div>
        </Modal>
      )}

      {/* =================================================================== */}
      {/* MODAL 3: ĐỐI SOÁT & XÁC NHẬN THU TIỀN (STRICT OVERPAYMENT GUARD)     */}
      {/* =================================================================== */}
      {isPayModalOpen && payInvoice && (
        <Modal
          isOpen={isPayModalOpen}
          onClose={() => {
            if (!paySubmitting) setIsPayModalOpen(false);
          }}
          title={`Đối Soát & Xác Nhận Thu Tiền [HĐ #${payInvoice.id}]`}
        >
          <form onSubmit={handleSubmitPayment} style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
            {payError && <AlertBanner type="error" message={payError} />}
            {paySuccess && <AlertBanner type="success" message={paySuccess} />}

            <div
              style={{
                backgroundColor: 'var(--bg-muted, #f8fafc)',
                padding: '0.75rem 1rem',
                borderRadius: '0.5rem',
                border: '1px solid var(--border-color)',
                fontSize: '0.8125rem',
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

            <div>
              <label style={{ display: 'block', fontSize: '0.875rem', fontWeight: 600, color: 'var(--text-primary)', marginBottom: '0.375rem' }}>
                Số tiền thực thu lần này (VND) <span style={{ color: '#ef4444' }}>*</span>
              </label>
              <input
                type="number"
                required
                min="0.01"
                step="any"
                value={payFormData.paidAmount}
                onChange={(e) => setPayFormData({ ...payFormData, paidAmount: e.target.value })}
                disabled={paySubmitting}
                style={{
                  width: '100%',
                  padding: '0.5rem 0.75rem',
                  fontSize: '0.875rem',
                  borderRadius: '0.375rem',
                  border: '1px solid var(--border-color)',
                  backgroundColor: 'var(--bg-surface)',
                  color: 'var(--text-primary)',
                  boxSizing: 'border-box',
                }}
              />
            </div>

            <div>
              <label style={{ display: 'block', fontSize: '0.875rem', fontWeight: 600, color: 'var(--text-primary)', marginBottom: '0.375rem' }}>
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
                disabled={paySubmitting}
                style={{
                  width: '100%',
                  padding: '0.5rem 0.75rem',
                  fontSize: '0.875rem',
                  borderRadius: '0.375rem',
                  border: '1px solid var(--border-color)',
                  backgroundColor: 'var(--bg-surface)',
                  color: 'var(--text-primary)',
                  boxSizing: 'border-box',
                }}
              >
                <option value="VIETQR">Quét mã VietQR ngân hàng</option>
                <option value="BANK_TRANSFER">Chuyển khoản trực tiếp</option>
                <option value="CASH">Tiền mặt tại quầy Ban quản lý</option>
              </select>
            </div>

            <div>
              <label style={{ display: 'block', fontSize: '0.875rem', fontWeight: 600, color: 'var(--text-primary)', marginBottom: '0.375rem' }}>
                Mã chuẩn chi / Mã giao dịch ngân hàng (transactionCode)
              </label>
              <input
                type="text"
                maxLength={100}
                placeholder="Ví dụ: FT2610..., VCB987..."
                value={payFormData.transactionCode}
                onChange={(e) => setPayFormData({ ...payFormData, transactionCode: e.target.value })}
                disabled={paySubmitting}
                style={{
                  width: '100%',
                  padding: '0.5rem 0.75rem',
                  fontSize: '0.875rem',
                  borderRadius: '0.375rem',
                  border: '1px solid var(--border-color)',
                  backgroundColor: 'var(--bg-surface)',
                  color: 'var(--text-primary)',
                  boxSizing: 'border-box',
                }}
              />
            </div>

            <div>
              <label style={{ display: 'block', fontSize: '0.875rem', fontWeight: 600, color: 'var(--text-primary)', marginBottom: '0.375rem' }}>
                Ghi chú đối soát sao kê (note)
              </label>
              <textarea
                rows={2}
                maxLength={500}
                placeholder="Ghi chú xác nhận khớp tiền..."
                value={payFormData.note}
                onChange={(e) => setPayFormData({ ...payFormData, note: e.target.value })}
                disabled={paySubmitting}
                style={{
                  width: '100%',
                  padding: '0.5rem 0.75rem',
                  fontSize: '0.875rem',
                  borderRadius: '0.375rem',
                  border: '1px solid var(--border-color)',
                  backgroundColor: 'var(--bg-surface)',
                  color: 'var(--text-primary)',
                  boxSizing: 'border-box',
                }}
              />
            </div>

            <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '0.75rem', paddingTop: '0.75rem', borderTop: '1px solid var(--border-color)' }}>
              <Button
                variant="secondary"
                disabled={paySubmitting}
                onClick={() => setIsPayModalOpen(false)}
              >
                Hủy bỏ
              </Button>
              <Button
                variant="primary"
                isLoading={paySubmitting}
                type="submit"
              >
                Xác nhận đã thu tiền
              </Button>
            </div>
          </form>
        </Modal>
      )}

      {/* =================================================================== */}
      {/* MODAL 4: XEM LỊCH SỬ THANH TOÁN (PAYMENTS HISTORY)                  */}
      {/* =================================================================== */}
      {viewingPaymentsInvoice && (
        <Modal
          isOpen={!!viewingPaymentsInvoice}
          onClose={() => setViewingPaymentsInvoice(null)}
          title={`Lịch Sử Thanh Toán [Hóa Đơn #${viewingPaymentsInvoice.id}]`}
        >
          <div style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem' }}>
            <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem', maxHeight: '280px', overflowY: 'auto' }}>
              {viewingPaymentsInvoice.payments?.map((payment) => (
                <div
                  key={payment.id}
                  style={{
                    padding: '0.75rem',
                    backgroundColor: 'var(--bg-muted, #f8fafc)',
                    borderRadius: '0.5rem',
                    border: '1px solid var(--border-color)',
                    fontSize: '0.8125rem',
                    lineHeight: '1.5',
                  }}
                >
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                    <span style={{ fontWeight: 700, color: '#059669', fontSize: '0.9375rem' }}>
                      +{formatCurrency(payment.amount, true, MAX_PAYMENT_CENTS)}
                    </span>
                    <span style={{ color: 'var(--text-secondary)', fontSize: '0.75rem' }}>
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

            <div style={{ display: 'flex', justifyContent: 'flex-end', paddingTop: '0.5rem', borderTop: '1px solid var(--border-color)' }}>
              <Button variant="secondary" onClick={() => setViewingPaymentsInvoice(null)}>
                Đóng
              </Button>
            </div>
          </div>
        </Modal>
      )}
    </div>
  );
};

export default BillingManagerPage;
