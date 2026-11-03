// =========================================================================
// TRANG QUẢN LÝ CĂN HỘ VÀ PHÊ DUYỆT CƯ DÂN (RESIDENTS & ROOMS MANAGEMENT)
// Phụ trách: Thành viên Đức (Senior React + TypeScript Frontend Developer)
// Phạm vi: web/src/pages/ResidentsPage.tsx
// Đợt hoàn thiện: FINAL HARDENING (No-Tailwind Scoped CSS, Anti-Race Condition,
//                  Accurate Stats, Strict Role-Aware Fallback)
// =========================================================================

import React, { useState, useEffect, useMemo, useCallback, useRef } from 'react';
import axiosClient from '../api/axiosClient';
import { API_ENDPOINTS } from '../api/endpoints';
import { ApiEnvelope, getStoredUser } from '../utils/auth';
import { validateResidentForApproval, validateRoomForAssignment } from '../utils/roomValidation';

// -------------------------------------------------------------------------
// ĐỊNH NGHĨA KIỂU DỮ LIỆU CỤC BỘ (STRICT TYPESCRIPT - KHÔNG DÙNG ANY)
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
  const [approvingResidentId, setApprovingResidentId] = useState<number | null>(null);
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
  // API: CẬP NHẬT THỐNG KÊ THỰC TẾ (ACCURATE REAL SYSTEM COUNTS)
  // Sử dụng truy vấn limit=1 với từng bộ lọc để lấy chính xác pagination.total từ DB
  // -----------------------------------------------------------------------
  const fetchOverviewStats = useCallback(async () => {
    const seq = ++residentsStatsReqSeqRef.current;
    setStatsLoading(true);
    setStatsError('');
    try {
      // 1. Lấy tổng số phòng và các trạng thái phòng
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

      // 2. Lấy số lượng cư dân chờ duyệt và đã duyệt
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
  // API: TẢI DANH MỤC CĂN HỘ (KÈM BẢO VỆ CHỐNG RACE CONDITION)
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

        // Bỏ qua nếu có request mới hơn được gửi đi sau đó hoặc component đã unmount
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
  // API: TẢI DANH SÁCH CƯ DÂN (KÈM CHỐNG RACE CONDITION & PHÂN QUYỀN FALLBACK)
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
          // Canonical endpoint: GET /api/apartments/residents
          res = await axiosClient.get(`${API_ENDPOINTS.AUTH.RESIDENTS}?${queryParams.toString()}`);
        } catch (primaryErr: unknown) {
          const apiErr = primaryErr as ApiErrorShape;
          // Chỉ kích hoạt Fallback khi 404 hoặc 501
          if (apiErr?.status === 404 || apiErr?.status === 501) {
            // Kiểm tra phân quyền Backend: Chỉ ADMIN mới được xem RESIDENT qua /api/admin/users
            // BQL bị Backend ép cứng roleFilter = TECHNICIAN, nên không được gọi thừa thãi
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
              // BQL không có quyền fallback -> báo rõ ràng API chính chưa sẵn sàng
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

        // Bỏ qua nếu có request mới hơn hoặc đã unmount
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

  // -----------------------------------------------------------------------
  // TRIGGER LOAD DATA: Khi bộ lọc thay đổi, quay về trang 1
  // -----------------------------------------------------------------------
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
  // XỬ LÝ PHÊ DUYỆT CƯ DÂN (BUG-05 PREFLIGHT VALIDATION)
  // -----------------------------------------------------------------------
  const handleApproveResident = async (resident: ResidentItem) => {
    if (!resident.id || resident.isApproved) return;

    // BUG-05: Kiểm tra điều kiện căn hộ trước khi gửi API phê duyệt
    const preflight = validateResidentForApproval(resident);
    if (!preflight.canApprove) {
      setActionNotice({
        type: 'error',
        text: preflight.reason || 'Điều kiện căn hộ không hợp lệ để phê duyệt.',
      });
      return;
    }

    const roomDesc = resident.room?.roomNumber ? `P.${resident.room.roomNumber}` : `Phòng #${resident.roomId}`;
    if (!window.confirm(`Xác nhận phê duyệt tài khoản cư dân [${resident.fullName}] vào căn hộ [${roomDesc}]?`)) {
      return;
    }

    setApprovingResidentId(resident.id);
    setActionNotice(null);

    try {
      try {
        // Canonical endpoint: PUT /api/apartments/residents/:id/approve
        await axiosClient.put(API_ENDPOINTS.AUTH.APPROVE_RESIDENT(resident.id));
      } catch (primaryErr: unknown) {
        const apiErr = primaryErr as ApiErrorShape;
        if (apiErr?.status === 404 || apiErr?.status === 501) {
          await axiosClient.put(`/api/admin/users/${resident.id}/approve`);
        } else {
          throw primaryErr;
        }
      }

      if (isMountedRef.current) {
        setResidents((prev) =>
          prev.map((r) =>
            r.id === resident.id
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
          text: `Đã phê duyệt thành công cư dân: ${resident.fullName}`,
        });

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
        setApprovingResidentId(null);
      }
    }
  };

  // -----------------------------------------------------------------------
  // XỬ LÝ GÁN CĂN HỘ CHO CƯ DÂN (BUG-05 ROOM ASSIGNMENT MODAL)
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
      floor: '',
      area: '',
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

  // Đóng modal khi nhấn phím ESC
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && isRoomModalOpen && !roomFormSubmitting) {
        setIsRoomModalOpen(false);
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [isRoomModalOpen, roomFormSubmitting]);

  // Gửi Form Căn Hộ
  const handleSubmitRoomForm = async (e: React.FormEvent) => {
    e.preventDefault();
    setRoomFormError('');
    setRoomFormSuccess('');

    const roomNumber = roomFormData.roomNumber.trim();
    if (!roomNumber) {
      setRoomFormError('Số phòng không được để trống.');
      return;
    }

    const floorNum = parseInt(roomFormData.floor, 10);
    if (isNaN(floorNum)) {
      setRoomFormError('Tầng phải là một số nguyên hợp lệ.');
      return;
    }

    const areaNum = parseFloat(roomFormData.area);
    if (isNaN(areaNum) || areaNum <= 0) {
      setRoomFormError('Diện tích căn hộ phải là số dương lớn hơn 0 (m²).');
      return;
    }

    if (!editingRoom && roomFormData.status === 'OCCUPIED') {
      setRoomFormError(
        'Không thể khởi tạo căn hộ ở trạng thái Đang có người ở (OCCUPIED). Chỉ chấp nhận VACANT hoặc MAINTENANCE.'
      );
      return;
    }

    setRoomFormSubmitting(true);
    try {
      if (editingRoom) {
        await axiosClient.put(`/api/rooms/${editingRoom.id}`, {
          roomNumber,
          floor: floorNum,
          area: areaNum,
          status: roomFormData.status,
        });
        setRoomFormSuccess(`Cập nhật căn hộ [${roomNumber}] thành công!`);
      } else {
        await axiosClient.post('/api/rooms', {
          roomNumber,
          floor: floorNum,
          area: areaNum,
          status: roomFormData.status,
        });
        setRoomFormSuccess(`Tạo mới căn hộ [${roomNumber}] thành công!`);
      }

      await fetchRooms(roomsPagination.page);
      await fetchOverviewStats();

      setTimeout(() => {
        if (isMountedRef.current) {
          setIsRoomModalOpen(false);
          setRoomFormSuccess('');
        }
      }, 800);
    } catch (err: unknown) {
      const msg = parseErrorMessage(err, 'Lỗi khi lưu thông tin căn hộ.');
      setRoomFormError(msg);
    } finally {
      if (isMountedRef.current) {
        setRoomFormSubmitting(false);
      }
    }
  };

  return (
    <div className="residents-container">
      {/* ================================================================= */}
      {/* TOÀN BỘ CSS THỰC SỰ - HOÀN TOÀN ĐỘC LẬP VỚI TAILWIND (NO TAILWIND) */}
      {/* ================================================================= */}
      <style>{`
        .residents-container {
          width: 100%;
          max-width: 1200px;
          margin: 0 auto;
          padding: 1.5rem 1rem 3rem 1rem;
          color: #1e293b;
          font-family: inherit;
        }
        .residents-header {
          display: flex;
          justify-content: space-between;
          align-items: center;
          flex-wrap: wrap;
          gap: 1rem;
          margin-bottom: 1.5rem;
        }
        .residents-title {
          font-size: 1.5rem;
          font-weight: 700;
          color: #0f172a;
          margin: 0;
          letter-spacing: -0.025em;
        }
        .residents-subtitle {
          font-size: 0.875rem;
          color: #64748b;
          margin: 0.25rem 0 0 0;
        }
        .residents-actions {
          display: flex;
          align-items: center;
          gap: 0.5rem;
        }
        .residents-btn {
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
        .residents-btn:disabled {
          opacity: 0.5;
          cursor: not-allowed;
        }
        .residents-btn-primary {
          background-color: #4f46e5;
          color: #ffffff;
        }
        .residents-btn-primary:hover:not(:disabled) {
          background-color: #4338ca;
        }
        .residents-btn-secondary {
          background-color: #ffffff;
          color: #334155;
          border-color: #cbd5e1;
        }
        .residents-btn-secondary:hover:not(:disabled) {
          background-color: #f8fafc;
        }
        .residents-btn-success {
          background-color: #059669;
          color: #ffffff;
        }
        .residents-btn-success:hover:not(:disabled) {
          background-color: #047857;
        }
        .residents-btn-sm {
          padding: 0.25rem 0.625rem;
          font-size: 0.75rem;
          border-radius: 0.375rem;
        }
        .residents-stats-grid {
          display: grid;
          grid-template-columns: repeat(auto-fit, minmax(220px, 1fr));
          gap: 1rem;
          margin-bottom: 1.5rem;
        }
        .residents-stat-card {
          background-color: #ffffff;
          border: 1px solid #e2e8f0;
          border-radius: 0.75rem;
          padding: 1.25rem;
          box-shadow: 0 1px 3px rgba(0, 0, 0, 0.05);
          position: relative;
        }
        .residents-stat-card-indigo { border-left: 4px solid #4f46e5; }
        .residents-stat-card-blue { border-left: 4px solid #2563eb; }
        .residents-stat-card-emerald { border-left: 4px solid #059669; }
        .residents-stat-card-amber { border-left: 4px solid #d97706; }
        .residents-stat-label {
          font-size: 0.75rem;
          font-weight: 600;
          color: #64748b;
          text-transform: uppercase;
          letter-spacing: 0.05em;
          margin: 0;
        }
        .residents-stat-value {
          font-size: 1.75rem;
          font-weight: 700;
          color: #0f172a;
          margin: 0.375rem 0 0 0;
        }
        .residents-stat-helper {
          font-size: 0.75rem;
          color: #94a3b8;
          margin-top: 0.25rem;
          display: block;
        }
        .residents-tabs {
          display: flex;
          gap: 1.5rem;
          border-bottom: 1px solid #e2e8f0;
          margin-bottom: 1.25rem;
        }
        .residents-tab-item {
          padding: 0.75rem 0.25rem;
          font-size: 0.875rem;
          font-weight: 600;
          color: #64748b;
          background: none;
          border: none;
          border-bottom: 2px solid transparent;
          cursor: pointer;
          display: flex;
          align-items: center;
          gap: 0.375rem;
          transition: all 0.15s ease;
        }
        .residents-tab-item.active {
          color: #4f46e5;
          border-bottom-color: #4f46e5;
        }
        .residents-badge-counter {
          background-color: #d97706;
          color: #ffffff;
          font-size: 0.6875rem;
          padding: 0.125rem 0.375rem;
          border-radius: 9999px;
          font-weight: 700;
        }
        .residents-card {
          background-color: #ffffff;
          border: 1px solid #e2e8f0;
          border-radius: 0.75rem;
          box-shadow: 0 1px 3px rgba(0, 0, 0, 0.05);
          margin-bottom: 1.25rem;
        }
        .residents-filter-box {
          padding: 1rem;
        }
        .residents-filter-grid {
          display: grid;
          grid-template-columns: repeat(auto-fit, minmax(200px, 1fr));
          gap: 0.75rem;
          align-items: flex-end;
        }
        .residents-form-group {
          display: flex;
          flex-direction: column;
          gap: 0.25rem;
        }
        .residents-form-label {
          font-size: 0.75rem;
          font-weight: 600;
          color: #475569;
        }
        .residents-input, .residents-select {
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
        .residents-input:focus, .residents-select:focus {
          border-color: #4f46e5;
          box-shadow: 0 0 0 2px rgba(79, 70, 229, 0.1);
        }
        .residents-alert {
          padding: 0.875rem 1rem;
          border-radius: 0.5rem;
          font-size: 0.875rem;
          margin-bottom: 1rem;
          display: flex;
          justify-content: space-between;
          align-items: center;
        }
        .residents-alert-success {
          background-color: #ecfdf5;
          color: #065f46;
          border: 1px solid #a7f3d0;
        }
        .residents-alert-error {
          background-color: #fef2f2;
          color: #991b1b;
          border: 1px solid #fecaca;
        }
        .residents-alert-warning {
          background-color: #fffbeb;
          color: #92400e;
          border: 1px solid #fde68a;
        }
        .residents-table-wrap {
          overflow-x: auto;
          width: 100%;
        }
        .residents-table {
          width: 100%;
          border-collapse: collapse;
          font-size: 0.875rem;
          text-align: left;
        }
        .residents-table th {
          background-color: #f8fafc;
          color: #475569;
          font-size: 0.75rem;
          font-weight: 600;
          text-transform: uppercase;
          letter-spacing: 0.05em;
          padding: 0.75rem 1rem;
          border-bottom: 1px solid #e2e8f0;
          white-space: nowrap;
        }
        .residents-table td {
          padding: 0.875rem 1rem;
          border-bottom: 1px solid #f1f5f9;
          color: #1e293b;
          vertical-align: middle;
        }
        .residents-table tr:hover td {
          background-color: #f8fafc;
        }
        .residents-badge {
          display: inline-flex;
          align-items: center;
          padding: 0.25rem 0.625rem;
          font-size: 0.75rem;
          font-weight: 600;
          border-radius: 9999px;
          white-space: nowrap;
        }
        .residents-badge-vacant {
          background-color: #ecfdf5;
          color: #065f46;
          border: 1px solid #a7f3d0;
        }
        .residents-badge-occupied {
          background-color: #eff6ff;
          color: #1e40af;
          border: 1px solid #bfdbfe;
        }
        .residents-badge-maintenance {
          background-color: #fffbeb;
          color: #92400e;
          border: 1px solid #fde68a;
        }
        .residents-badge-approved {
          background-color: #ecfdf5;
          color: #065f46;
          border: 1px solid #a7f3d0;
        }
        .residents-badge-pending {
          background-color: #fffbeb;
          color: #b45309;
          border: 1px solid #fde68a;
        }
        .residents-pagination {
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
        .residents-modal-overlay {
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
        .residents-modal-box {
          background-color: #ffffff;
          border-radius: 0.75rem;
          border: 1px solid #e2e8f0;
          box-shadow: 0 20px 25px -5px rgba(0, 0, 0, 0.1), 0 10px 10px -5px rgba(0, 0, 0, 0.04);
          width: 100%;
          max-width: 460px;
          max-height: 90vh;
          overflow-y: auto;
        }
        .residents-modal-header {
          display: flex;
          justify-content: space-between;
          align-items: center;
          padding: 1rem 1.25rem;
          background-color: #f8fafc;
          border-bottom: 1px solid #e2e8f0;
        }
        .residents-modal-title {
          font-size: 1rem;
          font-weight: 700;
          color: #0f172a;
          margin: 0;
        }
        .residents-modal-close {
          background: none;
          border: none;
          font-size: 1.25rem;
          color: #94a3b8;
          cursor: pointer;
          padding: 0;
          line-height: 1;
        }
        .residents-modal-close:hover {
          color: #475569;
        }
        .residents-modal-body {
          padding: 1.25rem;
          display: flex;
          flex-direction: column;
          gap: 1rem;
        }
        .residents-modal-footer {
          display: flex;
          justify-content: flex-end;
          gap: 0.5rem;
          padding-top: 1rem;
          border-top: 1px solid #f1f5f9;
        }
      `}</style>

      {/* HEADER TRANG */}
      <div className="residents-header">
        <div>
          <h1 className="residents-title">Quản Lý Căn Hộ & Cư Dân</h1>
          <p className="residents-subtitle">
            Hệ thống quản lý danh mục phòng tòa nhà, trạng thái sử dụng và phê duyệt cư dân đăng ký
          </p>
        </div>
        <div className="residents-actions">
          <button
            onClick={() => {
              fetchRooms(roomsPagination.page);
              fetchResidents(residentsPagination.page);
              fetchOverviewStats();
            }}
            className="residents-btn residents-btn-secondary"
            title="Tải lại toàn bộ dữ liệu"
          >
            🔄 Tải lại dữ liệu
          </button>
          {activeTab === 'ROOMS' && (
            <button onClick={handleOpenCreateRoomModal} className="residents-btn residents-btn-primary">
              + Thêm Căn Hộ Mới
            </button>
          )}
        </div>
      </div>

      {/* THÔNG BÁO TOÀN TRANG (ACTION NOTICE) */}
      {actionNotice && (
        <div
          className={`residents-alert ${
            actionNotice.type === 'success' ? 'residents-alert-success' : 'residents-alert-error'
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

      {/* BẢNG THỐNG KÊ ĐẦU TRANG - TÍNH TOÁN CHÍNH XÁC TOÀN HỆ THỐNG */}
      <div className="residents-stats-grid">
        <div className="residents-stat-card residents-stat-card-indigo">
          <p className="residents-stat-label">Tổng số căn hộ</p>
          <p className="residents-stat-value">
            {statsLoading ? '...' : stats.totalRooms !== null ? stats.totalRooms : 'N/A'}
          </p>
          <span className="residents-stat-helper">Toàn bộ căn hộ tòa nhà</span>
        </div>
        <div className="residents-stat-card residents-stat-card-blue">
          <p className="residents-stat-label">Căn hộ có người ở</p>
          <p className="residents-stat-value" style={{ color: '#2563eb' }}>
            {statsLoading ? '...' : stats.occupiedRooms !== null ? stats.occupiedRooms : 'N/A'}
          </p>
          <span className="residents-stat-helper">Trạng thái OCCUPIED</span>
        </div>
        <div className="residents-stat-card residents-stat-card-emerald">
          <p className="residents-stat-label">Căn hộ trống</p>
          <p className="residents-stat-value" style={{ color: '#059669' }}>
            {statsLoading ? '...' : stats.vacantRooms !== null ? stats.vacantRooms : 'N/A'}
          </p>
          <span className="residents-stat-helper">Sẵn sàng bàn giao (VACANT)</span>
        </div>
        <div className="residents-stat-card residents-stat-card-amber">
          <p className="residents-stat-label">Cư dân chờ duyệt</p>
          <p className="residents-stat-value" style={{ color: '#d97706' }}>
            {statsLoading ? '...' : stats.pendingResidents !== null ? stats.pendingResidents : 'N/A'}
          </p>
          <span className="residents-stat-helper">Đơn đăng ký mới (isApproved = false)</span>
        </div>
      </div>

      {statsError && (
        <div className="residents-alert residents-alert-error" style={{ margin: '0 0 1rem 0' }}>
          <span>{statsError}</span>
        </div>
      )}

      {/* CHUYỂN TAB ĐIỀU HƯỚNG */}
      <div className="residents-tabs">
        <button
          onClick={() => setActiveTab('ROOMS')}
          className={`residents-tab-item ${activeTab === 'ROOMS' ? 'active' : ''}`}
        >
          🏢 Danh Mục Căn Hộ ({stats.totalRooms !== null ? stats.totalRooms : '--'})
        </button>
        <button
          onClick={() => setActiveTab('RESIDENTS')}
          className={`residents-tab-item ${activeTab === 'RESIDENTS' ? 'active' : ''}`}
        >
          👥 Danh Sách Cư Dân
          {stats.pendingResidents !== null && stats.pendingResidents > 0 && (
            <span className="residents-badge-counter">{stats.pendingResidents}</span>
          )}
        </button>
      </div>

      {/* =================================================================== */}
      {/* PHÂN VÙNG 1: QUẢN LÝ CĂN HỘ (ROOMS TAB) */}
      {/* =================================================================== */}
      {activeTab === 'ROOMS' && (
        <div>
          {/* BỘ LỌC CĂN HỘ */}
          <div className="residents-card residents-filter-box">
            <div className="residents-filter-grid">
              <div className="residents-form-group">
                <label className="residents-form-label">Tìm kiếm số phòng</label>
                <input
                  type="text"
                  placeholder="Ví dụ: 101, A-202..."
                  value={roomSearchInput}
                  onChange={(e) => setRoomSearchInput(e.target.value)}
                  className="residents-input"
                />
              </div>

              <div className="residents-form-group">
                <label className="residents-form-label">Lọc theo tầng</label>
                <input
                  type="number"
                  placeholder="Tất cả các tầng"
                  value={roomFloorFilter}
                  onChange={(e) => setRoomFloorFilter(e.target.value)}
                  className="residents-input"
                />
              </div>

              <div className="residents-form-group">
                <label className="residents-form-label">Trạng thái căn hộ</label>
                <select
                  value={roomStatusFilter}
                  onChange={(e) => setRoomStatusFilter(e.target.value)}
                  className="residents-select"
                >
                  <option value="">Tất cả trạng thái</option>
                  <option value="VACANT">Phòng trống (VACANT)</option>
                  <option value="OCCUPIED">Đang có người ở (OCCUPIED)</option>
                  <option value="MAINTENANCE">Đang bảo trì (MAINTENANCE)</option>
                </select>
              </div>

              <div style={{ display: 'flex', gap: '0.5rem' }}>
                <button
                  type="button"
                  onClick={() => {
                    setRoomSearchInput('');
                    setRoomSearchDebounced('');
                    setRoomFloorFilter('');
                    setRoomStatusFilter('');
                  }}
                  className="residents-btn residents-btn-secondary"
                  style={{ width: '100%' }}
                >
                  Xóa lọc
                </button>
              </div>
            </div>
          </div>

          {/* LỖI TẢI CĂN HỘ NẾU CÓ */}
          {roomsError && (
            <div className="residents-alert residents-alert-error">
              <span>{roomsError}</span>
              <button
                onClick={() => fetchRooms(roomsPagination.page)}
                className="residents-btn residents-btn-sm residents-btn-secondary"
              >
                Thử lại
              </button>
            </div>
          )}

          {/* BẢNG CĂN HỘ */}
          <div className="residents-card">
            <div className="residents-table-wrap">
              <table className="residents-table">
                <thead>
                  <tr>
                    <th>Số Căn Hộ</th>
                    <th>Tầng</th>
                    <th>Diện Tích</th>
                    <th>Trạng Thái</th>
                    <th>Cư Dân Đã Duyệt</th>
                    <th style={{ textAlign: 'right' }}>Thao Tác</th>
                  </tr>
                </thead>
                <tbody>
                  {roomsLoading ? (
                    <tr>
                      <td colSpan={6} style={{ textAlign: 'center', padding: '2.5rem', color: '#94a3b8' }}>
                        ⏳ Đang tải danh mục căn hộ...
                      </td>
                    </tr>
                  ) : rooms.length === 0 ? (
                    <tr>
                      <td colSpan={6} style={{ textAlign: 'center', padding: '3rem', color: '#94a3b8' }}>
                        <p style={{ margin: 0, fontWeight: 600, color: '#475569' }}>
                          Không tìm thấy căn hộ nào phù hợp
                        </p>
                        <p style={{ margin: '0.25rem 0 0 0', fontSize: '0.75rem' }}>
                          Vui lòng kiểm tra lại bộ lọc tìm kiếm
                        </p>
                      </td>
                    </tr>
                  ) : (
                    rooms.map((room) => (
                      <tr key={room.id}>
                        <td style={{ fontWeight: 700, color: '#4f46e5' }}>P.{room.roomNumber}</td>
                        <td>Tầng {room.floor}</td>
                        <td>{room.area} m²</td>
                        <td>
                          {room.status === 'VACANT' && (
                            <span className="residents-badge residents-badge-vacant">
                              🟢 Trống (VACANT)
                            </span>
                          )}
                          {room.status === 'OCCUPIED' && (
                            <span className="residents-badge residents-badge-occupied">
                              🔵 Đang ở (OCCUPIED)
                            </span>
                          )}
                          {room.status === 'MAINTENANCE' && (
                            <span className="residents-badge residents-badge-maintenance">
                              🟠 Bảo trì (MAINTENANCE)
                            </span>
                          )}
                        </td>
                        <td style={{ fontWeight: 500 }}>{room.residentCount ?? 0} người</td>
                        <td style={{ textAlign: 'right' }}>
                          <button
                            onClick={() => handleOpenEditRoomModal(room)}
                            className="residents-btn residents-btn-sm residents-btn-secondary"
                          >
                            Chỉnh sửa
                          </button>
                        </td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>

            {/* PHÂN TRANG CĂN HỘ */}
            {roomsPagination.totalPages > 1 && (
              <div className="residents-pagination">
                <span>
                  Trang {roomsPagination.page} / {roomsPagination.totalPages} (Tổng số{' '}
                  {roomsPagination.total} căn hộ)
                </span>
                <div style={{ display: 'flex', gap: '0.5rem' }}>
                  <button
                    disabled={roomsPagination.page <= 1}
                    onClick={() => fetchRooms(roomsPagination.page - 1)}
                    className="residents-btn residents-btn-sm residents-btn-secondary"
                  >
                    Trang trước
                  </button>
                  <button
                    disabled={roomsPagination.page >= roomsPagination.totalPages}
                    onClick={() => fetchRooms(roomsPagination.page + 1)}
                    className="residents-btn residents-btn-sm residents-btn-secondary"
                  >
                    Trang sau
                  </button>
                </div>
              </div>
            )}
          </div>
        </div>
      )}

      {/* =================================================================== */}
      {/* PHÂN VÙNG 2: QUẢN LÝ CƯ DÂN (RESIDENTS TAB) */}
      {/* =================================================================== */}
      {activeTab === 'RESIDENTS' && (
        <div>
          {/* BỘ LỌC CƯ DÂN */}
          <div className="residents-card residents-filter-box">
            <div className="residents-filter-grid">
              <div className="residents-form-group">
                <label className="residents-form-label">Tìm kiếm cư dân</label>
                <input
                  type="text"
                  placeholder="Tên, tài khoản, SĐT..."
                  value={residentSearchInput}
                  onChange={(e) => setResidentSearchInput(e.target.value)}
                  className="residents-input"
                />
              </div>

              <div className="residents-form-group">
                <label className="residents-form-label">Trạng thái phê duyệt</label>
                <select
                  value={residentApprovalFilter}
                  onChange={(e) => setResidentApprovalFilter(e.target.value)}
                  className="residents-select"
                >
                  <option value="ALL">Tất cả cư dân</option>
                  <option value="PENDING">Chờ phê duyệt (isApproved = false)</option>
                  <option value="APPROVED">Đã phê duyệt (isApproved = true)</option>
                </select>
              </div>

              <div className="residents-form-group">
                <label className="residents-form-label">Lọc theo căn hộ</label>
                <select
                  value={residentRoomFilter}
                  onChange={(e) => setResidentRoomFilter(e.target.value)}
                  className="residents-select"
                >
                  <option value="">Tất cả căn hộ</option>
                  {rooms.map((r) => (
                    <option key={r.id} value={r.id}>
                      Phòng {r.roomNumber} (Tầng {r.floor})
                    </option>
                  ))}
                </select>
              </div>

              <div style={{ display: 'flex', gap: '0.5rem' }}>
                <button
                  type="button"
                  onClick={() => {
                    setResidentSearchInput('');
                    setResidentSearchDebounced('');
                    setResidentApprovalFilter('ALL');
                    setResidentRoomFilter('');
                  }}
                  className="residents-btn residents-btn-secondary"
                  style={{ width: '100%' }}
                >
                  Xóa lọc
                </button>
              </div>
            </div>
          </div>

          {/* CẢNH BÁO NẾU API DANH SÁCH CƯ DÂN CHƯA KHẢ DỤNG */}
          {residentsApiUnavailable && (
            <div className="residents-alert residents-alert-warning">
              <div>
                <strong>⚠️ Thông báo tính năng:</strong> {residentsError}
              </div>
              <button
                onClick={() => fetchResidents(1)}
                className="residents-btn residents-btn-sm residents-btn-secondary"
                style={{ marginLeft: '1rem', whiteSpace: 'nowrap' }}
              >
                🔄 Thử lại
              </button>
            </div>
          )}

          {/* LỖI THƯỜNG GẶP KHÁC */}
          {!residentsApiUnavailable && residentsError && (
            <div className="residents-alert residents-alert-error">
              <span>{residentsError}</span>
              <button
                onClick={() => fetchResidents(residentsPagination.page)}
                className="residents-btn residents-btn-sm residents-btn-secondary"
              >
                Thử lại
              </button>
            </div>
          )}

          {/* BẢNG CƯ DÂN */}
          <div className="residents-card">
            <div className="residents-table-wrap">
              <table className="residents-table">
                <thead>
                  <tr>
                    <th>Họ và Tên</th>
                    <th>Tài Khoản</th>
                    <th>Số Điện Thoại</th>
                    <th>Email</th>
                    <th>Căn Hộ</th>
                    <th>Trạng Thái</th>
                    <th>Ngày Đăng Ký</th>
                    <th style={{ textAlign: 'right' }}>Thao Tác</th>
                  </tr>
                </thead>
                <tbody>
                  {residentsLoading ? (
                    <tr>
                      <td colSpan={8} style={{ textAlign: 'center', padding: '2.5rem', color: '#94a3b8' }}>
                        ⏳ Đang tải danh sách cư dân...
                      </td>
                    </tr>
                  ) : residents.length === 0 ? (
                    <tr>
                      <td colSpan={8} style={{ textAlign: 'center', padding: '3rem', color: '#94a3b8' }}>
                        <p style={{ margin: 0, fontWeight: 600, color: '#475569' }}>
                          Chưa có cư dân nào phù hợp
                        </p>
                        <p style={{ margin: '0.25rem 0 0 0', fontSize: '0.75rem' }}>
                          Danh sách trống hoặc chưa có dữ liệu nộp đơn cư trú
                        </p>
                      </td>
                    </tr>
                  ) : (
                    residents.map((resident) => {
                      const roomLabel = resident.room?.roomNumber
                        ? `P.${resident.room.roomNumber}`
                        : resident.roomId
                        ? `Phòng #${resident.roomId}`
                        : 'Chưa gán phòng';

                      const floorLabel =
                        resident.room?.floor !== undefined ? `Tầng ${resident.room.floor}` : '-';

                      const dateFormatted = resident.createdAt
                        ? new Date(resident.createdAt).toLocaleDateString('vi-VN')
                        : '-';

                      return (
                        <tr key={resident.id}>
                          <td style={{ fontWeight: 700, color: '#0f172a' }}>{resident.fullName}</td>
                          <td style={{ fontFamily: 'monospace', color: '#64748b' }}>
                            {resident.username}
                          </td>
                          <td>{resident.phone || <span style={{ color: '#94a3b8' }}>Chưa có</span>}</td>
                          <td>{resident.email || <span style={{ color: '#94a3b8' }}>Chưa có</span>}</td>
                          <td>
                            <span style={{ fontWeight: 600, color: '#4f46e5' }}>{roomLabel}</span>
                            <span style={{ fontSize: '0.75rem', color: '#94a3b8', display: 'block' }}>
                              {floorLabel}
                            </span>
                          </td>
                          <td>
                            {resident.isApproved ? (
                              <span className="residents-badge residents-badge-approved">
                                ✓ Đã phê duyệt
                              </span>
                            ) : (
                              <span className="residents-badge residents-badge-pending">
                                ⏳ Chờ phê duyệt
                              </span>
                            )}
                          </td>
                          <td style={{ fontSize: '0.75rem', color: '#64748b' }}>{dateFormatted}</td>
                          <td style={{ textAlign: 'right' }}>
                            {!resident.isApproved ? (
                              <div style={{ display: 'flex', gap: '0.375rem', justifyContent: 'flex-end', alignItems: 'center' }}>
                                <button
                                  type="button"
                                  onClick={() => handleOpenAssignModal(resident)}
                                  className="residents-btn residents-btn-sm residents-btn-secondary"
                                  title="Gán hoặc đổi căn hộ cho cư dân"
                                >
                                  🏠 {resident.roomId ? 'Đổi phòng' : 'Gán phòng'}
                                </button>
                                <button
                                  disabled={
                                    approvingResidentId === resident.id ||
                                    !resident.roomId ||
                                    resident.room?.status === 'MAINTENANCE'
                                  }
                                  onClick={() => handleApproveResident(resident)}
                                  className="residents-btn residents-btn-sm residents-btn-success"
                                  title={
                                    !resident.roomId
                                      ? 'Chưa gán căn hộ - Vui lòng gán phòng trước'
                                      : resident.room?.status === 'MAINTENANCE'
                                      ? 'Căn hộ đang bảo trì (MAINTENANCE) - Không thể duyệt'
                                      : 'Phê duyệt cư dân vào căn hộ'
                                  }
                                >
                                  {approvingResidentId === resident.id ? 'Đang duyệt...' : '✓ Duyệt'}
                                </button>
                              </div>
                            ) : (
                              <div style={{ display: 'flex', gap: '0.375rem', justifyContent: 'flex-end', alignItems: 'center' }}>
                                <button
                                  type="button"
                                  onClick={() => handleOpenAssignModal(resident)}
                                  className="residents-btn residents-btn-sm residents-btn-secondary"
                                  title="Đổi căn hộ cho cư dân"
                                  style={{ fontSize: '0.75rem', padding: '0.2rem 0.4rem' }}
                                >
                                  Đổi phòng
                                </button>
                                <span
                                  style={{
                                    fontSize: '0.75rem',
                                    color: '#059669',
                                    fontWeight: 600,
                                    padding: '0.25rem 0.5rem',
                                    backgroundColor: '#ecfdf5',
                                    borderRadius: '0.25rem',
                                  }}
                                >
                                  Đã duyệt
                                </span>
                              </div>
                            )}
                          </td>
                        </tr>
                      );
                    })
                  )}
                </tbody>
              </table>
            </div>

            {/* PHÂN TRANG CƯ DÂN */}
            {residentsPagination.totalPages > 1 && (
              <div className="residents-pagination">
                <span>
                  Trang {residentsPagination.page} / {residentsPagination.totalPages} (Tổng số{' '}
                  {residentsPagination.total} cư dân)
                </span>
                <div style={{ display: 'flex', gap: '0.5rem' }}>
                  <button
                    disabled={residentsPagination.page <= 1}
                    onClick={() => fetchResidents(residentsPagination.page - 1)}
                    className="residents-btn residents-btn-sm residents-btn-secondary"
                  >
                    Trang trước
                  </button>
                  <button
                    disabled={residentsPagination.page >= residentsPagination.totalPages}
                    onClick={() => fetchResidents(residentsPagination.page + 1)}
                    className="residents-btn residents-btn-sm residents-btn-secondary"
                  >
                    Trang sau
                  </button>
                </div>
              </div>
            )}
          </div>
        </div>
      )}

      {/* =================================================================== */}
      {/* MODAL THÊM / CẬP NHẬT CĂN HỘ (NO TAILWIND - FULL PROPER CSS) */}
      {/* =================================================================== */}
      {isRoomModalOpen && (
        <div
          className="residents-modal-overlay"
          onClick={(e) => {
            if (e.target === e.currentTarget && !roomFormSubmitting) {
              setIsRoomModalOpen(false);
            }
          }}
        >
          <div className="residents-modal-box">
            <div className="residents-modal-header">
              <h3 className="residents-modal-title">
                {editingRoom ? `Cập Nhật Căn Hộ [P.${editingRoom.roomNumber}]` : 'Thêm Mới Căn Hộ'}
              </h3>
              <button
                type="button"
                onClick={() => !roomFormSubmitting && setIsRoomModalOpen(false)}
                className="residents-modal-close"
              >
                ✕
              </button>
            </div>

            <form onSubmit={handleSubmitRoomForm}>
              <div className="residents-modal-body">
                {roomFormError && (
                  <div className="residents-alert residents-alert-error" style={{ margin: 0 }}>
                    {roomFormError}
                  </div>
                )}
                {roomFormSuccess && (
                  <div className="residents-alert residents-alert-success" style={{ margin: 0 }}>
                    {roomFormSuccess}
                  </div>
                )}

                <div className="residents-form-group">
                  <label className="residents-form-label">
                    Số phòng (roomNumber) <span style={{ color: '#ef4444' }}>*</span>
                  </label>
                  <input
                    type="text"
                    required
                    placeholder="Ví dụ: 101, A-302"
                    value={roomFormData.roomNumber}
                    onChange={(e) => setRoomFormData({ ...roomFormData, roomNumber: e.target.value })}
                    className="residents-input"
                  />
                </div>

                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0.75rem' }}>
                  <div className="residents-form-group">
                    <label className="residents-form-label">
                      Tầng (floor) <span style={{ color: '#ef4444' }}>*</span>
                    </label>
                    <input
                      type="number"
                      required
                      placeholder="Ví dụ: 2"
                      value={roomFormData.floor}
                      onChange={(e) => setRoomFormData({ ...roomFormData, floor: e.target.value })}
                      className="residents-input"
                    />
                  </div>

                  <div className="residents-form-group">
                    <label className="residents-form-label">
                      Diện tích (m²) <span style={{ color: '#ef4444' }}>*</span>
                    </label>
                    <input
                      type="number"
                      step="any"
                      required
                      placeholder="Ví dụ: 68.5"
                      value={roomFormData.area}
                      onChange={(e) => setRoomFormData({ ...roomFormData, area: e.target.value })}
                      className="residents-input"
                    />
                  </div>
                </div>

                <div className="residents-form-group">
                  <label className="residents-form-label">
                    Trạng thái căn hộ <span style={{ color: '#ef4444' }}>*</span>
                  </label>
                  <select
                    value={roomFormData.status}
                    onChange={(e) =>
                      setRoomFormData({ ...roomFormData, status: e.target.value as RoomStatusType })
                    }
                    className="residents-select"
                  >
                    <option value="VACANT">Phòng trống (VACANT)</option>
                    {editingRoom && <option value="OCCUPIED">Đang có người ở (OCCUPIED)</option>}
                    <option value="MAINTENANCE">Đang bảo trì (MAINTENANCE)</option>
                  </select>
                  {!editingRoom && (
                    <span style={{ fontSize: '0.6875rem', color: '#94a3b8', marginTop: '0.25rem' }}>
                      * Ghi chú: Căn hộ mới khởi tạo ở trạng thái VACANT hoặc MAINTENANCE.
                    </span>
                  )}
                </div>

                <div className="residents-modal-footer">
                  <button
                    type="button"
                    onClick={() => setIsRoomModalOpen(false)}
                    disabled={roomFormSubmitting}
                    className="residents-btn residents-btn-secondary"
                  >
                    Hủy bỏ
                  </button>
                  <button
                    type="submit"
                    disabled={roomFormSubmitting}
                    className="residents-btn residents-btn-primary"
                  >
                    {roomFormSubmitting
                      ? 'Đang lưu...'
                      : editingRoom
                      ? 'Lưu Thay Đổi'
                      : 'Tạo Căn Hộ'}
                  </button>
                </div>
              </div>
            </form>
          </div>
        </div>
      )}
      {/* MODAL GÁN CĂN HỘ CHO CƯ DÂN (BUG-05 ROOM ASSIGNMENT) */}
      {isAssignModalOpen && assigningResident && (
        <div className="residents-modal-overlay">
          <div className="residents-modal-box">
            <div className="residents-modal-header">
              <h3 className="residents-modal-title">
                Gán Căn Hộ Cư Dân: {assigningResident.fullName}
              </h3>
              <button
                type="button"
                onClick={() => setIsAssignModalOpen(false)}
                disabled={assignSubmitting}
                className="residents-modal-close"
              >
                ✕
              </button>
            </div>

            <form onSubmit={handleSubmitAssignRoom}>
              <div className="residents-modal-body">
                {assignError && (
                  <div className="residents-alert residents-alert-error" style={{ margin: 0 }}>
                    {assignError}
                  </div>
                )}
                {assignSuccess && (
                  <div className="residents-alert residents-alert-success" style={{ margin: 0 }}>
                    {assignSuccess}
                  </div>
                )}

                <div className="residents-form-group">
                  <label className="residents-form-label">Thông tin cư dân</label>
                  <div style={{ fontSize: '0.875rem', color: '#475569', background: '#f8fafc', padding: '0.5rem', borderRadius: '0.375rem' }}>
                    <p style={{ margin: '0 0 0.25rem 0' }}><strong>Họ tên:</strong> {assigningResident.fullName} ({assigningResident.username})</p>
                    <p style={{ margin: '0 0 0.25rem 0' }}><strong>Điện thoại:</strong> {assigningResident.phone || 'Chưa có'}</p>
                    <p style={{ margin: 0 }}>
                      <strong>Trạng thái hiện tại:</strong>{' '}
                      {assigningResident.room?.roomNumber
                        ? `Đang ở P.${assigningResident.room.roomNumber} (${assigningResident.room.status || 'N/A'})`
                        : 'Chưa được gán căn hộ'}
                    </p>
                  </div>
                </div>

                <div className="residents-form-group">
                  <label className="residents-form-label">
                    Chọn căn hộ <span style={{ color: '#ef4444' }}>*</span>
                  </label>
                  {assignLoadingRooms ? (
                    <p style={{ fontSize: '0.8125rem', color: '#64748b' }}>Đang nạp danh sách căn hộ...</p>
                  ) : (
                    <select
                      value={selectedAssignRoomId}
                      onChange={(e) => setSelectedAssignRoomId(e.target.value)}
                      required
                      className="residents-select"
                    >
                      <option value="">-- Chọn căn hộ để gán --</option>
                      {assignRoomsList.map((room) => {
                        const isMaint = room.status === 'MAINTENANCE';
                        const statusLabel =
                          room.status === 'VACANT'
                            ? 'Trống (VACANT)'
                            : room.status === 'OCCUPIED'
                            ? 'Đang có người ở (OCCUPIED)'
                            : 'Đang bảo trì (MAINTENANCE - Không được gán)';
                        return (
                          <option
                            key={room.id}
                            value={String(room.id)}
                            disabled={isMaint}
                          >
                            P.{room.roomNumber} - Tầng {room.floor} ({room.area}m²) - [{statusLabel}]
                          </option>
                        );
                      })}
                    </select>
                  )}
                  <span style={{ fontSize: '0.6875rem', color: '#94a3b8', marginTop: '0.25rem' }}>
                    * Phòng đang bảo trì (MAINTENANCE) bị vô hiệu hóa để đảm bảo an toàn nghiệp vụ.
                  </span>
                </div>

                <div className="residents-modal-footer">
                  <button
                    type="button"
                    onClick={() => setIsAssignModalOpen(false)}
                    disabled={assignSubmitting}
                    className="residents-btn residents-btn-secondary"
                  >
                    Hủy bỏ
                  </button>
                  <button
                    type="submit"
                    disabled={assignSubmitting || !selectedAssignRoomId}
                    className="residents-btn residents-btn-primary"
                  >
                    {assignSubmitting ? 'Đang lưu...' : 'Xác Nhận Gán Phòng'}
                  </button>
                </div>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};
