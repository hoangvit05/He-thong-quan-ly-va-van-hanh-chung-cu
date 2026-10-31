export type AppRole = 'ADMIN' | 'BQL' | 'TECHNICIAN' | 'RESIDENT';

export interface MenuItem {
  title: string;
  path: string;
  roles: AppRole[];
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
    roles: ['ADMIN', 'BQL'],
  },
  {
    title: 'Điều phối sự cố',
    path: '/tickets/dispatch',
    roles: ['ADMIN', 'BQL'],
  },
  {
    title: 'Nhiệm vụ kỹ thuật',
    path: '/technician/tasks',
    roles: ['TECHNICIAN'],
  },
  {
    title: 'Hóa đơn & Thu phí',
    path: '/billing',
    roles: ['ADMIN', 'BQL'],
  },
  {
    title: 'Phản ánh & Đóng góp',
    path: '/feedback',
    roles: ['ADMIN', 'BQL'],
  },
  {
    title: 'Thông báo tòa nhà',
    path: '/announcements',
    roles: ['ADMIN', 'BQL'],
  },
];
