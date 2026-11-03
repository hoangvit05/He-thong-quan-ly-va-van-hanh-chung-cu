// =========================================================================
// TRANG QUẢN LÝ CĂN HỘ VÀ PHÊ DUYỆT CƯ DÂN (RESIDENTS & ROOMS MANAGEMENT)
// Phụ trách: Thành viên Đức (Senior React + TypeScript Frontend Developer)
// Phạm vi: web/src/pages/ResidentsPage.tsx
// Chuẩn hóa: Civic Clarity + Warm Modern Design System (WCAG 2.2 AA)
// =========================================================================

import React, { useState, useEffect, useCallback, useRef } from 'react';
import axiosClient from '../api/axiosClient';
import { API_ENDPOINTS } from '../api/endpoints';
import { ApiEnvelope, getStoredUser } from '../utils/auth';
import { validateResidentForApproval, validateRoomForAssignment } from '../utils/roomValidation';
import {
  Button,
  Card,
  CardHeader,
  CardTitle,
  StatCard,
  Badge,
  Modal,
  ConfirmDialog,
  Pagination,
  LoadingSpinner,
  EmptyState,
  AlertBanner,
} from '../components/common';

// -------------------------------------------------------------------------
// ĐỊNH NGHĨA KIỂU DỮ LIỆU CỤC BỘ (STRICT TYPESCRIPT)
// -------------------------------------------------------------------------

export type RoomStatusType = 'VACANT' | 'OCCUPIED' | 'MAINTENANCE';

export interface RoomItem {
  id: number;
  roomNumber: string;
  floor: number;
  area: number;
  status: RoomStatusType;
  residentCount?: number;
  createdAt?: string;
  updatedAt?: string;
}

export interface ResidentItem {
  id: number;
  username: string;
  fullName: string;
  phone?: string | null;
  email?: string | null;
  role: string;
  roomId?: number | null;
  isApproved: boolean;
  createdAt: string;
  room?: {
    id: number;
    roomNumber: string;
    floor: number;
    area: number;
    status?: string;
  } | null;
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
// COMPONENT CHÍNH: ResidentsPage
// -------------------------------------------------------------------------

export const ResidentsPage: React.FC = () => {
  // Tab điều hướng: 'ROOMS' (Căn hộ) | 'RESIDENTS' (Cư dân)
  const [activeTab, setActiveTab] = useState<'ROOMS' | 'RESIDENTS'>('ROOMS');

  // Chống rò rỉ bộ nhớ & cập nhật state khi unmount
  const isMountedRef = useRef<boolean>(true);
  useEffect(() => {
    isMountedRef.current = true;
    return () => {
      isMountedRef.current = false;
    };
  }, []);

  // Chống Race Condition bằng Request Sequence Counter độc lập cho từng nhóm request
  const roomsReqSeqRef = useRef<number>(0);
  const residentsReqSeqRef = useRef<number>(0);
  const residentsStatsReqSeqRef = useRef<number>(0);

  // -----------------------------------------------------------------------
  // STATE: THỐNG KÊ TỔNG QUAN HỆ THỐNG (ACCURATE REAL COUNTS)
  // -----------------------------------------------------------------------
  const [stats, setStats] = useState<{
    totalRooms: number | null;
    occupiedRooms: number | null;
    vacantRooms: number | null;
    pendingResidents: number | null;
    approvedResidents: number | null;
  }>({
    totalRooms: null,
    occupiedRooms: null,
    vacantRooms: null,
    pendingResidents: null,
    approvedResidents: null,
  });
  const [statsLoading, setStatsLoading] = useState<boolean>(false);
  const [statsError, setStatsError] = useState<string>('');

  // -----------------------------------------------------------------------
  // STATE: QUẢN LÝ CĂN HỘ (ROOMS)
  // -----------------------------------------------------------------------
  const [rooms, setRooms] = useState<RoomItem[]>([]);
  const [roomsLoading, setRoomsLoading] = useState<boolean>(false);
  const [roomsError, setRoomsError] = useState<string>('');
  const [roomsPagination, setRoomsPagination] = useState<PaginationMeta>({
    page: 1,
    limit: 10,
    total: 0,
    totalPages: 1,
  });

  // Bộ lọc căn hộ kèm Debounce tìm kiếm
  const [roomSearchInput, setRoomSearchInput] = useState<string>('');
  const [roomSearchDebounced, setRoomSearchDebounced] = useState<string>('');
  const [roomFloorFilter, setRoomFloorFilter] = useState<string>('');
  const [roomStatusFilter, setRoomStatusFilter] = useState<string>('');

  // Debounce search input cho căn hộ (400ms)
  useEffect(() => {
    const timer = setTimeout(() => {
      setRoomSearchDebounced(roomSearchInput);
    }, 400);
    return () => clearTimeout(timer);
  }, [roomSearchInput]);

  // Modal tạo / sửa căn hộ
  const [isRoomModalOpen, setIsRoomModalOpen] = useState<boolean>(false);
  const [editingRoom, setEditingRoom] = useState<RoomItem | null>(null);
  const [roomFormData, setRoomFormData] = useState({
    roomNumber: '',
    floor: '',
    area: '',
    status: 'VACANT' as RoomStatusType,
  });
  const [roomFormSubmitting, setRoomFormSubmitting] = useState<boolean>(false);
  const [roomFormError, setRoomFormError] = useState<string>('');
  const [roomFormSuccess, setRoomFormSuccess] = useState<string>('');

  // -----------------------------------------------------------------------
  // STATE: QUẢN LÝ CƯ DÂN (RESIDENTS)
  // -----------------------------------------------------------------------
  const [residents, setResidents] = useState<ResidentItem[]>([]);
  const [residentsLoading, setResidentsLoading] = useState<boolean>(false);
  const [residentsError, setResidentsError] = useState<string>('');
  const [residentsApiUnavailable, setResidentsApiUnavailable] = useState<boolean>(false);
  const [residentsPagination, setResidentsPagination] = useState<PaginationMeta>({
    page: 1,
    limit: 10,
    total: 0,
    totalPages: 1,
  });

  // Bộ lọc cư dân kèm Debounce tìm kiếm
  const [residentSearchInput, setResidentSearchInput] = useState<string>('');
  const [residentSearchDebounced, setResidentSearchDebounced] = useState<string>('');
  const [residentApprovalFilter, setResidentApprovalFilter] = useState<string>('ALL'); // 'ALL' | 'PENDING' | 'APPROVED'
  const [residentRoomFilter, setResidentRoomFilter] = useState<string>('');

  // Debounce search input cho cư dân (400ms)
  useEffect(() => {
    const timer = setTimeout(() => {
      setResidentSearchDebounced(residentSearchInput);
    }, 400);
    return () => clearTimeout(timer);
  }, [residentSearchInput]);

  // Thao tác duyệt cư dân
  const [approvingResident, setApprovingResident] = useState<ResidentItem | null>(null);
  const [isConfirmApproveOpen, setIsConfirmApproveOpen] = useState<boolean>(false);
  const [approvingLoading, setApprovingLoading] = useState<boolean>(false);
  const [actionNotice, setActionNotice] = useState<{ type: 'success' | 'error'; text: string } | null>(null);

  // Modal gán / đổi căn hộ cho cư dân (BUG-05 Room Assignment)
  const [isAssignModalOpen, setIsAssignModalOpen] = useState<boolean>(false);
  const [assigningResident, setAssigningResident] = useState<ResidentItem | null>(null);
  const [selectedAssignRoomId, setSelectedAssignRoomId] = useState<string>('');
  const [assignRoomsList, setAssignRoomsList] = useState<RoomItem[]>([]);
  const [assignLoadingRooms, setAssignLoadingRooms] = useState<boolean>(false);
  const [assignSubmitting, setAssignSubmitting] = useState<boolean>(false);
  const [assignError, setAssignError] = useState<string>('');
  const [assignSuccess, setAssignSuccess] = useState<string>('');

  // -----------------------------------------------------------------------
  // TIỆN ÍCH TRÍCH XUẤT LỖI TỪ API RESPONSE
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
  // API: CẬP NHẬT THỐNG KÊ THỰC TẾ
  // -----------------------------------------------------------------------
  const fetchOverviewStats = useCallback(async () => {
    const seq = ++residentsStatsReqSeqRef.current;
    setStatsLoading(true);
    setStatsError('');
    try {
      const [totalRes, vacantRes, occupiedRes] = await Promise.allSettled([
        axiosClient.get('/api/rooms?page=1&limit=1'),
        axiosClient.get('/api/rooms?status=VACANT&page=1&limit=1'),
        axiosClient.get('/api/rooms?status=OCCUPIED&page=1&limit=1'),
      ]);

      if (seq !== residentsStatsReqSeqRef.current || !isMountedRef.current) {
        return;
      }

      let hasStatsFailure = false;
      const parseSafeTotal = (res: PromiseSettledResult<unknown>): number | null => {
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
        hasStatsFailure = true;
        return null;
      };

      const totalR = parseSafeTotal(totalRes);
      const vacantR = parseSafeTotal(vacantRes);
      const occupiedR = parseSafeTotal(occupiedRes);

      let pendingR: number | null = null;
      let approvedR: number | null = null;
      try {
        const [pendingRes, approvedRes] = await Promise.allSettled([
          axiosClient.get(`${API_ENDPOINTS.AUTH.RESIDENTS}?isApproved=false&page=1&limit=1`),
          axiosClient.get(`${API_ENDPOINTS.AUTH.RESIDENTS}?isApproved=true&page=1&limit=1`),
        ]);

        if (seq !== residentsStatsReqSeqRef.current || !isMountedRef.current) {
          return;
        }

        pendingR = parseSafeTotal(pendingRes);
        approvedR = parseSafeTotal(approvedRes);
      } catch {
        hasStatsFailure = true;
      }

      if (seq === residentsStatsReqSeqRef.current && isMountedRef.current) {
        setStats({
          totalRooms: totalR,
          vacantRooms: vacantR,
          occupiedRooms: occupiedR,
          pendingResidents: pendingR,
          approvedResidents: approvedR,
        });
        if (hasStatsFailure) {
          setStatsError('Không thể nạp đầy đủ số liệu thống kê cư dân từ máy chủ. Vui lòng thử lại.');
        } else {
          setStatsError('');
        }
      }
    } catch (e) {
      console.error('[ResidentsPage] Lỗi thống kê:', e);
      if (seq === residentsStatsReqSeqRef.current && isMountedRef.current) {
        setStatsError('Không thể nạp số liệu thống kê từ máy chủ.');
      }
    } finally {
      if (seq === residentsStatsReqSeqRef.current && isMountedRef.current) {
        setStatsLoading(false);
      }
    }
  }, []);

  // -----------------------------------------------------------------------
  // API: TẢI DANH MỤC CĂN HỘ
  // -----------------------------------------------------------------------
  const fetchRooms = useCallback(
    async (targetPage = 1) => {
      const currentSeq = ++roomsReqSeqRef.current;
      setRoomsLoading(true);
      setRoomsError('');

      try {
        const queryParams = new URLSearchParams();
        queryParams.set('page', String(targetPage));
        queryParams.set('limit', String(roomsPagination.limit));

        if (roomSearchDebounced.trim()) {
          queryParams.set('search', roomSearchDebounced.trim());
        }
        if (roomFloorFilter !== '') {
          queryParams.set('floor', roomFloorFilter);
        }
        if (roomStatusFilter !== '') {
          queryParams.set('status', roomStatusFilter);
        }

        const res = (await axiosClient.get(`/api/rooms?${queryParams.toString()}`)) as unknown as
          | ApiEnvelope<RoomItem[]>
          | { data: RoomItem[]; pagination?: PaginationMeta };

        if (currentSeq !== roomsReqSeqRef.current || !isMountedRef.current) {
          return;
        }

        let list: RoomItem[] = [];
        let meta: PaginationMeta = {
          page: targetPage,
          limit: roomsPagination.limit,
          total: 0,
          totalPages: 1,
        };

        if (res && typeof res === 'object') {
          if ('data' in res && Array.isArray(res.data)) {
            list = res.data;
          }
          if ('pagination' in res && res.pagination) {
            meta = res.pagination;
          }
        }

        setRooms(list);
        setRoomsPagination(meta);
      } catch (err: unknown) {
        if (currentSeq !== roomsReqSeqRef.current || !isMountedRef.current) {
          return;
        }
        const msg = parseErrorMessage(err, 'Không thể tải danh mục căn hộ từ máy chủ.');
        setRoomsError(msg);
        setRooms([]);
      } finally {
        if (currentSeq === roomsReqSeqRef.current && isMountedRef.current) {
          setRoomsLoading(false);
        }
      }
    },
    [roomSearchDebounced, roomFloorFilter, roomStatusFilter, roomsPagination.limit]
  );

  // -----------------------------------------------------------------------
  // API: TẢI DANH SÁCH CƯ DÂN
  // -----------------------------------------------------------------------
  const fetchResidents = useCallback(
    async (targetPage = 1) => {
      const currentSeq = ++residentsReqSeqRef.current;
      setResidentsLoading(true);
      setResidentsError('');
      setResidentsApiUnavailable(false);

      try {
        const queryParams = new URLSearchParams();
        queryParams.set('page', String(targetPage));
        queryParams.set('limit', String(residentsPagination.limit));

        if (residentSearchDebounced.trim()) {
          queryParams.set('search', residentSearchDebounced.trim());
        }
        if (residentRoomFilter !== '') {
          queryParams.set('roomId', residentRoomFilter);
        }
        if (residentApprovalFilter === 'PENDING') {
          queryParams.set('isApproved', 'false');
        } else if (residentApprovalFilter === 'APPROVED') {
          queryParams.set('isApproved', 'true');
        }

        let res: unknown;
        let usedFallback = false;

        try {
          res = await axiosClient.get(`${API_ENDPOINTS.AUTH.RESIDENTS}?${queryParams.toString()}`);
        } catch (primaryErr: unknown) {
          const apiErr = primaryErr as ApiErrorShape;
          if (apiErr?.status === 404 || apiErr?.status === 501) {
            const currentUser = getStoredUser();
            if (currentUser?.role === 'ADMIN') {
              usedFallback = true;
              const fallbackParams = new URLSearchParams();
              fallbackParams.set('role', 'RESIDENT');
              fallbackParams.set('page', String(targetPage));
              fallbackParams.set('limit', String(residentsPagination.limit));
              if (residentSearchDebounced.trim()) {
                fallbackParams.set('search', residentSearchDebounced.trim());
              }
              res = await axiosClient.get(`${API_ENDPOINTS.AUTH.ADMIN_USERS}?${fallbackParams.toString()}`);
            } else {
              if (isMountedRef.current) {
                setResidentsApiUnavailable(true);
                setResidentsError(
                  'API danh sách cư dân (/api/apartments/residents) chưa khả dụng trên máy chủ (HTTP ' +
                    (apiErr?.status || 404) +
                    '). Phân quyền Ban quản lý không hỗ trợ nạp cư dân qua API quản trị nội bộ.'
                );
                setResidents([]);
              }
              return;
            }
          } else {
            throw primaryErr;
          }
        }

        if (currentSeq !== residentsReqSeqRef.current || !isMountedRef.current) {
          return;
        }

        let list: ResidentItem[] = [];
        let meta: PaginationMeta = {
          page: targetPage,
          limit: residentsPagination.limit,
          total: 0,
          totalPages: 1,
        };

        if (res && typeof res === 'object') {
          const envelope = res as ApiEnvelope<ResidentItem[]>;
          if (Array.isArray(envelope.data)) {
            list = envelope.data;
          }
          if (envelope.pagination) {
            meta = envelope.pagination;
          }
        }

        if (usedFallback) {
          list = list.filter((item) => item.role === 'RESIDENT');
          if (residentApprovalFilter === 'PENDING') {
            list = list.filter((item) => item.isApproved === false);
          } else if (residentApprovalFilter === 'APPROVED') {
            list = list.filter((item) => item.isApproved === true);
          }
          if (residentRoomFilter !== '') {
            const rId = Number(residentRoomFilter);
            list = list.filter((item) => item.roomId === rId);
          }
        }

        setResidents(list);
        setResidentsPagination(meta);
      } catch (err: unknown) {
        if (currentSeq !== residentsReqSeqRef.current || !isMountedRef.current) {
          return;
        }
        const msg = parseErrorMessage(err, 'Không thể tải danh sách cư dân từ máy chủ.');
        setResidentsError(msg);
        setResidents([]);
      } finally {
        if (currentSeq === residentsReqSeqRef.current && isMountedRef.current) {
          setResidentsLoading(false);
        }
      }
    },
    [residentSearchDebounced, residentApprovalFilter, residentRoomFilter, residentsPagination.limit]
  );

  useEffect(() => {
    fetchRooms(1);
  }, [fetchRooms]);

  useEffect(() => {
    fetchResidents(1);
  }, [fetchResidents]);

  useEffect(() => {
    fetchOverviewStats();
  }, [fetchOverviewStats]);

  // -----------------------------------------------------------------------
  // XỬ LÝ PHÊ DUYỆT CƯ DÂN (BUG-05 PREFLIGHT)
  // -----------------------------------------------------------------------
  const handleOpenApproveConfirm = (resident: ResidentItem) => {
    if (!resident.id || resident.isApproved) return;
    const preflight = validateResidentForApproval(resident);
    if (!preflight.canApprove) {
      setActionNotice({
        type: 'error',
        text: preflight.reason || 'Điều kiện căn hộ không hợp lệ để phê duyệt.',
      });
      return;
    }
    setApprovingResident(resident);
    setIsConfirmApproveOpen(true);
  };

  const handleExecuteApprove = async () => {
    if (!approvingResident) return;

    setApprovingLoading(true);
    setActionNotice(null);

    try {
      try {
        await axiosClient.put(API_ENDPOINTS.AUTH.APPROVE_RESIDENT(approvingResident.id));
      } catch (primaryErr: unknown) {
        const apiErr = primaryErr as ApiErrorShape;
        if (apiErr?.status === 404 || apiErr?.status === 501) {
          await axiosClient.put(`/api/admin/users/${approvingResident.id}/approve`);
        } else {
          throw primaryErr;
        }
      }

      if (isMountedRef.current) {
        setResidents((prev) =>
          prev.map((r) =>
            r.id === approvingResident.id
              ? {
                  ...r,
                  isApproved: true,
                  room: r.room ? { ...r.room, status: 'OCCUPIED' } : r.room,
                }
              : r
          )
        );

        setActionNotice({
          type: 'success',
          text: `Đã phê duyệt thành công cư dân: ${approvingResident.fullName}`,
        });

        setIsConfirmApproveOpen(false);
        setApprovingResident(null);
        fetchRooms(roomsPagination.page);
        fetchOverviewStats();
      }
    } catch (err: unknown) {
      if (isMountedRef.current) {
        const msg = parseErrorMessage(err, 'Lỗi khi phê duyệt tài khoản cư dân.');
        setActionNotice({
          type: 'error',
          text: msg,
        });
      }
    } finally {
      if (isMountedRef.current) {
        setApprovingLoading(false);
      }
    }
  };

  // -----------------------------------------------------------------------
  // XỬ LÝ GÁN CĂN HỘ CHO CƯ DÂN
  // -----------------------------------------------------------------------
  const handleOpenAssignModal = async (resident: ResidentItem) => {
    setAssigningResident(resident);
    setSelectedAssignRoomId(resident.roomId ? String(resident.roomId) : '');
    setAssignError('');
    setAssignSuccess('');
    setIsAssignModalOpen(true);
    setAssignLoadingRooms(true);

    try {
      const res = (await axiosClient.get(
        `${API_ENDPOINTS.ROOMS.LIST}?limit=100`
      )) as ApiEnvelope<RoomItem[]>;
      if (res && Array.isArray(res.data)) {
        setAssignRoomsList(res.data);
      } else {
        setAssignRoomsList(rooms);
      }
    } catch {
      setAssignRoomsList(rooms);
    } finally {
      if (isMountedRef.current) {
        setAssignLoadingRooms(false);
      }
    }
  };

  const handleSubmitAssignRoom = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!assigningResident) return;

    if (!selectedAssignRoomId) {
      setAssignError('Vui lòng chọn căn hộ để gán cho cư dân.');
      return;
    }

    const targetRoomId = Number(selectedAssignRoomId);
    const targetRoom = assignRoomsList.find((r) => r.id === targetRoomId);
    if (targetRoom) {
      const check = validateRoomForAssignment(targetRoom);
      if (!check.canAssign) {
        setAssignError(check.reason || 'Căn hộ không hợp lệ để gán.');
        return;
      }
    }

    setAssignSubmitting(true);
    setAssignError('');
    setAssignSuccess('');

    try {
      await axiosClient.put(API_ENDPOINTS.AUTH.ASSIGN_ROOM(assigningResident.id), {
        roomId: targetRoomId,
      });

      if (isMountedRef.current) {
        setAssignSuccess(`Gán căn hộ thành công cho cư dân: ${assigningResident.fullName}`);
        await fetchResidents(residentsPagination.page);
        await fetchRooms(roomsPagination.page);
        await fetchOverviewStats();

        setTimeout(() => {
          if (isMountedRef.current) {
            setIsAssignModalOpen(false);
            setAssignSuccess('');
            setAssigningResident(null);
          }
        }, 800);
      }
    } catch (err: unknown) {
      if (isMountedRef.current) {
        const msg = parseErrorMessage(err, 'Lỗi khi gán căn hộ cho cư dân.');
        setAssignError(msg);
      }
    } finally {
      if (isMountedRef.current) {
        setAssignSubmitting(false);
      }
    }
  };

  // -----------------------------------------------------------------------
  // XỬ LÝ MODAL CĂN HỘ
  // -----------------------------------------------------------------------
  const handleOpenCreateRoomModal = () => {
    setEditingRoom(null);
    setRoomFormData({
      roomNumber: '',
      floor: '1',
      area: '50',
      status: 'VACANT',
    });
    setRoomFormError('');
    setRoomFormSuccess('');
    setIsRoomModalOpen(true);
  };

  const handleOpenEditRoomModal = (room: RoomItem) => {
    setEditingRoom(room);
    setRoomFormData({
      roomNumber: room.roomNumber,
      floor: String(room.floor),
      area: String(room.area),
      status: room.status,
    });
    setRoomFormError('');
    setRoomFormSuccess('');
    setIsRoomModalOpen(true);
  };

  const handleSubmitRoomForm = async (e: React.FormEvent) => {
    e.preventDefault();
    setRoomFormError('');
    setRoomFormSuccess('');

    if (!roomFormData.roomNumber.trim()) {
      setRoomFormError('Vui lòng nhập số căn hộ (ví dụ: A-101).');
      return;
    }

    const floorNum = parseInt(roomFormData.floor, 10);
    if (isNaN(floorNum) || floorNum <= 0) {
      setRoomFormError('Tầng phải là số nguyên dương.');
      return;
    }

    const areaNum = parseFloat(roomFormData.area);
    if (isNaN(areaNum) || areaNum <= 0) {
      setRoomFormError('Diện tích phải lớn hơn 0 m².');
      return;
    }

    setRoomFormSubmitting(true);
    try {
      if (editingRoom) {
        await axiosClient.put(API_ENDPOINTS.ROOMS.UPDATE(editingRoom.id), {
          roomNumber: roomFormData.roomNumber.trim(),
          floor: floorNum,
          area: areaNum,
          status: roomFormData.status,
        });
        setRoomFormSuccess(`Cập nhật căn hộ [${roomFormData.roomNumber}] thành công!`);
      } else {
        await axiosClient.post(API_ENDPOINTS.ROOMS.CREATE, {
          roomNumber: roomFormData.roomNumber.trim(),
          floor: floorNum,
          area: areaNum,
          status: roomFormData.status,
        });
        setRoomFormSuccess(`Tạo mới căn hộ [${roomFormData.roomNumber}] thành công!`);
      }

      await fetchRooms(roomsPagination.page);
      await fetchOverviewStats();

      setTimeout(() => {
        if (isMountedRef.current) {
          setIsRoomModalOpen(false);
          setRoomFormSuccess('');
        }
      }, 700);
    } catch (err: unknown) {
      const msg = parseErrorMessage(err, 'Lỗi khi lưu thông tin căn hộ.');
      setRoomFormError(msg);
    } finally {
      if (isMountedRef.current) {
        setRoomFormSubmitting(false);
      }
    }
  };

  // Helper render badge trạng thái phòng
  const renderRoomStatusBadge = (status: RoomStatusType) => {
    switch (status) {
      case 'OCCUPIED':
        return <Badge variant="success" dot>Đang ở</Badge>;
      case 'VACANT':
        return <Badge variant="info" dot>Phòng trống</Badge>;
      case 'MAINTENANCE':
        return <Badge variant="warning" dot>Bảo trì</Badge>;
      default:
        return <Badge variant="neutral">{status}</Badge>;
    }
  };

  const occupancyPercent =
    stats.totalRooms && stats.totalRooms > 0
      ? Math.round(((stats.occupiedRooms || 0) / stats.totalRooms) * 100)
      : 0;

  return (
    <div className="space-y-6">
      {/* 1. Header Trang & Bộ Chuyển Tab */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <h2 className="text-xl md:text-2xl font-black text-slate-900 tracking-tight">
            Quản Lý Căn Hộ & Phê Duyệt Cư Dân
          </h2>
          <p className="text-xs md:text-sm text-slate-500 font-medium mt-0.5">
            Theo dõi danh mục căn hộ, chỉ số sử dụng và duyệt thành viên mới vào tòa nhà.
          </p>
        </div>

        {/* Nút thao tác nhanh */}
        <div className="flex items-center gap-2">
          {activeTab === 'ROOMS' && (
            <Button
              variant="primary"
              size="md"
              onClick={handleOpenCreateRoomModal}
              icon={
                <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M12 4v16m8-8H4" />
                </svg>
              }
            >
              Thêm căn hộ mới
            </Button>
          )}
          <Button
            variant="outline"
            size="md"
            onClick={() => {
              fetchOverviewStats();
              if (activeTab === 'ROOMS') fetchRooms(roomsPagination.page);
              else fetchResidents(residentsPagination.page);
            }}
            isLoading={roomsLoading || residentsLoading || statsLoading}
            icon={
              <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
              </svg>
            }
          >
            Làm mới
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

      {/* 2. Thẻ KPI Thống Kê Tổng Quan */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        <StatCard
          title="Tổng số căn hộ"
          value={stats.totalRooms ?? '-'}
          subtitle={`Phòng trống: ${stats.vacantRooms ?? 0} căn`}
          colorScheme="indigo"
          badge={<Badge variant="primary">{occupancyPercent}% đã ở</Badge>}
        />
        <StatCard
          title="Căn hộ đang ở"
          value={stats.occupiedRooms ?? '-'}
          subtitle="Đang sinh sống thực tế"
          colorScheme="emerald"
          badge={<Badge variant="success">Hoạt động</Badge>}
        />
        <StatCard
          title="Căn hộ bảo trì"
          value={
            stats.totalRooms !== null && stats.occupiedRooms !== null && stats.vacantRooms !== null
              ? Math.max(0, stats.totalRooms - stats.occupiedRooms - stats.vacantRooms)
              : '-'
          }
          subtitle="Tạm ngưng đón cư dân"
          colorScheme="amber"
          badge={<Badge variant="warning">Bảo trì</Badge>}
        />
        <StatCard
          title="Cư dân chờ duyệt"
          value={stats.pendingResidents ?? '-'}
          subtitle={`Đã duyệt: ${stats.approvedResidents ?? 0} người`}
          colorScheme={stats.pendingResidents && stats.pendingResidents > 0 ? 'rose' : 'emerald'}
          badge={
            stats.pendingResidents && stats.pendingResidents > 0 ? (
              <Badge variant="danger" dot>Cần xử lý</Badge>
            ) : (
              <Badge variant="success">Đã duyệt hết</Badge>
            )
          }
          onClick={() => setActiveTab('RESIDENTS')}
        />
      </div>

      {/* 3. Thanh Tab Điều Hướng */}
      <div className="flex border-b border-slate-200">
        <button
          type="button"
          onClick={() => setActiveTab('ROOMS')}
          className={`flex items-center gap-2 py-3 px-5 text-sm font-bold border-b-2 transition-all min-h-[44px] ${
            activeTab === 'ROOMS'
              ? 'border-indigo-600 text-indigo-600'
              : 'border-transparent text-slate-500 hover:text-slate-800'
          }`}
        >
          <span>🏢 Danh mục Căn hộ ({roomsPagination.total})</span>
        </button>
        <button
          type="button"
          onClick={() => setActiveTab('RESIDENTS')}
          className={`flex items-center gap-2 py-3 px-5 text-sm font-bold border-b-2 transition-all min-h-[44px] ${
            activeTab === 'RESIDENTS'
              ? 'border-indigo-600 text-indigo-600'
              : 'border-transparent text-slate-500 hover:text-slate-800'
          }`}
        >
          <span>👥 Cư dân Tòa nhà ({residentsPagination.total})</span>
          {stats.pendingResidents !== null && stats.pendingResidents > 0 && (
            <span className="w-5 h-5 rounded-full bg-rose-500 text-white text-[11px] font-black flex items-center justify-center">
              {stats.pendingResidents}
            </span>
          )}
        </button>
      </div>

      {/* 4. Nội Dung Tab 1: CĂN HỘ (ROOMS) */}
      {activeTab === 'ROOMS' && (
        <div className="space-y-4">
          {/* Thanh tìm kiếm & lọc căn hộ */}
          <div className="bg-white p-4 rounded-xl border border-slate-200 shadow-sm flex flex-col md:flex-row items-stretch md:items-center gap-3">
            <div className="relative flex-1">
              <input
                type="text"
                value={roomSearchInput}
                onChange={(e) => setRoomSearchInput(e.target.value)}
                placeholder="Tìm theo số phòng (ví dụ: 101, A-202)..."
                className="w-full pl-10 pr-4 py-2.5 h-11 text-sm bg-slate-50 border border-slate-300 rounded-lg outline-none focus:bg-white focus:ring-2 focus:ring-indigo-500 transition"
              />
              <svg className="w-5 h-5 absolute left-3 top-3 text-slate-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
              </svg>
            </div>

            <select
              value={roomFloorFilter}
              onChange={(e) => setRoomFloorFilter(e.target.value)}
              className="px-3 py-2 h-11 text-sm font-medium bg-slate-50 border border-slate-300 rounded-lg outline-none focus:bg-white focus:ring-2 focus:ring-indigo-500 text-slate-700"
            >
              <option value="">-- Tất cả tầng --</option>
              {Array.from({ length: 30 }, (_, i) => i + 1).map((f) => (
                <option key={f} value={String(f)}>Tầng {f}</option>
              ))}
            </select>

            <select
              value={roomStatusFilter}
              onChange={(e) => setRoomStatusFilter(e.target.value)}
              className="px-3 py-2 h-11 text-sm font-medium bg-slate-50 border border-slate-300 rounded-lg outline-none focus:bg-white focus:ring-2 focus:ring-indigo-500 text-slate-700"
            >
              <option value="">-- Tất cả trạng thái --</option>
              <option value="OCCUPIED">Đang có người ở</option>
              <option value="VACANT">Phòng trống</option>
              <option value="MAINTENANCE">Đang bảo trì</option>
            </select>

            {(roomSearchInput || roomFloorFilter || roomStatusFilter) && (
              <Button
                variant="ghost"
                size="md"
                onClick={() => {
                  setRoomSearchInput('');
                  setRoomFloorFilter('');
                  setRoomStatusFilter('');
                }}
              >
                Đặt lại
              </Button>
            )}
          </div>

          {roomsError && <AlertBanner type="error" message={roomsError} />}

          {/* Bảng danh sách căn hộ */}
          {roomsLoading ? (
            <LoadingSpinner text="Đang tải danh mục căn hộ..." />
          ) : rooms.length === 0 ? (
            <EmptyState
              title="Không tìm thấy căn hộ"
              description="Không có căn hộ nào phù hợp với điều kiện tìm kiếm hiện tại."
              actionLabel="Tạo căn hộ mới"
              onAction={handleOpenCreateRoomModal}
            />
          ) : (
            <Card>
              <div className="overflow-x-auto">
                <table className="w-full text-left border-collapse text-sm">
                  <thead>
                    <tr className="border-b border-slate-200 bg-slate-50/80 text-xs font-bold uppercase text-slate-600">
                      <th className="px-5 py-4">Số Căn Hộ</th>
                      <th className="px-5 py-4">Tầng</th>
                      <th className="px-5 py-4">Diện Tích</th>
                      <th className="px-5 py-4">Trạng Thái</th>
                      <th className="px-5 py-4">Số Cư Dân</th>
                      <th className="px-5 py-4 text-right">Thao Tác</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100 text-slate-700">
                    {rooms.map((room) => (
                      <tr key={room.id} className="hover:bg-slate-50/80 transition-colors">
                        <td className="px-5 py-4 font-black text-slate-900">{room.roomNumber}</td>
                        <td className="px-5 py-4">Tầng {room.floor}</td>
                        <td className="px-5 py-4">{room.area} m²</td>
                        <td className="px-5 py-4">{renderRoomStatusBadge(room.status)}</td>
                        <td className="px-5 py-4">
                          <span className="font-semibold text-slate-800">{room.residentCount ?? 0}</span> người
                        </td>
                        <td className="px-5 py-4 text-right">
                          <Button
                            variant="secondary"
                            size="sm"
                            onClick={() => handleOpenEditRoomModal(room)}
                          >
                            Chỉnh sửa
                          </Button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>

              {/* Phân trang căn hộ */}
              <div className="p-4 border-t border-slate-100">
                <Pagination
                  currentPage={roomsPagination.page}
                  totalPages={roomsPagination.totalPages}
                  totalRecords={roomsPagination.total}
                  onPageChange={(page) => fetchRooms(page)}
                  isLoading={roomsLoading}
                />
              </div>
            </Card>
          )}
        </div>
      )}

      {/* 5. Nội Dung Tab 2: CƯ DÂN (RESIDENTS) */}
      {activeTab === 'RESIDENTS' && (
        <div className="space-y-4">
          {/* Thanh tìm kiếm & lọc cư dân */}
          <div className="bg-white p-4 rounded-xl border border-slate-200 shadow-sm flex flex-col md:flex-row items-stretch md:items-center gap-3">
            <div className="relative flex-1">
              <input
                type="text"
                value={residentSearchInput}
                onChange={(e) => setResidentSearchInput(e.target.value)}
                placeholder="Tìm theo họ tên, username, số điện thoại..."
                className="w-full pl-10 pr-4 py-2.5 h-11 text-sm bg-slate-50 border border-slate-300 rounded-lg outline-none focus:bg-white focus:ring-2 focus:ring-indigo-500 transition"
              />
              <svg className="w-5 h-5 absolute left-3 top-3 text-slate-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
              </svg>
            </div>

            <select
              value={residentApprovalFilter}
              onChange={(e) => setResidentApprovalFilter(e.target.value)}
              className="px-3 py-2 h-11 text-sm font-medium bg-slate-50 border border-slate-300 rounded-lg outline-none focus:bg-white focus:ring-2 focus:ring-indigo-500 text-slate-700"
            >
              <option value="ALL">-- Tất cả duyệt --</option>
              <option value="PENDING">Chờ phê duyệt</option>
              <option value="APPROVED">Đã phê duyệt</option>
            </select>

            {(residentSearchInput || residentApprovalFilter !== 'ALL' || residentRoomFilter) && (
              <Button
                variant="ghost"
                size="md"
                onClick={() => {
                  setResidentSearchInput('');
                  setResidentApprovalFilter('ALL');
                  setResidentRoomFilter('');
                }}
              >
                Đặt lại
              </Button>
            )}
          </div>

          {residentsError && <AlertBanner type="error" message={residentsError} />}

          {/* Bảng danh sách cư dân */}
          {residentsLoading ? (
            <LoadingSpinner text="Đang nạp danh sách cư dân..." />
          ) : residents.length === 0 ? (
            <EmptyState
              title="Không có cư dân nào"
              description="Không tìm thấy bản ghi cư dân nào thỏa mãn bộ lọc hiện tại."
            />
          ) : (
            <Card>
              <div className="overflow-x-auto">
                <table className="w-full text-left border-collapse text-sm">
                  <thead>
                    <tr className="border-b border-slate-200 bg-slate-50/80 text-xs font-bold uppercase text-slate-600">
                      <th className="px-5 py-4">Họ và Tên</th>
                      <th className="px-5 py-4">Tên Đăng Nhập</th>
                      <th className="px-5 py-4">Căn Hộ</th>
                      <th className="px-5 py-4">Số Điện Thoại</th>
                      <th className="px-5 py-4">Trạng Thái</th>
                      <th className="px-5 py-4">Ngày Đăng Ký</th>
                      <th className="px-5 py-4 text-right">Hành Động</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100 text-slate-700">
                    {residents.map((resident) => {
                      const roomLabel = resident.room
                        ? `Căn ${resident.room.roomNumber}`
                        : resident.roomId
                        ? `Phòng #${resident.roomId}`
                        : 'Chưa gán phòng';

                      return (
                        <tr key={resident.id} className="hover:bg-slate-50/80 transition-colors">
                          <td className="px-5 py-4 font-bold text-slate-900">{resident.fullName}</td>
                          <td className="px-5 py-4 font-mono text-xs text-slate-500">{resident.username}</td>
                          <td className="px-5 py-4">
                            <Badge variant={resident.room ? 'primary' : 'warning'}>
                              {roomLabel}
                            </Badge>
                          </td>
                          <td className="px-5 py-4">{resident.phone || '-'}</td>
                          <td className="px-5 py-4">
                            {resident.isApproved ? (
                              <Badge variant="success" dot>Đã duyệt</Badge>
                            ) : (
                              <Badge variant="danger" dot>Chờ duyệt</Badge>
                            )}
                          </td>
                          <td className="px-5 py-4 text-xs text-slate-500">
                            {resident.createdAt ? new Date(resident.createdAt).toLocaleDateString('vi-VN') : '-'}
                          </td>
                          <td className="px-5 py-4 text-right">
                            <div className="flex items-center justify-end gap-2">
                              {!resident.isApproved && (
                                <Button
                                  variant="success"
                                  size="sm"
                                  onClick={() => handleOpenApproveConfirm(resident)}
                                >
                                  Phê duyệt
                                </Button>
                              )}
                              <Button
                                variant="secondary"
                                size="sm"
                                onClick={() => handleOpenAssignModal(resident)}
                              >
                                {resident.roomId ? 'Đổi phòng' : 'Gán phòng'}
                              </Button>
                            </div>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>

              {/* Phân trang cư dân */}
              <div className="p-4 border-t border-slate-100">
                <Pagination
                  currentPage={residentsPagination.page}
                  totalPages={residentsPagination.totalPages}
                  totalRecords={residentsPagination.total}
                  onPageChange={(page) => fetchResidents(page)}
                  isLoading={residentsLoading}
                />
              </div>
            </Card>
          )}
        </div>
      )}

      {/* 6. MODAL TẠO / SỬA CĂN HỘ */}
      <Modal
        isOpen={isRoomModalOpen}
        onClose={() => !roomFormSubmitting && setIsRoomModalOpen(false)}
        title={editingRoom ? `Cập Nhật Căn Hộ: ${editingRoom.roomNumber}` : 'Tạo Căn Hộ Mới'}
        description="Điền đầy đủ các thông số kỹ thuật của căn hộ vào hệ thống tòa nhà."
        maxWidth="md"
        footer={
          <>
            <Button
              variant="secondary"
              onClick={() => setIsRoomModalOpen(false)}
              disabled={roomFormSubmitting}
            >
              Hủy bỏ
            </Button>
            <Button
              variant="primary"
              onClick={handleSubmitRoomForm}
              isLoading={roomFormSubmitting}
            >
              {editingRoom ? 'Lưu cập nhật' : 'Tạo mới'}
            </Button>
          </>
        }
      >
        <form onSubmit={handleSubmitRoomForm} className="space-y-4">
          {roomFormError && <AlertBanner type="error" message={roomFormError} />}
          {roomFormSuccess && <AlertBanner type="success" message={roomFormSuccess} />}

          <div>
            <label className="block text-xs font-bold uppercase text-slate-600 mb-1">
              Số căn hộ <span className="text-rose-500">*</span>
            </label>
            <input
              type="text"
              required
              value={roomFormData.roomNumber}
              onChange={(e) => setRoomFormData({ ...roomFormData, roomNumber: e.target.value })}
              placeholder="Ví dụ: 101, A-202, B-1205"
              className="w-full px-3 py-2.5 h-11 border border-slate-300 rounded-lg text-sm outline-none focus:ring-2 focus:ring-indigo-500"
            />
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-xs font-bold uppercase text-slate-600 mb-1">
                Tầng số <span className="text-rose-500">*</span>
              </label>
              <input
                type="number"
                min="1"
                required
                value={roomFormData.floor}
                onChange={(e) => setRoomFormData({ ...roomFormData, floor: e.target.value })}
                className="w-full px-3 py-2.5 h-11 border border-slate-300 rounded-lg text-sm outline-none focus:ring-2 focus:ring-indigo-500"
              />
            </div>

            <div>
              <label className="block text-xs font-bold uppercase text-slate-600 mb-1">
                Diện tích (m²) <span className="text-rose-500">*</span>
              </label>
              <input
                type="number"
                step="0.1"
                min="1"
                required
                value={roomFormData.area}
                onChange={(e) => setRoomFormData({ ...roomFormData, area: e.target.value })}
                className="w-full px-3 py-2.5 h-11 border border-slate-300 rounded-lg text-sm outline-none focus:ring-2 focus:ring-indigo-500"
              />
            </div>
          </div>

          <div>
            <label className="block text-xs font-bold uppercase text-slate-600 mb-1">
              Trạng thái căn hộ
            </label>
            <select
              value={roomFormData.status}
              onChange={(e) =>
                setRoomFormData({ ...roomFormData, status: e.target.value as RoomStatusType })
              }
              className="w-full px-3 py-2.5 h-11 border border-slate-300 rounded-lg text-sm outline-none focus:ring-2 focus:ring-indigo-500 bg-white"
            >
              <option value="VACANT">Phòng trống (VACANT)</option>
              <option value="OCCUPIED">Đang có người ở (OCCUPIED)</option>
              <option value="MAINTENANCE">Đang bảo trì (MAINTENANCE)</option>
            </select>
          </div>
        </form>
      </Modal>

      {/* 7. MODAL GÁN / ĐỔI CĂN HỘ CHO CƯ DÂN */}
      <Modal
        isOpen={isAssignModalOpen}
        onClose={() => !assignSubmitting && setIsAssignModalOpen(false)}
        title="Gán Căn Hộ Cho Cư Dân"
        description={
          assigningResident
            ? `Cư dân: ${assigningResident.fullName} (${assigningResident.username})`
            : ''
        }
        maxWidth="md"
        footer={
          <>
            <Button
              variant="secondary"
              onClick={() => setIsAssignModalOpen(false)}
              disabled={assignSubmitting}
            >
              Đóng
            </Button>
            <Button
              variant="primary"
              onClick={handleSubmitAssignRoom}
              isLoading={assignSubmitting}
            >
              Xác nhận gán phòng
            </Button>
          </>
        }
      >
        <form onSubmit={handleSubmitAssignRoom} className="space-y-4">
          {assignError && <AlertBanner type="error" message={assignError} />}
          {assignSuccess && <AlertBanner type="success" message={assignSuccess} />}

          <div>
            <label className="block text-xs font-bold uppercase text-slate-600 mb-1">
              Chọn Căn Hộ Đích <span className="text-rose-500">*</span>
            </label>
            {assignLoadingRooms ? (
              <LoadingSpinner text="Đang nạp danh sách phòng..." />
            ) : (
              <select
                required
                value={selectedAssignRoomId}
                onChange={(e) => setSelectedAssignRoomId(e.target.value)}
                className="w-full px-3 py-2.5 h-11 border border-slate-300 rounded-lg text-sm outline-none focus:ring-2 focus:ring-indigo-500 bg-white"
              >
                <option value="">-- Chọn căn hộ --</option>
                {assignRoomsList.map((r) => {
                  const isMaintenance = r.status === 'MAINTENANCE';
                  const label = `Căn ${r.roomNumber} (Tầng ${r.floor}, ${r.area} m²) - ${
                    r.status === 'OCCUPIED'
                      ? 'Đang có người ở'
                      : isMaintenance
                      ? 'Đang bảo trì (Không gán)'
                      : 'Trống'
                  }`;

                  return (
                    <option key={r.id} value={String(r.id)} disabled={isMaintenance}>
                      {label}
                    </option>
                  );
                })}
              </select>
            )}
            <p className="mt-1 text-xs text-slate-500">
              * Lưu ý: Không thể gán cư dân vào các phòng đang trong trạng thái bảo trì (MAINTENANCE).
            </p>
          </div>
        </form>
      </Modal>

      {/* 8. MODAL XÁC NHẬN PHÊ DUYỆT CƯ DÂN */}
      {approvingResident && (
        <ConfirmDialog
          isOpen={isConfirmApproveOpen}
          onClose={() => !approvingLoading && setIsConfirmApproveOpen(false)}
          onConfirm={handleExecuteApprove}
          title="Xác Nhận Phê Duyệt Cư Dân"
          message={`Bạn có chắc chắn muốn phê duyệt tài khoản cư dân [${approvingResident.fullName}] vào căn hộ [${
            approvingResident.room?.roomNumber
              ? `Căn ${approvingResident.room.roomNumber}`
              : `Phòng #${approvingResident.roomId}`
          }]?`}
          confirmLabel="Phê duyệt ngay"
          confirmVariant="success"
          isLoading={approvingLoading}
        />
      )}
    </div>
  );
};
