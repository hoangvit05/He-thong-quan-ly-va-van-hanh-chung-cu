// ===================================================
// AUTH SESSION & USER UTILITY
// Phụ trách: Đăng Hoàng (Web Lead)
// ===================================================

export type AppRole = 'ADMIN' | 'BQL' | 'TECHNICIAN' | 'RESIDENT';

export interface StoredUser {
  id?: number;
  username?: string;
  fullName?: string;
  email?: string;
  phone?: string;
  role?: AppRole;
  roomId?: number | null;
  roomNumber?: string | null;
  isApproved?: boolean;
}

export interface LoginResponseData {
  token: string;
  user: StoredUser;
}

export interface ApiEnvelope<T = unknown> {
  success: boolean;
  data: T;
  message: string;
  pagination?: {
    page: number;
    limit: number;
    total: number;
    totalPages: number;
  };
}

export const ALL_ROLES: AppRole[] = ['ADMIN', 'BQL', 'TECHNICIAN', 'RESIDENT'];
export const WEB_PORTAL_ROLES: AppRole[] = ['ADMIN', 'BQL', 'TECHNICIAN'];

/**
 * Đọc token an toàn từ localStorage (chống lưu chuỗi 'undefined' / 'null')
 */
export function getStoredToken(): string | null {
  try {
    const token = localStorage.getItem('token');
    if (!token || token === 'undefined' || token === 'null' || token.trim() === '') {
      return null;
    }
    return token.trim();
  } catch {
    return null;
  }
}

/**
 * Đọc user an toàn từ localStorage (chống cú pháp JSON hỏng gây crash giao diện)
 */
export function getStoredUser(): StoredUser | null {
  try {
    const raw = localStorage.getItem('user');
    if (!raw || raw === 'undefined' || raw === 'null' || raw.trim() === '') {
      return null;
    }
    const parsed = JSON.parse(raw);
    if (!parsed || typeof parsed !== 'object') {
      return null;
    }
    return parsed as StoredUser;
  } catch {
    return null;
  }
}

/**
 * Thiết lập phiên đăng nhập vào localStorage một cách an toàn.
 * Cổng Quản trị Web chỉ cho phép các vai trò Quản lý/Kỹ thuật (WEB_PORTAL_ROLES).
 * Tuyệt đối từ chối tạo session cho vai trò RESIDENT.
 */
export function setAuthSession(token: string, user: StoredUser): boolean {
  if (!token || typeof token !== 'string' || token === 'undefined' || token === 'null' || !token.trim()) {
    return false;
  }
  if (!user || typeof user !== 'object' || !user.role || !WEB_PORTAL_ROLES.includes(user.role)) {
    return false;
  }
  try {
    localStorage.setItem('token', token.trim());
    localStorage.setItem('user', JSON.stringify(user));
    return true;
  } catch {
    return false;
  }
}

/**
 * Xóa sạch dữ liệu phiên đăng nhập
 */
export function clearAuthSession(): void {
  try {
    localStorage.removeItem('token');
    localStorage.removeItem('user');
  } catch {
    // Không ném lỗi nếu localStorage bị chặn
  }
}

/**
 * Kiểm tra trạng thái đã đăng nhập và có vai trò hợp lệ trên Web Management Portal
 */
export function isAuthenticated(): boolean {
  const token = getStoredToken();
  const user = getStoredUser();
  return Boolean(token && user && user.role && WEB_PORTAL_ROLES.includes(user.role));
}

/**
 * Đường dẫn điều hướng mặc định sau đăng nhập theo vai trò người dùng
 */
export function getRootRedirectPath(role?: AppRole): string {
  switch (role) {
    case 'ADMIN':
      return '/admin/accounts';
    case 'BQL':
      return '/residents';
    case 'TECHNICIAN':
      return '/technician/tasks';
    case 'RESIDENT':
    default:
      return '/login';
  }
}

/**
 * Kết quả phân quyền tuyến đường
 */
export interface RouteAccessDecision {
  allowed: boolean;
  status: 200 | 302 | 403;
  redirect?: string;
  reason?: string;
}

/**
 * Đánh giá phân quyền truy cập tuyến đường cho RouteGuard (Production & Test dùng chung)
 */
export function evaluateRouteAccess(
  user: StoredUser | null,
  allowedRoles?: AppRole[]
): RouteAccessDecision {
  const token = getStoredToken();
  if (!token || !user || !user.role) {
    return { allowed: false, status: 302, redirect: '/login', reason: 'UNAUTHENTICATED' };
  }

  if (user.role === 'RESIDENT' || !WEB_PORTAL_ROLES.includes(user.role)) {
    return { allowed: false, status: 403, reason: 'RESIDENT_OR_INVALID_ROLE' };
  }

  if (allowedRoles && allowedRoles.length > 0 && !allowedRoles.includes(user.role)) {
    return { allowed: false, status: 403, reason: 'ROLE_UNAUTHORIZED' };
  }

  return { allowed: true, status: 200 };
}

/**
 * Xử lý gắn Authorization token và định dạng dữ liệu cho request (Dùng chung cho Axios interceptor)
 */
export function applyRequestAuth<T extends { headers?: Record<string, string>; data?: unknown }>(
  config: T,
  tokenGetter: () => string | null = getStoredToken
): T {
  const token = tokenGetter();
  if (token) {
    config.headers = config.headers || {};
    config.headers['Authorization'] = `Bearer ${token}`;
  }

  // Nếu gửi dữ liệu dạng FormData (upload media, tệp đính kèm), xóa Content-Type
  // để trình duyệt tự động thiết lập multipart/form-data cùng boundary hợp lệ
  const isFormData = typeof FormData !== 'undefined' && config.data instanceof FormData;
  if (isFormData && config.headers) {
    delete config.headers['Content-Type'];
  }

  return config;
}

export interface FormattedAxiosError {
  status?: number;
  message: string;
  data: unknown;
  raw: unknown;
}

/**
 * Xử lý lỗi HTTP response, bao gồm 401 Session Handling và chuyển đổi thông báo lỗi thân thiện
 */
export function formatAxiosError(
  error: any,
  clearSession: () => void = clearAuthSession,
  currentPath?: string,
  redirectFn?: (path: string) => void
): FormattedAxiosError {
  const status = error?.response?.status;
  const backendData = error?.response?.data;

  // Xử lý 401 Unauthorized: Xóa phiên và chuyển về /login đúng một lần, chống vòng lặp redirect
  if (status === 401) {
    clearSession();
    const url = String(error?.config?.url || '');
    const isLoginRequest = url.includes('/auth/login');
    const path = currentPath || (typeof window !== 'undefined' ? window.location.pathname : '');
    const isLoginPage = path === '/login';
    if (!isLoginRequest && !isLoginPage) {
      if (redirectFn) {
        redirectFn('/login');
      } else if (typeof window !== 'undefined' && typeof window.location?.replace === 'function') {
        window.location.replace('/login');
      }
    }
  }

  // Xác định thông báo lỗi thân thiện dựa trên HTTP status code nếu Backend không gửi message cụ thể
  let fallbackMessage = 'Đã xảy ra lỗi khi kết nối tới máy chủ.';
  if (!error?.response) {
    fallbackMessage = 'Không thể kết nối đến máy chủ. Vui lòng kiểm tra đường truyền mạng hoặc liên hệ quản trị viên.';
  } else if (status === 400) {
    fallbackMessage = 'Yêu cầu không hợp lệ hoặc thiếu thông tin bắt buộc.';
  } else if (status === 401) {
    fallbackMessage = 'Phiên đăng nhập đã hết hạn hoặc thông tin xác thực không chính xác.';
  } else if (status === 403) {
    fallbackMessage = 'Bạn không có quyền thực hiện thao tác hoặc truy cập tài nguyên này.';
  } else if (status === 404) {
    fallbackMessage = 'Không tìm thấy tài nguyên yêu cầu trên máy chủ.';
  } else if (status === 409) {
    fallbackMessage = 'Dữ liệu đã tồn tại hoặc xảy ra xung đột trạng thái.';
  } else if (status === 422) {
    fallbackMessage = 'Dữ liệu gửi lên không vượt qua được kiểm tra logic của hệ thống.';
  } else if (status === 429) {
    fallbackMessage = 'Quá nhiều yêu cầu gửi tới hệ thống cùng lúc. Vui lòng thử lại sau giây lát.';
  } else if (status === 500) {
    fallbackMessage = 'Lỗi máy chủ nội bộ. Vui lòng liên hệ ban quản trị để được hỗ trợ.';
  } else if (status === 502 || status === 503) {
    fallbackMessage = 'Dịch vụ máy chủ tạm thời không sẵn sàng hoặc đang bảo trì. Vui lòng thử lại sau.';
  }

  // Thứ tự ưu tiên thông báo lỗi chuẩn xác:
  // 1. Message hoặc error từ Backend envelope ({ success: false, message: '...' } hoặc { error: '...' })
  // 2. Fallback tiếng Việt tương ứng với HTTP status hoặc lỗi mạng (Network Error)
  // 3. Cuối cùng mới đến error?.message nếu không có fallback phù hợp
  const backendMsg =
    typeof backendData?.message === 'string' && backendData.message.trim() !== ''
      ? backendData.message.trim()
      : typeof backendData?.error === 'string' && backendData.error.trim() !== ''
      ? backendData.error.trim()
      : null;

  const message = backendMsg || fallbackMessage || error?.message || 'Đã xảy ra lỗi không xác định.';

  return {
    status,
    message,
    data: backendData?.data ?? null,
    raw: backendData,
  };
}
