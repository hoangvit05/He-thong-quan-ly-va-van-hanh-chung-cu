// =========================================================================
// TRANG QUẢN LÝ & PHÁT THÔNG BÁO TÒA NHÀ (ANNOUNCEMENTS PAGE)
// Phụ trách: Thành viên Oanh (Senior Full-Stack & UI/UX Integration Engineer)
// Định hướng thiết kế: Civic Clarity + Warm Modern (Dễ tiếp cận, thân thiện mọi lứa tuổi)
// Tuân thủ WCAG 2.2 AA, Touch target >= 44px, Nhãn tiếng Việt rõ ràng, Chống Race Condition
// =========================================================================

import React, { useState, useEffect, useCallback, useMemo, useRef } from 'react';
import axiosClient from '../api/axiosClient';
import { API_ENDPOINTS } from '../api/endpoints';
import { getStoredUser, StoredUser, ApiEnvelope } from '../utils/auth';
import {
  validateAnnouncementPayload,
  AnnouncementStatsSummary,
} from '../utils/announcementsFeedbackValidation';

// -------------------------------------------------------------------------
// KIỂU DỮ LIỆU ĐỐI TƯỢNG THÔNG BÁO (STRICT TYPESCRIPT)
// -------------------------------------------------------------------------

export interface NotificationAuthor {
  id: number;
  fullName?: string | null;
  role?: string;
  username?: string;
}

export interface NotificationItem {
  id: number;
  title: string;
  content: string;
  targetRoom?: string | null;
  authorId?: number | null;
  author?: NotificationAuthor | null;
  createdAt: string;
}

export interface RoomOption {
  id: number;
  roomNumber: string;
  floor?: number;
}

export type ScopeFilterType = 'ALL' | 'GENERAL' | 'TARGETED';

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
// COMPONENT CHÍNH: AnnouncementsPage
// -------------------------------------------------------------------------

export const AnnouncementsPage: React.FC = () => {
  const isMountedRef = useRef<boolean>(true);
  const fetchSeqRef = useRef<number>(0);
  const statsSeqRef = useRef<number>(0);

  // Người dùng đăng nhập (Ban Quản Lý / Admin)
  const currentUser: StoredUser | null = useMemo(() => getStoredUser(), []);

  // Danh sách thông báo & phân trang
  const [announcements, setAnnouncements] = useState<NotificationItem[]>([]);
  const [loading, setLoading] = useState<boolean>(true);
  const [errorMsg, setErrorMsg] = useState<string>('');

  const [pagination, setPagination] = useState<PaginationMeta>({
    page: 1,
    limit: 6,
    total: 0,
    totalPages: 1,
  });

  // Bộ lọc phạm vi & tìm kiếm
  const [scopeFilter, setScopeFilter] = useState<ScopeFilterType>('ALL');
  const [searchInput, setSearchInput] = useState<string>('');
  const [debouncedSearch, setDebouncedSearch] = useState<string>('');

  // Chỉ số thống kê KPI
  const [stats, setStats] = useState<AnnouncementStatsSummary>({
    total: 0,
    allBuilding: 0,
    targetedRoom: 0,
  });
  const [statsLoading, setStatsLoading] = useState<boolean>(false);

  // Danh mục phòng nạp cho dropdown tạo thông báo
  const [availableRooms, setAvailableRooms] = useState<RoomOption[]>([]);

  // State Modal: Soạn thông báo mới
  const [isCreateModalOpen, setIsCreateModalOpen] = useState<boolean>(false);
  const [createTitle, setCreateTitle] = useState<string>('');
  const [createContent, setCreateContent] = useState<string>('');
  const [createScope, setCreateScope] = useState<'ALL' | 'ROOM'>('ALL');
  const [createTargetRoom, setCreateTargetRoom] = useState<string>('');
  const [createSubmitting, setCreateSubmitting] = useState<boolean>(false);
  const [createError, setCreateError] = useState<string>('');

  // State Modal: Xem chi tiết thông báo
  const [viewingItem, setViewingItem] = useState<NotificationItem | null>(null);

  // Toast phản hồi toàn cục
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
  // NẠP DANH SÁCH PHÒNG PHỤC VỤ CHỌN CĂN HỘ NHẬN THÔNG BÁO
  // -------------------------------------------------------------------------
  const fetchAvailableRooms = useCallback(async () => {
    try {
      const res = (await axiosClient.get(
        `${API_ENDPOINTS.ROOMS.LIST}?page=1&limit=100`
      )) as unknown as ApiEnvelope<RoomOption[]>;
      if (isMountedRef.current && res && Array.isArray(res.data)) {
        setAvailableRooms(res.data);
      }
    } catch {
      // Giữ danh sách rỗng nếu có lỗi cục bộ
    }
  }, []);

  useEffect(() => {
    fetchAvailableRooms();
  }, [fetchAvailableRooms]);

  // -------------------------------------------------------------------------
  // NẠP THỐNG KÊ TỔNG QUAN (KPI)
  // -------------------------------------------------------------------------
  const fetchOverviewStats = useCallback(async () => {
    const seq = ++statsSeqRef.current;
    setStatsLoading(true);

    try {
      // Nạp danh sách rộng (limit=100) để tính toán phân bổ chính xác
      const res = (await axiosClient.get(
        `${API_ENDPOINTS.NOTIFICATIONS.LIST}?page=1&limit=100`
      )) as unknown as ApiEnvelope<NotificationItem[]>;

      if (seq === statsSeqRef.current && isMountedRef.current) {
        if (res && Array.isArray(res.data)) {
          let general = 0;
          let targeted = 0;
          for (const item of res.data) {
            if (item.targetRoom && item.targetRoom.trim()) {
              targeted++;
            } else {
              general++;
            }
          }
          const totalFromPagination = res.pagination?.total ?? res.data.length;
          setStats({
            total: totalFromPagination,
            allBuilding: general,
            targetedRoom: targeted,
          });
        }
      }
    } catch {
      // Không chặn giao diện chính nếu lỗi thống kê
    } finally {
      if (seq === statsSeqRef.current && isMountedRef.current) {
        setStatsLoading(false);
      }
    }
  }, []);

  // -------------------------------------------------------------------------
  // NẠP DANH SÁCH THÔNG BÁO CÓ PHÂN TRANG VÀ BỘ LỌC
  // -------------------------------------------------------------------------
  const fetchAnnouncements = useCallback(
    async (pageToLoad: number = 1) => {
      const seq = ++fetchSeqRef.current;
      setLoading(true);
      setErrorMsg('');

      try {
        const params = new URLSearchParams();
        params.append('page', String(pageToLoad));
        params.append('limit', String(pagination.limit));

        if (scopeFilter === 'GENERAL') {
          // Backend NotificationService lọc targetRoom = null khi không truyền targetRoom
        } else if (scopeFilter === 'TARGETED' && debouncedSearch) {
          params.append('targetRoom', debouncedSearch.trim());
        }

        const url = `${API_ENDPOINTS.NOTIFICATIONS.LIST}?${params.toString()}`;
        const res = (await axiosClient.get(url)) as unknown as ApiEnvelope<NotificationItem[]>;

        if (seq === fetchSeqRef.current && isMountedRef.current) {
          if (res && res.success && Array.isArray(res.data)) {
            let list = res.data;

            // Lọc cục bộ theo phạm vi đã chọn
            if (scopeFilter === 'GENERAL') {
              list = list.filter((item) => !item.targetRoom || !item.targetRoom.trim());
            } else if (scopeFilter === 'TARGETED') {
              list = list.filter((item) => item.targetRoom && item.targetRoom.trim());
            }

            // Lọc từ khóa tìm kiếm (tiêu đề, nội dung hoặc phòng)
            if (debouncedSearch.trim()) {
              const q = debouncedSearch.trim().toLowerCase();
              list = list.filter(
                (item) =>
                  item.title.toLowerCase().includes(q) ||
                  item.content.toLowerCase().includes(q) ||
                  (item.targetRoom && item.targetRoom.toLowerCase().includes(q))
              );
            }

            setAnnouncements(list);
            if (res.pagination) {
              setPagination({
                page: res.pagination.page,
                limit: res.pagination.limit,
                total: res.pagination.total,
                totalPages: Math.max(1, res.pagination.totalPages),
              });
            }
          } else {
            setAnnouncements([]);
            setErrorMsg(res?.message || 'Không thể tải danh sách thông báo.');
          }
        }
      } catch (err: unknown) {
        if (seq === fetchSeqRef.current && isMountedRef.current) {
          setAnnouncements([]);
          setErrorMsg(parseErrorMessage(err, 'Lỗi kết nối máy chủ khi nạp thông báo tòa nhà.'));
        }
      } finally {
        if (seq === fetchSeqRef.current && isMountedRef.current) {
          setLoading(false);
        }
      }
    },
    [pagination.limit, scopeFilter, debouncedSearch]
  );

  useEffect(() => {
    fetchAnnouncements(1);
    fetchOverviewStats();
  }, [fetchAnnouncements, fetchOverviewStats]);

  // -------------------------------------------------------------------------
  // HÀNH ĐỘNG: SOẠN & PHÁT THÔNG BÁO MỚI (POST /api/notifications)
  // -------------------------------------------------------------------------
  const openCreateModal = () => {
    setCreateTitle('');
    setCreateContent('');
    setCreateScope('ALL');
    setCreateTargetRoom('');
    setCreateError('');
    setIsCreateModalOpen(true);
  };

  const handleCreateAnnouncement = async (e: React.FormEvent) => {
    e.preventDefault();
    setCreateError('');

    const targetRoomVal = createScope === 'ROOM' ? createTargetRoom.trim() : null;

    if (createScope === 'ROOM' && !targetRoomVal) {
      setCreateError('Vui lòng chọn hoặc nhập số căn hộ nhận thông báo.');
      return;
    }

    // Kiểm định tiền kiểm dữ liệu
    const validation = validateAnnouncementPayload({
      title: createTitle,
      content: createContent,
      targetRoom: targetRoomVal,
    });

    if (!validation.isValid || !validation.data) {
      setCreateError(validation.error || 'Dữ liệu thông báo không hợp lệ.');
      return;
    }

    setCreateSubmitting(true);

    try {
      await axiosClient.post(API_ENDPOINTS.NOTIFICATIONS.CREATE, validation.data);

      if (!isMountedRef.current) return;
      setToast({
        type: 'success',
        message: targetRoomVal
          ? `Đã phát hành thành công thông báo tới căn hộ [${targetRoomVal}].`
          : 'Đã phát hành thành công thông báo chung tới toàn bộ cư dân tòa nhà!',
      });
      setIsCreateModalOpen(false);
      fetchAnnouncements(1);
      fetchOverviewStats();
    } catch (err: unknown) {
      if (!isMountedRef.current) return;
      setCreateError(parseErrorMessage(err, 'Lỗi máy chủ khi phát thông báo.'));
    } finally {
      if (isMountedRef.current) {
        setCreateSubmitting(false);
      }
    }
  };

  return (
    <div className="announcements-page">
      {/* SCOPED STYLING: CIVIC CLARITY + WARM MODERN */}
      <style>{`
        .announcements-page {
          max-width: 1280px;
          margin: 0 auto;
          padding: 1.5rem 1rem;
          color: #1e293b;
          font-family: Inter, -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif;
          background-color: #faf8f5;
          min-height: 100vh;
          box-sizing: border-box;
        }

        /* 1. HEADER */
        .ann-header-card {
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
          .ann-header-card {
            flex-direction: row;
            justify-content: space-between;
            align-items: center;
          }
        }
        .ann-title {
          font-size: 1.5rem;
          font-weight: 700;
          color: #0f172a;
          margin: 0 0 0.375rem 0;
          line-height: 1.25;
        }
        .ann-sub {
          font-size: 0.9375rem;
          color: #64748b;
          margin: 0;
          line-height: 1.4;
        }

        /* 2. KPI METRICS */
        .ann-kpi-grid {
          display: grid;
          grid-template-columns: repeat(auto-fit, minmax(220px, 1fr));
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

        /* 3. CONTROLS */
        .ann-controls-card {
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
        .filter-pills-row {
          display: flex;
          flex-wrap: wrap;
          gap: 0.5rem;
        }
        .filter-pill-btn {
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
        .filter-pill-btn:hover {
          background: #f8fafc;
          border-color: #94a3b8;
        }
        .filter-pill-btn-active {
          background: #0f172a;
          color: #ffffff;
          border-color: #0f172a;
        }
        .search-row {
          display: grid;
          grid-template-columns: 1fr;
          gap: 0.75rem;
        }
        @media (min-width: 768px) {
          .search-row {
            grid-template-columns: 3fr auto;
          }
        }
        .form-input, .form-select, .form-textarea {
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
        .form-input:focus, .form-select:focus, .form-textarea:focus {
          outline: none;
          border-color: #0284c7;
          box-shadow: 0 0 0 3px rgba(2, 132, 199, 0.15);
        }

        /* 4. ANNOUNCEMENT CARDS */
        .ann-grid {
          display: grid;
          grid-template-columns: 1fr;
          gap: 1.25rem;
          margin-bottom: 2rem;
        }
        @media (min-width: 900px) {
          .ann-grid {
            grid-template-columns: repeat(2, 1fr);
          }
        }
        .ann-card {
          background: #ffffff;
          border: 1px solid #e2e8f0;
          border-radius: 0.875rem;
          box-shadow: 0 1px 3px rgba(0, 0, 0, 0.05);
          display: flex;
          flex-direction: column;
          overflow: hidden;
          transition: box-shadow 0.2s ease, border-color 0.2s ease;
        }
        .ann-card:hover {
          box-shadow: 0 6px 12px -2px rgba(0, 0, 0, 0.08);
          border-color: #cbd5e1;
        }
        .ann-card-header {
          padding: 1rem 1.25rem;
          background-color: #f8fafc;
          border-bottom: 1px solid #f1f5f9;
          display: flex;
          justify-content: space-between;
          align-items: center;
          flex-wrap: wrap;
          gap: 0.5rem;
        }
        .ann-card-body {
          padding: 1.25rem;
          display: flex;
          flex-direction: column;
          gap: 0.875rem;
          flex-grow: 1;
        }
        .ann-card-title {
          font-size: 1.125rem;
          font-weight: 700;
          color: #0f172a;
          margin: 0;
          line-height: 1.35;
        }
        .ann-card-content {
          font-size: 0.9375rem;
          color: #334155;
          line-height: 1.5;
          margin: 0;
          white-space: pre-wrap;
          word-break: break-word;
          max-height: 120px;
          overflow: hidden;
          position: relative;
        }
        .ann-card-footer {
          padding: 1rem 1.25rem;
          background-color: #f8fafc;
          border-top: 1px solid #e2e8f0;
          display: flex;
          justify-content: space-between;
          align-items: center;
          flex-wrap: wrap;
          gap: 0.75rem;
        }

        /* 5. BADGES & BUTTONS */
        .scope-badge {
          display: inline-flex;
          align-items: center;
          gap: 0.375rem;
          padding: 0.3125rem 0.625rem;
          border-radius: 9999px;
          font-size: 0.8125rem;
          font-weight: 600;
        }
        .badge-general {
          background-color: #e0f2fe;
          color: #0369a1;
          border: 1px solid #bae6fd;
        }
        .badge-room {
          background-color: #f3e8ff;
          color: #6b21a8;
          border: 1px solid #e9d5ff;
        }

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
        }
        .btn-primary {
          background-color: #0f172a;
          color: #ffffff;
        }
        .btn-primary:hover {
          background-color: #1e293b;
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
        .btn:disabled {
          opacity: 0.6;
          cursor: not-allowed;
        }

        /* 6. MODALS */
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
          max-width: 600px;
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

        /* 7. TOAST NOTIFICATION */
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

        /* 8. EMPTY & LOADING */
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

        /* 9. PAGINATION */
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

      {/* 1. HEADER */}
      <header className="ann-header-card">
        <div>
          <h1 className="ann-title">Quản Lý & Phát Thông Báo Tòa Nhà</h1>
          <p className="ann-sub">
            Soạn và gửi thông báo chính thức của Ban Quản Lý tới toàn thể cư dân hoặc từng căn hộ
          </p>
        </div>
        <div>
          <button
            type="button"
            className="btn btn-primary"
            onClick={openCreateModal}
            title="Soạn thảo thông báo mới"
          >
            ➕ Soạn thông báo mới
          </button>
        </div>
      </header>

      {/* 2. KPI METRICS CARDS */}
      <section className="ann-kpi-grid" aria-label="Thống kê thông báo">
        <button
          type="button"
          onClick={() => setScopeFilter('ALL')}
          className={`kpi-card ${scopeFilter === 'ALL' ? 'kpi-card-active' : ''}`}
        >
          <div className="kpi-label">
            <span>Tổng số thông báo</span>
            <span>📢</span>
          </div>
          <div className="kpi-value">{statsLoading ? '...' : stats.total}</div>
          <div className="kpi-subtext">Đã phát hành trên hệ thống</div>
        </button>

        <button
          type="button"
          onClick={() => setScopeFilter('GENERAL')}
          className={`kpi-card ${scopeFilter === 'GENERAL' ? 'kpi-card-active' : ''}`}
        >
          <div className="kpi-label">
            <span>Thông báo toàn tòa nhà</span>
            <span style={{ color: '#0284c7' }}>🏢</span>
          </div>
          <div className="kpi-value" style={{ color: '#0369a1' }}>
            {statsLoading ? '...' : stats.allBuilding}
          </div>
          <div className="kpi-subtext">Gửi chung cho toàn cư dân</div>
        </button>

        <button
          type="button"
          onClick={() => setScopeFilter('TARGETED')}
          className={`kpi-card ${scopeFilter === 'TARGETED' ? 'kpi-card-active' : ''}`}
        >
          <div className="kpi-label">
            <span>Thông báo riêng căn hộ</span>
            <span style={{ color: '#7c3aed' }}>🏠</span>
          </div>
          <div className="kpi-value" style={{ color: '#6b21a8' }}>
            {statsLoading ? '...' : stats.targetedRoom}
          </div>
          <div className="kpi-subtext">Gửi đích danh theo số phòng</div>
        </button>
      </section>

      {/* 3. FILTER & SEARCH */}
      <section className="ann-controls-card">
        <div className="filter-pills-row" role="tablist" aria-label="Bộ lọc phạm vi thông báo">
          <button
            type="button"
            className={`filter-pill-btn ${scopeFilter === 'ALL' ? 'filter-pill-btn-active' : ''}`}
            onClick={() => setScopeFilter('ALL')}
          >
            Tất cả ({stats.total})
          </button>
          <button
            type="button"
            className={`filter-pill-btn ${scopeFilter === 'GENERAL' ? 'filter-pill-btn-active' : ''}`}
            onClick={() => setScopeFilter('GENERAL')}
          >
            📢 Toàn tòa nhà ({stats.allBuilding})
          </button>
          <button
            type="button"
            className={`filter-pill-btn ${scopeFilter === 'TARGETED' ? 'filter-pill-btn-active' : ''}`}
            onClick={() => setScopeFilter('TARGETED')}
          >
            🏠 Riêng căn hộ ({stats.targetedRoom})
          </button>
        </div>

        <div className="search-row">
          <input
            type="text"
            className="form-input"
            placeholder="🔍 Tìm kiếm theo tiêu đề, nội dung hoặc số phòng..."
            value={searchInput}
            onChange={(e) => setSearchInput(e.target.value)}
          />
          <button
            type="button"
            className="btn btn-secondary"
            onClick={() => {
              fetchAnnouncements(pagination.page);
              fetchOverviewStats();
            }}
            title="Làm mới danh sách thông báo"
          >
            🔄 Tải lại dữ liệu
          </button>
        </div>
      </section>

      {/* 4. MAIN LIST */}
      <main>
        {loading ? (
          <div className="state-empty-box">
            <div style={{ fontSize: '2rem' }}>⏳</div>
            <h2 className="state-empty-title">Đang tải danh sách thông báo tòa nhà...</h2>
            <p className="state-empty-desc">Vui lòng chờ trong giây lát.</p>
          </div>
        ) : errorMsg ? (
          <div className="state-empty-box" style={{ borderColor: '#fca5a5', background: '#fef2f2' }}>
            <div style={{ fontSize: '2rem' }}>⚠️</div>
            <h2 className="state-empty-title" style={{ color: '#991b1b' }}>
              Không thể tải dữ liệu thông báo
            </h2>
            <p className="state-empty-desc" style={{ color: '#b91c1c' }}>
              {errorMsg}
            </p>
            <button
              type="button"
              className="btn btn-secondary"
              style={{ marginTop: '1rem', display: 'inline-flex' }}
              onClick={() => fetchAnnouncements(pagination.page)}
            >
              Thử lại
            </button>
          </div>
        ) : announcements.length === 0 ? (
          <div className="state-empty-box">
            <div style={{ fontSize: '2.5rem' }}>📭</div>
            <h2 className="state-empty-title">Không tìm thấy thông báo nào</h2>
            <p className="state-empty-desc">
              {scopeFilter !== 'ALL' || debouncedSearch
                ? 'Không có thông báo nào phù hợp với bộ lọc tìm kiếm hiện tại.'
                : 'Chưa có thông báo nào được phát hành. Bấm "Soạn thông báo mới" để gửi tin tức tới cư dân.'}
            </p>
          </div>
        ) : (
          <div className="ann-grid">
            {announcements.map((item) => (
              <article key={item.id} className="ann-card">
                {/* HEADER CARD */}
                <div className="ann-card-header">
                  <div>
                    {item.targetRoom && item.targetRoom.trim() ? (
                      <span className="scope-badge badge-room" title="Chỉ gửi cho căn hộ này">
                        🏠 Căn hộ: P.{item.targetRoom}
                      </span>
                    ) : (
                      <span className="scope-badge badge-general" title="Gửi cho toàn thể cư dân tòa nhà">
                        📢 Toàn Tòa Nhà
                      </span>
                    )}
                  </div>
                  <div style={{ fontSize: '0.8125rem', color: '#64748b' }}>
                    {formatDateTime(item.createdAt)}
                  </div>
                </div>

                {/* BODY CARD */}
                <div className="ann-card-body">
                  <h3 className="ann-card-title">{item.title}</h3>
                  <p className="ann-card-content">{item.content}</p>
                </div>

                {/* FOOTER CARD */}
                <div className="ann-card-footer">
                  <div style={{ fontSize: '0.8125rem', color: '#475569' }}>
                    <span>Người đăng: </span>
                    <strong>{item.author?.fullName || item.author?.username || 'Ban Quản Lý'}</strong>
                  </div>
                  <button
                    type="button"
                    className="btn btn-secondary"
                    style={{ minHeight: '38px', padding: '0.375rem 0.875rem', fontSize: '0.875rem' }}
                    onClick={() => setViewingItem(item)}
                  >
                    📄 Đọc toàn bộ nội dung
                  </button>
                </div>
              </article>
            ))}
          </div>
        )}

        {/* 5. PAGINATION */}
        {announcements.length > 0 && pagination.totalPages > 1 && (
          <nav className="pagination-bar" aria-label="Phân trang thông báo">
            <div className="pagination-info">
              Trang <strong>{pagination.page}</strong> / <strong>{pagination.totalPages}</strong> (Tổng cộng {pagination.total} thông báo)
            </div>
            <div className="pagination-btns">
              <button
                type="button"
                className="pagination-btn"
                disabled={pagination.page <= 1 || loading}
                onClick={() => fetchAnnouncements(pagination.page - 1)}
              >
                ◀ Trang trước
              </button>
              <button
                type="button"
                className="pagination-btn"
                disabled={pagination.page >= pagination.totalPages || loading}
                onClick={() => fetchAnnouncements(pagination.page + 1)}
              >
                Trang sau ▶
              </button>
            </div>
          </nav>
        )}
      </main>

      {/* ========================================================================= */}
      {/* MODAL 1: SOẠN & PHÁT THÔNG BÁO MỚI                                        */}
      {/* ========================================================================= */}
      {isCreateModalOpen && (
        <div className="modal-overlay" role="dialog" aria-modal="true" aria-labelledby="create-modal-title">
          <div className="modal-card">
            <div className="modal-header">
              <h2 id="create-modal-title" className="modal-title">
                Soạn & Phát Hành Thông Báo Mới
              </h2>
              <button
                type="button"
                className="modal-close-btn"
                onClick={() => setIsCreateModalOpen(false)}
                aria-label="Đóng cửa sổ"
              >
                ×
              </button>
            </div>
            <form onSubmit={handleCreateAnnouncement}>
              <div className="modal-body">
                <div>
                  <label style={{ display: 'block', fontSize: '0.875rem', fontWeight: 600, color: '#0f172a', marginBottom: '0.375rem' }}>
                    Tiêu đề thông báo: *
                  </label>
                  <input
                    type="text"
                    className="form-input"
                    placeholder="Ví dụ: Lịch bảo dưỡng định kỳ hệ thống thang máy Tháp A..."
                    value={createTitle}
                    onChange={(e) => setCreateTitle(e.target.value)}
                    maxLength={200}
                    required
                  />
                  <div style={{ fontSize: '0.75rem', color: '#94a3b8', marginTop: '0.25rem', textAlign: 'right' }}>
                    {createTitle.length} / 200 ký tự (Tối thiểu 3 ký tự)
                  </div>
                </div>

                <div>
                  <label style={{ display: 'block', fontSize: '0.875rem', fontWeight: 600, color: '#0f172a', marginBottom: '0.375rem' }}>
                    Phạm vi người nhận: *
                  </label>
                  <div style={{ display: 'flex', gap: '1rem', marginTop: '0.25rem' }}>
                    <label style={{ display: 'flex', alignItems: 'center', gap: '0.375rem', fontSize: '0.9375rem', cursor: 'pointer' }}>
                      <input
                        type="radio"
                        name="scope"
                        checked={createScope === 'ALL'}
                        onChange={() => setCreateScope('ALL')}
                      />
                      📢 Toàn bộ cư dân tòa nhà
                    </label>
                    <label style={{ display: 'flex', alignItems: 'center', gap: '0.375rem', fontSize: '0.9375rem', cursor: 'pointer' }}>
                      <input
                        type="radio"
                        name="scope"
                        checked={createScope === 'ROOM'}
                        onChange={() => setCreateScope('ROOM')}
                      />
                      🏠 Gửi riêng 1 căn hộ cụ thể
                    </label>
                  </div>
                </div>

                {createScope === 'ROOM' && (
                  <div>
                    <label style={{ display: 'block', fontSize: '0.875rem', fontWeight: 600, color: '#0f172a', marginBottom: '0.375rem' }}>
                      Chọn hoặc nhập số căn hộ: *
                    </label>
                    {availableRooms.length > 0 ? (
                      <select
                        className="form-select"
                        value={createTargetRoom}
                        onChange={(e) => setCreateTargetRoom(e.target.value)}
                        required
                      >
                        <option value="">-- Chọn căn hộ đích --</option>
                        {availableRooms.map((r) => (
                          <option key={r.id} value={r.roomNumber}>
                            Phòng {r.roomNumber} {r.floor ? `(Tầng ${r.floor})` : ''}
                          </option>
                        ))}
                      </select>
                    ) : (
                      <input
                        type="text"
                        className="form-input"
                        placeholder="Nhập chính xác số phòng, ví dụ: 101, A-302..."
                        value={createTargetRoom}
                        onChange={(e) => setCreateTargetRoom(e.target.value)}
                        required
                      />
                    )}
                  </div>
                )}

                <div>
                  <label style={{ display: 'block', fontSize: '0.875rem', fontWeight: 600, color: '#0f172a', marginBottom: '0.375rem' }}>
                    Nội dung thông báo chi tiết: *
                  </label>
                  <textarea
                    className="form-textarea"
                    style={{ minHeight: '140px', resize: 'vertical', fontFamily: 'inherit' }}
                    placeholder="Nhập nội dung thông báo đầy đủ, rõ ràng cho cư dân..."
                    value={createContent}
                    onChange={(e) => setCreateContent(e.target.value)}
                    maxLength={5000}
                    required
                  />
                  <div style={{ fontSize: '0.75rem', color: '#94a3b8', marginTop: '0.25rem', textAlign: 'right' }}>
                    {createContent.length} / 5000 ký tự (Tối thiểu 5 ký tự)
                  </div>
                </div>

                {createError && (
                  <div style={{ padding: '0.75rem', background: '#fee2e2', color: '#991b1b', borderRadius: '0.375rem', fontSize: '0.875rem' }}>
                    ⚠️ {createError}
                  </div>
                )}
              </div>
              <div className="modal-footer">
                <button
                  type="button"
                  className="btn btn-secondary"
                  disabled={createSubmitting}
                  onClick={() => setIsCreateModalOpen(false)}
                >
                  Hủy bỏ
                </button>
                <button
                  type="submit"
                  className="btn btn-primary"
                  disabled={createSubmitting}
                >
                  {createSubmitting ? 'Đang phát hành...' : 'Xác nhận phát thông báo'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* ========================================================================= */}
      {/* MODAL 2: XEM NỘI DUNG CHI TIẾT THÔNG BÁO                                 */}
      {/* ========================================================================= */}
      {viewingItem && (
        <div className="modal-overlay" role="dialog" aria-modal="true" aria-labelledby="detail-modal-title">
          <div className="modal-card">
            <div className="modal-header">
              <h2 id="detail-modal-title" className="modal-title">
                Chi Tiết Thông Báo Tòa Nhà
              </h2>
              <button
                type="button"
                className="modal-close-btn"
                onClick={() => setViewingItem(null)}
                aria-label="Đóng cửa sổ"
              >
                ×
              </button>
            </div>
            <div className="modal-body">
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <div>
                  {viewingItem.targetRoom ? (
                    <span className="scope-badge badge-room">
                      🏠 Gửi riêng: Căn hộ P.{viewingItem.targetRoom}
                    </span>
                  ) : (
                    <span className="scope-badge badge-general">
                      📢 Thông báo chung toàn tòa nhà
                    </span>
                  )}
                </div>
                <div style={{ fontSize: '0.875rem', color: '#64748b' }}>
                  {formatDateTime(viewingItem.createdAt)}
                </div>
              </div>

              <div>
                <h3 style={{ margin: '0 0 0.5rem 0', fontSize: '1.25rem', color: '#0f172a' }}>
                  {viewingItem.title}
                </h3>
                <div
                  style={{
                    padding: '1rem',
                    backgroundColor: '#f8fafc',
                    border: '1px solid #e2e8f0',
                    borderRadius: '0.5rem',
                    whiteSpace: 'pre-wrap',
                    lineHeight: 1.6,
                    fontSize: '0.9375rem',
                    color: '#334155',
                  }}
                >
                  {viewingItem.content}
                </div>
              </div>

              <div style={{ fontSize: '0.875rem', color: '#64748b', marginTop: '0.5rem' }}>
                Người phát hành: <strong>{viewingItem.author?.fullName || viewingItem.author?.username || 'Ban Quản Lý'}</strong>
              </div>
            </div>
            <div className="modal-footer">
              <button
                type="button"
                className="btn btn-primary"
                onClick={() => setViewingItem(null)}
              >
                Đóng
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ========================================================================= */}
      {/* TOAST NOTIFICATION                                                        */}
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

export default AnnouncementsPage;
