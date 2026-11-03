// =========================================================================
// TRANG TIẾP NHẬN & PHẢN HỒI HÒM THƯ GÓP Ý CƯ DÂN (FEEDBACK MANAGEMENT)
// Phụ trách: Thành viên Oanh (Senior Full-Stack & UI/UX Integration Engineer)
// Định hướng thiết kế: Civic Clarity + Warm Modern (Dễ tiếp cận, thân thiện mọi lứa tuổi)
// Tuân thủ WCAG 2.2 AA, Touch target >= 44px, Nhãn tiếng Việt rõ ràng, Chống Race Condition
// =========================================================================

import React, { useState, useEffect, useCallback, useMemo, useRef } from 'react';
import axiosClient from '../api/axiosClient';
import { API_ENDPOINTS } from '../api/endpoints';
import { getStoredUser, StoredUser, ApiEnvelope } from '../utils/auth';
import {
  validateFeedbackReplyPayload,
  FeedbackStatsSummary,
} from '../utils/announcementsFeedbackValidation';

// -------------------------------------------------------------------------
// KIỂU DỮ LIỆU ĐỐI TƯỢNG PHẢN ÁNH (STRICT TYPESCRIPT)
// -------------------------------------------------------------------------

export interface FeedbackResident {
  id: number;
  fullName: string;
  roomId?: number | null;
}

export interface FeedbackRoom {
  id: number;
  roomNumber: string;
  floor?: number;
}

export interface FeedbackItem {
  id: number;
  residentId: number;
  resident?: FeedbackResident | null;
  roomId?: number | null;
  room?: FeedbackRoom | null;
  title: string;
  content: string;
  reply?: string | null;
  isResolved: boolean;
  repliedAt?: string | null;
  createdAt: string;
  updatedAt: string;
}

export type FeedbackStatusFilter = 'ALL' | 'PENDING' | 'RESOLVED';

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
// COMPONENT CHÍNH: FeedbackManagementPage
// -------------------------------------------------------------------------

export const FeedbackManagementPage: React.FC = () => {
  const isMountedRef = useRef<boolean>(true);
  const fetchSeqRef = useRef<number>(0);
  const statsSeqRef = useRef<number>(0);

  // Người dùng đăng nhập (Ban Quản Lý)
  const currentUser: StoredUser | null = useMemo(() => getStoredUser(), []);

  // Danh sách phản ánh & phân trang
  const [feedbacks, setFeedbacks] = useState<FeedbackItem[]>([]);
  const [loading, setLoading] = useState<boolean>(true);
  const [errorMsg, setErrorMsg] = useState<string>('');

  const [pagination, setPagination] = useState<PaginationMeta>({
    page: 1,
    limit: 6,
    total: 0,
    totalPages: 1,
  });

  // Bộ lọc trạng thái & tìm kiếm
  const [statusFilter, setStatusFilter] = useState<FeedbackStatusFilter>('ALL');
  const [searchInput, setSearchInput] = useState<string>('');
  const [debouncedSearch, setDebouncedSearch] = useState<string>('');

  // Thống kê tổng quan KPI
  const [stats, setStats] = useState<FeedbackStatsSummary>({
    total: 0,
    pending: 0,
    resolved: 0,
  });
  const [statsLoading, setStatsLoading] = useState<boolean>(false);

  // State Modal: Trả lời / Phản hồi phản ánh
  const [replyingFeedback, setReplyingFeedback] = useState<FeedbackItem | null>(null);
  const [replyContent, setReplyContent] = useState<string>('');
  const [replyIsResolved, setReplyIsResolved] = useState<boolean>(true);
  const [replySubmitting, setReplySubmitting] = useState<boolean>(false);
  const [replyError, setReplyError] = useState<string>('');

  // State Modal: Xem chi tiết phản ánh
  const [viewingFeedback, setViewingFeedback] = useState<FeedbackItem | null>(null);

  // State xử lý toggle trạng thái nhanh
  const [statusUpdatingId, setStatusUpdatingId] = useState<number | null>(null);

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
  // NẠP THỐNG KÊ TỔNG QUAN (KPI COUNTERS)
  // -------------------------------------------------------------------------
  const fetchOverviewStats = useCallback(async () => {
    const seq = ++statsSeqRef.current;
    setStatsLoading(true);

    try {
      // Gọi song song 2 trạng thái isResolved=false và isResolved=true để lấy con số chính xác
      const [pendingRes, resolvedRes] = await Promise.all([
        axiosClient.get(`${API_ENDPOINTS.FEEDBACK.LIST}?isResolved=false&limit=1`) as Promise<ApiEnvelope<FeedbackItem[]>>,
        axiosClient.get(`${API_ENDPOINTS.FEEDBACK.LIST}?isResolved=true&limit=1`) as Promise<ApiEnvelope<FeedbackItem[]>>,
      ]);

      if (seq === statsSeqRef.current && isMountedRef.current) {
        const pendingCount = pendingRes?.pagination?.total ?? 0;
        const resolvedCount = resolvedRes?.pagination?.total ?? 0;
        const totalCount = pendingCount + resolvedCount;

        setStats({
          total: totalCount,
          pending: pendingCount,
          resolved: resolvedCount,
        });
      }
    } catch {
      // Bỏ qua lỗi thống kê phụ
    } finally {
      if (seq === statsSeqRef.current && isMountedRef.current) {
        setStatsLoading(false);
      }
    }
  }, []);

  // -------------------------------------------------------------------------
  // NẠP DANH SÁCH PHẢN ÁNH CÓ PHÂN TRANG VÀ BỘ LỌC (CHỐNG RACE CONDITION)
  // -------------------------------------------------------------------------
  const fetchFeedbacks = useCallback(
    async (pageToLoad: number = 1) => {
      const seq = ++fetchSeqRef.current;
      setLoading(true);
      setErrorMsg('');

      try {
        const params = new URLSearchParams();
        params.append('page', String(pageToLoad));
        params.append('limit', String(pagination.limit));

        if (statusFilter === 'PENDING') {
          params.append('isResolved', 'false');
        } else if (statusFilter === 'RESOLVED') {
          params.append('isResolved', 'true');
        }

        if (debouncedSearch.trim()) {
          params.append('search', debouncedSearch.trim());
        }

        const url = `${API_ENDPOINTS.FEEDBACK.LIST}?${params.toString()}`;
        const res = (await axiosClient.get(url)) as unknown as ApiEnvelope<FeedbackItem[]>;

        if (seq === fetchSeqRef.current && isMountedRef.current) {
          if (res && res.success && Array.isArray(res.data)) {
            setFeedbacks(res.data);
            if (res.pagination) {
              setPagination({
                page: res.pagination.page,
                limit: res.pagination.limit,
                total: res.pagination.total,
                totalPages: Math.max(1, res.pagination.totalPages),
              });
            }
          } else {
            setFeedbacks([]);
            setErrorMsg(res?.message || 'Không thể tải danh sách phản ánh.');
          }
        }
      } catch (err: unknown) {
        if (seq === fetchSeqRef.current && isMountedRef.current) {
          setFeedbacks([]);
          setErrorMsg(parseErrorMessage(err, 'Lỗi kết nối máy chủ khi tải hòm thư góp ý.'));
        }
      } finally {
        if (seq === fetchSeqRef.current && isMountedRef.current) {
          setLoading(false);
        }
      }
    },
    [pagination.limit, statusFilter, debouncedSearch]
  );

  useEffect(() => {
    fetchFeedbacks(1);
    fetchOverviewStats();
  }, [fetchFeedbacks, fetchOverviewStats]);

  // -------------------------------------------------------------------------
  // HÀNH ĐỘNG 1: GỬI CÂU TRẢ LỜI PHẢN HỒI (POST /api/feedback/:id/reply)
  // -------------------------------------------------------------------------
  const openReplyModal = (feedback: FeedbackItem) => {
    setReplyingFeedback(feedback);
    setReplyContent(feedback.reply || '');
    setReplyIsResolved(true);
    setReplyError('');
  };

  const handleSendReply = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!replyingFeedback) return;
    setReplyError('');

    // Kiểm định nội dung phản hồi
    const valResult = validateFeedbackReplyPayload(replyContent);
    if (!valResult.isValid || !valResult.data) {
      setReplyError(valResult.error || 'Nội dung phản hồi không hợp lệ.');
      return;
    }

    setReplySubmitting(true);

    try {
      const url = API_ENDPOINTS.FEEDBACK.REPLY(replyingFeedback.id);
      await axiosClient.post(url, {
        reply: valResult.data.reply,
        isResolved: replyIsResolved,
      });

      if (!isMountedRef.current) return;
      setToast({
        type: 'success',
        message: `Đã gửi câu trả lời phản hồi tới cư dân cho phản ánh #${replyingFeedback.id}.`,
      });
      setReplyingFeedback(null);
      fetchFeedbacks(pagination.page);
      fetchOverviewStats();
    } catch (err: unknown) {
      if (!isMountedRef.current) return;
      setReplyError(parseErrorMessage(err, 'Lỗi khi gửi câu trả lời phản hồi.'));
    } finally {
      if (isMountedRef.current) {
        setReplySubmitting(false);
      }
    }
  };

  // -------------------------------------------------------------------------
  // HÀNH ĐỘNG 2: CẬP NHẬT TRẠNG THÁI NHANH (PATCH /api/feedback/:id/status)
  // -------------------------------------------------------------------------
  const handleToggleStatus = async (feedback: FeedbackItem) => {
    const nextStatus = !feedback.isResolved;
    setStatusUpdatingId(feedback.id);

    try {
      await axiosClient.patch(`/api/feedback/${feedback.id}/status`, {
        isResolved: nextStatus,
      });

      if (!isMountedRef.current) return;
      setToast({
        type: 'success',
        message: nextStatus
          ? `Đã đánh dấu phản ánh #${feedback.id} là Đã giải quyết.`
          : `Đã mở lại trạng thái Chưa giải quyết cho phản ánh #${feedback.id}.`,
      });
      fetchFeedbacks(pagination.page);
      fetchOverviewStats();
    } catch (err: unknown) {
      if (!isMountedRef.current) return;
      setToast({
        type: 'error',
        message: parseErrorMessage(err, 'Không thể cập nhật trạng thái phản ánh.'),
      });
    } finally {
      if (isMountedRef.current) {
        setStatusUpdatingId(null);
      }
    }
  };

  return (
    <div className="feedback-page">
      {/* SCOPED STYLING: CIVIC CLARITY + WARM MODERN */}
      <style>{`
        .feedback-page {
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
        .fb-header-card {
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
          .fb-header-card {
            flex-direction: row;
            justify-content: space-between;
            align-items: center;
          }
        }
        .fb-title {
          font-size: 1.5rem;
          font-weight: 700;
          color: #0f172a;
          margin: 0 0 0.375rem 0;
          line-height: 1.25;
        }
        .fb-sub {
          font-size: 0.9375rem;
          color: #64748b;
          margin: 0;
          line-height: 1.4;
        }

        /* 2. KPI METRICS */
        .fb-kpi-grid {
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
        .fb-controls-card {
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
        .form-input, .form-textarea {
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
        .form-input:focus, .form-textarea:focus {
          outline: none;
          border-color: #0284c7;
          box-shadow: 0 0 0 3px rgba(2, 132, 199, 0.15);
        }

        /* 4. FEEDBACK CARDS */
        .fb-grid {
          display: grid;
          grid-template-columns: 1fr;
          gap: 1.25rem;
          margin-bottom: 2rem;
        }
        @media (min-width: 900px) {
          .fb-grid {
            grid-template-columns: repeat(2, 1fr);
          }
        }
        .fb-card {
          background: #ffffff;
          border: 1px solid #e2e8f0;
          border-radius: 0.875rem;
          box-shadow: 0 1px 3px rgba(0, 0, 0, 0.05);
          display: flex;
          flex-direction: column;
          overflow: hidden;
          transition: box-shadow 0.2s ease, border-color 0.2s ease;
        }
        .fb-card:hover {
          box-shadow: 0 6px 12px -2px rgba(0, 0, 0, 0.08);
          border-color: #cbd5e1;
        }
        .fb-card-header {
          padding: 1rem 1.25rem;
          background-color: #f8fafc;
          border-bottom: 1px solid #f1f5f9;
          display: flex;
          justify-content: space-between;
          align-items: center;
          flex-wrap: wrap;
          gap: 0.5rem;
        }
        .fb-card-body {
          padding: 1.25rem;
          display: flex;
          flex-direction: column;
          gap: 0.875rem;
          flex-grow: 1;
        }
        .fb-meta-box {
          display: flex;
          justify-content: space-between;
          align-items: center;
          font-size: 0.875rem;
          background-color: #f8fafc;
          border: 1px solid #f1f5f9;
          padding: 0.5rem 0.75rem;
          border-radius: 0.375rem;
          color: #475569;
        }
        .fb-card-title {
          font-size: 1.125rem;
          font-weight: 700;
          color: #0f172a;
          margin: 0;
          line-height: 1.35;
        }
        .fb-card-content {
          font-size: 0.9375rem;
          color: #334155;
          line-height: 1.5;
          margin: 0;
          white-space: pre-wrap;
          word-break: break-word;
        }
        .fb-reply-box {
          background-color: #f0fdf4;
          border: 1px solid #bbf7d0;
          border-radius: 0.5rem;
          padding: 0.875rem;
          font-size: 0.875rem;
        }
        .fb-reply-title {
          font-weight: 700;
          color: #166534;
          margin-bottom: 0.375rem;
          display: flex;
          justify-content: space-between;
          align-items: center;
        }
        .fb-reply-content {
          margin: 0;
          color: #14532d;
          white-space: pre-wrap;
          line-height: 1.45;
        }
        .fb-card-footer {
          padding: 1rem 1.25rem;
          background-color: #f8fafc;
          border-top: 1px solid #e2e8f0;
          display: flex;
          flex-direction: column;
          gap: 0.625rem;
        }
        .fb-actions-row {
          display: flex;
          flex-wrap: wrap;
          gap: 0.625rem;
        }

        /* 5. BADGES & BUTTONS */
        .status-badge {
          display: inline-flex;
          align-items: center;
          gap: 0.375rem;
          padding: 0.3125rem 0.625rem;
          border-radius: 9999px;
          font-size: 0.8125rem;
          font-weight: 600;
        }
        .badge-pending {
          background-color: #fef3c7;
          color: #92400e;
          border: 1px solid #fde68a;
        }
        .badge-resolved {
          background-color: #d1fae5;
          color: #065f46;
          border: 1px solid #a7f3d0;
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
      <header className="fb-header-card">
        <div>
          <h1 className="fb-title">Hòm Thư Phản Ánh & Góp Ý Cư Dân</h1>
          <p className="fb-sub">
            Tiếp nhận tâm tư, ý kiến đóng góp của cư dân và gửi phản hồi giải quyết chính thức từ Ban Quản Lý
          </p>
        </div>
      </header>

      {/* 2. KPI METRICS CARDS */}
      <section className="fb-kpi-grid" aria-label="Thống kê hòm thư góp ý">
        <button
          type="button"
          onClick={() => setStatusFilter('ALL')}
          className={`kpi-card ${statusFilter === 'ALL' ? 'kpi-card-active' : ''}`}
        >
          <div className="kpi-label">
            <span>Tổng số ý kiến</span>
            <span>📬</span>
          </div>
          <div className="kpi-value">{statsLoading ? '...' : stats.total}</div>
          <div className="kpi-subtext">Tất cả phản ánh đã tiếp nhận</div>
        </button>

        <button
          type="button"
          onClick={() => setStatusFilter('PENDING')}
          className={`kpi-card ${statusFilter === 'PENDING' ? 'kpi-card-active' : ''}`}
        >
          <div className="kpi-label">
            <span>Chưa giải quyết</span>
            <span style={{ color: '#d97706' }}>⏳</span>
          </div>
          <div className="kpi-value" style={{ color: '#b45309' }}>
            {statsLoading ? '...' : stats.pending}
          </div>
          <div className="kpi-subtext">Cần BQL kiểm tra và phản hồi</div>
        </button>

        <button
          type="button"
          onClick={() => setStatusFilter('RESOLVED')}
          className={`kpi-card ${statusFilter === 'RESOLVED' ? 'kpi-card-active' : ''}`}
        >
          <div className="kpi-label">
            <span>Đã giải quyết xong</span>
            <span style={{ color: '#059669' }}>✅</span>
          </div>
          <div className="kpi-value" style={{ color: '#047857' }}>
            {statsLoading ? '...' : stats.resolved}
          </div>
          <div className="kpi-subtext">Đã gửi câu trả lời phản hồi</div>
        </button>
      </section>

      {/* 3. FILTER & SEARCH */}
      <section className="fb-controls-card">
        <div className="filter-pills-row" role="tablist" aria-label="Bộ lọc trạng thái phản ánh">
          <button
            type="button"
            className={`filter-pill-btn ${statusFilter === 'ALL' ? 'filter-pill-btn-active' : ''}`}
            onClick={() => setStatusFilter('ALL')}
          >
            Tất cả ({stats.total})
          </button>
          <button
            type="button"
            className={`filter-pill-btn ${statusFilter === 'PENDING' ? 'filter-pill-btn-active' : ''}`}
            onClick={() => setStatusFilter('PENDING')}
          >
            ⏳ Chưa giải quyết ({stats.pending})
          </button>
          <button
            type="button"
            className={`filter-pill-btn ${statusFilter === 'RESOLVED' ? 'filter-pill-btn-active' : ''}`}
            onClick={() => setStatusFilter('RESOLVED')}
          >
            ✅ Đã giải quyết ({stats.resolved})
          </button>
        </div>

        <div className="search-row">
          <input
            type="text"
            className="form-input"
            placeholder="🔍 Tìm kiếm theo tiêu đề, nội dung phản ánh..."
            value={searchInput}
            onChange={(e) => setSearchInput(e.target.value)}
          />
          <button
            type="button"
            className="btn btn-secondary"
            onClick={() => {
              fetchFeedbacks(pagination.page);
              fetchOverviewStats();
            }}
            title="Làm mới danh sách phản ánh"
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
            <h2 className="state-empty-title">Đang tải danh sách hòm thư góp ý...</h2>
            <p className="state-empty-desc">Vui lòng chờ trong giây lát.</p>
          </div>
        ) : errorMsg ? (
          <div className="state-empty-box" style={{ borderColor: '#fca5a5', background: '#fef2f2' }}>
            <div style={{ fontSize: '2rem' }}>⚠️</div>
            <h2 className="state-empty-title" style={{ color: '#991b1b' }}>
              Không thể tải dữ liệu hòm thư góp ý
            </h2>
            <p className="state-empty-desc" style={{ color: '#b91c1c' }}>
              {errorMsg}
            </p>
            <button
              type="button"
              className="btn btn-secondary"
              style={{ marginTop: '1rem', display: 'inline-flex' }}
              onClick={() => fetchFeedbacks(pagination.page)}
            >
              Thử lại
            </button>
          </div>
        ) : feedbacks.length === 0 ? (
          <div className="state-empty-box">
            <div style={{ fontSize: '2.5rem' }}>🎉</div>
            <h2 className="state-empty-title">Không có phản ánh nào</h2>
            <p className="state-empty-desc">
              {statusFilter !== 'ALL' || debouncedSearch
                ? 'Không tìm thấy phản ánh nào phù hợp với bộ lọc tìm kiếm hiện tại.'
                : 'Hiện tại hòm thư góp ý không có phản ánh nào đang chờ xử lý.'}
            </p>
          </div>
        ) : (
          <div className="fb-grid">
            {feedbacks.map((item) => (
              <article key={item.id} className="fb-card">
                {/* HEADER CARD */}
                <div className="fb-card-header">
                  <span style={{ fontSize: '0.9375rem', fontWeight: 700, color: '#0f172a' }}>
                    Phản ánh #{item.id}
                  </span>
                  <div>
                    {item.isResolved ? (
                      <span className="status-badge badge-resolved">
                        ✓ Đã giải quyết
                      </span>
                    ) : (
                      <span className="status-badge badge-pending">
                        ⏳ Chưa giải quyết
                      </span>
                    )}
                  </div>
                </div>

                {/* BODY CARD */}
                <div className="fb-card-body">
                  <div className="fb-meta-box">
                    <span>
                      📍 Vị trí:{' '}
                      <strong>
                        {item.room ? `P.${item.room.roomNumber} (Tầng ${item.room.floor || '?'})` : 'Khu vực chung'}
                      </strong>
                    </span>
                    <span>
                      Cư dân: <strong>{item.resident?.fullName || 'Cư dân'}</strong>
                    </span>
                  </div>

                  <div>
                    <h3 className="fb-card-title">{item.title}</h3>
                    <p className="fb-card-content" style={{ marginTop: '0.375rem' }}>
                      {item.content}
                    </p>
                  </div>

                  {/* KHỐI HIỂN THỊ CÂU TRẢ LỜI CỦA BQL (NẾU CÓ) */}
                  {item.reply ? (
                    <div className="fb-reply-box">
                      <div className="fb-reply-title">
                        <span>💬 Phản hồi từ Ban Quản Lý:</span>
                        {item.repliedAt && (
                          <span style={{ fontSize: '0.75rem', fontWeight: 400, color: '#15803d' }}>
                            {formatDateTime(item.repliedAt)}
                          </span>
                        )}
                      </div>
                      <p className="fb-reply-content">{item.reply}</p>
                    </div>
                  ) : (
                    <div style={{ fontSize: '0.8125rem', color: '#94a3b8', fontStyle: 'italic' }}>
                      Chưa có câu trả lời phản hồi từ Ban Quản Lý.
                    </div>
                  )}

                  <div style={{ fontSize: '0.8125rem', color: '#94a3b8', marginTop: 'auto' }}>
                    Thời gian gửi: {formatDateTime(item.createdAt)}
                  </div>
                </div>

                {/* FOOTER CARD */}
                <div className="fb-card-footer">
                  <div className="fb-actions-row">
                    <button
                      type="button"
                      className="btn btn-primary"
                      onClick={() => openReplyModal(item)}
                    >
                      {item.reply ? '✏️ Sửa câu trả lời' : '💬 Soạn phản hồi'}
                    </button>

                    <button
                      type="button"
                      className={item.isResolved ? 'btn btn-secondary' : 'btn btn-success'}
                      disabled={statusUpdatingId === item.id}
                      onClick={() => handleToggleStatus(item)}
                    >
                      {statusUpdatingId === item.id
                        ? 'Đang lưu...'
                        : item.isResolved
                        ? '↩ Mở lại'
                        : '✓ Đã xong'}
                    </button>
                  </div>

                  <button
                    type="button"
                    className="btn btn-secondary"
                    style={{ flex: 'none', width: '100%', minHeight: '38px', fontSize: '0.875rem' }}
                    onClick={() => setViewingFeedback(item)}
                  >
                    📄 Xem chi tiết toàn diện
                  </button>
                </div>
              </article>
            ))}
          </div>
        )}

        {/* 5. PAGINATION */}
        {feedbacks.length > 0 && pagination.totalPages > 1 && (
          <nav className="pagination-bar" aria-label="Phân trang hòm thư góp ý">
            <div className="pagination-info">
              Trang <strong>{pagination.page}</strong> / <strong>{pagination.totalPages}</strong> (Tổng cộng {pagination.total} phản ánh)
            </div>
            <div className="pagination-btns">
              <button
                type="button"
                className="pagination-btn"
                disabled={pagination.page <= 1 || loading}
                onClick={() => fetchFeedbacks(pagination.page - 1)}
              >
                ◀ Trang trước
              </button>
              <button
                type="button"
                className="pagination-btn"
                disabled={pagination.page >= pagination.totalPages || loading}
                onClick={() => fetchFeedbacks(pagination.page + 1)}
              >
                Trang sau ▶
              </button>
            </div>
          </nav>
        )}
      </main>

      {/* ========================================================================= */}
      {/* MODAL 1: SOẠN & GỬI CÂU TRẢ LỜI PHẢN HỒI (POST /reply)                   */}
      {/* ========================================================================= */}
      {replyingFeedback && (
        <div className="modal-overlay" role="dialog" aria-modal="true" aria-labelledby="reply-modal-title">
          <div className="modal-card">
            <div className="modal-header">
              <h2 id="reply-modal-title" className="modal-title">
                Phản Hồi Phản Ánh #{replyingFeedback.id}
              </h2>
              <button
                type="button"
                className="modal-close-btn"
                onClick={() => setReplyingFeedback(null)}
                aria-label="Đóng cửa sổ"
              >
                ×
              </button>
            </div>
            <form onSubmit={handleSendReply}>
              <div className="modal-body">
                {/* Thông tin phản ánh gốc */}
                <div style={{ background: '#f8fafc', padding: '0.875rem', borderRadius: '0.5rem', border: '1px solid #e2e8f0' }}>
                  <div style={{ fontSize: '0.75rem', color: '#64748b' }}>
                    Người gửi: <strong>{replyingFeedback.resident?.fullName || 'Cư dân'}</strong> •{' '}
                    {replyingFeedback.room ? `Phòng ${replyingFeedback.room.roomNumber}` : 'Khu vực chung'}
                  </div>
                  <div style={{ fontSize: '0.9375rem', fontWeight: 600, color: '#0f172a', marginTop: '0.25rem' }}>
                    {replyingFeedback.title}
                  </div>
                  <div style={{ fontSize: '0.875rem', color: '#334155', marginTop: '0.25rem', whiteSpace: 'pre-wrap' }}>
                    {replyingFeedback.content}
                  </div>
                </div>

                <div>
                  <label style={{ display: 'block', fontSize: '0.875rem', fontWeight: 600, color: '#0f172a', marginBottom: '0.375rem' }}>
                    Nội dung câu trả lời từ Ban Quản Lý: *
                  </label>
                  <textarea
                    className="form-textarea"
                    style={{ minHeight: '120px', resize: 'vertical', fontFamily: 'inherit' }}
                    placeholder="Nhập nội dung giải đáp, giải quyết hoặc tiếp thu ý kiến của cư dân..."
                    value={replyContent}
                    onChange={(e) => setReplyContent(e.target.value)}
                    maxLength={2000}
                    required
                  />
                  <div style={{ fontSize: '0.75rem', color: '#94a3b8', marginTop: '0.25rem', textAlign: 'right' }}>
                    {replyContent.length} / 2000 ký tự (Tối thiểu 2 ký tự)
                  </div>
                </div>

                <div>
                  <label style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', fontSize: '0.9375rem', cursor: 'pointer' }}>
                    <input
                      type="checkbox"
                      checked={replyIsResolved}
                      onChange={(e) => setReplyIsResolved(e.target.checked)}
                    />
                    <span>Đánh dấu phản ánh này đã được giải quyết xong</span>
                  </label>
                </div>

                {replyError && (
                  <div style={{ padding: '0.75rem', background: '#fee2e2', color: '#991b1b', borderRadius: '0.375rem', fontSize: '0.875rem' }}>
                    ⚠️ {replyError}
                  </div>
                )}
              </div>
              <div className="modal-footer">
                <button
                  type="button"
                  className="btn btn-secondary"
                  disabled={replySubmitting}
                  onClick={() => setReplyingFeedback(null)}
                >
                  Hủy bỏ
                </button>
                <button
                  type="submit"
                  className="btn btn-primary"
                  disabled={replySubmitting}
                >
                  {replySubmitting ? 'Đang gửi...' : 'Gửi phản hồi cho cư dân'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* ========================================================================= */}
      {/* MODAL 2: XEM CHI TIẾT ĐẦY ĐỦ CỦA PHẢN ÁNH                                */}
      {/* ========================================================================= */}
      {viewingFeedback && (
        <div className="modal-overlay" role="dialog" aria-modal="true" aria-labelledby="view-modal-title">
          <div className="modal-card">
            <div className="modal-header">
              <h2 id="view-modal-title" className="modal-title">
                Chi Tiết Phản Ánh #{viewingFeedback.id}
              </h2>
              <button
                type="button"
                className="modal-close-btn"
                onClick={() => setViewingFeedback(null)}
                aria-label="Đóng cửa sổ"
              >
                ×
              </button>
            </div>
            <div className="modal-body">
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <span style={{ fontSize: '0.875rem', color: '#64748b' }}>
                  Thời gian: {formatDateTime(viewingFeedback.createdAt)}
                </span>
                <div>
                  {viewingFeedback.isResolved ? (
                    <span className="status-badge badge-resolved">✓ Đã giải quyết</span>
                  ) : (
                    <span className="status-badge badge-pending">⏳ Chưa giải quyết</span>
                  )}
                </div>
              </div>

              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0.75rem', background: '#f8fafc', padding: '0.875rem', borderRadius: '0.5rem', border: '1px solid #e2e8f0' }}>
                <div>
                  <div style={{ fontSize: '0.75rem', color: '#64748b' }}>Vị trí / Căn hộ</div>
                  <div style={{ fontSize: '0.9375rem', fontWeight: 600, color: '#0f172a' }}>
                    {viewingFeedback.room ? `Phòng ${viewingFeedback.room.roomNumber}` : 'Khu vực chung'}
                  </div>
                </div>
                <div>
                  <div style={{ fontSize: '0.75rem', color: '#64748b' }}>Cư dân phản ánh</div>
                  <div style={{ fontSize: '0.9375rem', fontWeight: 600, color: '#0f172a' }}>
                    {viewingFeedback.resident?.fullName || 'Cư dân'}
                  </div>
                </div>
              </div>

              <div>
                <h3 style={{ margin: '0 0 0.5rem 0', fontSize: '1.25rem', color: '#0f172a' }}>
                  {viewingFeedback.title}
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
                  {viewingFeedback.content}
                </div>
              </div>

              {viewingFeedback.reply && (
                <div className="fb-reply-box">
                  <div className="fb-reply-title">
                    <span>💬 Phản hồi của Ban Quản Lý:</span>
                    {viewingFeedback.repliedAt && (
                      <span style={{ fontSize: '0.75rem', color: '#15803d' }}>
                        {formatDateTime(viewingFeedback.repliedAt)}
                      </span>
                    )}
                  </div>
                  <p className="fb-reply-content">{viewingFeedback.reply}</p>
                </div>
              )}
            </div>
            <div className="modal-footer">
              <button
                type="button"
                className="btn btn-primary"
                onClick={() => setViewingFeedback(null)}
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

export default FeedbackManagementPage;
