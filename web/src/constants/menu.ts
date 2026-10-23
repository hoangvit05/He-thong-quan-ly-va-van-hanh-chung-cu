export interface MenuItem {
  title: string;
  path: string;
  roles: string[];
}

export const MENU_ITEMS: MenuItem[] = [
  {
    title: 'Quản lý tài khoản',
    path: '/admin/accounts',
    roles: ['ADMIN'],
  },
  {
    title: 'Cư dân & Căn hộ',
    path: '/residents',
    roles: ['ADMIN', 'MANAGER'],
  },
  {
    title: 'Điều phối sự cố',
    path: '/tickets/dispatch',
    roles: ['ADMIN', 'MANAGER'],
  },
  {
    title: 'Nhiệm vụ kỹ thuật',
    path: '/technician/tasks',
    roles: ['TECHNICIAN'],
  },
  {
    title: 'Hóa đơn & Thu phí',
    path: '/billing',
    roles: ['ADMIN', 'MANAGER'],
  },
  {
    title: 'Phản ánh & Đóng góp',
    path: '/feedback',
    roles: ['ADMIN', 'MANAGER'],
  },
  {
    title: 'Thông báo tòa nhà',
    path: '/announcements',
    roles: ['ADMIN', 'MANAGER'],
  },
];