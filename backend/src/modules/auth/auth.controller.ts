// Phụ trách: Đặng Hoàng
// Chức năng: Đăng nhập, đổi mật khẩu, cấp JWT token cho 4 roles
import { Router } from 'express';

const router = Router();

router.post('/login', (req, res) => {
  // TODO (Hoàng): Xác thực tài khoản và cấp JWT Token
  res.json({ success: true, data: { token: 'sample-jwt-token', role: 'ADMIN' }, message: 'Đăng nhập thành công' });
});

router.post('/change-password', (req, res) => {
  // TODO (Hoàng): Đổi mật khẩu
  res.json({ success: true, data: null, message: 'Đổi mật khẩu thành công' });
});

export default router;
