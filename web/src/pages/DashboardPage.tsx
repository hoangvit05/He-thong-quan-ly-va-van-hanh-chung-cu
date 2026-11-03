import React, { useState, useEffect, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import axiosClient from '../api/axiosClient';
import { API_ENDPOINTS } from '../api/endpoints';
import { getStoredUser, ApiEnvelope } from '../utils/auth';
import { StatCard, Card, CardHeader, CardTitle, CardContent, Button, Badge, LoadingSpinner, AlertBanner } from '../components/common';

interface DashboardStats {
  roomsTotal: number;
  roomsOccupied: number;
  roomsVacant: number;
  roomsMaintenance: number;
  residentsApproved: number;
  residentsPending: number;
  ticketsTotal: number;
  ticketsPending: number;
  ticketsInProgress: number;
  invoicesTotal: number;
  invoicesUnpaid: number;
  feedbackPending: number;
}

interface RecentTicket {
  id: number;
  category: string;
  description: string;
  status: string;
  createdAt: string;
  room?: { roomNumber: string } | null;
}

interface RecentFeedback {
  id: number;
  title: string;
  content: string;
  isResolved: boolean;
  createdAt: string;
  resident?: { fullName: string } | null;
  room?: { roomNumber: string } | null;
}

interface RecentAnnouncement {
  id: number;
  title: string;
  content: string;
  targetRoom?: string | null;
  createdAt: string;
}

export const DashboardPage: React.FC = () => {
  const navigate = useNavigate();
  const user = getStoredUser();
  const isMountedRef = useRef<boolean>(true);
  const fetchSeqRef = useRef<number>(0);

  const [loading, setLoading] = useState<boolean>(true);
  const [errorMsg, setErrorMsg] = useState<string>('');
  const [stats, setStats] = useState<DashboardStats>({
    roomsTotal: 0,
    roomsOccupied: 0,
    roomsVacant: 0,
    roomsMaintenance: 0,
    residentsApproved: 0,
    residentsPending: 0,
    ticketsTotal: 0,
    ticketsPending: 0,
    ticketsInProgress: 0,
    invoicesTotal: 0,
    invoicesUnpaid: 0,
    feedbackPending: 0,
  });

  const [urgentTickets, setUrgentTickets] = useState<RecentTicket[]>([]);
  const [urgentFeedback, setUrgentFeedback] = useState<RecentFeedback[]>([]);
  const [recentNotices, setRecentNotices] = useState<RecentAnnouncement[]>([]);

  useEffect(() => {
    isMountedRef.current = true;
    return () => {
      isMountedRef.current = false;
    };
  }, []);

  const loadDashboardData = async () => {
    const seq = ++fetchSeqRef.current;
    setLoading(true);
    setErrorMsg('');

    try {
      const [
        roomsTotalRes,
        roomsOccupiedRes,
        roomsVacantRes,
        residentsApprovedRes,
        residentsPendingRes,
        ticketsTotalRes,
        ticketsPendingRes,
        ticketsInProgressRes,
        invoicesTotalRes,
        invoicesUnpaidRes,
        feedbackPendingRes,
        urgentTicketsRes,
        urgentFeedbackRes,
        recentNoticesRes,
      ] = await Promise.allSettled([
        axiosClient.get(`${API_ENDPOINTS.ROOMS.LIST}?page=1&limit=1`),
        axiosClient.get(`${API_ENDPOINTS.ROOMS.LIST}?status=OCCUPIED&page=1&limit=1`),
        axiosClient.get(`${API_ENDPOINTS.ROOMS.LIST}?status=VACANT&page=1&limit=1`),
        axiosClient.get(`${API_ENDPOINTS.AUTH.RESIDENTS}?isApproved=true&page=1&limit=1`),
        axiosClient.get(`${API_ENDPOINTS.AUTH.RESIDENTS}?isApproved=false&page=1&limit=1`),
        axiosClient.get(`${API_ENDPOINTS.TICKETS.LIST}?page=1&limit=1`),
        axiosClient.get(`${API_ENDPOINTS.TICKETS.LIST}?status=PENDING&page=1&limit=1`),
        axiosClient.get(`${API_ENDPOINTS.TICKETS.LIST}?status=IN_PROGRESS&page=1&limit=1`),
        axiosClient.get(`${API_ENDPOINTS.INVOICES.LIST}?page=1&limit=1`),
        axiosClient.get(`${API_ENDPOINTS.INVOICES.LIST}?status=UNPAID&page=1&limit=1`),
        axiosClient.get(`${API_ENDPOINTS.FEEDBACK.LIST}?isResolved=false&page=1&limit=1`),
        axiosClient.get(`${API_ENDPOINTS.TICKETS.LIST}?status=PENDING&page=1&limit=5`),
        axiosClient.get(`${API_ENDPOINTS.FEEDBACK.LIST}?isResolved=false&page=1&limit=5`),
        axiosClient.get(`${API_ENDPOINTS.NOTIFICATIONS.LIST}?page=1&limit=3`),
      ]);

      if (seq !== fetchSeqRef.current || !isMountedRef.current) return;

      const getTotal = (res: PromiseSettledResult<unknown>): number => {
        if (res.status === 'fulfilled') {
          const env = res.value as ApiEnvelope<unknown>;
          return env?.pagination?.total ?? 0;
        }
        return 0;
      };

      const getData = <T,>(res: PromiseSettledResult<unknown>): T[] => {
        if (res.status === 'fulfilled') {
          const env = res.value as ApiEnvelope<T[]>;
          if (Array.isArray(env?.data)) return env.data;
        }
        return [];
      };

      const totalRooms = getTotal(roomsTotalRes);
      const occupiedRooms = getTotal(roomsOccupiedRes);

      setStats({
        roomsTotal: totalRooms,
        roomsOccupied: occupiedRooms,
        roomsVacant: getTotal(roomsVacantRes),
        roomsMaintenance: Math.max(0, totalRooms - occupiedRooms - getTotal(roomsVacantRes)),
        residentsApproved: getTotal(residentsApprovedRes),
        residentsPending: getTotal(residentsPendingRes),
        ticketsTotal: getTotal(ticketsTotalRes),
        ticketsPending: getTotal(ticketsPendingRes),
        ticketsInProgress: getTotal(ticketsInProgressRes),
        invoicesTotal: getTotal(invoicesTotalRes),
        invoicesUnpaid: getTotal(invoicesUnpaidRes),
        feedbackPending: getTotal(feedbackPendingRes),
      });

      setUrgentTickets(getData<RecentTicket>(urgentTicketsRes));
      setUrgentFeedback(getData<RecentFeedback>(urgentFeedbackRes));
      setRecentNotices(getData<RecentAnnouncement>(recentNoticesRes));
    } catch (err: unknown) {
      if (seq === fetchSeqRef.current && isMountedRef.current) {
        const errObj = err as { message?: string };
        setErrorMsg(errObj?.message || 'Không thể nạp đầy đủ dữ liệu bảng điều khiển.');
      }
    } finally {
      if (seq === fetchSeqRef.current && isMountedRef.current) {
        setLoading(false);
      }
    }
  };

  useEffect(() => {
    loadDashboardData();
  }, []);

  const occupancyRate =
    stats.roomsTotal > 0 ? Math.round((stats.roomsOccupied / stats.roomsTotal) * 100) : 0;

  return (
    <div className="space-y-6">
      {/* 1. Header Trang & Nút Làm Mới */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h2 className="text-xl md:text-2xl font-black text-slate-900 tracking-tight">
            Bàn Làm Việc Ban Quản Lý
          </h2>
          <p className="text-xs md:text-sm text-slate-500 font-medium mt-0.5">
            Tổng quan chỉ số vận hành, tình trạng tòa nhà và các nhiệm vụ cần giải quyết ngay.
          </p>
        </div>
        <div className="flex items-center gap-2">
          <Button
            variant="outline"
            size="md"
            onClick={loadDashboardData}
            isLoading={loading}
            icon={
              <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth="2"
                  d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15"
                />
              </svg>
            }
          >
            Làm mới số liệu
          </Button>
        </div>
      </div>

      {errorMsg && <AlertBanner type="error" message={errorMsg} onClose={() => setErrorMsg('')} />}

      {/* 2. Thẻ KPI Tổng Quan 4 Khối Trọng Tâm */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        <StatCard
          title="Tỷ lệ lấp đầy căn hộ"
          value={`${occupancyRate}%`}
          subtitle={`${stats.roomsOccupied} / ${stats.roomsTotal} căn đang ở`}
          colorScheme="indigo"
          onClick={() => navigate('/residents')}
          badge={
            <Badge variant="primary" dot>
              {stats.roomsVacant} phòng trống
            </Badge>
          }
          icon={
            <svg className="w-6 h-6" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth="2"
                d="M19 21V5a2 2 0 00-2-2H7a2 2 0 00-2 2v16m14 0h2m-2 0h-5m-9 0H3m2 0h5M9 7h1m-1 4h1m4-4h1m-1 4h1m-5 10v-5a1 1 0 011-1h2a1 1 0 011 1v5m-4 0h4"
              />
            </svg>
          }
        />

        <StatCard
          title="Cư dân cần duyệt mới"
          value={stats.residentsPending}
          subtitle={`Đã duyệt: ${stats.residentsApproved} cư dân`}
          colorScheme={stats.residentsPending > 0 ? 'amber' : 'emerald'}
          onClick={() => navigate('/residents')}
          badge={
            stats.residentsPending > 0 ? (
              <Badge variant="warning" dot>
                Cần duyệt
              </Badge>
            ) : (
              <Badge variant="success">Hoàn tất</Badge>
            )
          }
          icon={
            <svg className="w-6 h-6" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth="2"
                d="M17 20h5v-2a3 3 0 00-5.356-1.857M17 20H7m10 0v-2c0-.656-.126-1.283-.356-1.857M7 20H2v-2a3 3 0 015.356-1.857M7 20v-2c0-.656.126-1.283.356-1.857m0 0a5.002 5.002 0 019.288 0M15 7a3 3 0 11-6 0 3 3 0 016 0zm6 3a2 2 0 11-4 0 2 2 0 014 0zM7 10a2 2 0 11-4 0 2 2 0 014 0z"
              />
            </svg>
          }
        />

        <StatCard
          title="Sự cố chờ điều phối"
          value={stats.ticketsPending}
          subtitle={`Đang xử lý: ${stats.ticketsInProgress} phiếu`}
          colorScheme={stats.ticketsPending > 0 ? 'rose' : 'emerald'}
          onClick={() => navigate('/tickets/dispatch')}
          badge={
            stats.ticketsPending > 0 ? (
              <Badge variant="danger" dot>
                Khẩn cấp
              </Badge>
            ) : (
              <Badge variant="success">Đã gán hết</Badge>
            )
          }
          icon={
            <svg className="w-6 h-6" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth="2"
                d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z"
              />
            </svg>
          }
        />

        <StatCard
          title="Hóa đơn chưa thanh toán"
          value={stats.invoicesUnpaid}
          subtitle={`Tổng số hóa đơn: ${stats.invoicesTotal}`}
          colorScheme={stats.invoicesUnpaid > 0 ? 'amber' : 'slate'}
          onClick={() => navigate('/billing')}
          badge={
            stats.invoicesUnpaid > 0 ? (
              <Badge variant="warning">Chưa nộp</Badge>
            ) : (
              <Badge variant="success">Thu đủ</Badge>
            )
          }
          icon={
            <svg className="w-6 h-6" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth="2"
                d="M9 14l6-6m-5.5.5h.01m4.99 5h.01M19 21V5a2 2 0 00-2-2H7a2 2 0 00-2 2v16l3.5-2 3.5 2 3.5-2 3.5 2zM10 8.5a.5.5 0 11-1 0 .5.5 0 011 0zm5 5a.5.5 0 11-1 0 .5.5 0 011 0z"
              />
            </svg>
          }
        />
      </div>

      {/* 3. Lối Tắt Thao Tác Nhanh (Quick Actions Bar) */}
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-sm uppercase tracking-wider text-slate-500 font-bold">
            Thao tác nhanh cho Ban Quản Lý
          </CardTitle>
        </CardHeader>
        <CardContent className="pt-0">
          <div className="flex flex-wrap items-center gap-3">
            <Button variant="secondary" size="md" onClick={() => navigate('/residents')}>
              🏢 Quản lý Căn hộ
            </Button>
            <Button variant="secondary" size="md" onClick={() => navigate('/residents')}>
              👤 Duyệt Cư dân mới
            </Button>
            <Button variant="secondary" size="md" onClick={() => navigate('/tickets/dispatch')}>
              🔧 Bảng điều phối sự cố
            </Button>
            <Button variant="secondary" size="md" onClick={() => navigate('/billing')}>
              💳 Lập hóa đơn & Biểu phí
            </Button>
            <Button variant="secondary" size="md" onClick={() => navigate('/announcements')}>
              📢 Phát thông báo tòa nhà
            </Button>
            <Button variant="secondary" size="md" onClick={() => navigate('/feedback')}>
              📬 Hòm thư góp ý ({stats.feedbackPending} chờ xử lý)
            </Button>
          </div>
        </CardContent>
      </Card>

      {/* 4. Nhiệm Vụ Cần Xử Lý Ngay (Split Grid 2 Cột) */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Cột Trái: Sự cố kỹ thuật mới nhận */}
        <Card>
          <CardHeader className="flex flex-row items-center justify-between pb-3">
            <div>
              <CardTitle>Sự cố cần gán Thợ gấp</CardTitle>
              <p className="text-xs text-slate-500">Các phiếu báo hỏng mới gửi đang ở trạng thái PENDING</p>
            </div>
            <Button
              variant="outline"
              size="sm"
              onClick={() => navigate('/tickets/dispatch')}
              className="shrink-0"
            >
              Xem tất cả
            </Button>
          </CardHeader>
          <CardContent className="p-0">
            {loading ? (
              <LoadingSpinner text="Đang nạp sự cố..." />
            ) : urgentTickets.length === 0 ? (
              <div className="p-6 text-center text-slate-500 text-sm font-medium">
                ✨ Không có sự cố nào đang chờ gán thợ.
              </div>
            ) : (
              <div className="divide-y divide-slate-100">
                {urgentTickets.map((t) => (
                  <div key={t.id} className="p-4 hover:bg-slate-50 transition flex items-start justify-between gap-3">
                    <div className="space-y-1">
                      <div className="flex items-center gap-2">
                        <Badge variant="danger" dot>
                          Căn {t.room?.roomNumber || 'Khu chung'}
                        </Badge>
                        <span className="text-xs font-bold text-slate-700 uppercase">{t.category}</span>
                      </div>
                      <p className="text-sm text-slate-800 line-clamp-1">{t.description}</p>
                      <span className="text-[11px] text-slate-400">
                        Gửi lúc: {new Date(t.createdAt).toLocaleString('vi-VN')}
                      </span>
                    </div>
                    <Button
                      variant="primary"
                      size="sm"
                      onClick={() => navigate('/tickets/dispatch')}
                      className="shrink-0"
                    >
                      Gán việc
                    </Button>
                  </div>
                ))}
              </div>
            )}
          </CardContent>
        </Card>

        {/* Cột Phải: Hòm thư phản ánh chờ xử lý */}
        <Card>
          <CardHeader className="flex flex-row items-center justify-between pb-3">
            <div>
              <CardTitle>Ý kiến cư dân chờ phản hồi</CardTitle>
              <p className="text-xs text-slate-500">Các góp ý, phản ánh chưa được BQL đánh dấu giải quyết</p>
            </div>
            <Button variant="outline" size="sm" onClick={() => navigate('/feedback')} className="shrink-0">
              Xem hòm thư
            </Button>
          </CardHeader>
          <CardContent className="p-0">
            {loading ? (
              <LoadingSpinner text="Đang nạp góp ý..." />
            ) : urgentFeedback.length === 0 ? (
              <div className="p-6 text-center text-slate-500 text-sm font-medium">
                ✨ Đã phản hồi và giải quyết hết ý kiến cư dân.
              </div>
            ) : (
              <div className="divide-y divide-slate-100">
                {urgentFeedback.map((f) => (
                  <div key={f.id} className="p-4 hover:bg-slate-50 transition flex items-start justify-between gap-3">
                    <div className="space-y-1">
                      <div className="flex items-center gap-2">
                        <Badge variant="warning">
                          {f.room?.roomNumber ? `Căn ${f.room.roomNumber}` : 'Chung tòa nhà'}
                        </Badge>
                        <span className="text-xs text-slate-500 font-medium">
                          {f.resident?.fullName || 'Cư dân'}
                        </span>
                      </div>
                      <h4 className="text-sm font-bold text-slate-900 line-clamp-1">{f.title}</h4>
                      <p className="text-xs text-slate-600 line-clamp-1">{f.content}</p>
                    </div>
                    <Button
                      variant="secondary"
                      size="sm"
                      onClick={() => navigate('/feedback')}
                      className="shrink-0"
                    >
                      Trả lời
                    </Button>
                  </div>
                ))}
              </div>
            )}
          </CardContent>
        </Card>
      </div>

      {/* 5. Bảng Tin Tòa Nhà Mới Phát Hành */}
      <Card>
        <CardHeader className="flex flex-row items-center justify-between pb-3">
          <div>
            <CardTitle>Thông báo tòa nhà gần đây</CardTitle>
            <p className="text-xs text-slate-500">Các thông báo mới phát hành tới cư dân</p>
          </div>
          <Button variant="outline" size="sm" onClick={() => navigate('/announcements')}>
            Tạo thông báo mới
          </Button>
        </CardHeader>
        <CardContent className="p-0">
          {recentNotices.length === 0 ? (
            <div className="p-6 text-center text-slate-500 text-sm font-medium">
              Chưa có thông báo nào được phát hành.
            </div>
          ) : (
            <div className="divide-y divide-slate-100">
              {recentNotices.map((n) => (
                <div key={n.id} className="p-4 hover:bg-slate-50 transition flex items-start justify-between gap-4">
                  <div className="space-y-1">
                    <div className="flex items-center gap-2">
                      <Badge variant={n.targetRoom ? 'info' : 'primary'}>
                        {n.targetRoom ? `Gửi riêng căn ${n.targetRoom}` : 'Toàn tòa nhà'}
                      </Badge>
                      <span className="text-xs text-slate-400">
                        {new Date(n.createdAt).toLocaleDateString('vi-VN')}
                      </span>
                    </div>
                    <h4 className="text-sm font-bold text-slate-900">{n.title}</h4>
                    <p className="text-xs text-slate-600 line-clamp-2 leading-relaxed">{n.content}</p>
                  </div>
                  <Button variant="ghost" size="sm" onClick={() => navigate('/announcements')}>
                    Chi tiết
                  </Button>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
};
