// =========================================================================
// TRANG KHÔNG GIAN LÀM VIỆC CỦA THỢ KỸ THUẬT (TECHNICIAN TASKS WORKSPACE)
// Phụ trách: Thành viên Oanh (Senior Full-Stack & UI/UX Integration Engineer)
// Định hướng thiết kế: Civic Clarity + Warm Modern (Dễ tiếp cận, thân thiện mọi lứa tuổi)
// Tuân thủ WCAG 2.2 AA, Touch target >= 44px, Nhãn tiếng Việt rõ ràng, Chống Race Condition
// =========================================================================

import React, { useState, useEffect, useCallback, useMemo, useRef } from 'react';
import axiosClient from '../api/axiosClient';
import { API_ENDPOINTS } from '../api/endpoints';
import { getStoredUser, StoredUser, ApiEnvelope } from '../utils/auth';
import {
  validateTechnicianTransition,
  validateMaterialsInput,
  isSafeMediaUrl,
} from '../utils/technicianTaskValidation';

// -------------------------------------------------------------------------
// KIỂU DỮ LIỆU CHUẨN XÁC THEO BACKEND PRISMA (STRICT TYPESCRIPT)
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
}

export interface TechnicianTicketItem {
  id: number;
  title?: string | null;
  category: string;
  description: string;
  mediaUrl?: string | null;
  completedMediaUrl?: string | null;
  materials?: string | null;
  status: TicketStatusType;
  roomId?: number | null;
  residentId: number;
  technicianId?: number | null;
  rating?: number | null;
  ratingComment?: string | null;
  isDuplicate?: boolean;
  createdAt: string;
  updatedAt: string;
  room?: TicketRoomRelation | null;
  resident?: TicketResidentRelation | null;
  technician?: TicketTechnicianRelation | null;
}

export type StatusFilterType = 'ALL' | 'ASSIGNED' | 'IN_PROGRESS' | 'COMPLETED' | 'CLOSED';

export interface TaskOverviewStats {
  total: number;
  assigned: number;
  inProgress: number;
  completed: number;
  closed: number;
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
}

// -------------------------------------------------------------------------
// DANH MỤC PHÂN LOẠI SỰ CỐ PHỔ BIẾN
// -------------------------------------------------------------------------
const CATEGORY_OPTIONS: { value: string; label: string }[] = [
  { value: '', label: 'Tất cả phân loại sự cố' },
  { value: 'Điện', label: 'Điện & Chiếu sáng' },
  { value: 'Nước', label: 'Nước & Hệ thống cấp thoát nước' },
  { value: 'Thang máy', label: 'Thang máy & Cửa tự động' },
  { value: 'PCCC', label: 'PCCC & Cảnh báo cháy' },
  { value: 'Khóa cửa', label: 'Khóa thông minh & Cửa ra vào' },
  { value: 'Khác', label: 'Sự cố khác' },
];

// -------------------------------------------------------------------------
// COMPONENT CHÍNH: TechnicianTasksPage
// -------------------------------------------------------------------------

export const TechnicianTasksPage: React.FC = () => {
  const isMountedRef = useRef<boolean>(true);
  const fetchSeqRef = useRef<number>(0);
  const statsSeqRef = useRef<number>(0);

  // Thông tin kỹ thuật viên đang đăng nhập
  const currentUser: StoredUser | null = useMemo(() => getStoredUser(), []);

  // Danh sách công việc và phân trang
  const [tickets, setTickets] = useState<TechnicianTicketItem[]>([]);
  const [loading, setLoading] = useState<boolean>(true);
  const [tableError, setTableError] = useState<string>('');

  const [pagination, setPagination] = useState<PaginationMeta>({
    page: 1,
    limit: 8,
    total: 0,
    totalPages: 1,
  });

  // Bộ lọc tìm kiếm và trạng thái
  const [statusFilter, setStatusFilter] = useState<StatusFilterType>('ALL');
  const [categoryFilter, setCategoryFilter] = useState<string>('');
  const [searchInput, setSearchInput] = useState<string>('');
  const [debouncedSearch, setDebouncedSearch] = useState<string>('');

  // Thống kê tổng quan KPI (Civic Clarity)
  const [stats, setStats] = useState<TaskOverviewStats>({
    total: 0,
    assigned: 0,
    inProgress: 0,
    completed: 0,
    closed: 0,
  });
  const [statsLoading, setStatsLoading] = useState<boolean>(false);

  // State các Modal tương tác
  const [acceptingTicket, setAcceptingTicket] = useState<TechnicianTicketItem | null>(null);
  const [acceptSubmitting, setAcceptSubmitting] = useState<boolean>(false);
  const [acceptError, setAcceptError] = useState<string>('');

  const [materialsTicket, setMaterialsTicket] = useState<TechnicianTicketItem | null>(null);
  const [materialsInput, setMaterialsInput] = useState<string>('');
  const [materialsSubmitting, setMaterialsSubmitting] = useState<boolean>(false);
  const [materialsError, setMaterialsError] = useState<string>('');

  const [completingTicket, setCompletingTicket] = useState<TechnicianTicketItem | null>(null);
  const [completingMaterials, setCompletingMaterials] = useState<string>('');
  const [completingMediaUrl, setCompletingMediaUrl] = useState<string>('');
  const [completeSubmitting, setCompleteSubmitting] = useState<boolean>(false);
  const [completeError, setCompleteError] = useState<string>('');

  const [viewingDetailTicket, setViewingDetailTicket] = useState<TechnicianTicketItem | null>(null);
  const [previewMedia, setPreviewMedia] = useState<{ url: string; title: string } | null>(null);

  // Thông báo toast phản hồi toàn cục
  const [toast, setToast] = useState<{ type: 'success' | 'error'; message: string } | null>(null);

  // Dọn dẹp mount ref
  useEffect(() => {
    isMountedRef.current = true;
    return () => {
      isMountedRef.current = false;
    };
  }, []);

  // Tự động tắt Toast sau 5 giây
  useEffect(() => {
    if (!toast) return;
    const timer = setTimeout(() => {
      if (isMountedRef.current) setToast(null);
    }, 5000);
    return () => clearTimeout(timer);
  }, [toast]);

  // Debounce tìm kiếm 350ms
  useEffect(() => {
    const handler = setTimeout(() => {
      setDebouncedSearch(searchInput.trim());
    }, 350);
    return () => clearTimeout(handler);
  }, [searchInput]);

  // Tiện ích trích xuất lỗi an toàn
  const parseErrorMessage = (err: unknown, fallback: string): string => {
    if (typeof err === 'object' && err !== null) {
      const apiErr = err as ApiErrorShape;
      if (typeof apiErr.message === 'string' && apiErr.message.trim()) {
        return apiErr.message;
      }
    }
    return fallback;
  };

  // Định dạng ngày giờ thân thiện cho người dùng Việt Nam
  const formatDateTime = (isoString?: string | null): string => {
    if (!isoString) return 'Chưa xác định';
    try {
      const date = new Date(isoString);
      if (isNaN(date.getTime())) return isoString;
      return new Intl.DateTimeFormat('vi-VN', {
        hour: '2-digit',
        minute: '2-digit',
        day: '2-digit',
        month: '2-digit',
        year: 'numeric',
      }).format(date);
    } catch {
      return isoString;
    }
  };

  // -------------------------------------------------------------------------
  // API: NẠP THỐNG KÊ TỔNG QUAN (KPI COUNTERS)
  // -------------------------------------------------------------------------
  const fetchOverviewStats = useCallback(async () => {
    const seq = ++statsSeqRef.current;
    setStatsLoading(true);

    try {
      // Gọi song song các trạng thái để có con số chính xác
      const [assignedRes, inProgressRes, completedRes, closedRes] = await Promise.all([
        axiosClient.get(`${API_ENDPOINTS.TICKETS.TECHNICIAN_TICKETS}?status=ASSIGNED&limit=1`) as Promise<ApiEnvelope<TechnicianTicketItem[]>>,
        axiosClient.get(`${API_ENDPOINTS.TICKETS.TECHNICIAN_TICKETS}?status=IN_PROGRESS&limit=1`) as Promise<ApiEnvelope<TechnicianTicketItem[]>>,
        axiosClient.get(`${API_ENDPOINTS.TICKETS.TECHNICIAN_TICKETS}?status=COMPLETED&limit=1`) as Promise<ApiEnvelope<TechnicianTicketItem[]>>,
        axiosClient.get(`${API_ENDPOINTS.TICKETS.TECHNICIAN_TICKETS}?status=CLOSED&limit=1`) as Promise<ApiEnvelope<TechnicianTicketItem[]>>,
      ]);

      if (seq === statsSeqRef.current && isMountedRef.current) {
        const assignedCount = assignedRes?.pagination?.total ?? 0;
        const inProgressCount = inProgressRes?.pagination?.total ?? 0;
        const completedCount = completedRes?.pagination?.total ?? 0;
        const closedCount = closedRes?.pagination?.total ?? 0;
        const totalCount = assignedCount + inProgressCount + completedCount + closedCount;

        setStats({
          total: totalCount,
          assigned: assignedCount,
          inProgress: inProgressCount,
          completed: completedCount,
          closed: closedCount,
        });
      }
    } catch {
      // Thống kê phụ, không chặn giao diện chính nếu có lỗi mạng cục bộ
    } finally {
      if (seq === statsSeqRef.current && isMountedRef.current) {
        setStatsLoading(false);
      }
    }
  }, []);

  // -------------------------------------------------------------------------
  // API: NẠP DANH SÁCH CÔNG VIỆC THEO BỘ LỌC VÀ PHÂN TRANG (CHỐNG RACE CONDITION)
  // -------------------------------------------------------------------------
  const fetchTickets = useCallback(
    async (pageToLoad: number = 1) => {
      const seq = ++fetchSeqRef.current;
      setLoading(true);
      setTableError('');

      try {
        const params = new URLSearchParams();
        params.append('page', String(pageToLoad));
        params.append('limit', String(pagination.limit));

        if (statusFilter !== 'ALL') {
          params.append('status', statusFilter);
        }
        if (categoryFilter.trim()) {
          params.append('category', categoryFilter.trim());
        }
        if (debouncedSearch.trim()) {
          params.append('search', debouncedSearch.trim());
        }

        const url = `${API_ENDPOINTS.TICKETS.TECHNICIAN_TICKETS}?${params.toString()}`;
        const res = (await axiosClient.get(url)) as unknown as ApiEnvelope<TechnicianTicketItem[]>;

        if (seq === fetchSeqRef.current && isMountedRef.current) {
          if (res && res.success && Array.isArray(res.data)) {
            setTickets(res.data);
            if (res.pagination) {
              setPagination({
                page: res.pagination.page,
                limit: res.pagination.limit,
                total: res.pagination.total,
                totalPages: Math.max(1, res.pagination.totalPages),
              });
            }
          } else {
            setTickets([]);
            setTableError(res?.message || 'Không thể tải danh sách công việc.');
          }
        }
      } catch (err: unknown) {
        if (seq === fetchSeqRef.current && isMountedRef.current) {
          setTickets([]);
          setTableError(parseErrorMessage(err, 'Lỗi kết nối máy chủ khi lấy danh sách nhiệm vụ.'));
        }
      } finally {
        if (seq === fetchSeqRef.current && isMountedRef.current) {
          setLoading(false);
        }
      }
    },
    [pagination.limit, statusFilter, categoryFilter, debouncedSearch]
  );

  // Kích hoạt nạp dữ liệu khi bộ lọc hoặc trang thay đổi
  useEffect(() => {
    fetchTickets(1);
    fetchOverviewStats();
  }, [fetchTickets, fetchOverviewStats]);

  // -------------------------------------------------------------------------
  // HÀNH ĐỘNG 1: THỢ NHẬN VIỆC (ASSIGNED -> IN_PROGRESS)
  // -------------------------------------------------------------------------
  const confirmAcceptTask = async () => {
    if (!acceptingTicket) return;

    // Kiểm tra tính hợp lệ trước khi gọi API (Client-side Preflight Guard)
    const check = validateTechnicianTransition(acceptingTicket.status, 'IN_PROGRESS');
    if (!check.allowed) {
      setAcceptError(check.reason || 'Bước chuyển trạng thái không hợp lệ.');
      return;
    }

    setAcceptSubmitting(true);
    setAcceptError('');

    try {
      const url = API_ENDPOINTS.TICKETS.UPDATE_STATUS(acceptingTicket.id);
      await axiosClient.put(url, { status: 'IN_PROGRESS' });

      if (!isMountedRef.current) return;
      setToast({
        type: 'success',
        message: `Đã nhận việc thành công! Sự cố #${acceptingTicket.id} chuyển sang trạng thái Đang sửa chữa.`,
      });
      setAcceptingTicket(null);
      fetchTickets(pagination.page);
      fetchOverviewStats();
    } catch (err: unknown) {
      if (!isMountedRef.current) return;
      setAcceptError(parseErrorMessage(err, 'Không thể nhận việc. Vui lòng thử lại sau.'));
    } finally {
      if (isMountedRef.current) {
        setAcceptSubmitting(false);
      }
    }
  };

  // -------------------------------------------------------------------------
  // HÀNH ĐỘNG 2: THỢ KÊ KHAI VẬT TƯ THAY THẾ
  // -------------------------------------------------------------------------
  const openMaterialsModal = (ticket: TechnicianTicketItem) => {
    setMaterialsTicket(ticket);
    setMaterialsInput(ticket.materials || '');
    setMaterialsError('');
  };

  const confirmSaveMaterials = async () => {
    if (!materialsTicket) return;

    // Thẩm định danh mục vật tư
    const valResult = validateMaterialsInput(materialsInput);
    if (!valResult.isValid) {
      setMaterialsError(valResult.error || 'Danh mục vật tư không hợp lệ.');
      return;
    }

    setMaterialsSubmitting(true);
    setMaterialsError('');

    try {
      const url = API_ENDPOINTS.TICKETS.SUBMIT_MATERIALS(materialsTicket.id);
      await axiosClient.post(url, { materials: valResult.sanitized! });

      if (!isMountedRef.current) return;
      setToast({
        type: 'success',
        message: `Đã cập nhật danh mục vật tư thay thế cho phiếu #${materialsTicket.id}.`,
      });
      setMaterialsTicket(null);
      fetchTickets(pagination.page);
    } catch (err: unknown) {
      if (!isMountedRef.current) return;
      setMaterialsError(parseErrorMessage(err, 'Lỗi khi lưu danh mục vật tư thay thế.'));
    } finally {
      if (isMountedRef.current) {
        setMaterialsSubmitting(false);
      }
    }
  };

  // -------------------------------------------------------------------------
  // HÀNH ĐỘNG 3: BÁO HOÀN THÀNH SỬA CHỮA (IN_PROGRESS -> COMPLETED)
  // -------------------------------------------------------------------------
  const openCompleteModal = (ticket: TechnicianTicketItem) => {
    setCompletingTicket(ticket);
    setCompletingMaterials(ticket.materials || '');
    setCompletingMediaUrl(ticket.completedMediaUrl || '');
    setCompleteError('');
  };

  const confirmCompleteTask = async () => {
    if (!completingTicket) return;

    // Thẩm định bước chuyển trạng thái sang COMPLETED
    const check = validateTechnicianTransition(completingTicket.status, 'COMPLETED');
    if (!check.allowed) {
      setCompleteError(check.reason || 'Bước chuyển trạng thái không hợp lệ.');
      return;
    }

    // Thẩm định vật tư nếu có nhập
    if (completingMaterials.trim()) {
      const matResult = validateMaterialsInput(completingMaterials);
      if (!matResult.isValid) {
        setCompleteError(matResult.error || 'Danh mục vật tư không hợp lệ.');
        return;
      }
    }

    // Thẩm định URL ảnh nghiệm thu nếu có nhập
    if (completingMediaUrl.trim() && !isSafeMediaUrl(completingMediaUrl)) {
      setCompleteError('Đường dẫn ảnh nghiệm thu không hợp lệ hoặc chứa mã Base64!');
      return;
    }

    setCompleteSubmitting(true);
    setCompleteError('');

    try {
      // 1. Cập nhật vật tư trước nếu thợ có nhập/chỉnh sửa
      const trimmedMaterials = completingMaterials.trim();
      if (trimmedMaterials && trimmedMaterials !== completingTicket.materials) {
        const matUrl = API_ENDPOINTS.TICKETS.SUBMIT_MATERIALS(completingTicket.id);
        await axiosClient.post(matUrl, { materials: trimmedMaterials });
      }

      // 2. Chuyển trạng thái sang COMPLETED
      const statusUrl = API_ENDPOINTS.TICKETS.UPDATE_STATUS(completingTicket.id);
      const payload: { status: TicketStatusType; completedMediaUrl?: string } = {
        status: 'COMPLETED',
      };
      if (completingMediaUrl.trim()) {
        payload.completedMediaUrl = completingMediaUrl.trim();
      }

      await axiosClient.put(statusUrl, payload);

      if (!isMountedRef.current) return;
      setToast({
        type: 'success',
        message: `Đã báo hoàn thành công việc #${completingTicket.id}! Phiếu đang chờ cư dân nghiệm thu.`,
      });
      setCompletingTicket(null);
      fetchTickets(pagination.page);
      fetchOverviewStats();
    } catch (err: unknown) {
      if (!isMountedRef.current) return;
      setCompleteError(parseErrorMessage(err, 'Không thể chuyển trạng thái hoàn thành. Vui lòng kiểm tra lại.'));
    } finally {
      if (isMountedRef.current) {
        setCompleteSubmitting(false);
      }
    }
  };

  // -------------------------------------------------------------------------
  // TIỆN ÍCH HIỂN THỊ HUY HIỆU TRẠNG THÁI (WCAG 2.2 AA COMPLIANT)
  // -------------------------------------------------------------------------
  const renderStatusBadge = (status: TicketStatusType) => {
    switch (status) {
      case 'ASSIGNED':
        return (
          <span className="badge badge-assigned" title="Đã có thợ phụ trách, chờ nhận việc">
            <span className="badge-dot dot-assigned" />
            Chờ nhận việc
          </span>
        );
      case 'IN_PROGRESS':
        return (
          <span className="badge badge-in-progress" title="Kỹ thuật viên đang trực tiếp sửa chữa">
            <span className="badge-dot dot-in-progress" />
            Đang sửa chữa
          </span>
        );
      case 'COMPLETED':
        return (
          <span className="badge badge-completed" title="Đã sửa xong, chờ cư dân nghiệm thu">
            <span className="badge-dot dot-completed" />
            Chờ nghiệm thu
          </span>
        );
      case 'CLOSED':
        return (
          <span className="badge badge-closed" title="Đã hoàn thành và đóng phiếu">
            <span className="badge-dot dot-closed" />
            Đã đóng
          </span>
        );
      default:
        return (
          <span className="badge badge-pending">
            <span className="badge-dot dot-pending" />
            {status}
          </span>
        );
    }
  };

  // Hiển thị sao đánh giá
  const renderRatingStars = (rating?: number | null) => {
    if (!rating || rating <= 0) return null;
    const stars = Math.min(5, Math.max(1, Math.round(rating)));
    return (
      <div className="rating-container" title={`Đánh giá: ${stars}/5 sao`}>
        <div className="stars-row">
          {[1, 2, 3, 4, 5].map((star) => (
            <span key={star} className={`star-item ${star <= stars ? 'star-filled' : 'star-empty'}`}>
              ★
            </span>
          ))}
        </div>
        <span className="rating-text">({stars}/5 sao)</span>
      </div>
    );
  };

  return (
    <div className="tech-tasks-page">
      {/* SCOPED CSS: CIVIC CLARITY + WARM MODERN */}
      <style>{`
        .tech-tasks-page {
          max-width: 1280px;
          margin: 0 auto;
          padding: 1.5rem 1rem;
          color: #1e293b;
          font-family: Inter, -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif;
          background-color: #faf8f5;
          min-height: 100vh;
          box-sizing: border-box;
        }

        /* 1. HEADER & GREETING BANNER */
        .tech-header-card {
          background: #ffffff;
          border: 1px solid #e2e8f0;
          border-radius: 0.875rem;
          padding: 1.5rem;
          margin-bottom: 1.5rem;
          box-shadow: 0 1px 3px rgba(0, 0, 0, 0.05);
          display: flex;
          flex-direction: column;
          gap: 1rem;
        }
        @media (min-width: 768px) {
          .tech-header-card {
            flex-direction: row;
            justify-content: space-between;
            align-items: center;
          }
        }
        .tech-greeting-title {
          font-size: 1.5rem;
          font-weight: 700;
          color: #0f172a;
          margin: 0 0 0.375rem 0;
          line-height: 1.25;
        }
        .tech-greeting-sub {
          font-size: 0.9375rem;
          color: #64748b;
          margin: 0;
          line-height: 1.4;
        }
        .tech-user-pill {
          display: inline-flex;
          align-items: center;
          gap: 0.5rem;
          padding: 0.5rem 0.875rem;
          background-color: #f1f5f9;
          border: 1px solid #cbd5e1;
          border-radius: 9999px;
          font-size: 0.875rem;
          font-weight: 600;
          color: #334155;
          align-self: flex-start;
        }
        @media (min-width: 768px) {
          .tech-user-pill {
            align-self: center;
          }
        }

        /* 2. OVERVIEW KPI CARDS */
        .tech-kpi-grid {
          display: grid;
          grid-template-columns: repeat(auto-fit, minmax(200px, 1fr));
          gap: 1rem;
          margin-bottom: 1.5rem;
        }
        .kpi-card {
          background: #ffffff;
          border: 1px solid #e2e8f0;
          border-radius: 0.75rem;
          padding: 1.125rem 1.25rem;
          cursor: pointer;
          transition: all 0.2s ease;
          position: relative;
          box-shadow: 0 1px 2px rgba(0, 0, 0, 0.04);
          text-align: left;
        }
        .kpi-card:hover {
          transform: translateY(-2px);
          box-shadow: 0 4px 6px -1px rgba(0, 0, 0, 0.08);
          border-color: #cbd5e1;
        }
        .kpi-card-active {
          border-color: #0284c7;
          background-color: #f0f9ff;
          box-shadow: 0 0 0 2px #38bdf8;
        }
        .kpi-label {
          font-size: 0.875rem;
          font-weight: 600;
          color: #64748b;
          margin: 0 0 0.5rem 0;
          display: flex;
          align-items: center;
          justify-content: space-between;
        }
        .kpi-value {
          font-size: 1.875rem;
          font-weight: 700;
          color: #0f172a;
          margin: 0;
          line-height: 1;
        }
        .kpi-subtext {
          font-size: 0.75rem;
          color: #94a3b8;
          margin-top: 0.375rem;
        }

        /* 3. FILTER & SEARCH SECTION */
        .tech-controls-card {
          background: #ffffff;
          border: 1px solid #e2e8f0;
          border-radius: 0.75rem;
          padding: 1.25rem;
          margin-bottom: 1.5rem;
          box-shadow: 0 1px 3px rgba(0, 0, 0, 0.04);
          display: flex;
          flex-direction: column;
          gap: 1rem;
        }
        .status-pills-row {
          display: flex;
          flex-wrap: wrap;
          gap: 0.5rem;
        }
        .status-pill-btn {
          min-height: 44px;
          padding: 0.5rem 1rem;
          border-radius: 9999px;
          border: 1px solid #cbd5e1;
          background: #ffffff;
          color: #475569;
          font-size: 0.875rem;
          font-weight: 600;
          cursor: pointer;
          transition: all 0.15s ease;
          display: inline-flex;
          align-items: center;
          gap: 0.375rem;
        }
        .status-pill-btn:hover {
          background: #f8fafc;
          border-color: #94a3b8;
        }
        .status-pill-btn-active {
          background: #0f172a;
          color: #ffffff;
          border-color: #0f172a;
        }
        .filter-inputs-row {
          display: grid;
          grid-template-columns: 1fr;
          gap: 0.75rem;
        }
        @media (min-width: 768px) {
          .filter-inputs-row {
            grid-template-columns: 2fr 1fr auto;
          }
        }
        .form-input, .form-select {
          min-height: 44px;
          padding: 0.625rem 0.875rem;
          font-size: 0.9375rem;
          border: 1px solid #cbd5e1;
          border-radius: 0.5rem;
          background-color: #ffffff;
          color: #0f172a;
          box-sizing: border-box;
          width: 100%;
        }
        .form-input:focus, .form-select:focus {
          outline: none;
          border-color: #0284c7;
          box-shadow: 0 0 0 3px rgba(2, 132, 199, 0.15);
        }
        .refresh-btn {
          min-height: 44px;
          padding: 0.625rem 1.25rem;
          background: #f1f5f9;
          border: 1px solid #cbd5e1;
          border-radius: 0.5rem;
          font-size: 0.9375rem;
          font-weight: 600;
          color: #334155;
          cursor: pointer;
          white-space: nowrap;
          display: inline-flex;
          align-items: center;
          justify-content: center;
          gap: 0.5rem;
          transition: all 0.15s ease;
        }
        .refresh-btn:hover {
          background: #e2e8f0;
        }

        /* 4. TASK CARDS GRID */
        .tasks-grid {
          display: grid;
          grid-template-columns: 1fr;
          gap: 1.25rem;
          margin-bottom: 2rem;
        }
        @media (min-width: 900px) {
          .tasks-grid {
            grid-template-columns: repeat(2, 1fr);
          }
        }

        .task-card {
          background: #ffffff;
          border: 1px solid #e2e8f0;
          border-radius: 0.875rem;
          box-shadow: 0 1px 3px rgba(0, 0, 0, 0.05);
          display: flex;
          flex-direction: column;
          overflow: hidden;
          transition: box-shadow 0.2s ease, border-color 0.2s ease;
        }
        .task-card:hover {
          box-shadow: 0 6px 12px -2px rgba(0, 0, 0, 0.08);
          border-color: #cbd5e1;
        }
        .task-card-header {
          padding: 1rem 1.25rem;
          background-color: #f8fafc;
          border-bottom: 1px solid #f1f5f9;
          display: flex;
          justify-content: space-between;
          align-items: center;
          flex-wrap: wrap;
          gap: 0.5rem;
        }
        .task-ticket-id {
          font-size: 0.9375rem;
          font-weight: 700;
          color: #0f172a;
          display: inline-flex;
          align-items: center;
          gap: 0.375rem;
        }
        .task-card-body {
          padding: 1.25rem;
          display: flex;
          flex-direction: column;
          gap: 0.875rem;
          flex-grow: 1;
        }
        .task-location-row {
          display: flex;
          align-items: center;
          gap: 0.5rem;
          font-size: 0.9375rem;
          font-weight: 600;
          color: #0369a1;
          background: #f0f9ff;
          padding: 0.5rem 0.75rem;
          border-radius: 0.375rem;
          border: 1px solid #bae6fd;
        }
        .task-resident-row {
          display: flex;
          align-items: center;
          justify-content: space-between;
          font-size: 0.875rem;
          color: #475569;
          background: #fdfbf7;
          padding: 0.5rem 0.75rem;
          border-radius: 0.375rem;
          border: 1px solid #f1ede4;
        }
        .phone-link {
          color: #0284c7;
          text-decoration: none;
          font-weight: 600;
          display: inline-flex;
          align-items: center;
          gap: 0.25rem;
          padding: 0.25rem 0.5rem;
          background: #ffffff;
          border-radius: 0.25rem;
          border: 1px solid #e0f2fe;
        }
        .phone-link:hover {
          text-decoration: underline;
        }
        .task-title {
          font-size: 1.125rem;
          font-weight: 700;
          color: #0f172a;
          margin: 0;
          line-height: 1.35;
        }
        .task-category-tag {
          display: inline-block;
          font-size: 0.75rem;
          font-weight: 600;
          padding: 0.2rem 0.5rem;
          background-color: #f1f5f9;
          border-radius: 0.25rem;
          color: #475569;
          margin-bottom: 0.375rem;
        }
        .task-desc {
          font-size: 0.9375rem;
          color: #334155;
          line-height: 1.5;
          margin: 0;
          background: #ffffff;
          word-break: break-word;
        }
        .task-materials-box {
          background-color: #fffbeb;
          border: 1px solid #fde68a;
          border-radius: 0.5rem;
          padding: 0.75rem;
          font-size: 0.875rem;
          color: #92400e;
        }
        .task-materials-title {
          font-weight: 700;
          margin-bottom: 0.25rem;
          display: flex;
          align-items: center;
          gap: 0.375rem;
        }
        .task-materials-content {
          margin: 0;
          white-space: pre-wrap;
          line-height: 1.4;
          color: #78350f;
        }
        .task-photos-row {
          display: flex;
          gap: 0.75rem;
          flex-wrap: wrap;
        }
        .photo-thumb-btn {
          background: none;
          border: 1px solid #cbd5e1;
          border-radius: 0.375rem;
          padding: 0;
          cursor: pointer;
          overflow: hidden;
          width: 72px;
          height: 72px;
          position: relative;
        }
        .photo-thumb-img {
          width: 100%;
          height: 100%;
          object-fit: cover;
        }
        .task-rating-box {
          background: #f8fafc;
          border: 1px solid #e2e8f0;
          border-radius: 0.5rem;
          padding: 0.75rem;
        }
        .task-card-footer {
          padding: 1rem 1.25rem;
          background-color: #f8fafc;
          border-top: 1px solid #e2e8f0;
          display: flex;
          flex-direction: column;
          gap: 0.625rem;
        }
        .task-actions-row {
          display: flex;
          flex-wrap: wrap;
          gap: 0.625rem;
        }

        /* 5. BUTTONS (TOUCH TARGET >= 44PX) */
        .btn {
          min-height: 44px;
          padding: 0.625rem 1.125rem;
          border-radius: 0.5rem;
          font-size: 0.9375rem;
          font-weight: 600;
          cursor: pointer;
          display: inline-flex;
          align-items: center;
          justify-content: center;
          gap: 0.5rem;
          transition: all 0.15s ease;
          border: 1px solid transparent;
          box-sizing: border-box;
          text-decoration: none;
          flex: 1;
        }
        .btn-primary {
          background-color: #0f172a;
          color: #ffffff;
        }
        .btn-primary:hover {
          background-color: #1e293b;
        }
        .btn-success {
          background-color: #047857;
          color: #ffffff;
        }
        .btn-success:hover {
          background-color: #065f46;
        }
        .btn-secondary {
          background-color: #ffffff;
          border-color: #cbd5e1;
          color: #334155;
        }
        .btn-secondary:hover {
          background-color: #f8fafc;
          border-color: #94a3b8;
        }
        .btn-warning {
          background-color: #b45309;
          color: #ffffff;
        }
        .btn-warning:hover {
          background-color: #92400e;
        }
        .btn:disabled {
          opacity: 0.6;
          cursor: not-allowed;
        }

        /* 6. STATUS BADGES */
        .badge {
          display: inline-flex;
          align-items: center;
          gap: 0.375rem;
          padding: 0.3125rem 0.625rem;
          border-radius: 9999px;
          font-size: 0.8125rem;
          font-weight: 600;
          line-height: 1;
        }
        .badge-dot {
          width: 8px;
          height: 8px;
          border-radius: 50%;
        }
        .badge-assigned {
          background-color: #fef3c7;
          color: #92400e;
          border: 1px solid #fde68a;
        }
        .dot-assigned { background-color: #d97706; }

        .badge-in-progress {
          background-color: #dbeafe;
          color: #1e40af;
          border: 1px solid #bfdbfe;
        }
        .dot-in-progress { background-color: #2563eb; }

        .badge-completed {
          background-color: #d1fae5;
          color: #065f46;
          border: 1px solid #a7f3d0;
        }
        .dot-completed { background-color: #059669; }

        .badge-closed {
          background-color: #f1f5f9;
          color: #475569;
          border: 1px solid #e2e8f0;
        }
        .dot-closed { background-color: #64748b; }

        .badge-pending {
          background-color: #f3f4f6;
          color: #4b5563;
        }
        .dot-pending { background-color: #9ca3af; }

        /* 7. STAR RATING */
        .rating-container {
          display: flex;
          align-items: center;
          gap: 0.5rem;
        }
        .stars-row {
          display: flex;
          gap: 0.125rem;
        }
        .star-item {
          font-size: 1.125rem;
          line-height: 1;
        }
        .star-filled { color: #f59e0b; }
        .star-empty { color: #cbd5e1; }
        .rating-text {
          font-size: 0.8125rem;
          font-weight: 600;
          color: #475569;
        }

        /* 8. MODALS & POPUPS */
        .modal-overlay {
          position: fixed;
          top: 0;
          left: 0;
          right: 0;
          bottom: 0;
          background-color: rgba(15, 23, 42, 0.65);
          backdrop-filter: blur(2px);
          z-index: 1000;
          display: flex;
          align-items: center;
          justify-content: center;
          padding: 1rem;
          box-sizing: border-box;
        }
        .modal-card {
          background: #ffffff;
          border-radius: 0.875rem;
          border: 1px solid #e2e8f0;
          box-shadow: 0 20px 25px -5px rgba(0, 0, 0, 0.15);
          width: 100%;
          max-width: 540px;
          max-height: 90vh;
          overflow-y: auto;
          display: flex;
          flex-direction: column;
        }
        .modal-header {
          padding: 1.125rem 1.5rem;
          border-bottom: 1px solid #e2e8f0;
          background-color: #f8fafc;
          display: flex;
          justify-content: space-between;
          align-items: center;
        }
        .modal-title {
          font-size: 1.125rem;
          font-weight: 700;
          color: #0f172a;
          margin: 0;
        }
        .modal-close-btn {
          min-height: 40px;
          min-width: 40px;
          background: none;
          border: none;
          font-size: 1.5rem;
          color: #94a3b8;
          cursor: pointer;
          display: flex;
          align-items: center;
          justify-content: center;
          border-radius: 0.375rem;
        }
        .modal-close-btn:hover {
          color: #0f172a;
          background: #f1f5f9;
        }
        .modal-body {
          padding: 1.5rem;
          display: flex;
          flex-direction: column;
          gap: 1.125rem;
        }
        .modal-footer {
          padding: 1rem 1.5rem;
          border-top: 1px solid #f1f5f9;
          background-color: #f8fafc;
          display: flex;
          justify-content: flex-end;
          gap: 0.75rem;
        }

        /* 9. TOAST NOTIFICATION */
        .toast-banner {
          position: fixed;
          bottom: 1.5rem;
          right: 1.5rem;
          z-index: 2000;
          padding: 1rem 1.25rem;
          border-radius: 0.625rem;
          display: flex;
          align-items: center;
          gap: 0.75rem;
          box-shadow: 0 10px 15px -3px rgba(0, 0, 0, 0.1);
          max-width: 450px;
          font-size: 0.9375rem;
          font-weight: 500;
        }
        .toast-success {
          background-color: #065f46;
          color: #ffffff;
          border: 1px solid #047857;
        }
        .toast-error {
          background-color: #991b1b;
          color: #ffffff;
          border: 1px solid #b91c1c;
        }
        .toast-close-btn {
          background: none;
          border: none;
          color: #ffffff;
          font-size: 1.25rem;
          cursor: pointer;
          margin-left: auto;
          line-height: 1;
        }

        /* 10. EMPTY & LOADING STATES */
        .state-empty-box {
          background: #ffffff;
          border: 1px dashed #cbd5e1;
          border-radius: 0.875rem;
          padding: 3rem 1.5rem;
          text-align: center;
          margin: 1.5rem 0;
        }
        .state-empty-title {
          font-size: 1.125rem;
          font-weight: 700;
          color: #334155;
          margin: 0.5rem 0;
        }
        .state-empty-desc {
          font-size: 0.9375rem;
          color: #64748b;
          margin: 0;
        }

        /* 11. PAGINATION ROW */
        .pagination-bar {
          display: flex;
          justify-content: space-between;
          align-items: center;
          background: #ffffff;
          border: 1px solid #e2e8f0;
          border-radius: 0.75rem;
          padding: 0.875rem 1.25rem;
          flex-wrap: wrap;
          gap: 0.75rem;
        }
        .pagination-info {
          font-size: 0.875rem;
          color: #475569;
        }
        .pagination-btns {
          display: flex;
          gap: 0.5rem;
        }
        .pagination-btn {
          min-height: 40px;
          padding: 0.375rem 0.875rem;
          border: 1px solid #cbd5e1;
          border-radius: 0.375rem;
          background: #ffffff;
          font-size: 0.875rem;
          font-weight: 600;
          color: #334155;
          cursor: pointer;
        }
        .pagination-btn:hover:not(:disabled) {
          background: #f1f5f9;
        }
        .pagination-btn:disabled {
          opacity: 0.5;
          cursor: not-allowed;
        }
      `}</style>

      {/* 1. GREETING & HEADER BANNER */}
      <header className="tech-header-card">
        <div>
          <h1 className="tech-greeting-title">Không Gian Làm Việc Kỹ Thuật Viên</h1>
          <p className="tech-greeting-sub">
            Tiếp nhận sự cố kỹ thuật, cập nhật tiến độ sửa chữa tại hiện trường và kê khai vật tư thay thế
          </p>
        </div>
        <div className="tech-user-pill">
          <span>🛠️ Thợ phụ trách:</span>
          <strong>{currentUser?.fullName || currentUser?.username || 'Kỹ thuật viên'}</strong>
        </div>
      </header>

      {/* 2. OVERVIEW KPI CARDS (CIVIC CLARITY QUICK FILTER) */}
      <section className="tech-kpi-grid" aria-label="Thống kê công việc">
        <button
          type="button"
          onClick={() => setStatusFilter('ALL')}
          className={`kpi-card ${statusFilter === 'ALL' ? 'kpi-card-active' : ''}`}
        >
          <div className="kpi-label">
            <span>Tổng số việc được giao</span>
            <span>📋</span>
          </div>
          <div className="kpi-value">{statsLoading ? '...' : stats.total}</div>
          <div className="kpi-subtext">Tất cả sự cố liên kết</div>
        </button>

        <button
          type="button"
          onClick={() => setStatusFilter('ASSIGNED')}
          className={`kpi-card ${statusFilter === 'ASSIGNED' ? 'kpi-card-active' : ''}`}
        >
          <div className="kpi-label">
            <span>Chờ nhận việc</span>
            <span style={{ color: '#d97706' }}>⏳</span>
          </div>
          <div className="kpi-value" style={{ color: '#b45309' }}>
            {statsLoading ? '...' : stats.assigned}
          </div>
          <div className="kpi-subtext">Cần xác nhận bắt đầu sửa</div>
        </button>

        <button
          type="button"
          onClick={() => setStatusFilter('IN_PROGRESS')}
          className={`kpi-card ${statusFilter === 'IN_PROGRESS' ? 'kpi-card-active' : ''}`}
        >
          <div className="kpi-label">
            <span>Đang sửa chữa</span>
            <span style={{ color: '#2563eb' }}>🔧</span>
          </div>
          <div className="kpi-value" style={{ color: '#1d4ed8' }}>
            {statsLoading ? '...' : stats.inProgress}
          </div>
          <div className="kpi-subtext">Đang thi công tại căn hộ</div>
        </button>

        <button
          type="button"
          onClick={() => setStatusFilter('COMPLETED')}
          className={`kpi-card ${statusFilter === 'COMPLETED' ? 'kpi-card-active' : ''}`}
        >
          <div className="kpi-label">
            <span>Chờ nghiệm thu</span>
            <span style={{ color: '#059669' }}>✅</span>
          </div>
          <div className="kpi-value" style={{ color: '#047857' }}>
            {statsLoading ? '...' : stats.completed}
          </div>
          <div className="kpi-subtext">Chờ cư dân đánh giá</div>
        </button>

        <button
          type="button"
          onClick={() => setStatusFilter('CLOSED')}
          className={`kpi-card ${statusFilter === 'CLOSED' ? 'kpi-card-active' : ''}`}
        >
          <div className="kpi-label">
            <span>Đã hoàn tất đóng</span>
            <span style={{ color: '#64748b' }}>🔒</span>
          </div>
          <div className="kpi-value" style={{ color: '#475569' }}>
            {statsLoading ? '...' : stats.closed}
          </div>
          <div className="kpi-subtext">Đã nghiệm thu xong</div>
        </button>
      </section>

      {/* 3. FILTER CONTROLS & SEARCH */}
      <section className="tech-controls-card">
        {/* Hàng nút lọc nhanh theo trạng thái */}
        <div className="status-pills-row" role="tablist" aria-label="Lọc theo trạng thái sự cố">
          <button
            type="button"
            className={`status-pill-btn ${statusFilter === 'ALL' ? 'status-pill-btn-active' : ''}`}
            onClick={() => setStatusFilter('ALL')}
          >
            Tất cả ({stats.total})
          </button>
          <button
            type="button"
            className={`status-pill-btn ${statusFilter === 'ASSIGNED' ? 'status-pill-btn-active' : ''}`}
            onClick={() => setStatusFilter('ASSIGNED')}
          >
            <span className="badge-dot dot-assigned" /> Chờ nhận việc ({stats.assigned})
          </button>
          <button
            type="button"
            className={`status-pill-btn ${statusFilter === 'IN_PROGRESS' ? 'status-pill-btn-active' : ''}`}
            onClick={() => setStatusFilter('IN_PROGRESS')}
          >
            <span className="badge-dot dot-in-progress" /> Đang sửa chữa ({stats.inProgress})
          </button>
          <button
            type="button"
            className={`status-pill-btn ${statusFilter === 'COMPLETED' ? 'status-pill-btn-active' : ''}`}
            onClick={() => setStatusFilter('COMPLETED')}
          >
            <span className="badge-dot dot-completed" /> Chờ nghiệm thu ({stats.completed})
          </button>
          <button
            type="button"
            className={`status-pill-btn ${statusFilter === 'CLOSED' ? 'status-pill-btn-active' : ''}`}
            onClick={() => setStatusFilter('CLOSED')}
          >
            <span className="badge-dot dot-closed" /> Đã đóng ({stats.closed})
          </button>
        </div>

        {/* Hàng ô tìm kiếm & phân loại */}
        <div className="filter-inputs-row">
          <input
            type="text"
            className="form-input"
            placeholder="🔍 Tìm theo số phòng, tiêu đề hoặc nội dung sự cố..."
            value={searchInput}
            onChange={(e) => setSearchInput(e.target.value)}
          />

          <select
            className="form-select"
            value={categoryFilter}
            onChange={(e) => setCategoryFilter(e.target.value)}
            aria-label="Lọc theo phân loại sự cố"
          >
            {CATEGORY_OPTIONS.map((opt) => (
              <option key={opt.value} value={opt.value}>
                {opt.label}
              </option>
            ))}
          </select>

          <button
            type="button"
            className="refresh-btn"
            onClick={() => {
              fetchTickets(pagination.page);
              fetchOverviewStats();
            }}
            title="Làm mới danh sách công việc"
          >
            🔄 Tải lại dữ liệu
          </button>
        </div>
      </section>

      {/* 4. MAIN TASK CARDS LIST */}
      <main>
        {loading ? (
          <div className="state-empty-box">
            <div style={{ fontSize: '2rem' }}>⏳</div>
            <h2 className="state-empty-title">Đang tải danh sách công việc kỹ thuật...</h2>
            <p className="state-empty-desc">Vui lòng chờ trong giây lát.</p>
          </div>
        ) : tableError ? (
          <div className="state-empty-box" style={{ borderColor: '#fca5a5', background: '#fef2f2' }}>
            <div style={{ fontSize: '2rem' }}>⚠️</div>
            <h2 className="state-empty-title" style={{ color: '#991b1b' }}>
              Không thể tải dữ liệu
            </h2>
            <p className="state-empty-desc" style={{ color: '#b91c1c' }}>
              {tableError}
            </p>
            <button
              type="button"
              className="btn btn-secondary"
              style={{ marginTop: '1rem', display: 'inline-flex', maxWidth: '200px' }}
              onClick={() => fetchTickets(pagination.page)}
            >
              Thử lại
            </button>
          </div>
        ) : tickets.length === 0 ? (
          <div className="state-empty-box">
            <div style={{ fontSize: '2.5rem' }}>🎉</div>
            <h2 className="state-empty-title">Không có sự cố nào cần xử lý</h2>
            <p className="state-empty-desc">
              {statusFilter !== 'ALL' || categoryFilter || debouncedSearch
                ? 'Không tìm thấy công việc nào phù hợp với bộ lọc hiện tại. Hãy thử thay đổi bộ lọc.'
                : 'Hiện tại bạn không có nhiệm vụ kỹ thuật nào đang chờ xử lý.'}
            </p>
          </div>
        ) : (
          <div className="tasks-grid">
            {tickets.map((ticket) => {
              const hasMedia = isSafeMediaUrl(ticket.mediaUrl);
              const hasCompletedMedia = isSafeMediaUrl(ticket.completedMediaUrl);

              return (
                <article key={ticket.id} className="task-card">
                  {/* HEADER CARD */}
                  <div className="task-card-header">
                    <div className="task-ticket-id">
                      <span>Phiếu #{ticket.id}</span>
                      {ticket.isDuplicate && (
                        <span
                          style={{
                            fontSize: '0.75rem',
                            padding: '0.125rem 0.375rem',
                            background: '#fee2e2',
                            color: '#991b1b',
                            borderRadius: '0.25rem',
                          }}
                          title="Hệ thống phát hiện có phiếu tương tự trong 24h"
                        >
                          Trùng 24h
                        </span>
                      )}
                    </div>
                    <div>{renderStatusBadge(ticket.status)}</div>
                  </div>

                  {/* BODY CARD */}
                  <div className="task-card-body">
                    {/* Vị trí căn hộ */}
                    <div className="task-location-row">
                      <span>📍</span>
                      <span>
                        {ticket.room ? (
                          <>
                            <strong>Căn hộ: P.{ticket.room.roomNumber}</strong>
                            {ticket.room.floor ? ` (Tầng ${ticket.room.floor})` : ''}
                          </>
                        ) : (
                          <strong>Khu vực chung / Tòa nhà</strong>
                        )}
                      </span>
                    </div>

                    {/* Thông tin cư dân liên hệ */}
                    <div className="task-resident-row">
                      <div>
                        <span>Người báo: </span>
                        <strong>{ticket.resident?.fullName || 'Cư dân'}</strong>
                      </div>
                      {ticket.resident?.phone ? (
                        <a
                          href={`tel:${ticket.resident.phone}`}
                          className="phone-link"
                          title="Bấm để gọi điện cho cư dân"
                        >
                          📞 {ticket.resident.phone}
                        </a>
                      ) : (
                        <span style={{ color: '#94a3b8' }}>Chưa có SĐT</span>
                      )}
                    </div>

                    {/* Tiêu đề & Nội dung sự cố */}
                    <div>
                      <span className="task-category-tag">
                        🏷️ Phân loại: {ticket.category || 'Chưa phân loại'}
                      </span>
                      <h3 className="task-title">
                        {ticket.title || `Báo hỏng: ${ticket.category}`}
                      </h3>
                      <p className="task-desc" style={{ marginTop: '0.375rem' }}>
                        {ticket.description}
                      </p>
                    </div>

                    {/* Ảnh hiện trạng cư dân gửi */}
                    {hasMedia && (
                      <div>
                        <div style={{ fontSize: '0.8125rem', fontWeight: 600, color: '#475569', marginBottom: '0.375rem' }}>
                          📸 Ảnh sự cố cư dân chụp:
                        </div>
                        <div className="task-photos-row">
                          <button
                            type="button"
                            className="photo-thumb-btn"
                            onClick={() =>
                              setPreviewMedia({
                                url: ticket.mediaUrl!,
                                title: `Ảnh hiện trạng sự cố #${ticket.id}`,
                              })
                            }
                            title="Bấm để xem ảnh phóng to"
                          >
                            <img src={ticket.mediaUrl!} alt="Ảnh sự cố" className="photo-thumb-img" />
                          </button>
                        </div>
                      </div>
                    )}

                    {/* Khối hiển thị vật tư thay thế đã kê khai */}
                    {ticket.materials && (
                      <div className="task-materials-box">
                        <div className="task-materials-title">
                          <span>📦</span>
                          <span>Vật tư thay thế đã kê khai:</span>
                        </div>
                        <p className="task-materials-content">{ticket.materials}</p>
                      </div>
                    )}

                    {/* Ảnh chụp hoàn thành nghiệm thu nếu có */}
                    {hasCompletedMedia && (
                      <div>
                        <div style={{ fontSize: '0.8125rem', fontWeight: 600, color: '#047857', marginBottom: '0.375rem' }}>
                          ✅ Ảnh chụp sau khi sửa xong:
                        </div>
                        <div className="task-photos-row">
                          <button
                            type="button"
                            className="photo-thumb-btn"
                            style={{ borderColor: '#a7f3d0' }}
                            onClick={() =>
                              setPreviewMedia({
                                url: ticket.completedMediaUrl!,
                                title: `Ảnh hoàn thành sửa chữa #${ticket.id}`,
                              })
                            }
                            title="Bấm để xem ảnh phóng to"
                          >
                            <img src={ticket.completedMediaUrl!} alt="Ảnh nghiệm thu" className="photo-thumb-img" />
                          </button>
                        </div>
                      </div>
                    )}

                    {/* Đánh giá và phản hồi của cư dân nếu có */}
                    {ticket.rating && (
                      <div className="task-rating-box">
                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '0.25rem' }}>
                          <span style={{ fontSize: '0.8125rem', fontWeight: 600, color: '#475569' }}>
                            Đánh giá từ cư dân:
                          </span>
                          {renderRatingStars(ticket.rating)}
                        </div>
                        {ticket.ratingComment && (
                          <p style={{ margin: 0, fontSize: '0.875rem', color: '#1e293b', fontStyle: 'italic' }}>
                            "{ticket.ratingComment}"
                          </p>
                        )}
                      </div>
                    )}

                    {/* Thời gian tiếp nhận */}
                    <div style={{ fontSize: '0.8125rem', color: '#94a3b8', marginTop: 'auto' }}>
                      Thời gian báo: {formatDateTime(ticket.createdAt)}
                    </div>
                  </div>

                  {/* FOOTER CARD: HÀNH ĐỘNG THAO TÁC CỦA THỢ */}
                  <div className="task-card-footer">
                    <div className="task-actions-row">
                      {/* TRẠNG THÁI 1: ASSIGNED (Chờ nhận việc) */}
                      {ticket.status === 'ASSIGNED' && (
                        <button
                          type="button"
                          className="btn btn-primary"
                          onClick={() => {
                            setAcceptingTicket(ticket);
                            setAcceptError('');
                          }}
                        >
                          ▶ Bắt đầu sửa chữa (Nhận việc)
                        </button>
                      )}

                      {/* TRẠNG THÁI 2: IN_PROGRESS (Đang sửa) */}
                      {ticket.status === 'IN_PROGRESS' && (
                        <>
                          <button
                            type="button"
                            className="btn btn-secondary"
                            onClick={() => openMaterialsModal(ticket)}
                          >
                            📝 Kê khai vật tư
                          </button>

                          <button
                            type="button"
                            className="btn btn-success"
                            onClick={() => openCompleteModal(ticket)}
                          >
                            ✓ Báo hoàn thành việc
                          </button>
                        </>
                      )}

                      {/* TRẠNG THÁI 3: COMPLETED (Chờ nghiệm thu) */}
                      {ticket.status === 'COMPLETED' && (
                        <>
                          <button
                            type="button"
                            className="btn btn-secondary"
                            onClick={() => openMaterialsModal(ticket)}
                          >
                            ✏️ Cập nhật bổ sung vật tư
                          </button>
                          <div
                            style={{
                              width: '100%',
                              fontSize: '0.8125rem',
                              color: '#047857',
                              fontWeight: 600,
                              textAlign: 'center',
                              padding: '0.375rem',
                              backgroundColor: '#ecfdf5',
                              borderRadius: '0.375rem',
                            }}
                          >
                            Đã báo xong việc. Đang chờ cư dân nghiệm thu chất lượng.
                          </div>
                        </>
                      )}

                      {/* TRẠNG THÁI 4: CLOSED (Đã đóng) */}
                      {ticket.status === 'CLOSED' && (
                        <div
                          style={{
                            width: '100%',
                            fontSize: '0.875rem',
                            color: '#475569',
                            fontWeight: 600,
                            textAlign: 'center',
                            padding: '0.5rem',
                            backgroundColor: '#f1f5f9',
                            borderRadius: '0.375rem',
                          }}
                        >
                          🔒 Phiếu đã đóng hoàn tất và lưu trữ hồ sơ.
                        </div>
                      )}
                    </div>

                    {/* Nút xem chi tiết toàn diện */}
                    <button
                      type="button"
                      className="btn btn-secondary"
                      style={{ flex: 'none', width: '100%' }}
                      onClick={() => setViewingDetailTicket(ticket)}
                    >
                      📄 Xem chi tiết phiếu sự cố
                    </button>
                  </div>
                </article>
              );
            })}
          </div>
        )}

        {/* 5. PHÂN TRANG */}
        {tickets.length > 0 && pagination.totalPages > 1 && (
          <nav className="pagination-bar" aria-label="Phân trang công việc">
            <div className="pagination-info">
              Hiển thị trang <strong>{pagination.page}</strong> / <strong>{pagination.totalPages}</strong> (Tổng cộng {pagination.total} công việc)
            </div>
            <div className="pagination-btns">
              <button
                type="button"
                className="pagination-btn"
                disabled={pagination.page <= 1 || loading}
                onClick={() => fetchTickets(pagination.page - 1)}
              >
                ◀ Trang trước
              </button>
              <button
                type="button"
                className="pagination-btn"
                disabled={pagination.page >= pagination.totalPages || loading}
                onClick={() => fetchTickets(pagination.page + 1)}
              >
                Trang sau ▶
              </button>
            </div>
          </nav>
        )}
      </main>

      {/* ========================================================================= */}
      {/* MODAL 1: XÁC NHẬN NHẬN VIỆC (ASSIGNED -> IN_PROGRESS)                     */}
      {/* ========================================================================= */}
      {acceptingTicket && (
        <div className="modal-overlay" role="dialog" aria-modal="true" aria-labelledby="accept-modal-title">
          <div className="modal-card">
            <div className="modal-header">
              <h2 id="accept-modal-title" className="modal-title">
                Xác Nhận Nhận Việc & Bắt Đầu Sửa Chữa
              </h2>
              <button
                type="button"
                className="modal-close-btn"
                onClick={() => setAcceptingTicket(null)}
                aria-label="Đóng cửa sổ"
              >
                ×
              </button>
            </div>
            <div className="modal-body">
              <p style={{ margin: 0, fontSize: '0.9375rem', color: '#334155', lineHeight: 1.5 }}>
                Bạn sắp nhận xử lý sự cố <strong>#{acceptingTicket.id}</strong> tại{' '}
                <strong>
                  {acceptingTicket.room ? `Căn hộ P.${acceptingTicket.room.roomNumber}` : 'Khu vực chung'}
                </strong>.
              </p>
              <div style={{ background: '#f8fafc', padding: '0.875rem', borderRadius: '0.5rem', border: '1px solid #e2e8f0' }}>
                <div style={{ fontSize: '0.875rem', color: '#64748b' }}>Hạng mục: {acceptingTicket.category}</div>
                <div style={{ fontSize: '0.9375rem', fontWeight: 600, color: '#0f172a', marginTop: '0.25rem' }}>
                  {acceptingTicket.title || acceptingTicket.category}
                </div>
                <div style={{ fontSize: '0.875rem', color: '#475569', marginTop: '0.25rem' }}>
                  Mô tả: {acceptingTicket.description}
                </div>
              </div>

              {acceptError && (
                <div style={{ padding: '0.75rem', background: '#fee2e2', color: '#991b1b', borderRadius: '0.375rem', fontSize: '0.875rem' }}>
                  ⚠️ {acceptError}
                </div>
              )}
            </div>
            <div className="modal-footer">
              <button
                type="button"
                className="btn btn-secondary"
                disabled={acceptSubmitting}
                onClick={() => setAcceptingTicket(null)}
              >
                Hủy bỏ
              </button>
              <button
                type="button"
                className="btn btn-primary"
                disabled={acceptSubmitting}
                onClick={confirmAcceptTask}
              >
                {acceptSubmitting ? 'Đang xử lý...' : 'Xác nhận bắt đầu sửa'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ========================================================================= */}
      {/* MODAL 2: KÊ KHAI VẬT TƯ THAY THẾ (POST /materials)                        */}
      {/* ========================================================================= */}
      {materialsTicket && (
        <div className="modal-overlay" role="dialog" aria-modal="true" aria-labelledby="materials-modal-title">
          <div className="modal-card">
            <div className="modal-header">
              <h2 id="materials-modal-title" className="modal-title">
                Kê Khai Vật Tư Thay Thế #{materialsTicket.id}
              </h2>
              <button
                type="button"
                className="modal-close-btn"
                onClick={() => setMaterialsTicket(null)}
                aria-label="Đóng cửa sổ"
              >
                ×
              </button>
            </div>
            <div className="modal-body">
              <p style={{ margin: 0, fontSize: '0.875rem', color: '#64748b' }}>
                Kê khai chính xác danh mục linh kiện, vật tư đã sử dụng để làm căn cứ quyết toán và minh bạch với cư dân.
              </p>

              <div>
                <label style={{ display: 'block', fontSize: '0.875rem', fontWeight: 600, color: '#0f172a', marginBottom: '0.375rem' }}>
                  Danh mục vật tư thay thế:
                </label>
                <textarea
                  className="form-input"
                  style={{ minHeight: '120px', resize: 'vertical', fontFamily: 'inherit' }}
                  placeholder="Ví dụ:&#10;- 01 bóng đèn LED Rạng Đông 18W&#10;- 02 cút nối ống nước phi 21&#10;- 01 cuộn băng tan"
                  value={materialsInput}
                  onChange={(e) => setMaterialsInput(e.target.value)}
                  maxLength={2000}
                />
                <div style={{ fontSize: '0.75rem', color: '#94a3b8', marginTop: '0.25rem', textAlign: 'right' }}>
                  {materialsInput.length} / 2000 ký tự
                </div>
              </div>

              {materialsError && (
                <div style={{ padding: '0.75rem', background: '#fee2e2', color: '#991b1b', borderRadius: '0.375rem', fontSize: '0.875rem' }}>
                  ⚠️ {materialsError}
                </div>
              )}
            </div>
            <div className="modal-footer">
              <button
                type="button"
                className="btn btn-secondary"
                disabled={materialsSubmitting}
                onClick={() => setMaterialsTicket(null)}
              >
                Đóng
              </button>
              <button
                type="button"
                className="btn btn-primary"
                disabled={materialsSubmitting}
                onClick={confirmSaveMaterials}
              >
                {materialsSubmitting ? 'Đang lưu...' : 'Lưu kê khai vật tư'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ========================================================================= */}
      {/* MODAL 3: BÁO HOÀN THÀNH CÔNG VIỆC (IN_PROGRESS -> COMPLETED)              */}
      {/* ========================================================================= */}
      {completingTicket && (
        <div className="modal-overlay" role="dialog" aria-modal="true" aria-labelledby="complete-modal-title">
          <div className="modal-card">
            <div className="modal-header">
              <h2 id="complete-modal-title" className="modal-title">
                Báo Hoàn Thành Công Việc #{completingTicket.id}
              </h2>
              <button
                type="button"
                className="modal-close-btn"
                onClick={() => setCompletingTicket(null)}
                aria-label="Đóng cửa sổ"
              >
                ×
              </button>
            </div>
            <div className="modal-body">
              <p style={{ margin: 0, fontSize: '0.9375rem', color: '#334155', lineHeight: 1.5 }}>
                Bạn xác nhận đã xử lý xong sự cố tại{' '}
                <strong>
                  {completingTicket.room ? `Căn hộ P.${completingTicket.room.roomNumber}` : 'Khu vực chung'}
                </strong>. Phiếu sẽ được chuyển sang trạng thái <strong>Chờ nghiệm thu</strong>.
              </p>

              <div>
                <label style={{ display: 'block', fontSize: '0.875rem', fontWeight: 600, color: '#0f172a', marginBottom: '0.375rem' }}>
                  Rà soát danh mục vật tư thay thế (nếu có):
                </label>
                <textarea
                  className="form-input"
                  style={{ minHeight: '90px', resize: 'vertical', fontFamily: 'inherit' }}
                  placeholder="Ghi rõ danh mục linh kiện đã dùng (nếu chưa kê khai trước đó)..."
                  value={completingMaterials}
                  onChange={(e) => setCompletingMaterials(e.target.value)}
                  maxLength={2000}
                />
              </div>

              <div>
                <label style={{ display: 'block', fontSize: '0.875rem', fontWeight: 600, color: '#0f172a', marginBottom: '0.375rem' }}>
                  Đường dẫn ảnh nghiệm thu kết quả (tùy chọn):
                </label>
                <input
                  type="text"
                  className="form-input"
                  placeholder="https://... (Ảnh chụp thiết bị sau khi sửa xong)"
                  value={completingMediaUrl}
                  onChange={(e) => setCompletingMediaUrl(e.target.value)}
                />
                <span style={{ fontSize: '0.75rem', color: '#64748b' }}>
                  Chỉ chấp nhận liên kết dạng http:// hoặc https://. Không dùng mã Base64.
                </span>
              </div>

              {completeError && (
                <div style={{ padding: '0.75rem', background: '#fee2e2', color: '#991b1b', borderRadius: '0.375rem', fontSize: '0.875rem' }}>
                  ⚠️ {completeError}
                </div>
              )}
            </div>
            <div className="modal-footer">
              <button
                type="button"
                className="btn btn-secondary"
                disabled={completeSubmitting}
                onClick={() => setCompletingTicket(null)}
              >
                Hủy bỏ
              </button>
              <button
                type="button"
                className="btn btn-success"
                disabled={completeSubmitting}
                onClick={confirmCompleteTask}
              >
                {completeSubmitting ? 'Đang cập nhật...' : 'Xác nhận hoàn thành'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ========================================================================= */}
      {/* MODAL 4: XEM CHI TIẾT ĐẦY ĐỦ CỦA PHIẾU SỰ CỐ                              */}
      {/* ========================================================================= */}
      {viewingDetailTicket && (
        <div className="modal-overlay" role="dialog" aria-modal="true" aria-labelledby="detail-modal-title">
          <div className="modal-card" style={{ maxWidth: '640px' }}>
            <div className="modal-header">
              <h2 id="detail-modal-title" className="modal-title">
                Hồ Sơ Sự Cố Kỹ Thuật #{viewingDetailTicket.id}
              </h2>
              <button
                type="button"
                className="modal-close-btn"
                onClick={() => setViewingDetailTicket(null)}
                aria-label="Đóng cửa sổ"
              >
                ×
              </button>
            </div>
            <div className="modal-body">
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <span className="task-category-tag">Phân loại: {viewingDetailTicket.category}</span>
                {renderStatusBadge(viewingDetailTicket.status)}
              </div>

              <div>
                <h3 style={{ margin: '0 0 0.5rem 0', fontSize: '1.25rem', color: '#0f172a' }}>
                  {viewingDetailTicket.title || viewingDetailTicket.category}
                </h3>
                <p style={{ margin: 0, fontSize: '0.9375rem', color: '#334155', lineHeight: 1.5 }}>
                  {viewingDetailTicket.description}
                </p>
              </div>

              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0.75rem', background: '#f8fafc', padding: '1rem', borderRadius: '0.5rem', border: '1px solid #e2e8f0' }}>
                <div>
                  <div style={{ fontSize: '0.75rem', color: '#64748b' }}>Vị trí / Căn hộ</div>
                  <div style={{ fontSize: '0.9375rem', fontWeight: 600, color: '#0f172a' }}>
                    {viewingDetailTicket.room ? `P.${viewingDetailTicket.room.roomNumber} (Tầng ${viewingDetailTicket.room.floor || '?'})` : 'Khu vực chung'}
                  </div>
                </div>
                <div>
                  <div style={{ fontSize: '0.75rem', color: '#64748b' }}>Người gửi báo hỏng</div>
                  <div style={{ fontSize: '0.9375rem', fontWeight: 600, color: '#0f172a' }}>
                    {viewingDetailTicket.resident?.fullName || 'Cư dân'}
                  </div>
                  {viewingDetailTicket.resident?.phone && (
                    <a href={`tel:${viewingDetailTicket.resident.phone}`} style={{ fontSize: '0.8125rem', color: '#0284c7' }}>
                      📞 {viewingDetailTicket.resident.phone}
                    </a>
                  )}
                </div>
                <div>
                  <div style={{ fontSize: '0.75rem', color: '#64748b' }}>Thời gian tạo</div>
                  <div style={{ fontSize: '0.875rem', color: '#334155' }}>
                    {formatDateTime(viewingDetailTicket.createdAt)}
                  </div>
                </div>
                <div>
                  <div style={{ fontSize: '0.75rem', color: '#64748b' }}>Cập nhật lần cuối</div>
                  <div style={{ fontSize: '0.875rem', color: '#334155' }}>
                    {formatDateTime(viewingDetailTicket.updatedAt)}
                  </div>
                </div>
              </div>

              {viewingDetailTicket.materials && (
                <div className="task-materials-box">
                  <div className="task-materials-title">
                    <span>📦</span>
                    <span>Danh mục vật tư thay thế:</span>
                  </div>
                  <p className="task-materials-content">{viewingDetailTicket.materials}</p>
                </div>
              )}

              {viewingDetailTicket.rating && (
                <div className="task-rating-box">
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '0.25rem' }}>
                    <span style={{ fontSize: '0.875rem', fontWeight: 600, color: '#0f172a' }}>
                      Đánh giá nghiệm thu:
                    </span>
                    {renderRatingStars(viewingDetailTicket.rating)}
                  </div>
                  {viewingDetailTicket.ratingComment && (
                    <p style={{ margin: 0, fontSize: '0.875rem', color: '#334155' }}>
                      "{viewingDetailTicket.ratingComment}"
                    </p>
                  )}
                </div>
              )}
            </div>
            <div className="modal-footer">
              <button
                type="button"
                className="btn btn-secondary"
                onClick={() => setViewingDetailTicket(null)}
              >
                Đóng
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ========================================================================= */}
      {/* MODAL 5: XEM PHÓNG TO ẢNH (SAFE MEDIA VIEWER)                             */}
      {/* ========================================================================= */}
      {previewMedia && (
        <div className="modal-overlay" role="dialog" aria-modal="true" aria-labelledby="preview-modal-title">
          <div className="modal-card" style={{ maxWidth: '700px' }}>
            <div className="modal-header">
              <h2 id="preview-modal-title" className="modal-title">
                {previewMedia.title}
              </h2>
              <button
                type="button"
                className="modal-close-btn"
                onClick={() => setPreviewMedia(null)}
                aria-label="Đóng cửa sổ"
              >
                ×
              </button>
            </div>
            <div className="modal-body" style={{ alignItems: 'center' }}>
              <img
                src={previewMedia.url}
                alt={previewMedia.title}
                style={{
                  maxWidth: '100%',
                  maxHeight: '70vh',
                  objectFit: 'contain',
                  borderRadius: '0.5rem',
                  border: '1px solid #e2e8f0',
                }}
              />
            </div>
            <div className="modal-footer">
              <a
                href={previewMedia.url}
                target="_blank"
                rel="noopener noreferrer"
                className="btn btn-secondary"
              >
                Mở trong tab mới ↗
              </a>
              <button
                type="button"
                className="btn btn-primary"
                onClick={() => setPreviewMedia(null)}
              >
                Đóng
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ========================================================================= */}
      {/* TOAST BANNER THÔNG BÁO PHẢN HỒI                                           */}
      {/* ========================================================================= */}
      {toast && (
        <aside
          className={`toast-banner ${toast.type === 'success' ? 'toast-success' : 'toast-error'}`}
          role="status"
          aria-live="polite"
        >
          <span>{toast.type === 'success' ? '✓' : '⚠️'}</span>
          <span>{toast.message}</span>
          <button
            type="button"
            className="toast-close-btn"
            onClick={() => setToast(null)}
            aria-label="Tắt thông báo"
          >
            ×
          </button>
        </aside>
      )}
    </div>
  );
};

export default TechnicianTasksPage;
