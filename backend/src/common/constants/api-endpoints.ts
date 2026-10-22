// ========================================================
// FILE THỐNG NHẤT DANH MỤC API DÙNG CHUNG TOÀN HỆ THỐNG
// ========================================================

export const API_ENDPOINTS = {
  // 1. Phân hệ Auth & Quản lý User (Phụ trách: Đặng Hoàng)
  AUTH: {
    LOGIN: '/api/auth/login',
    CHANGE_PASSWORD: '/api/auth/change-password',
    ADMIN_USERS: '/api/admin/users',
    RESIDENTS: '/api/apartments/residents',
    APPROVE_RESIDENT: (id: string | number) => `/api/apartments/residents/${id}/approve`,
    ASSIGN_ROOM: (id: string | number) => `/api/apartments/residents/${id}/room`,
  },

  // Alias ngữ nghĩa cho phân hệ Cư dân (Quản lý Cư dân tòa nhà)
  RESIDENTS: {
    LIST: '/api/apartments/residents',
    APPROVE: (id: string | number) => `/api/apartments/residents/${id}/approve`,
    ASSIGN_ROOM: (id: string | number) => `/api/apartments/residents/${id}/room`,
  },

  // 2. Phân hệ Báo hỏng & Luồng Sự cố (Phụ trách: Hiếu)
  TICKETS: {
    CREATE: '/api/tickets',
    LIST: '/api/tickets',
    MY_TICKETS: '/api/tickets/my-tickets',
    ASSIGN: (id: string | number) => `/api/tickets/${id}/assign`,
    TECHNICIAN_TICKETS: '/api/technician/tickets',
    UPDATE_STATUS: (id: string | number) => `/api/technician/tickets/${id}/status`,
    SUBMIT_MATERIALS: (id: string | number) => `/api/technician/tickets/${id}/materials`,
    RATE: (id: string | number) => `/api/tickets/${id}/rate`,
  },

  // 3. Phân hệ Hóa đơn & Biểu phí (Phụ trách: Hiếu)
  INVOICES: {
    CREATE: '/api/invoices',
    LIST: '/api/invoices',
    MY_INVOICE: '/api/invoices/my-invoice',
    VIETQR: (id: string | number) => `/api/invoices/${id}/vietqr`,
    UPDATE_STATUS: (id: string | number) => `/api/invoices/${id}/status`,
  },

  // 4. Phân hệ Hòm thư góp ý (Phụ trách: Hiếu)
  FEEDBACK: {
    SUBMIT: '/api/feedback',
    LIST: '/api/feedback',
    MY_FEEDBACK: '/api/feedback/my-feedback',
    REPLY: (id: string | number) => `/api/feedback/${id}/reply`,
  },

  // 5. Phân hệ Thông báo & Push Notification (Phụ trách: Đặng Hoàng)
  NOTIFICATIONS: {
    CREATE: '/api/notifications',
    LIST: '/api/notifications',
  },

  // 6. Phân hệ Quản lý Căn hộ (Phụ trách: Việt Hoàng)
  ROOMS: {
    LIST: '/api/rooms',
    CREATE: '/api/rooms',
    UPDATE: (id: string | number) => `/api/rooms/${id}`,
  },

  // 7. Phân hệ Tải lên Đa phương tiện Cloudinary (Phụ trách: Việt Hoàng)
  MEDIA: {
    SIGNATURE: '/api/media/signature',
    CONFIRM: '/api/media/confirm',
  },
};
