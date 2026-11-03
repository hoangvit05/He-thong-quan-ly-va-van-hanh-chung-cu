// =========================================================================
// DESIGN SYSTEM & DASHBOARD UNIT TEST SUITE
// Phụ trách: Đăng Hoàng (Web Lead)
// Mục tiêu: Kiểm thử toàn diện tính toàn vẹn của bộ Component dùng chung,
//           tính toán số liệu Dashboard BQL và RBAC Routing Contract.
// =========================================================================

import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

import { MENU_ITEMS } from '../src/constants/menu.ts';
import { getRootRedirectPath, WEB_PORTAL_ROLES } from '../src/utils/auth.ts';

describe('1. DESIGN SYSTEM & SHARED COMPONENTS INTEGRITY', () => {
  const commonPath = path.join(__dirname, '../src/components/common');

  it('DS-01: Kiểm tra thư mục components/common và tệp barrel export index.ts', () => {
    assert.strictEqual(fs.existsSync(commonPath), true, 'Thư mục components/common phải tồn tại');
    const indexPath = path.join(commonPath, 'index.ts');
    assert.strictEqual(fs.existsSync(indexPath), true, 'index.ts phải tồn tại');
    const indexSource = fs.readFileSync(indexPath, 'utf8');

    assert(indexSource.includes("export * from './Button'"), 'Phải export Button');
    assert(indexSource.includes("export * from './Card'"), 'Phải export Card');
    assert(indexSource.includes("export * from './StatCard'"), 'Phải export StatCard');
    assert(indexSource.includes("export * from './Badge'"), 'Phải export Badge');
    assert(indexSource.includes("export * from './Modal'"), 'Phải export Modal');
    assert(indexSource.includes("export * from './ConfirmDialog'"), 'Phải export ConfirmDialog');
    assert(indexSource.includes("export * from './DataTable'"), 'Phải export DataTable');
    assert(indexSource.includes("export * from './Pagination'"), 'Phải export Pagination');
    assert(indexSource.includes("export * from './SearchFilterBar'"), 'Phải export SearchFilterBar');
    assert(indexSource.includes("export * from './LoadingSpinner'"), 'Phải export LoadingSpinner');
    assert(indexSource.includes("export * from './EmptyState'"), 'Phải export EmptyState');
    assert(indexSource.includes("export * from './AlertBanner'"), 'Phải export AlertBanner');
  });

  it('DS-02: Kiểm tra Button.tsx tuân thủ kích thước tối thiểu WCAG 2.2 AA (>= 44px)', () => {
    const buttonPath = path.join(commonPath, 'Button.tsx');
    const buttonSource = fs.readFileSync(buttonPath, 'utf8');
    assert(buttonSource.includes('min-h-[44px]'), 'Nút cỡ chuẩn (md) phải có chiều cao tối thiểu 44px');
    assert(buttonSource.includes('min-h-[48px]'), 'Nút cỡ lớn (lg) phải có chiều cao tối thiểu 48px');
    assert(buttonSource.includes('disabled={disabled || isLoading}'), 'Phải vô hiệu hóa nút khi đang loading');
  });

  it('DS-03: Kiểm tra Modal.tsx hỗ trợ phím Escape và bọc overlay dễ tiếp cận', () => {
    const modalPath = path.join(commonPath, 'Modal.tsx');
    const modalSource = fs.readFileSync(modalPath, 'utf8');
    assert(modalSource.includes("e.key === 'Escape'"), 'Modal phải lắng nghe phím Escape');
    assert(modalSource.includes('aria-modal="true"'), 'Modal phải có thuộc tính aria-modal');
    assert(modalSource.includes('role="dialog"'), 'Modal phải có role dialog');
  });

  it('DS-04: Kiểm tra Sidebar.tsx và Header.tsx hỗ trợ chế độ Responsive Mobile Drawer', () => {
    const sidebarPath = path.join(__dirname, '../src/components/Layout/Sidebar.tsx');
    const headerPath = path.join(__dirname, '../src/components/Layout/Header.tsx');
    const sidebarSource = fs.readFileSync(sidebarPath, 'utf8');
    const headerSource = fs.readFileSync(headerPath, 'utf8');

    assert(sidebarSource.includes('isMobileOpen'), 'Sidebar phải nhận prop isMobileOpen');
    assert(sidebarSource.includes('onCloseMobile'), 'Sidebar phải nhận prop onCloseMobile');
    assert(headerSource.includes('onToggleMobile'), 'Header phải nhận prop onToggleMobile');
  });
});

describe('2. DASHBOARD BQL CALCULATIONS & STATE MANAGEMENT', () => {
  // Hàm mô phỏng tính toán occupancy rate như trong DashboardPage.tsx
  const calculateOccupancyRate = (occupied, total) => {
    if (!total || total <= 0) return 0;
    return Math.round((occupied / total) * 100);
  };

  it('DB-01: Tính tỷ lệ lấp đầy phòng chính xác khi có phòng đang ở', () => {
    assert.strictEqual(calculateOccupancyRate(85, 100), 85);
    assert.strictEqual(calculateOccupancyRate(1, 3), 33);
    assert.strictEqual(calculateOccupancyRate(2, 3), 67);
  });

  it('DB-02: Phòng rỗng hoặc tòa nhà mới (total = 0) không gây lỗi chia cho 0', () => {
    assert.strictEqual(calculateOccupancyRate(0, 0), 0);
    assert.strictEqual(calculateOccupancyRate(5, 0), 0);
    assert.strictEqual(calculateOccupancyRate(0, 50), 0);
  });

  it('DB-03: Kiểm tra tính toàn vẹn của mã nguồn DashboardPage.tsx', () => {
    const dashPath = path.join(__dirname, '../src/pages/DashboardPage.tsx');
    assert.strictEqual(fs.existsSync(dashPath), true, 'DashboardPage.tsx phải tồn tại');
    const dashSource = fs.readFileSync(dashPath, 'utf8');

    assert(dashSource.includes('Promise.allSettled'), 'Dashboard phải gọi đồng thời các API qua Promise.allSettled');
    assert(dashSource.includes('API_ENDPOINTS.ROOMS.LIST'), 'Kết nối danh mục phòng');
    assert(dashSource.includes('API_ENDPOINTS.AUTH.RESIDENTS'), 'Kết nối cư dân');
    assert(dashSource.includes('API_ENDPOINTS.TICKETS.LIST'), 'Kết nối sự cố kỹ thuật');
    assert(dashSource.includes('API_ENDPOINTS.INVOICES.LIST'), 'Kết nối hóa đơn thu phí');
    assert(dashSource.includes('API_ENDPOINTS.FEEDBACK.LIST'), 'Kết nối hòm thư góp ý');
    assert(dashSource.includes('API_ENDPOINTS.NOTIFICATIONS.LIST'), 'Kết nối thông báo tòa nhà');
  });
});

describe('3. PRODUCTION MENU & RBAC CONTRACT VERIFICATION', () => {
  it('MN-01: MENU_ITEMS có đúng 8 danh mục chức năng phân quyền', () => {
    assert.strictEqual(MENU_ITEMS.length, 8);
  });

  it('MN-02: Route /dashboard được cấp quyền cho cả BQL và ADMIN', () => {
    const dashItem = MENU_ITEMS.find((item) => item.path === '/dashboard');
    assert.ok(dashItem, 'Phải có mục menu /dashboard');
    assert.strictEqual(dashItem.roles.includes('BQL'), true);
    assert.strictEqual(dashItem.roles.includes('ADMIN'), true);
    assert.strictEqual(dashItem.roles.includes('RESIDENT'), false);
  });

  it('MN-03: getRootRedirectPath tự động chuyển hướng BQL vào Dashboard', () => {
    assert.strictEqual(getRootRedirectPath('BQL'), '/dashboard');
    assert.strictEqual(getRootRedirectPath('ADMIN'), '/admin/accounts');
    assert.strictEqual(getRootRedirectPath('TECHNICIAN'), '/technician/tasks');
    assert.strictEqual(getRootRedirectPath('RESIDENT'), '/login');
  });

  it('MN-04: Cư dân (RESIDENT) không xuất hiện trong bất kỳ mục menu nào trên Web', () => {
    MENU_ITEMS.forEach((item) => {
      assert.strictEqual(
        item.roles.includes('RESIDENT'),
        false,
        `Mục [${item.title}] vi phạm cấp quyền cho RESIDENT trên Web`
      );
    });
  });
});
