// =========================================================================
// TRANG BẢNG ĐIỀU PHỐI SỰ CỐ & PHÂN CÔNG THỢ (TICKET DISPATCH PAGE)
// Phụ trách: Thành viên Đức (Senior React + TypeScript Frontend Developer)
// Phạm vi: web/src/pages/TicketDispatchPage.tsx
// Đợt hoàn thiện: FINAL BUG FIX & QUALITY ASSURANCE
// Cải tiến:
//   1. Thống kê đầy đủ toàn bộ trạng thái: PENDING, ASSIGNED, IN_PROGRESS,
//      COMPLETED (không hardcode 0), CLOSED, isDuplicate 24h, Tổng số phiếu.
//   2. Request Sequence Counters độc lập cho từng nhóm request (List, Stats, Techs, Rooms).
//   3. Chống Race Condition và Debounce 400ms.
//   4. Pure Scoped CSS (No-Tailwind) và kiểm soát Media an toàn.
// =========================================================================

import React, { useState, useEffect, useCallback, useMemo, useRef } from 'react';
import axiosClient from '../api/axiosClient';
import { API_ENDPOINTS } from '../api/endpoints';
import { ApiEnvelope } from '../utils/auth';

// -------------------------------------------------------------------------
// ĐỊNH NGHĨA KIỂU DỮ LIỆU CỤC BỘ (STRICT TYPESCRIPT - KHÔNG DÙNG ANY)
// -------------------------------------------------------------------------

export type TicketStatusType = 'PENDING' | 'ASSIGNED' | 'IN_PROGRESS' | 'COMPLETED' | 'CLOSED';

export interface TicketRoomRelation {
  id: number;
  roomNumber: string;
  floor?: number;
}

export interface TicketResidentRelation {
  id: number;
  fullName: string;
  phone?: string | null;
  email?: string | null;
}

export interface TicketTechnicianRelation {
  id: number;
  fullName: string;
  phone?: string | null;
  username?: string;
  role?: string;
}

export interface TicketItem {
  id: number;
  title?: string | null;
  category: string;
  description: string;
  mediaUrl?: string | null;
  status: TicketStatusType;
  roomId?: number | null;
  residentId: number;
  technicianId?: number | null;
  isDuplicate: boolean;
  createdAt: string;
  updatedAt: string;
  room?: TicketRoomRelation | null;
  resident?: TicketResidentRelation | null;
  technician?: TicketTechnicianRelation | null;
}

export interface TechnicianUser {
  id: number;
  username: string;
  fullName: string;
  phone?: string | null;
  email?: string | null;
  role: string;
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
// COMPONENT CHÍNH: TicketDispatchPage
// -------------------------------------------------------------------------

export const TicketDispatchPage: React.FC = () => {
  // Chống rò rỉ bộ nhớ khi unmount
  const isMountedRef = useRef<boolean>(true);
  useEffect(() => {
    isMountedRef.current = true;
    return () => {
      isMountedRef.current = false;
    };
  }, []);

  // -----------------------------------------------------------------------
  // CHỐNG RACE CONDITION ĐỘC LẬP CHO TỪNG NHÓM REQUEST
  // -----------------------------------------------------------------------
  const ticketsListSeqRef = useRef<number>(0);
  const ticketsStatsSeqRef = useRef<number>(0);
  const techniciansSeqRef = useRef<number>(0);
  const roomsOptionsSeqRef = useRef<number>(0);

  // -----------------------------------------------------------------------
  // STATE: DANH SÁCH & PHÂN TRANG TICKETS
  // -----------------------------------------------------------------------
  const [tickets, setTickets] = useState<TicketItem[]>([]);
  const [loading, setLoading] = useState<boolean>(false);
  const [errorMessage, setErrorMessage] = useState<string>('');
  const [pagination, setPagination] = useState<PaginationMeta>({
    page: 1,
    limit: 15,
    total: 0,
    totalPages: 1,
  });

  // -----------------------------------------------------------------------
  // STATE: BỘ LỌC TÌM KIẾM SỰ CỐ KÈM DEBOUNCE
  // -----------------------------------------------------------------------
  const [searchInput, setSearchInput] = useState<string>('');
  const [searchDebounced, setSearchDebounced] = useState<string>('');
  const [statusFilter, setStatusFilter] = useState<string>('');
  const [categoryFilter, setCategoryFilter] = useState<string>('');
  const [roomFilter, setRoomFilter] = useState<string>('');
  const [duplicateFilter, setDuplicateFilter] = useState<string>(''); // '' | 'true' | 'false'

  // Debounce tìm kiếm (400ms)
  useEffect(() => {
    const timer = setTimeout(() => {
      setSearchDebounced(searchInput);
    }, 400);
    return () => clearTimeout(timer);
  }, [searchInput]);

  // Danh mục phòng cho dropdown lọc
  const [availableRooms, setAvailableRooms] = useState<RoomOption[]>([]);

  // -----------------------------------------------------------------------
  // STATE: THỐNG KÊ ĐẦY ĐỦ TRẠNG THÁI TOÀN HỆ THỐNG
  // Bao gồm PENDING, ASSIGNED, IN_PROGRESS, COMPLETED (không hardcode 0), CLOSED, Duplicate, Total
  // -----------------------------------------------------------------------
  const [stats, setStats] = useState<{
    total: number | null;
    pending: number | null;
    assigned: number | null;
    inProgress: number | null;
    completed: number | null;
    closed: number | null;
    duplicates: number | null;
  }>({
    total: null,
    pending: null,
    assigned: null,
    inProgress: null,
    completed: null,
    closed: null,
    duplicates: null,
  });
  const [statsLoading, setStatsLoading] = useState<boolean>(false);
  const [statsError, setStatsError] = useState<string>('');

  // -----------------------------------------------------------------------
  // STATE: MODAL PHÂN CÔNG THỢ KỸ THUẬT
  // -----------------------------------------------------------------------
  const [isAssignModalOpen, setIsAssignModalOpen] = useState<boolean>(false);
  const [selectedTicket, setSelectedTicket] = useState<TicketItem | null>(null);
  const [technicians, setTechnicians] = useState<TechnicianUser[]>([]);
  const [techniciansLoading, setTechniciansLoading] = useState<boolean>(false);
  const [selectedTechnicianId, setSelectedTechnicianId] = useState<string>('');
  const [manualTechnicianId, setManualTechnicianId] = useState<string>('');
  const [assignSubmitting, setAssignSubmitting] = useState<boolean>(false);
  const [assignError, setAssignError] = useState<string>('');
  const [assignSuccess, setAssignSuccess] = useState<string>('');

  // -----------------------------------------------------------------------
  // STATE: MODAL XEM CHI TIẾT SỰ CỐ & MEDIA AN TOÀN
  // -----------------------------------------------------------------------
  const [viewingTicket, setViewingTicket] = useState<TicketItem | null>(null);

  // Thông báo phản hồi toàn cục
  const [actionNotice, setActionNotice] = useState<{ type: 'success' | 'error'; text: string } | null>(null);

  // -----------------------------------------------------------------------
  // TIỆN ÍCH TRÍCH XUẤT LỖI AN TOÀN
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
  // TIỆN ÍCH KIỂM TRA MEDIA AN TOÀN (CHỈ CHẤP NHẬN HTTP/HTTPS)
  // -----------------------------------------------------------------------
  const isSafeMediaUrl = (url: unknown): boolean => {
    if (typeof url !== 'string' || !url.trim()) return false;
    const trimmed = url.trim().toLowerCase();
    return trimmed.startsWith('http://') || trimmed.startsWith('https://');
  };

  // -----------------------------------------------------------------------
  // API: NẠP DANH MỤC PHÒNG CHO SELECT BỘ LỌC (SEQUENCE COUNTER RIÊNG)
  // -----------------------------------------------------------------------
  const fetchRoomsForFilter = useCallback(async () => {
    const seq = ++roomsOptionsSeqRef.current;
    try {
      const res = (await axiosClient.get('/api/rooms?page=1&limit=100')) as unknown as ApiEnvelope<RoomOption[]>;
      if (seq === roomsOptionsSeqRef.current && isMountedRef.current) {
        if (res && Array.isArray(res.data)) {
          setAvailableRooms(res.data);
        }
      }
    } catch {
      // Giữ danh sách rỗng nếu lỗi
    }
  }, []);

  // -----------------------------------------------------------------------
  // API: LẤY DANH SÁCH THỢ KỸ THUẬT PHỤC VỤ PHÂN CÔNG (SEQUENCE COUNTER RIÊNG)
  // -----------------------------------------------------------------------
  const fetchTechnicians = useCallback(async () => {
    const seq = ++techniciansSeqRef.current;
    setTechniciansLoading(true);
    try {
      const res = (await axiosClient.get(
        `${API_ENDPOINTS.AUTH.ADMIN_USERS}?role=TECHNICIAN&page=1&limit=100`
      )) as unknown as ApiEnvelope<TechnicianUser[]>;

      if (seq === techniciansSeqRef.current && isMountedRef.current) {
        let list: TechnicianUser[] = [];
        if (res && Array.isArray(res.data)) {
          list = res.data.filter((u) => u.role === 'TECHNICIAN');
        }
        setTechnicians(list);
      }
    } catch (err: unknown) {
      console.warn('[TicketDispatchPage] Không thể nạp danh sách thợ kỹ thuật:', err);
      if (seq === techniciansSeqRef.current && isMountedRef.current) {
        setTechnicians([]);
      }
    } finally {
      if (seq === techniciansSeqRef.current && isMountedRef.current) {
        setTechniciansLoading(false);
      }
    }
  }, []);

  // -----------------------------------------------------------------------
  // API: THỐNG KÊ TOÀN HỆ THỐNG ĐẦY ĐỦ 5 TRẠNG THÁI + TRÙNG LẶP + TỔNG PHIẾU
  // (SEQUENCE COUNTER RIÊNG: ticketsStatsSeqRef)
  // -----------------------------------------------------------------------
  const fetchOverviewStats = useCallback(async () => {
    const seq = ++ticketsStatsSeqRef.current;
    setStatsLoading(true);
    setStatsError('');

    try {
      // Gọi song song đầy đủ các truy vấn đếm trên toàn hệ thống (không lọc theo tìm kiếm hay trang)
      const [
        totalRes,
        pendingRes,
        assignedRes,
        inProgressRes,
        completedRes,
        closedRes,
        dupRes,
      ] = await Promise.allSettled([
        axiosClient.get(`${API_ENDPOINTS.TICKETS.LIST}?page=1&limit=1`),
        axiosClient.get(`${API_ENDPOINTS.TICKETS.LIST}?status=PENDING&page=1&limit=1`),
        axiosClient.get(`${API_ENDPOINTS.TICKETS.LIST}?status=ASSIGNED&page=1&limit=1`),
        axiosClient.get(`${API_ENDPOINTS.TICKETS.LIST}?status=IN_PROGRESS&page=1&limit=1`),
        axiosClient.get(`${API_ENDPOINTS.TICKETS.LIST}?status=COMPLETED&page=1&limit=1`),
        axiosClient.get(`${API_ENDPOINTS.TICKETS.LIST}?status=CLOSED&page=1&limit=1`),
        axiosClient.get(`${API_ENDPOINTS.TICKETS.LIST}?isDuplicate=true&page=1&limit=1`),
      ]);

      if (seq !== ticketsStatsSeqRef.current || !isMountedRef.current) {
        return;
      }

      let hasFailures = false;
      const extractTotal = (res: PromiseSettledResult<unknown>): number | null => {
        if (res.status === 'fulfilled') {
          const env = res.value as unknown as ApiEnvelope<TicketItem[]>;
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
      const pending = extractTotal(pendingRes);
      const assigned = extractTotal(assignedRes);
      const inProgress = extractTotal(inProgressRes);
      const completed = extractTotal(completedRes);
      const closed = extractTotal(closedRes);
      const duplicates = extractTotal(dupRes);

      if (hasFailures) {
        setStatsError('Không thể nạp đầy đủ số liệu thống kê sự cố từ máy chủ. Vui lòng thử lại.');
      }

      setStats({
        total,
        pending,
        assigned,
        inProgress,
        completed,
        closed,
        duplicates,
      });
    } catch (err: unknown) {
      if (seq === ticketsStatsSeqRef.current && isMountedRef.current) {
        const msg = parseErrorMessage(err, 'Lỗi nạp chỉ số thống kê sự cố.');
        setStatsError(msg);
      }
    } finally {
      if (seq === ticketsStatsSeqRef.current && isMountedRef.current) {
        setStatsLoading(false);
      }
    }
  }, []);

  // -----------------------------------------------------------------------
  // API: TẢI DANH SÁCH TICKETS (SEQUENCE COUNTER RIÊNG: ticketsListSeqRef)
  // -----------------------------------------------------------------------
  const fetchTickets = useCallback(
    async (targetPage = 1) => {
      const currentSeq = ++ticketsListSeqRef.current;
      setLoading(true);
      setErrorMessage('');

      try {
        const queryParams = new URLSearchParams();
        queryParams.set('page', String(targetPage));
        queryParams.set('limit', String(pagination.limit));

        if (statusFilter) {
          queryParams.set('status', statusFilter);
        }
        if (categoryFilter.trim()) {
          queryParams.set('category', categoryFilter.trim());
        }
        if (roomFilter) {
          queryParams.set('roomId', roomFilter);
        }
        if (duplicateFilter !== '') {
          queryParams.set('isDuplicate', duplicateFilter);
        }
        if (searchDebounced.trim()) {
          queryParams.set('search', searchDebounced.trim());
        }

        const res = (await axiosClient.get(
          `${API_ENDPOINTS.TICKETS.LIST}?${queryParams.toString()}`
        )) as unknown as ApiEnvelope<TicketItem[]>;

        if (currentSeq !== ticketsListSeqRef.current || !isMountedRef.current) {
          return;
        }

        let list: TicketItem[] = [];
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

        setTickets(list);
        setPagination(meta);
      } catch (err: unknown) {
        if (currentSeq !== ticketsListSeqRef.current || !isMountedRef.current) {
          return;
        }
        const msg = parseErrorMessage(err, 'Không thể tải danh sách phiếu báo hỏng từ máy chủ.');
        setErrorMessage(msg);
        setTickets([]);
      } finally {
        if (currentSeq === ticketsListSeqRef.current && isMountedRef.current) {
          setLoading(false);
        }
      }
    },
    [statusFilter, categoryFilter, roomFilter, duplicateFilter, searchDebounced, pagination.limit]
  );

  // -----------------------------------------------------------------------
  // TRIGGER LOAD DỮ LIỆU
  // -----------------------------------------------------------------------
  useEffect(() => {
    fetchRoomsForFilter();
    fetchTechnicians();
    fetchOverviewStats();
  }, [fetchRoomsForFilter, fetchTechnicians, fetchOverviewStats]);

  useEffect(() => {
    fetchTickets(1);
  }, [fetchTickets]);

  // -----------------------------------------------------------------------
  // XỬ LÝ MODAL PHÂN CÔNG THỢ
  // -----------------------------------------------------------------------
  const handleOpenAssignModal = (ticket: TicketItem) => {
    if (ticket.status === 'CLOSED') {
      setActionNotice({
        type: 'error',
        text: 'Phiếu này đã đóng hoàn tất (CLOSED). Không thể phân công lại.',
      });
      return;
    }

    setSelectedTicket(ticket);
    setSelectedTechnicianId(ticket.technicianId ? String(ticket.technicianId) : '');
    setManualTechnicianId('');
    setAssignError('');
    setAssignSuccess('');
    setIsAssignModalOpen(true);

    if (technicians.length === 0) {
      fetchTechnicians();
    }
  };

  // Đóng modal bằng phím ESC
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        if (isAssignModalOpen && !assignSubmitting) {
          setIsAssignModalOpen(false);
        }
        if (viewingTicket) {
          setViewingTicket(null);
        }
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [isAssignModalOpen, assignSubmitting, viewingTicket]);

  // Gửi lệnh phân công thợ
  const handleSubmitAssign = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedTicket) return;

    setAssignError('');
    setAssignSuccess('');

    let techIdNum = 0;
    if (selectedTechnicianId) {
      techIdNum = parseInt(selectedTechnicianId, 10);
    } else if (manualTechnicianId.trim()) {
      techIdNum = parseInt(manualTechnicianId.trim(), 10);
    }

    if (isNaN(techIdNum) || techIdNum <= 0) {
      setAssignError('Vui lòng chọn hoặc nhập mã định danh Thợ kỹ thuật hợp lệ (số nguyên dương).');
      return;
    }

    setAssignSubmitting(true);
    try {
      const res = (await axiosClient.put(API_ENDPOINTS.TICKETS.ASSIGN(selectedTicket.id), {
        technicianId: techIdNum,
      })) as unknown as ApiEnvelope<TicketItem>;

      const updated = res?.data;

      if (isMountedRef.current) {
        setTickets((prev) =>
          prev.map((t) =>
            t.id === selectedTicket.id
              ? {
                  ...t,
                  status: 'ASSIGNED',
                  technicianId: techIdNum,
                  technician: updated?.technician || t.technician || {
                    id: techIdNum,
                    fullName: `Thợ #${techIdNum}`,
                  },
                }
              : t
          )
        );

        setAssignSuccess('Đã phân công việc cho Thợ kỹ thuật thành công!');
        fetchOverviewStats();

        setTimeout(() => {
          if (isMountedRef.current) {
            setIsAssignModalOpen(false);
            setAssignSuccess('');
            setSelectedTicket(null);
          }
        }, 800);
      }
    } catch (err: unknown) {
      if (isMountedRef.current) {
        const msg = parseErrorMessage(err, 'Lỗi khi phân công thợ kỹ thuật.');
        setAssignError(msg);
      }
    } finally {
      if (isMountedRef.current) {
        setAssignSubmitting(false);
      }
    }
  };

  return (
    <div className="ticket-dispatch-container">
      {/* ================================================================= */}
      {/* TOÀN BỘ CSS THỰC SỰ - HOÀN TOÀN ĐỘC LẬP VỚI TAILWIND (NO TAILWIND) */}
      {/* ================================================================= */}
      <style>{`
        .ticket-dispatch-container {
          width: 100%;
          max-width: 1200px;
          margin: 0 auto;
          padding: 1.5rem 1rem 3rem 1rem;
          color: #1e293b;
          font-family: inherit;
        }
        .ticket-dispatch-header {
          display: flex;
          justify-content: space-between;
          align-items: center;
          flex-wrap: wrap;
          gap: 1rem;
          margin-bottom: 1.5rem;
        }
        .ticket-dispatch-title {
          font-size: 1.5rem;
          font-weight: 700;
          color: #0f172a;
          margin: 0;
          letter-spacing: -0.025em;
        }
        .ticket-dispatch-subtitle {
          font-size: 0.875rem;
          color: #64748b;
          margin: 0.25rem 0 0 0;
        }
        .ticket-dispatch-btn {
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
        .ticket-dispatch-btn:disabled {
          opacity: 0.5;
          cursor: not-allowed;
        }
        .ticket-dispatch-btn-primary {
          background-color: #4f46e5;
          color: #ffffff;
        }
        .ticket-dispatch-btn-primary:hover:not(:disabled) {
          background-color: #4338ca;
        }
        .ticket-dispatch-btn-secondary {
          background-color: #ffffff;
          color: #334155;
          border-color: #cbd5e1;
        }
        .ticket-dispatch-btn-secondary:hover:not(:disabled) {
          background-color: #f8fafc;
        }
        .ticket-dispatch-btn-sm {
          padding: 0.25rem 0.625rem;
          font-size: 0.75rem;
          border-radius: 0.375rem;
        }
        .ticket-dispatch-stats-grid {
          display: grid;
          grid-template-columns: repeat(auto-fit, minmax(150px, 1fr));
          gap: 0.75rem;
          margin-bottom: 1.5rem;
        }
        .ticket-dispatch-stat-card {
          background-color: #ffffff;
          border: 1px solid #e2e8f0;
          border-radius: 0.75rem;
          padding: 1rem;
          box-shadow: 0 1px 3px rgba(0, 0, 0, 0.05);
        }
        .ticket-dispatch-stat-card-slate { border-left: 4px solid #475569; }
        .ticket-dispatch-stat-card-amber { border-left: 4px solid #d97706; }
        .ticket-dispatch-stat-card-blue { border-left: 4px solid #2563eb; }
        .ticket-dispatch-stat-card-purple { border-left: 4px solid #9333ea; }
        .ticket-dispatch-stat-card-emerald { border-left: 4px solid #059669; }
        .ticket-dispatch-stat-card-gray { border-left: 4px solid #64748b; }
        .ticket-dispatch-stat-card-rose { border-left: 4px solid #e11d48; background-color: #fff1f2; }
        .ticket-dispatch-stat-label {
          font-size: 0.6875rem;
          font-weight: 700;
          color: #64748b;
          text-transform: uppercase;
          letter-spacing: 0.05em;
          margin: 0;
        }
        .ticket-dispatch-stat-value {
          font-size: 1.375rem;
          font-weight: 700;
          color: #0f172a;
          margin: 0.25rem 0 0 0;
        }
        .ticket-dispatch-card {
          background-color: #ffffff;
          border: 1px solid #e2e8f0;
          border-radius: 0.75rem;
          box-shadow: 0 1px 3px rgba(0, 0, 0, 0.05);
          margin-bottom: 1.25rem;
        }
        .ticket-dispatch-filter-box {
          padding: 1rem;
        }
        .ticket-dispatch-filter-grid {
          display: grid;
          grid-template-columns: repeat(auto-fit, minmax(180px, 1fr));
          gap: 0.75rem;
          align-items: flex-end;
        }
        .ticket-dispatch-form-group {
          display: flex;
          flex-direction: column;
          gap: 0.25rem;
        }
        .ticket-dispatch-form-label {
          font-size: 0.75rem;
          font-weight: 600;
          color: #475569;
        }
        .ticket-dispatch-input, .ticket-dispatch-select {
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
        .ticket-dispatch-input:focus, .ticket-dispatch-select:focus {
          border-color: #4f46e5;
          box-shadow: 0 0 0 2px rgba(79, 70, 229, 0.1);
        }
        .ticket-dispatch-alert {
          padding: 0.875rem 1rem;
          border-radius: 0.5rem;
          font-size: 0.875rem;
          margin-bottom: 1rem;
          display: flex;
          justify-content: space-between;
          align-items: center;
        }
        .ticket-dispatch-alert-success {
          background-color: #ecfdf5;
          color: #065f46;
          border: 1px solid #a7f3d0;
        }
        .ticket-dispatch-alert-error {
          background-color: #fef2f2;
          color: #991b1b;
          border: 1px solid #fecaca;
        }
        .ticket-dispatch-table-wrap {
          overflow-x: auto;
          width: 100%;
        }
        .ticket-dispatch-table {
          width: 100%;
          border-collapse: collapse;
          font-size: 0.875rem;
          text-align: left;
        }
        .ticket-dispatch-table th {
          background-color: #f8fafc;
          color: #475569;
          font-size: 0.75rem;
          font-weight: 600;
          text-transform: uppercase;
          letter-spacing: 0.05em;
          padding: 0.75rem 0.875rem;
          border-bottom: 1px solid #e2e8f0;
          white-space: nowrap;
        }
        .ticket-dispatch-table td {
          padding: 0.875rem 0.875rem;
          border-bottom: 1px solid #f1f5f9;
          color: #1e293b;
          vertical-align: middle;
        }
        .ticket-dispatch-row-dup {
          background-color: #fffbeb !important;
        }
        .ticket-dispatch-row-dup:hover td {
          background-color: #fef3c7 !important;
        }
        .ticket-dispatch-table tr:hover td {
          background-color: #f8fafc;
        }
        .ticket-dispatch-badge {
          display: inline-flex;
          align-items: center;
          padding: 0.25rem 0.5rem;
          font-size: 0.75rem;
          font-weight: 600;
          border-radius: 9999px;
          white-space: nowrap;
        }
        .ticket-dispatch-badge-pending {
          background-color: #fffbeb;
          color: #b45309;
          border: 1px solid #fde68a;
        }
        .ticket-dispatch-badge-assigned {
          background-color: #eff6ff;
          color: #1d4ed8;
          border: 1px solid #bfdbfe;
        }
        .ticket-dispatch-badge-in-progress {
          background-color: #faf5ff;
          color: #7e22ce;
          border: 1px solid #e9d5ff;
        }
        .ticket-dispatch-badge-completed {
          background-color: #ecfdf5;
          color: #047857;
          border: 1px solid #a7f3d0;
        }
        .ticket-dispatch-badge-closed {
          background-color: #f1f5f9;
          color: #475569;
          border: 1px solid #cbd5e1;
        }
        .ticket-dispatch-badge-dup-alert {
          background-color: #f59e0b;
          color: #ffffff;
          padding: 0.125rem 0.375rem;
          border-radius: 0.25rem;
          font-size: 0.6875rem;
          font-weight: 700;
          display: inline-block;
          margin-top: 0.25rem;
        }
        .ticket-dispatch-pagination {
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
        .ticket-dispatch-modal-overlay {
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
        .ticket-dispatch-modal-box {
          background-color: #ffffff;
          border-radius: 0.75rem;
          border: 1px solid #e2e8f0;
          box-shadow: 0 20px 25px -5px rgba(0, 0, 0, 0.1);
          width: 100%;
          max-width: 480px;
          max-height: 90vh;
          overflow-y: auto;
        }
        .ticket-dispatch-modal-header {
          display: flex;
          justify-content: space-between;
          align-items: center;
          padding: 1rem 1.25rem;
          background-color: #f8fafc;
          border-bottom: 1px solid #e2e8f0;
        }
        .ticket-dispatch-modal-title {
          font-size: 1rem;
          font-weight: 700;
          color: #0f172a;
          margin: 0;
        }
        .ticket-dispatch-modal-close {
          background: none;
          border: none;
          font-size: 1.25rem;
          color: #94a3b8;
          cursor: pointer;
          padding: 0;
          line-height: 1;
        }
        .ticket-dispatch-modal-body {
          padding: 1.25rem;
          display: flex;
          flex-direction: column;
          gap: 1rem;
        }
        .ticket-dispatch-modal-footer {
          display: flex;
          justify-content: flex-end;
          gap: 0.5rem;
          padding-top: 1rem;
          border-top: 1px solid #f1f5f9;
        }
      `}</style>

      {/* HEADER TRANG */}
      <div className="ticket-dispatch-header">
        <div>
          <h1 className="ticket-dispatch-title">Bảng Điều Phối Sự Cố Kỹ Thuật</h1>
          <p className="ticket-dispatch-subtitle">
            Hệ thống tiếp nhận báo hỏng, nhận diện sự cố gửi trùng 24h và phân công thợ sửa chữa
          </p>
        </div>
        <div>
          <button
            onClick={() => {
              fetchTickets(pagination.page);
              fetchOverviewStats();
            }}
            className="ticket-dispatch-btn ticket-dispatch-btn-secondary"
            title="Làm mới bảng sự cố"
          >
            🔄 Tải lại dữ liệu
          </button>
        </div>
      </div>

      {/* THÔNG BÁO TOÀN TRANG */}
      {actionNotice && (
        <div
          className={`ticket-dispatch-alert ${
            actionNotice.type === 'success'
              ? 'ticket-dispatch-alert-success'
              : 'ticket-dispatch-alert-error'
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

      {/* BẢNG THỐNG KÊ ĐẦY ĐỦ 5 TRẠNG THÁI + TRÙNG 24H + TỔNG (ACCURATE REAL COUNTS) */}
      <div className="ticket-dispatch-stats-grid">
        <div className="ticket-dispatch-stat-card ticket-dispatch-stat-card-slate">
          <p className="ticket-dispatch-stat-label">Tổng phiếu</p>
          <p className="ticket-dispatch-stat-value">
            {statsLoading ? '...' : stats.total !== null ? stats.total : 'N/A'}
          </p>
        </div>
        <div className="ticket-dispatch-stat-card ticket-dispatch-stat-card-amber">
          <p className="ticket-dispatch-stat-label" style={{ color: '#d97706' }}>
            Chờ tiếp nhận
          </p>
          <p className="ticket-dispatch-stat-value" style={{ color: '#d97706' }}>
            {statsLoading ? '...' : stats.pending !== null ? stats.pending : 'N/A'}
          </p>
        </div>
        <div className="ticket-dispatch-stat-card ticket-dispatch-stat-card-blue">
          <p className="ticket-dispatch-stat-label" style={{ color: '#2563eb' }}>
            Đã phân công
          </p>
          <p className="ticket-dispatch-stat-value" style={{ color: '#2563eb' }}>
            {statsLoading ? '...' : stats.assigned !== null ? stats.assigned : 'N/A'}
          </p>
        </div>
        <div className="ticket-dispatch-stat-card ticket-dispatch-stat-card-purple">
          <p className="ticket-dispatch-stat-label" style={{ color: '#9333ea' }}>
            Đang xử lý
          </p>
          <p className="ticket-dispatch-stat-value" style={{ color: '#9333ea' }}>
            {statsLoading ? '...' : stats.inProgress !== null ? stats.inProgress : 'N/A'}
          </p>
        </div>
        <div className="ticket-dispatch-stat-card ticket-dispatch-stat-card-emerald">
          <p className="ticket-dispatch-stat-label" style={{ color: '#059669' }}>
            Đã hoàn thành
          </p>
          <p className="ticket-dispatch-stat-value" style={{ color: '#059669' }}>
            {statsLoading ? '...' : stats.completed !== null ? stats.completed : 'N/A'}
          </p>
        </div>
        <div className="ticket-dispatch-stat-card ticket-dispatch-stat-card-gray">
          <p className="ticket-dispatch-stat-label" style={{ color: '#475569' }}>
            Đã đóng
          </p>
          <p className="ticket-dispatch-stat-value" style={{ color: '#475569' }}>
            {statsLoading ? '...' : stats.closed !== null ? stats.closed : 'N/A'}
          </p>
        </div>
        <div className="ticket-dispatch-stat-card ticket-dispatch-stat-card-rose">
          <p className="ticket-dispatch-stat-label" style={{ color: '#e11d48' }}>
            ⚠️ Trùng 24h
          </p>
          <p className="ticket-dispatch-stat-value" style={{ color: '#e11d48' }}>
            {statsLoading ? '...' : stats.duplicates !== null ? stats.duplicates : 'N/A'}
          </p>
        </div>
      </div>

      {statsError && (
        <div className="ticket-dispatch-alert ticket-dispatch-alert-error" style={{ margin: '0 0 1rem 0' }}>
          <span>{statsError}</span>
        </div>
      )}

      {/* BỘ LỌC SỰ CỐ */}
      <div className="ticket-dispatch-card ticket-dispatch-filter-box">
        <div className="ticket-dispatch-filter-grid">
          <div className="ticket-dispatch-form-group">
            <label className="ticket-dispatch-form-label">Tìm kiếm sự cố</label>
            <input
              type="text"
              placeholder="Tiêu đề, nội dung sự cố..."
              value={searchInput}
              onChange={(e) => setSearchInput(e.target.value)}
              className="ticket-dispatch-input"
            />
          </div>

          <div className="ticket-dispatch-form-group">
            <label className="ticket-dispatch-form-label">Trạng thái phiếu</label>
            <select
              value={statusFilter}
              onChange={(e) => setStatusFilter(e.target.value)}
              className="ticket-dispatch-select"
            >
              <option value="">Tất cả trạng thái</option>
              <option value="PENDING">Chờ tiếp nhận (PENDING)</option>
              <option value="ASSIGNED">Đã phân công (ASSIGNED)</option>
              <option value="IN_PROGRESS">Đang xử lý (IN_PROGRESS)</option>
              <option value="COMPLETED">Đã hoàn thành (COMPLETED)</option>
              <option value="CLOSED">Đã đóng phiếu (CLOSED)</option>
            </select>
          </div>

          <div className="ticket-dispatch-form-group">
            <label className="ticket-dispatch-form-label">Hạng mục sự cố</label>
            <input
              type="text"
              placeholder="Điện, Nước, Thang máy..."
              value={categoryFilter}
              onChange={(e) => setCategoryFilter(e.target.value)}
              className="ticket-dispatch-input"
            />
          </div>

          <div className="ticket-dispatch-form-group">
            <label className="ticket-dispatch-form-label">Căn hộ</label>
            <select
              value={roomFilter}
              onChange={(e) => setRoomFilter(e.target.value)}
              className="ticket-dispatch-select"
            >
              <option value="">Tất cả căn hộ</option>
              {availableRooms.map((r) => (
                <option key={r.id} value={r.id}>
                  Phòng {r.roomNumber} (Tầng {r.floor})
                </option>
              ))}
            </select>
          </div>

          <div className="ticket-dispatch-form-group">
            <label className="ticket-dispatch-form-label">Cảnh báo trùng lặp</label>
            <select
              value={duplicateFilter}
              onChange={(e) => setDuplicateFilter(e.target.value)}
              className="ticket-dispatch-select"
            >
              <option value="">Tất cả phiếu</option>
              <option value="true">⚠️ Chỉ xem phiếu trùng 24h</option>
              <option value="false">Phiếu bình thường</option>
            </select>
          </div>

          <div>
            <button
              type="button"
              onClick={() => {
                setSearchInput('');
                setSearchDebounced('');
                setStatusFilter('');
                setCategoryFilter('');
                setRoomFilter('');
                setDuplicateFilter('');
              }}
              className="ticket-dispatch-btn ticket-dispatch-btn-secondary"
              style={{ width: '100%' }}
            >
              Xóa bộ lọc
            </button>
          </div>
        </div>
      </div>

      {/* HIỂN THỊ LỖI NẾU CÓ */}
      {errorMessage && (
        <div className="ticket-dispatch-alert ticket-dispatch-alert-error">
          <span>{errorMessage}</span>
          <button
            onClick={() => fetchTickets(pagination.page)}
            className="ticket-dispatch-btn ticket-dispatch-btn-sm ticket-dispatch-btn-secondary"
          >
            Thử lại
          </button>
        </div>
      )}

      {/* BẢNG DANH SÁCH PHIẾU BÁO HỎNG */}
      <div className="ticket-dispatch-card">
        <div className="ticket-dispatch-table-wrap">
          <table className="ticket-dispatch-table">
            <thead>
              <tr>
                <th>Mã</th>
                <th>Căn Hộ</th>
                <th>Cư Dân Báo</th>
                <th>Hạng Mục</th>
                <th>Tiêu Đề & Mô Tả</th>
                <th>Ảnh / Media</th>
                <th>Thời Gian Gửi</th>
                <th>Trạng Thái</th>
                <th>Thợ Phụ Trách</th>
                <th style={{ textAlign: 'right' }}>Thao Tác</th>
              </tr>
            </thead>
            <tbody>
              {loading ? (
                <tr>
                  <td colSpan={10} style={{ textAlign: 'center', padding: '2.5rem', color: '#94a3b8' }}>
                    ⏳ Đang tải bảng điều phối sự cố...
                  </td>
                </tr>
              ) : tickets.length === 0 ? (
                <tr>
                  <td colSpan={10} style={{ textAlign: 'center', padding: '3rem', color: '#94a3b8' }}>
                    <p style={{ margin: 0, fontWeight: 600, color: '#475569' }}>
                      Chưa có phiếu sự cố nào phù hợp
                    </p>
                    <p style={{ margin: '0.25rem 0 0 0', fontSize: '0.75rem' }}>
                      Hệ thống không ghi nhận phản ánh báo hỏng theo tiêu chí lọc
                    </p>
                  </td>
                </tr>
              ) : (
                tickets.map((ticket) => {
                  const roomText = ticket.room?.roomNumber
                    ? `P.${ticket.room.roomNumber}`
                    : ticket.roomId
                    ? `Phòng #${ticket.roomId}`
                    : 'Khu vực chung';

                  const dateFormatted = ticket.createdAt
                    ? new Date(ticket.createdAt).toLocaleString('vi-VN', {
                        year: 'numeric',
                        month: '2-digit',
                        day: '2-digit',
                        hour: '2-digit',
                        minute: '2-digit',
                      })
                    : '-';

                  const hasSafeMedia = isSafeMediaUrl(ticket.mediaUrl);

                  return (
                    <tr
                      key={ticket.id}
                      className={ticket.isDuplicate ? 'ticket-dispatch-row-dup' : ''}
                    >
                      <td style={{ fontFamily: 'monospace', fontWeight: 700, color: '#475569' }}>
                        #{ticket.id}
                      </td>
                      <td>
                        <span style={{ fontWeight: 700, color: '#4f46e5' }}>{roomText}</span>
                        {ticket.room?.floor !== undefined && (
                          <span style={{ fontSize: '0.75rem', color: '#94a3b8', display: 'block' }}>
                            Tầng {ticket.room.floor}
                          </span>
                        )}
                      </td>
                      <td>
                        <span style={{ fontWeight: 600, color: '#0f172a' }}>
                          {ticket.resident?.fullName || `Cư dân #${ticket.residentId}`}
                        </span>
                        {ticket.resident?.phone && (
                          <span style={{ fontSize: '0.75rem', color: '#64748b', display: 'block' }}>
                            {ticket.resident.phone}
                          </span>
                        )}
                      </td>
                      <td>
                        <span
                          style={{
                            padding: '0.2rem 0.5rem',
                            backgroundColor: '#f1f5f9',
                            borderRadius: '0.25rem',
                            fontSize: '0.75rem',
                            fontWeight: 600,
                          }}
                        >
                          {ticket.category}
                        </span>
                      </td>
                      <td style={{ maxWidth: '240px' }}>
                        <div style={{ fontWeight: 600, color: '#0f172a' }}>
                          {ticket.title || ticket.category}
                        </div>
                        {/* CẢNH BÁO TRÙNG LẶP 24H THEO YÊU CẦU NGHIỆM THU */}
                        {ticket.isDuplicate && (
                          <div>
                            <span className="ticket-dispatch-badge-dup-alert">
                              ⚠️ Cảnh báo trùng lặp 24h
                            </span>
                          </div>
                        )}
                        <p
                          style={{
                            margin: '0.25rem 0 0 0',
                            fontSize: '0.75rem',
                            color: '#64748b',
                            overflow: 'hidden',
                            textOverflow: 'ellipsis',
                            whiteSpace: 'nowrap',
                          }}
                          title={ticket.description}
                        >
                          {ticket.description}
                        </p>
                      </td>
                      <td>
                        {hasSafeMedia ? (
                          <a
                            href={ticket.mediaUrl!}
                            target="_blank"
                            rel="noopener noreferrer"
                            style={{
                              fontSize: '0.75rem',
                              color: '#4f46e5',
                              fontWeight: 600,
                              textDecoration: 'underline',
                            }}
                          >
                            📷 Xem ảnh
                          </a>
                        ) : (
                          <span style={{ fontSize: '0.75rem', color: '#94a3b8', fontStyle: 'italic' }}>
                            Không có
                          </span>
                        )}
                      </td>
                      <td style={{ fontSize: '0.75rem', color: '#64748b', whiteSpace: 'nowrap' }}>
                        {dateFormatted}
                      </td>
                      <td>
                        {ticket.status === 'PENDING' && (
                          <span className="ticket-dispatch-badge ticket-dispatch-badge-pending">
                            Chờ tiếp nhận
                          </span>
                        )}
                        {ticket.status === 'ASSIGNED' && (
                          <span className="ticket-dispatch-badge ticket-dispatch-badge-assigned">
                            Đã phân công
                          </span>
                        )}
                        {ticket.status === 'IN_PROGRESS' && (
                          <span className="ticket-dispatch-badge ticket-dispatch-badge-in-progress">
                            Đang xử lý
                          </span>
                        )}
                        {ticket.status === 'COMPLETED' && (
                          <span className="ticket-dispatch-badge ticket-dispatch-badge-completed">
                            Đã hoàn thành
                          </span>
                        )}
                        {ticket.status === 'CLOSED' && (
                          <span className="ticket-dispatch-badge ticket-dispatch-badge-closed">
                            Đã đóng
                          </span>
                        )}
                      </td>
                      <td>
                        {ticket.technician ? (
                          <div>
                            <span style={{ fontWeight: 600, color: '#0f172a', fontSize: '0.75rem' }}>
                              🔧 {ticket.technician.fullName}
                            </span>
                            {ticket.technician.phone && (
                              <span style={{ fontSize: '0.6875rem', color: '#64748b', display: 'block' }}>
                                {ticket.technician.phone}
                              </span>
                            )}
                          </div>
                        ) : (
                          <span style={{ fontSize: '0.75rem', color: '#d97706', fontStyle: 'italic' }}>
                            Chưa phân công
                          </span>
                        )}
                      </td>
                      <td style={{ textAlign: 'right', whiteSpace: 'nowrap' }}>
                        <div style={{ display: 'flex', gap: '0.375rem', justifyContent: 'flex-end' }}>
                          <button
                            onClick={() => setViewingTicket(ticket)}
                            className="ticket-dispatch-btn ticket-dispatch-btn-sm ticket-dispatch-btn-secondary"
                          >
                            Chi tiết
                          </button>
                          {ticket.status !== 'CLOSED' ? (
                            <button
                              onClick={() => handleOpenAssignModal(ticket)}
                              className="ticket-dispatch-btn ticket-dispatch-btn-sm ticket-dispatch-btn-primary"
                            >
                              Phân công thợ
                            </button>
                          ) : (
                            <span
                              style={{
                                fontSize: '0.75rem',
                                color: '#94a3b8',
                                padding: '0.25rem 0.5rem',
                              }}
                            >
                              Đã đóng
                            </span>
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

        {/* PHÂN TRANG TICKETS */}
        {pagination.totalPages > 1 && (
          <div className="ticket-dispatch-pagination">
            <span>
              Trang {pagination.page} / {pagination.totalPages} (Tổng số {pagination.total} phiếu sự cố)
            </span>
            <div style={{ display: 'flex', gap: '0.5rem' }}>
              <button
                disabled={pagination.page <= 1}
                onClick={() => fetchTickets(pagination.page - 1)}
                className="ticket-dispatch-btn ticket-dispatch-btn-sm ticket-dispatch-btn-secondary"
              >
                Trang trước
              </button>
              <button
                disabled={pagination.page >= pagination.totalPages}
                onClick={() => fetchTickets(pagination.page + 1)}
                className="ticket-dispatch-btn ticket-dispatch-btn-sm ticket-dispatch-btn-secondary"
              >
                Trang sau
              </button>
            </div>
          </div>
        )}
      </div>

      {/* =================================================================== */}
      {/* MODAL PHÂN CÔNG THỢ KỸ THUẬT (NO TAILWIND - FULL PROPER CSS) */}
      {/* =================================================================== */}
      {isAssignModalOpen && selectedTicket && (
        <div
          className="ticket-dispatch-modal-overlay"
          onClick={(e) => {
            if (e.target === e.currentTarget && !assignSubmitting) {
              setIsAssignModalOpen(false);
            }
          }}
        >
          <div className="ticket-dispatch-modal-box">
            <div className="ticket-dispatch-modal-header">
              <h3 className="ticket-dispatch-modal-title">
                Phân Công Thợ Sửa Chữa [Phiếu #{selectedTicket.id}]
              </h3>
              <button
                type="button"
                onClick={() => !assignSubmitting && setIsAssignModalOpen(false)}
                className="ticket-dispatch-modal-close"
              >
                ✕
              </button>
            </div>

            <form onSubmit={handleSubmitAssign}>
              <div className="ticket-dispatch-modal-body">
                {assignError && (
                  <div className="ticket-dispatch-alert ticket-dispatch-alert-error" style={{ margin: 0 }}>
                    {assignError}
                  </div>
                )}
                {assignSuccess && (
                  <div
                    className="ticket-dispatch-alert ticket-dispatch-alert-success"
                    style={{ margin: 0 }}
                  >
                    {assignSuccess}
                  </div>
                )}

                <div
                  style={{
                    backgroundColor: '#f8fafc',
                    padding: '0.75rem',
                    borderRadius: '0.5rem',
                    border: '1px solid #e2e8f0',
                    fontSize: '0.75rem',
                  }}
                >
                  <p style={{ margin: '0 0 0.25rem 0' }}>
                    <strong>Hạng mục:</strong> {selectedTicket.category} -{' '}
                    <span style={{ fontWeight: 700, color: '#4f46e5' }}>
                      {selectedTicket.room?.roomNumber
                        ? `Phòng ${selectedTicket.room.roomNumber}`
                        : 'Khu vực chung'}
                    </span>
                  </p>
                  <p style={{ margin: '0 0 0.25rem 0' }}>
                    <strong>Tiêu đề:</strong> {selectedTicket.title || 'Không có tiêu đề'}
                  </p>
                  <p style={{ margin: '0 0 0.25rem 0' }}>
                    <strong>Mô tả:</strong> {selectedTicket.description}
                  </p>
                  {selectedTicket.isDuplicate && (
                    <p style={{ margin: 0, color: '#b45309', fontWeight: 700 }}>
                      ⚠️ Cảnh báo: Phiếu sự cố này có khả năng trùng lặp trong 24h qua!
                    </p>
                  )}
                </div>

                <div className="ticket-dispatch-form-group">
                  <label className="ticket-dispatch-form-label">
                    Chọn Thợ kỹ thuật phụ trách <span style={{ color: '#ef4444' }}>*</span>
                  </label>
                  {techniciansLoading ? (
                    <span style={{ fontSize: '0.75rem', color: '#94a3b8', fontStyle: 'italic' }}>
                      Đang tải danh sách thợ...
                    </span>
                  ) : technicians.length > 0 ? (
                    <select
                      value={selectedTechnicianId}
                      onChange={(e) => {
                        setSelectedTechnicianId(e.target.value);
                        if (e.target.value) setManualTechnicianId('');
                      }}
                      className="ticket-dispatch-select"
                    >
                      <option value="">-- Chọn kỹ thuật viên --</option>
                      {technicians.map((t) => (
                        <option key={t.id} value={t.id}>
                          {t.fullName} (ID: #{t.id} - SĐT: {t.phone || 'N/A'})
                        </option>
                      ))}
                    </select>
                  ) : (
                    <p
                      style={{
                        margin: 0,
                        fontSize: '0.75rem',
                        color: '#b45309',
                        backgroundColor: '#fffbeb',
                        padding: '0.5rem',
                        borderRadius: '0.375rem',
                      }}
                    >
                      Chưa nạp được danh sách thợ từ hệ thống. Vui lòng nhập mã ID thợ bên dưới.
                    </p>
                  )}
                </div>

                <div className="ticket-dispatch-form-group">
                  <label className="ticket-dispatch-form-label">
                    Hoặc nhập trực tiếp technicianId dự phòng
                  </label>
                  <input
                    type="number"
                    min="1"
                    placeholder="Nhập mã ID thợ kỹ thuật (số nguyên dương)"
                    value={manualTechnicianId}
                    onChange={(e) => {
                      setManualTechnicianId(e.target.value);
                      if (e.target.value) setSelectedTechnicianId('');
                    }}
                    className="ticket-dispatch-input"
                  />
                  <span style={{ fontSize: '0.6875rem', color: '#94a3b8', marginTop: '0.25rem' }}>
                    * Hướng dẫn: Mã ID phải thuộc tài khoản có vai trò TECHNICIAN trên hệ thống.
                  </span>
                </div>

                <div className="ticket-dispatch-modal-footer">
                  <button
                    type="button"
                    onClick={() => setIsAssignModalOpen(false)}
                    disabled={assignSubmitting}
                    className="ticket-dispatch-btn ticket-dispatch-btn-secondary"
                  >
                    Hủy bỏ
                  </button>
                  <button
                    type="submit"
                    disabled={assignSubmitting}
                    className="ticket-dispatch-btn ticket-dispatch-btn-primary"
                  >
                    {assignSubmitting ? 'Đang phân công...' : 'Xác Nhận Phân Công'}
                  </button>
                </div>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* =================================================================== */}
      {/* MODAL XEM CHI TIẾT SỰ CỐ & MEDIA (NO TAILWIND - FULL PROPER CSS) */}
      {/* =================================================================== */}
      {viewingTicket && (
        <div
          className="ticket-dispatch-modal-overlay"
          onClick={(e) => {
            if (e.target === e.currentTarget) {
              setViewingTicket(null);
            }
          }}
        >
          <div className="ticket-dispatch-modal-box">
            <div className="ticket-dispatch-modal-header">
              <h3 className="ticket-dispatch-modal-title">
                Chi Tiết Phiếu Báo Hỏng #{viewingTicket.id}
              </h3>
              <button
                type="button"
                onClick={() => setViewingTicket(null)}
                className="ticket-dispatch-modal-close"
              >
                ✕
              </button>
            </div>

            <div className="ticket-dispatch-modal-body">
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0.5rem', fontSize: '0.75rem' }}>
                <div>
                  <span style={{ color: '#94a3b8', display: 'block' }}>Căn hộ:</span>
                  <span style={{ fontWeight: 700, color: '#0f172a' }}>
                    {viewingTicket.room?.roomNumber
                      ? `Phòng ${viewingTicket.room.roomNumber}`
                      : 'Khu vực chung'}
                  </span>
                </div>
                <div>
                  <span style={{ color: '#94a3b8', display: 'block' }}>Hạng mục:</span>
                  <span style={{ fontWeight: 700, color: '#0f172a' }}>{viewingTicket.category}</span>
                </div>
                <div>
                  <span style={{ color: '#94a3b8', display: 'block' }}>Người báo:</span>
                  <span style={{ fontWeight: 700, color: '#0f172a' }}>
                    {viewingTicket.resident?.fullName || `ID #${viewingTicket.residentId}`}
                  </span>
                </div>
                <div>
                  <span style={{ color: '#94a3b8', display: 'block' }}>Thợ phụ trách:</span>
                  <span style={{ fontWeight: 700, color: '#4f46e5' }}>
                    {viewingTicket.technician?.fullName || 'Chưa gán'}
                  </span>
                </div>
              </div>

              <div>
                <span style={{ fontSize: '0.75rem', color: '#64748b', fontWeight: 600, display: 'block' }}>
                  Tiêu đề sự cố:
                </span>
                <p style={{ margin: '0.25rem 0 0 0', fontWeight: 700, color: '#0f172a', fontSize: '0.875rem' }}>
                  {viewingTicket.title || viewingTicket.category}
                </p>
              </div>

              <div>
                <span style={{ fontSize: '0.75rem', color: '#64748b', fontWeight: 600, display: 'block' }}>
                  Mô tả chi tiết:
                </span>
                <p
                  style={{
                    margin: '0.25rem 0 0 0',
                    padding: '0.75rem',
                    backgroundColor: '#f8fafc',
                    borderRadius: '0.5rem',
                    border: '1px solid #e2e8f0',
                    fontSize: '0.75rem',
                    whiteSpace: 'pre-wrap',
                  }}
                >
                  {viewingTicket.description}
                </p>
              </div>

              {viewingTicket.isDuplicate && (
                <div
                  style={{
                    backgroundColor: '#fffbeb',
                    color: '#92400e',
                    padding: '0.75rem',
                    borderRadius: '0.5rem',
                    fontSize: '0.75rem',
                    border: '1px solid #fde68a',
                  }}
                >
                  ⚠️ <strong>Cảnh báo trùng lặp 24h:</strong> Hệ thống đã phát hiện có phiếu tương tự cùng căn hộ và danh mục trong 24 giờ qua.
                </div>
              )}

              {/* MEDIA AN TOÀN */}
              {isSafeMediaUrl(viewingTicket.mediaUrl) ? (
                <div>
                  <span style={{ fontSize: '0.75rem', color: '#64748b', fontWeight: 600, display: 'block', marginBottom: '0.25rem' }}>
                    Ảnh chụp sự cố:
                  </span>
                  <div
                    style={{
                      borderRadius: '0.5rem',
                      overflow: 'hidden',
                      border: '1px solid #e2e8f0',
                      backgroundColor: '#0f172a',
                      textAlign: 'center',
                    }}
                  >
                    <img
                      src={viewingTicket.mediaUrl!}
                      alt="Ảnh sự cố"
                      style={{ maxHeight: '240px', width: 'auto', maxWidth: '100%', objectFit: 'contain' }}
                      onError={(e) => {
                        (e.currentTarget as HTMLElement).style.display = 'none';
                      }}
                    />
                  </div>
                  <div style={{ textAlign: 'right', marginTop: '0.25rem' }}>
                    <a
                      href={viewingTicket.mediaUrl!}
                      target="_blank"
                      rel="noopener noreferrer"
                      style={{ fontSize: '0.75rem', color: '#4f46e5', textDecoration: 'underline', fontWeight: 600 }}
                    >
                      Mở ảnh tab mới ↗
                    </a>
                  </div>
                </div>
              ) : viewingTicket.mediaUrl ? (
                <p style={{ fontSize: '0.75rem', color: '#b45309', fontStyle: 'italic', margin: 0 }}>
                  * Tệp đính kèm không sử dụng giao thức HTTP/HTTPS an toàn, đã bị chặn hiển thị.
                </p>
              ) : null}

              <div className="ticket-dispatch-modal-footer">
                <button
                  type="button"
                  onClick={() => setViewingTicket(null)}
                  className="ticket-dispatch-btn ticket-dispatch-btn-secondary"
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
