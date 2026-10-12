export interface MenuItem {
  title: string;
  path: string;
  role: 'ADMIN' | 'BQL' | 'TECHNICIAN' | 'ALL';
}

export const MENU_ITEMS: MenuItem[] = [
  // 1. Phân hệ Admin (Hoàng)
  { title: "Quản lý Tài khoản (Admin)", path: "/admin/accounts", role: "ADMIN" },

  // 2. Phân hệ BQL (Đức)
  { title: "Căn hộ & Cư dân", path: "/residents", role: "BQL" },
  { title: "Bảng chia việc (Sự cố)", path: "/ticket-dispatch", role: "BQL" },
  { title: "Hóa đơn & Biểu phí", path: "/billing", role: "BQL" },

  // 3. Phân hệ Thợ Kỹ thuật & BQL phụ (Oanh)
  { title: "Không gian làm việc Thợ", path: "/technician-tasks", role: "TECHNICIAN" },
  { title: "Soạn & Gửi thông báo", path: "/announcements", role: "BQL" },
  { title: "Hòm thư góp ý", path: "/feedback", role: "BQL" },
];
