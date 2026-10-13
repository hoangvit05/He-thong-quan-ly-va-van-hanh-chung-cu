// Phụ trách: Hiếu
// Chức năng: Lập biểu phí định kỳ hàng tháng, xem hóa đơn theo căn hộ, sinh mã VietQR động
import { Router, Request, Response } from 'express';
import prisma from '../../database/prisma';
import { generateVietQRUrl } from '../../common/utils/vietqr';

const router = Router();

// 1. Lấy danh sách hóa đơn toàn tòa nhà (BQL tra cứu)
router.get('/', async (req: Request, res: Response) => {
  try {
    const { month, status, roomId } = req.query;
    const where: any = {};
    if (month) where.month = String(month);
    if (status) where.status = String(status);
    if (roomId) where.roomId = Number(roomId);

    const invoices = await prisma.invoice.findMany({
      where,
      include: {
        room: true,
        payments: true,
      },
      orderBy: { createdAt: 'desc' },
    });

    res.json({ success: true, data: invoices, message: 'Danh sách hóa đơn phí dịch vụ' });
  } catch (error: any) {
    res.status(500).json({ success: false, data: null, message: error.message || 'Lỗi lấy danh sách hóa đơn' });
  }
});

// 2. BQL tạo biểu phí định kỳ tháng mới (Bẫy: Chặn trùng hóa đơn & Chốt Snapshot tổng tiền)
router.post('/', async (req: Request, res: Response) => {
  try {
    const { roomId, month, managementFee = 0, parkingFee = 0, waterFee = 0, otherFee = 0, dueDate } = req.body;

    if (!roomId || !month) {
      return res.status(400).json({ success: false, message: 'Vui lòng cung cấp roomId và tháng (month: MM/YYYY).' });
    }

    // Kiểm tra xem phòng đó trong tháng đó đã có hóa đơn chưa (Phòng tránh bẫy trùng lặp)
    const existing = await prisma.invoice.findUnique({
      where: {
        roomId_month: {
          roomId: Number(roomId),
          month: String(month),
        },
      },
    });

    if (existing) {
      return res.status(409).json({
        success: false,
        message: `Phòng ${roomId} đã được tạo hóa đơn cho tháng ${month} rồi! Vui lòng không tạo trùng lặp.`,
      });
    }

    // Chốt Snapshot tổng tiền cố định (Không tính động lại sau này)
    const totalAmount = Number(managementFee) + Number(parkingFee) + Number(waterFee) + Number(otherFee);

    const newInvoice = await prisma.invoice.create({
      data: {
        roomId: Number(roomId),
        month: String(month),
        managementFee: Number(managementFee),
        parkingFee: Number(parkingFee),
        waterFee: Number(waterFee),
        otherFee: Number(otherFee),
        totalAmount,
        dueDate: dueDate ? new Date(dueDate) : null,
        status: 'UNPAID',
      },
    });

    res.status(201).json({ success: true, data: newInvoice, message: 'Lập hóa đơn thành công' });
  } catch (error: any) {
    res.status(500).json({ success: false, data: null, message: error.message || 'Lỗi lập hóa đơn' });
  }
});

// 3. Cư dân xem hóa đơn của căn hộ mình
router.get('/my-invoice', async (req: Request, res: Response) => {
  try {
    const { roomId, month } = req.query;

    if (!roomId) {
      return res.status(400).json({ success: false, message: 'Vui lòng cung cấp thông tin roomId.' });
    }

    const where: any = { roomId: Number(roomId) };
    if (month) where.month = String(month);

    const invoices = await prisma.invoice.findMany({
      where,
      include: { room: true, payments: true },
      orderBy: { createdAt: 'desc' },
    });

    res.json({ success: true, data: invoices, message: 'Chi tiết hóa đơn căn hộ' });
  } catch (error: any) {
    res.status(500).json({ success: false, data: null, message: error.message || 'Lỗi tra cứu hóa đơn căn hộ' });
  }
});

// 4. Sinh mã VietQR chuyển khoản ngân hàng động (Không lưu file ảnh vào DB)
router.get('/:id/vietqr', async (req: Request, res: Response) => {
  try {
    const invoiceId = Number(req.params.id);

    const invoice = await prisma.invoice.findUnique({
      where: { id: invoiceId },
      include: { room: true },
    });

    if (!invoice) {
      return res.status(404).json({ success: false, message: 'Không tìm thấy hóa đơn.' });
    }

    // Tính số tiền còn lại cần nộp
    const remainingAmount = Math.max(0, invoice.totalAmount - invoice.paidAmount);

    // Sinh link mã VietQR động trực tiếp từ chuẩn quốc gia
    const qrUrl = generateVietQRUrl({
      amount: remainingAmount,
      description: `HOA DON PHONG ${invoice.room.roomNumber} T${invoice.month}`,
    });

    res.json({
      success: true,
      data: {
        invoiceId: invoice.id,
        roomNumber: invoice.room.roomNumber,
        totalAmount: invoice.totalAmount,
        paidAmount: invoice.paidAmount,
        remainingAmount,
        vietQrUrl: qrUrl,
      },
      message: 'Sinh mã VietQR thanh toán thành công',
    });
  } catch (error: any) {
    res.status(500).json({ success: false, data: null, message: error.message || 'Lỗi sinh mã VietQR' });
  }
});

// 5. Cập nhật trạng thái thanh toán & Ghi nhận giao dịch
router.put('/:id/status', async (req: Request, res: Response) => {
  try {
    const invoiceId = Number(req.params.id);
    const { status, paidAmount, paymentMethod, transactionCode, note } = req.body;

    const invoice = await prisma.invoice.findUnique({ where: { id: invoiceId } });
    if (!invoice) {
      return res.status(404).json({ success: false, message: 'Không tìm thấy hóa đơn.' });
    }

    // Ghi nhận thanh toán nếu có số tiền nộp
    if (paidAmount && Number(paidAmount) > 0) {
      await prisma.payment.create({
        data: {
          invoiceId,
          amount: Number(paidAmount),
          paymentMethod: paymentMethod || 'VIETQR',
          transactionCode: transactionCode || null,
          note: note || null,
        },
      });
    }

    const newPaidAmount = (invoice.paidAmount || 0) + (paidAmount ? Number(paidAmount) : 0);
    const calculatedStatus =
      status || (newPaidAmount >= invoice.totalAmount ? 'PAID' : newPaidAmount > 0 ? 'PARTIALLY_PAID' : 'UNPAID');

    const updated = await prisma.invoice.update({
      where: { id: invoiceId },
      data: {
        status: calculatedStatus,
        paidAmount: newPaidAmount,
      },
    });

    res.json({ success: true, data: updated, message: 'Cập nhật thanh toán thành công' });
  } catch (error: any) {
    res.status(500).json({ success: false, data: null, message: error.message || 'Lỗi cập nhật thanh toán' });
  }
});

export default router;
