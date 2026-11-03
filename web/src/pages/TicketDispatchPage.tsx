// =========================================================================
// TRANG BẢNG ĐIỀU PHỐI SỰ CỐ & PHÂN CÔNG THỢ (TICKET DISPATCH PAGE)
// Phụ trách: Thành viên Đức (Senior React + TypeScript Frontend Developer)
// Phạm vi: web/src/pages/TicketDispatchPage.tsx
// Chuẩn hóa: Civic Clarity + Warm Modern Design System (WCAG 2.2 AA)
// Đặc tả:
//   1. Thống kê 5 trạng thái + Trùng lặp 24h + Tổng số phiếu bằng StatCard.
//   2. Request Sequence Counters độc lập (List, Stats, Techs, Rooms).
//   3. Debounce 400ms và chống gửi request trùng lặp (Concurrency Safe).
//   4. Modal phân công thợ và Modal xem chi tiết sự cố kèm ảnh đính kèm an toàn.
//   5. Cảnh báo nổi bật sự cố trùng lặp 24h bằng Warning Badge và highlight hàng.
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
  // STATE: DANH SÁCH THỢ KỸ THUẬT CHO VIỆC PHÂN CÔNG
  // -----------------------------------------------------------------------
  const [technicians, setTechnicians] = useState<TechnicianUser[]>([]);
  const [loadingTechnicians, setLoadingTechnicians] = useState<boolean>(false);

  // -----------------------------------------------------------------------
  // STATE: MODAL PHÂN CÔNG THỢ KỸ THUẬT
  // -----------------------------------------------------------------------
  const [isAssignModalOpen, setIsAssignModalOpen] = useState<boolean>(false);
  const [selectedTicket, setSelectedTicket] = useState<TicketItem | null>(null);
  const [selectedTechnicianId, setSelectedTechnicianId] = useState<string>('');
  const [assignSubmitting, setAssignSubmitting] = useState<boolean>(false);
  const [assignError, setAssignError] = useState<string>('');
  const [assignSuccess, setAssignSuccess] = useState<string>('');

  // -----------------------------------------------------------------------
  // STATE: MODAL XEM CHI TIẾT SỰ CỐ
  // -----------------------------------------------------------------------
  const [isDetailModalOpen, setIsDetailModalOpen] = useState<boolean>(false);
  const [detailTicket, setDetailTicket] = useState<TicketItem | null>(null);

  // Thông báo hành động chung trên trang
  const [actionNotice, setActionNotice] = useState<{ type: 'success' | 'error'; text: string } | null>(null);

  // -----------------------------------------------------------------------
  // TIỆN ÍCH TRÍCH XUẤT THÔNG BÁO LỖI CHUẨN
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
  // API: NẠP DANH SÁCH CĂN HỘ PHỤC VỤ DROPDOWN BỘ LỌC
  // -----------------------------------------------------------------------
  const fetchRoomsForFilter = useCallback(async () => {
    const seq = ++roomsOptionsSeqRef.current;
    try {
      const res = (await axiosClient.get(
        `${API_ENDPOINTS.ROOMS.LIST}?page=1&limit=200`
      )) as unknown as ApiEnvelope<RoomOption[]>;

      if (seq !== roomsOptionsSeqRef.current || !isMountedRef.current) {
        return;
      }

      if (res && Array.isArray(res.data)) {
        setAvailableRooms(res.data);
      }
    } catch {
      // Bỏ qua lỗi ngầm định, người dùng vẫn lọc được theo các tiêu chí khác
    }
  }, []);

  // -----------------------------------------------------------------------
  // API: NẠP DANH SÁCH THỢ KỸ THUẬT (TECHNICIANS)
  // -----------------------------------------------------------------------
  const fetchTechnicians = useCallback(async () => {
    const seq = ++techniciansSeqRef.current;
    setLoadingTechnicians(true);
    try {
      const res = (await axiosClient.get(
        `${API_ENDPOINTS.AUTH.ADMIN_USERS}?role=TECHNICIAN&page=1&limit=100`
      )) as unknown as ApiEnvelope<TechnicianUser[]>;

      if (seq !== techniciansSeqRef.current || !isMountedRef.current) {
        return;
      }

      if (res && Array.isArray(res.data)) {
        setTechnicians(res.data);
      }
    } catch {
      // Giữ nguyên mảng thợ cũ
    } finally {
      if (seq === techniciansSeqRef.current && isMountedRef.current) {
        setLoadingTechnicians(false);
      }
    }
  }, []);

  // -----------------------------------------------------------------------
  // API: NẠP THỐNG KÊ TỔNG QUAN (ACCURATE REAL COUNTS)
  // -----------------------------------------------------------------------
  const fetchOverviewStats = useCallback(async () => {
    const seq = ++ticketsStatsSeqRef.current;
    setStatsLoading(true);
    setStatsError('');

    try {
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
      const pending = extractTotal(pendingRes);
      const assigned = extractTotal(assignedRes);
      const inProgress = extractTotal(inProgressRes);
      const completed = extractTotal(completedRes);
      const closed = extractTotal(closedRes);
      const duplicates = extractTotal(dupRes);

      if (hasFailures) {
        setStatsError('Không thể nạp đầy đủ số liệu thống kê sự cố từ máy chủ. Vui lòng thử lại.');
      } else {
        setStatsError('');
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
  // API: TẢI DANH SÁCH TICKETS (SEQUENCE COUNTER: ticketsListSeqRef)
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

  // Trigger nạp dữ liệu ban đầu
  useEffect(() => {
    fetchRoomsForFilter();
    fetchTechnicians();
    fetchOverviewStats();
  }, [fetchRoomsForFilter, fetchTechnicians, fetchOverviewStats]);

  useEffect(() => {
    fetchTickets(1);
  }, [fetchTickets]);

  // -----------------------------------------------------------------------
  // THAO TÁC PHÂN CÔNG THỢ KỸ THUẬT
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
    setAssignError('');
    setAssignSuccess('');
    setIsAssignModalOpen(true);

    if (technicians.length === 0) {
      fetchTechnicians();
    }
  };

  const handleConfirmAssign = async () => {
    if (!selectedTicket) return;

    if (!selectedTechnicianId) {
      setAssignError('Vui lòng chọn một thợ kỹ thuật từ danh sách.');
      return;
    }

    const techIdNum = parseInt(selectedTechnicianId, 10);
    if (isNaN(techIdNum) || techIdNum <= 0) {
      setAssignError('Mã thợ kỹ thuật không hợp lệ.');
      return;
    }

    setAssignSubmitting(true);
    setAssignError('');
    setAssignSuccess('');

    try {
      const res = (await axiosClient.put(API_ENDPOINTS.TICKETS.ASSIGN(selectedTicket.id), {
        technicianId: techIdNum,
      })) as unknown as ApiEnvelope<TicketItem>;

      if (isMountedRef.current) {
        const updated = res?.data;
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
        }, 700);
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

  // -----------------------------------------------------------------------
  // THAO TÁC XEM CHI TIẾT SỰ CỐ
  // -----------------------------------------------------------------------
  const handleOpenDetailModal = (ticket: TicketItem) => {
    setDetailTicket(ticket);
    setIsDetailModalOpen(true);
  };

  // -----------------------------------------------------------------------
  // TIỆN ÍCH HIỂN THỊ BADGE TRẠNG THÁI SỰ CỐ
  // -----------------------------------------------------------------------
  const renderStatusBadge = (status: TicketStatusType) => {
    switch (status) {
      case 'PENDING':
        return <Badge variant="warning">Chờ tiếp nhận</Badge>;
      case 'ASSIGNED':
        return <Badge variant="info">Đã phân công</Badge>;
      case 'IN_PROGRESS':
        return <Badge variant="primary">Đang xử lý</Badge>;
      case 'COMPLETED':
        return <Badge variant="success">Chờ nghiệm thu</Badge>;
      case 'CLOSED':
        return <Badge variant="neutral">Đã đóng</Badge>;
      default:
        return <Badge variant="neutral">{status}</Badge>;
    }
  };

  // Kiểm tra liên kết ảnh an toàn
  const isSafeMediaUrl = (url?: string | null): boolean => {
    if (!url || typeof url !== 'string') return false;
    const lower = url.trim().toLowerCase();
    return lower.startsWith('http://') || lower.startsWith('https://');
  };

  // Danh mục gợi ý hạng mục
  const categoryOptions = useMemo(
    () => ['Điện', 'Nước', 'Thang máy', 'PCCC', 'Điều hòa', 'Xây dựng / Cửa', 'Khác'],
    []
  );

  return (
    <div style={{ width: '100%', maxWidth: '1280px', margin: '0 auto', display: 'flex', flexDirection: 'column', gap: '1.5rem' }}>
      {/* TIÊU ĐỀ TRANG VÀ NÚT TẢI LẠI */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '1rem' }}>
        <div>
          <h1 style={{ fontSize: '1.5rem', fontWeight: 700, color: 'var(--text-primary)', margin: 0 }}>
            Bảng Điều Phối Sự Cố Kỹ Thuật
          </h1>
          <p style={{ fontSize: '0.875rem', color: 'var(--text-secondary)', margin: '0.25rem 0 0 0' }}>
            Tiếp nhận báo hỏng, nhận diện sự cố gửi trùng lặp trong 24h và phân công kỹ thuật viên xử lý
          </p>
        </div>
        <div>
          <Button
            variant="secondary"
            onClick={() => {
              fetchTickets(pagination.page);
              fetchOverviewStats();
            }}
            isLoading={loading}
          >
            🔄 Tải lại dữ liệu
          </Button>
        </div>
      </div>

      {/* THÔNG BÁO TOÀN TRANG NẾU CÓ */}
      {actionNotice && (
        <AlertBanner
          type={actionNotice.type}
          message={actionNotice.text}
          onClose={() => setActionNotice(null)}
        />
      )}

      {/* THỐNG KÊ TỔNG QUAN 7 CHỈ SỐ BẰNG STATCARD */}
      <div
        style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(auto-fit, minmax(145px, 1fr))',
          gap: '0.75rem',
        }}
      >
        <StatCard title="Tổng số phiếu" value={stats.total !== null ? stats.total : '-'} colorScheme="slate" />
        <StatCard title="Chờ tiếp nhận" value={stats.pending !== null ? stats.pending : '-'} colorScheme="amber" />
        <StatCard title="Đã phân công" value={stats.assigned !== null ? stats.assigned : '-'} colorScheme="indigo" />
        <StatCard title="Đang xử lý" value={stats.inProgress !== null ? stats.inProgress : '-'} colorScheme="indigo" />
        <StatCard title="Chờ nghiệm thu" value={stats.completed !== null ? stats.completed : '-'} colorScheme="emerald" />
        <StatCard title="Đã hoàn tất" value={stats.closed !== null ? stats.closed : '-'} colorScheme="slate" />
        <StatCard title="Trùng lặp 24h" value={stats.duplicates !== null ? stats.duplicates : '-'} colorScheme="rose" />
      </div>

      {statsError && <AlertBanner type="warning" message={statsError} />}

      {/* BỘ LỌC TÌM KIẾM VÀ PHÂN LOẠI */}
      <Card>
        <div style={{ padding: '1rem', display: 'flex', flexDirection: 'column', gap: '0.75rem' }}>
          <div
            style={{
              display: 'grid',
              gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))',
              gap: '0.75rem',
              alignItems: 'flex-end',
            }}
          >
            {/* TÌM KIẾM THEO TỪ KHÓA */}
            <div>
              <label style={{ display: 'block', fontSize: '0.75rem', fontWeight: 600, color: 'var(--text-secondary)', marginBottom: '0.25rem' }}>
                Tìm kiếm sự cố
              </label>
              <input
                type="text"
                placeholder="Tiêu đề, nội dung sự cố..."
                value={searchInput}
                onChange={(e) => setSearchInput(e.target.value)}
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

            {/* LỌC THEO TRẠNG THÁI */}
            <div>
              <label style={{ display: 'block', fontSize: '0.75rem', fontWeight: 600, color: 'var(--text-secondary)', marginBottom: '0.25rem' }}>
                Trạng thái
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
                <option value="PENDING">Chờ tiếp nhận (PENDING)</option>
                <option value="ASSIGNED">Đã phân công (ASSIGNED)</option>
                <option value="IN_PROGRESS">Đang xử lý (IN_PROGRESS)</option>
                <option value="COMPLETED">Chờ nghiệm thu (COMPLETED)</option>
                <option value="CLOSED">Đã đóng phiếu (CLOSED)</option>
              </select>
            </div>

            {/* LỌC THEO HẠNG MỤC */}
            <div>
              <label style={{ display: 'block', fontSize: '0.75rem', fontWeight: 600, color: 'var(--text-secondary)', marginBottom: '0.25rem' }}>
                Hạng mục sự cố
              </label>
              <select
                value={categoryFilter}
                onChange={(e) => setCategoryFilter(e.target.value)}
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
                <option value="">Tất cả hạng mục</option>
                {categoryOptions.map((cat) => (
                  <option key={cat} value={cat}>
                    {cat}
                  </option>
                ))}
              </select>
            </div>

            {/* LỌC THEO CĂN HỘ */}
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

            {/* LỌC PHIẾU TRÙNG LẶP */}
            <div>
              <label style={{ display: 'block', fontSize: '0.75rem', fontWeight: 600, color: 'var(--text-secondary)', marginBottom: '0.25rem' }}>
                Cảnh báo trùng lặp
              </label>
              <select
                value={duplicateFilter}
                onChange={(e) => setDuplicateFilter(e.target.value)}
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
                <option value="">Tất cả phiếu</option>
                <option value="true">⚠️ Chỉ xem phiếu trùng 24h</option>
                <option value="false">Phiếu không trùng lặp</option>
              </select>
            </div>
          </div>

          {/* NÚT XÓA BỘ LỌC KHI ĐANG ÁP DỤNG */}
          {(searchInput || statusFilter || categoryFilter || roomFilter || duplicateFilter) && (
            <div style={{ display: 'flex', justifyContent: 'flex-end', paddingTop: '0.5rem' }}>
              <Button
                variant="ghost"
                size="sm"
                onClick={() => {
                  setSearchInput('');
                  setStatusFilter('');
                  setCategoryFilter('');
                  setRoomFilter('');
                  setDuplicateFilter('');
                }}
              >
                ✕ Xóa bộ lọc
              </Button>
            </div>
          )}
        </div>
      </Card>

      {/* DANH SÁCH BẢNG PHIẾU BÁO HỎNG */}
      <Card>
        <CardHeader>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <CardTitle>
              Danh Sách Sự Cố Kỹ Thuật ({pagination.total} phiếu)
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
            <LoadingSpinner size="lg" text="Đang nạp dữ liệu phiếu báo hỏng..." />
          </div>
        ) : tickets.length === 0 ? (
          <div style={{ padding: '2rem' }}>
            <EmptyState
              title="Không có phiếu sự cố nào"
              description={
                searchInput || statusFilter || categoryFilter || roomFilter || duplicateFilter
                  ? 'Không tìm thấy phiếu sự cố nào phù hợp với bộ lọc hiện tại.'
                  : 'Hiện tại tòa nhà không ghi nhận sự cố kỹ thuật nào cần xử lý.'
              }
              actionLabel={(searchInput || statusFilter || categoryFilter || roomFilter || duplicateFilter) ? "Xóa bộ lọc" : undefined}
              onAction={(searchInput || statusFilter || categoryFilter || roomFilter || duplicateFilter) ? () => { setSearchInput(""); setStatusFilter(""); setCategoryFilter(""); setRoomFilter(""); setDuplicateFilter(""); } : undefined}
            />
          </div>
        ) : (
          <>
            <div style={{ overflowX: 'auto', width: '100%' }}>
              <table style={{ width: '100%', borderCollapse: 'collapse', textAlign: 'left', fontSize: '0.875rem' }}>
                <thead>
                  <tr style={{ backgroundColor: 'var(--bg-muted, #f8fafc)', borderBottom: '1px solid var(--border-color)' }}>
                    <th style={{ padding: '0.75rem 1rem', fontWeight: 600, color: 'var(--text-secondary)', fontSize: '0.75rem', textTransform: 'uppercase' }}>
                      Mã / Hạng mục
                    </th>
                    <th style={{ padding: '0.75rem 1rem', fontWeight: 600, color: 'var(--text-secondary)', fontSize: '0.75rem', textTransform: 'uppercase' }}>
                      Căn hộ / Người báo
                    </th>
                    <th style={{ padding: '0.75rem 1rem', fontWeight: 600, color: 'var(--text-secondary)', fontSize: '0.75rem', textTransform: 'uppercase' }}>
                      Mô tả sự cố
                    </th>
                    <th style={{ padding: '0.75rem 1rem', fontWeight: 600, color: 'var(--text-secondary)', fontSize: '0.75rem', textTransform: 'uppercase' }}>
                      Trạng thái
                    </th>
                    <th style={{ padding: '0.75rem 1rem', fontWeight: 600, color: 'var(--text-secondary)', fontSize: '0.75rem', textTransform: 'uppercase' }}>
                      Thợ phụ trách
                    </th>
                    <th style={{ padding: '0.75rem 1rem', fontWeight: 600, color: 'var(--text-secondary)', fontSize: '0.75rem', textTransform: 'uppercase', textAlign: 'right' }}>
                      Thao tác
                    </th>
                  </tr>
                </thead>
                <tbody>
                  {tickets.map((t) => (
                    <tr
                      key={t.id}
                      style={{
                        borderBottom: '1px solid var(--border-color)',
                        backgroundColor: t.isDuplicate ? 'rgba(254, 243, 199, 0.35)' : 'transparent',
                        transition: 'background-color 0.15s ease',
                      }}
                    >
                      {/* CỘT 1: ID & HẠNG MỤC & CẢNH BÁO TRÙNG */}
                      <td style={{ padding: '0.875rem 1rem', verticalAlign: 'middle' }}>
                        <div style={{ display: 'flex', flexDirection: 'column', gap: '0.25rem' }}>
                          <span style={{ fontWeight: 700, color: 'var(--text-primary)' }}>
                            #{t.id} - {t.category}
                          </span>
                          <span style={{ fontSize: '0.75rem', color: 'var(--text-secondary)' }}>
                            {new Date(t.createdAt).toLocaleString('vi-VN')}
                          </span>
                          {t.isDuplicate && (
                            <div>
                              <Badge variant="warning">
                                ⚠️ Trùng lặp 24h
                              </Badge>
                            </div>
                          )}
                        </div>
                      </td>

                      {/* CỘT 2: CĂN HỘ & NGƯỜI BÁO */}
                      <td style={{ padding: '0.875rem 1rem', verticalAlign: 'middle' }}>
                        <div style={{ display: 'flex', flexDirection: 'column', gap: '0.125rem' }}>
                          <span style={{ fontWeight: 600, color: 'var(--text-primary)' }}>
                            {t.room?.roomNumber ? `Phòng ${t.room.roomNumber}` : 'Khu vực chung'}
                          </span>
                          <span style={{ fontSize: '0.75rem', color: 'var(--text-secondary)' }}>
                            {t.resident?.fullName || `Cư dân #${t.residentId}`}
                          </span>
                          {t.resident?.phone && (
                            <span style={{ fontSize: '0.75rem', color: 'var(--text-secondary)' }}>
                              📞 {t.resident.phone}
                            </span>
                          )}
                        </div>
                      </td>

                      {/* CỘT 3: TIÊU ĐỀ & MÔ TẢ TÓM TẮT */}
                      <td style={{ padding: '0.875rem 1rem', verticalAlign: 'middle', maxWidth: '320px' }}>
                        <div style={{ display: 'flex', flexDirection: 'column', gap: '0.25rem' }}>
                          {t.title && (
                            <span style={{ fontWeight: 600, color: 'var(--text-primary)' }}>
                              {t.title}
                            </span>
                          )}
                          <p
                            style={{
                              margin: 0,
                              fontSize: '0.8125rem',
                              color: 'var(--text-secondary)',
                              overflow: 'hidden',
                              textOverflow: 'ellipsis',
                              display: '-webkit-box',
                              WebkitLineClamp: 2,
                              WebkitBoxOrient: 'vertical',
                            }}
                          >
                            {t.description}
                          </p>
                          {isSafeMediaUrl(t.mediaUrl) && (
                            <span style={{ fontSize: '0.75rem', color: 'var(--primary-color, #2563eb)' }}>
                              📷 Có ảnh đính kèm
                            </span>
                          )}
                        </div>
                      </td>

                      {/* CỘT 4: TRẠNG THÁI */}
                      <td style={{ padding: '0.875rem 1rem', verticalAlign: 'middle' }}>
                        {renderStatusBadge(t.status)}
                      </td>

                      {/* CỘT 5: THỢ PHỤ TRÁCH */}
                      <td style={{ padding: '0.875rem 1rem', verticalAlign: 'middle' }}>
                        {t.technician ? (
                          <div style={{ display: 'flex', flexDirection: 'column', gap: '0.125rem' }}>
                            <span style={{ fontWeight: 600, color: 'var(--text-primary)' }}>
                              🛠️ {t.technician.fullName}
                            </span>
                            {t.technician.phone && (
                              <span style={{ fontSize: '0.75rem', color: 'var(--text-secondary)' }}>
                                {t.technician.phone}
                              </span>
                            )}
                          </div>
                        ) : (
                          <span style={{ fontSize: '0.8125rem', color: 'var(--text-muted, #94a3b8)', fontStyle: 'italic' }}>
                            Chưa phân công
                          </span>
                        )}
                      </td>

                      {/* CỘT 6: THAO TÁC */}
                      <td style={{ padding: '0.875rem 1rem', verticalAlign: 'middle', textAlign: 'right' }}>
                        <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '0.5rem', flexWrap: 'nowrap' }}>
                          <Button
                            variant="secondary"
                            size="sm"
                            onClick={() => handleOpenDetailModal(t)}
                            title="Xem chi tiết phiếu sự cố"
                          >
                            👁️ Chi tiết
                          </Button>
                          {t.status !== 'CLOSED' && (
                            <Button
                              variant="primary"
                              size="sm"
                              onClick={() => handleOpenAssignModal(t)}
                              title={t.technicianId ? 'Điều chuyển thợ kỹ thuật khác' : 'Phân công thợ kỹ thuật'}
                            >
                              {t.technicianId ? '🔄 Đổi thợ' : '🛠️ Gán việc'}
                            </Button>
                          )}
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            {/* PHÂN TRANG */}
            {pagination.totalPages > 1 && (
              <div style={{ padding: '1rem', borderTop: '1px solid var(--border-color)' }}>
                <Pagination
                  currentPage={pagination.page}
                  totalPages={pagination.totalPages}
                  totalRecords={pagination.total}
                  onPageChange={(p) => fetchTickets(p)}
                />
              </div>
            )}
          </>
        )}
      </Card>

      {/* =================================================================== */}
      {/* MODAL 1: PHÂN CÔNG THỢ KỸ THUẬT (TECHNICIAN ASSIGNMENT)             */}
      {/* =================================================================== */}
      {isAssignModalOpen && selectedTicket && (
        <Modal
          isOpen={isAssignModalOpen}
          onClose={() => {
            if (!assignSubmitting) {
              setIsAssignModalOpen(false);
              setSelectedTicket(null);
            }
          }}
          title={`Phân Công Thợ - Phiếu #${selectedTicket.id}`}
        >
          <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
            {assignSuccess && <AlertBanner type="success" message={assignSuccess} />}
            {assignError && <AlertBanner type="error" message={assignError} />}

            {/* TÓM TẮT THÔNG TIN PHIẾU */}
            <div
              style={{
                padding: '0.75rem',
                borderRadius: '0.5rem',
                backgroundColor: 'var(--bg-muted, #f8fafc)',
                border: '1px solid var(--border-color)',
                fontSize: '0.875rem',
              }}
            >
              <div style={{ fontWeight: 600, color: 'var(--text-primary)', marginBottom: '0.25rem' }}>
                Hạng mục: {selectedTicket.category}
              </div>
              <div style={{ color: 'var(--text-secondary)', marginBottom: '0.25rem' }}>
                Căn hộ:{' '}
                {selectedTicket.room?.roomNumber
                  ? `Phòng ${selectedTicket.room.roomNumber}`
                  : 'Khu vực chung'}
              </div>
              <div style={{ color: 'var(--text-secondary)' }}>
                Nội dung: {selectedTicket.description}
              </div>
              {selectedTicket.isDuplicate && (
                <div style={{ marginTop: '0.5rem' }}>
                  <Badge variant="warning">
                    ⚠️ Phiếu được hệ thống ghi nhận trùng lặp trong 24h
                  </Badge>
                </div>
              )}
            </div>

            {/* DROPDOWN CHỌN THỢ KỸ THUẬT */}
            <div>
              <label
                style={{
                  display: 'block',
                  fontSize: '0.875rem',
                  fontWeight: 600,
                  color: 'var(--text-primary)',
                  marginBottom: '0.375rem',
                }}
              >
                Chọn Thợ kỹ thuật tiếp nhận xử lý <span style={{ color: '#ef4444' }}>*</span>
              </label>

              {loadingTechnicians ? (
                <div style={{ padding: '0.75rem 0', display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                  <LoadingSpinner size="sm" />
                  <span style={{ fontSize: '0.875rem', color: 'var(--text-secondary)' }}>
                    Đang nạp danh sách thợ...
                  </span>
                </div>
              ) : (
                <select
                  value={selectedTechnicianId}
                  onChange={(e) => setSelectedTechnicianId(e.target.value)}
                  disabled={assignSubmitting}
                  style={{
                    width: '100%',
                    padding: '0.625rem 0.75rem',
                    fontSize: '0.875rem',
                    borderRadius: '0.375rem',
                    border: '1px solid var(--border-color)',
                    backgroundColor: 'var(--bg-surface)',
                    color: 'var(--text-primary)',
                    boxSizing: 'border-box',
                  }}
                >
                  <option value="">-- Vui lòng chọn thợ kỹ thuật --</option>
                  {technicians.map((tech) => (
                    <option key={tech.id} value={String(tech.id)}>
                      {tech.fullName} ({tech.username}) {tech.phone ? `- ${tech.phone}` : ''}
                    </option>
                  ))}
                </select>
              )}
            </div>

            {/* NÚT THAO TÁC MODAL */}
            <div
              style={{
                display: 'flex',
                justifyContent: 'flex-end',
                gap: '0.75rem',
                paddingTop: '0.75rem',
                borderTop: '1px solid var(--border-color)',
              }}
            >
              <Button
                variant="secondary"
                disabled={assignSubmitting}
                onClick={() => {
                  setIsAssignModalOpen(false);
                  setSelectedTicket(null);
                }}
              >
                Hủy bỏ
              </Button>
              <Button
                variant="primary"
                isLoading={assignSubmitting}
                onClick={handleConfirmAssign}
              >
                Xác nhận phân công
              </Button>
            </div>
          </div>
        </Modal>
      )}

      {/* =================================================================== */}
      {/* MODAL 2: CHI TIẾT PHIẾU SỰ CỐ KỸ THUẬT (TICKET DETAILS VIEW)       */}
      {/* =================================================================== */}
      {isDetailModalOpen && detailTicket && (
        <Modal
          isOpen={isDetailModalOpen}
          onClose={() => {
            setIsDetailModalOpen(false);
            setDetailTicket(null);
          }}
          title={`Chi Tiết Sự Cố #${detailTicket.id} - ${detailTicket.category}`}
        >
          <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem', maxHeight: '75vh', overflowY: 'auto' }}>
            {/* THÔNG TIN CHUNG */}
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0.75rem', fontSize: '0.875rem' }}>
              <div>
                <span style={{ color: 'var(--text-secondary)', display: 'block', fontSize: '0.75rem' }}>
                  Trạng thái hiện tại:
                </span>
                <div style={{ marginTop: '0.25rem' }}>{renderStatusBadge(detailTicket.status)}</div>
              </div>
              <div>
                <span style={{ color: 'var(--text-secondary)', display: 'block', fontSize: '0.75rem' }}>
                  Thời gian gửi:
                </span>
                <span style={{ fontWeight: 600, color: 'var(--text-primary)' }}>
                  {new Date(detailTicket.createdAt).toLocaleString('vi-VN')}
                </span>
              </div>
              <div>
                <span style={{ color: 'var(--text-secondary)', display: 'block', fontSize: '0.75rem' }}>
                  Căn hộ:
                </span>
                <span style={{ fontWeight: 600, color: 'var(--text-primary)' }}>
                  {detailTicket.room?.roomNumber
                    ? `Phòng ${detailTicket.room.roomNumber} (Tầng ${detailTicket.room.floor || 'N/A'})`
                    : 'Khu vực chung'}
                </span>
              </div>
              <div>
                <span style={{ color: 'var(--text-secondary)', display: 'block', fontSize: '0.75rem' }}>
                  Người báo hỏng:
                </span>
                <span style={{ fontWeight: 600, color: 'var(--text-primary)' }}>
                  {detailTicket.resident?.fullName || `Cư dân #${detailTicket.residentId}`}
                </span>
                {detailTicket.resident?.phone && (
                  <span style={{ display: 'block', fontSize: '0.75rem', color: 'var(--text-secondary)' }}>
                    SĐT: {detailTicket.resident.phone}
                  </span>
                )}
              </div>
            </div>

            {/* CẢNH BÁO TRÙNG LẶP NẾU CÓ */}
            {detailTicket.isDuplicate && (
              <AlertBanner
                type="warning"
                message="Hệ thống đã nhận diện được sự cố tương tự cùng căn hộ và hạng mục đã được báo trong vòng 24h qua."
              />
            )}

            {/* MÔ TẢ CHI TIẾT */}
            <div>
              <span style={{ color: 'var(--text-secondary)', display: 'block', fontSize: '0.75rem', marginBottom: '0.25rem' }}>
                Tiêu đề & Nội dung mô tả sự cố:
              </span>
              {detailTicket.title && (
                <div style={{ fontWeight: 700, color: 'var(--text-primary)', marginBottom: '0.25rem' }}>
                  {detailTicket.title}
                </div>
              )}
              <div
                style={{
                  padding: '0.75rem',
                  borderRadius: '0.375rem',
                  backgroundColor: 'var(--bg-muted, #f8fafc)',
                  border: '1px solid var(--border-color)',
                  color: 'var(--text-primary)',
                  fontSize: '0.875rem',
                  whiteSpace: 'pre-wrap',
                }}
              >
                {detailTicket.description}
              </div>
            </div>

            {/* THỢ PHỤ TRÁCH HIỆN TẠI */}
            <div>
              <span style={{ color: 'var(--text-secondary)', display: 'block', fontSize: '0.75rem', marginBottom: '0.25rem' }}>
                Thợ kỹ thuật tiếp nhận:
              </span>
              {detailTicket.technician ? (
                <div
                  style={{
                    padding: '0.625rem 0.75rem',
                    borderRadius: '0.375rem',
                    backgroundColor: 'rgba(59, 130, 246, 0.08)',
                    border: '1px solid rgba(59, 130, 246, 0.25)',
                    display: 'flex',
                    justifyContent: 'space-between',
                    alignItems: 'center',
                  }}
                >
                  <div>
                    <div style={{ fontWeight: 600, color: 'var(--text-primary)' }}>
                      🛠️ {detailTicket.technician.fullName}
                    </div>
                    {detailTicket.technician.phone && (
                      <div style={{ fontSize: '0.75rem', color: 'var(--text-secondary)' }}>
                        SĐT: {detailTicket.technician.phone}
                      </div>
                    )}
                  </div>
                  {detailTicket.status !== 'CLOSED' && (
                    <Button
                      variant="secondary"
                      size="sm"
                      onClick={() => {
                        setIsDetailModalOpen(false);
                        handleOpenAssignModal(detailTicket);
                      }}
                    >
                      Đổi thợ
                    </Button>
                  )}
                </div>
              ) : (
                <div
                  style={{
                    padding: '0.625rem 0.75rem',
                    borderRadius: '0.375rem',
                    backgroundColor: 'var(--bg-muted, #f8fafc)',
                    border: '1px dashed var(--border-color)',
                    display: 'flex',
                    justifyContent: 'space-between',
                    alignItems: 'center',
                  }}
                >
                  <span style={{ fontSize: '0.875rem', color: 'var(--text-secondary)' }}>
                    Chưa phân công thợ kỹ thuật.
                  </span>
                  {detailTicket.status !== 'CLOSED' && (
                    <Button
                      variant="primary"
                      size="sm"
                      onClick={() => {
                        setIsDetailModalOpen(false);
                        handleOpenAssignModal(detailTicket);
                      }}
                    >
                      Phân công ngay
                    </Button>
                  )}
                </div>
              )}
            </div>

            {/* HÌNH ẢNH HIỆN TRƯỜNG ĐÍNH KÈM (AN TOÀN) */}
            {isSafeMediaUrl(detailTicket.mediaUrl) && (
              <div>
                <span style={{ color: 'var(--text-secondary)', display: 'block', fontSize: '0.75rem', marginBottom: '0.375rem' }}>
                  Hình ảnh hiện trường sự cố:
                </span>
                <div
                  style={{
                    borderRadius: '0.5rem',
                    overflow: 'hidden',
                    border: '1px solid var(--border-color)',
                    maxHeight: '280px',
                    backgroundColor: '#000',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                  }}
                >
                  <img
                    src={detailTicket.mediaUrl!}
                    alt="Hiện trường sự cố"
                    style={{ maxWidth: '100%', maxHeight: '280px', objectFit: 'contain' }}
                    onError={(e) => {
                      (e.target as HTMLElement).style.display = 'none';
                    }}
                  />
                </div>
              </div>
            )}

            {/* NÚT ĐÓNG */}
            <div style={{ display: 'flex', justifyContent: 'flex-end', paddingTop: '0.5rem' }}>
              <Button
                variant="secondary"
                onClick={() => {
                  setIsDetailModalOpen(false);
                  setDetailTicket(null);
                }}
              >
                Đóng
              </Button>
            </div>
          </div>
        </Modal>
      )}
    </div>
  );
};

export default TicketDispatchPage;
