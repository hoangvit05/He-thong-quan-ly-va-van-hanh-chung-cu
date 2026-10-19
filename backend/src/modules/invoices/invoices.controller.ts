// Phụ trách: Hiếu
// Chức năng: Lập biểu phí định kỳ hàng tháng, xem hóa đơn theo căn hộ, sinh mã VietQR động, ghi nhận giao dịch thanh toán
import { Router, Request, Response } from 'express';
import { Prisma } from '@prisma/client';
import prisma from '../../database/prisma';
import { generateVietQRUrl } from '../../common/utils/vietqr';

const router = Router();

/**
 * Chuẩn hóa định dạng tháng về chuẩn ISO YYYY-MM (ví dụ: "2026-10")
 * Hỗ trợ nhận cả "YYYY-MM" và "MM/YYYY" từ client để chống bypass unique constraint
 */
function normalizeMonth(rawMonth: string): string {
  const trimmed = String(rawMonth || '').trim();
  // Khớp định dạng YYYY-MM (2026-10)
  if (/^\d{4}-(0[1-9]|1[0-2])$/.test(trimmed)) {
    return trimmed;
  }
  // Khớp định dạng MM/YYYY (10/2026) -> chuyển thành YYYY-MM
  const match = trimmed.match(/^(0[1-9]|1[0-2])\/(\d{4})$/);
  if (match) {
    return `${match[2]}-${match[1]}`;
  }
  throw new Error('Định dạng tháng không hợp lệ. Vui lòng nhập định dạng YYYY-MM (ví dụ: "2026-10") hoặc MM/YYYY.');
}

/**
 * Kiểm tra và chuyển đổi an toàn sang Prisma.Decimal với độ chính xác 2 chữ số thập phân
 */
function parseSafeDecimal(val: any, fieldName: string, defaultValue = '0'): Prisma.Decimal {
  if (val === undefined || val === null || val === '') {
    return new Prisma.Decimal(defaultValue);
  }
  try {
    const dec = new Prisma.Decimal(val);
    if (dec.isNaN() || !dec.isFinite()) {
      throw new Error(`Giá trị ${fieldName} không hợp lệ.`);
    }
    if (dec.isNegative()) {
      throw new Error(`Số tiền ${fieldName} không được âm.`);
    }
    return dec.toDecimalPlaces(2, Prisma.Decimal.ROUND_HALF_UP);
  } catch (err: any) {
    throw new Error(`Giá trị ${fieldName} không hợp lệ: ${err.message}`);
  }
}

// 1. Lấy danh sách hóa đơn toàn tòa nhà (BQL tra cứu)
router.get('/', async (req: Request, res: Response) => {
  try {
    const { month, status, roomId } = req.query;
    const where: any = {};
    if (month) {
      try {
        where.month = normalizeMonth(String(month));
      } catch {
        where.month = String(month);
      }
    }
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

// 2. BQL tạo biểu phí định kỳ tháng mới (Bẫy: Chặn trùng hóa đơn & Chốt Snapshot tổng tiền bằng Decimal)
router.post('/', async (req: Request, res: Response) => {
  try {
    const { roomId, month, managementFee = 0, parkingFee = 0, waterFee = 0, otherFee = 0, dueDate } = req.body;

    if (!roomId || !month) {
      return res.status(400).json({ success: false, message: 'Vui lòng cung cấp roomId và tháng (month: YYYY-MM hoặc MM/YYYY).' });
    }

    let normalizedMonth: string;
    try {
      normalizedMonth = normalizeMonth(month);
    } catch (err: any) {
      return res.status(400).json({ success: false, message: err.message });
    }

    // Kiểm tra xem phòng đó trong tháng đó đã có hóa đơn chưa (Phòng tránh bẫy trùng lặp)
    const existing = await prisma.invoice.findUnique({
      where: {
        roomId_month: {
          roomId: Number(roomId),
          month: normalizedMonth,
        },
      },
    });

    if (existing) {
      return res.status(409).json({
        success: false,
        message: `Phòng ${roomId} đã được tạo hóa đơn cho tháng ${normalizedMonth} rồi! Vui lòng không tạo trùng lặp.`,
      });
    }

    // Chuyển đổi và kiểm tra an toàn các trường tiền tệ (Tránh rủi ro số âm, NaN, float drift)
    const mgmt = parseSafeDecimal(managementFee, 'Phí quản lý');
    const park = parseSafeDecimal(parkingFee, 'Phí gửi xe');
    const water = parseSafeDecimal(waterFee, 'Tiền nước');
    const other = parseSafeDecimal(otherFee, 'Phí khác');

    // Chốt Snapshot tổng tiền cố định bằng phép tính Decimal chính xác tuyệt đối
    const totalAmount = mgmt.plus(park).plus(water).plus(other);

    const newInvoice = await prisma.invoice.create({
      data: {
        roomId: Number(roomId),
        month: normalizedMonth,
        managementFee: mgmt,
        parkingFee: park,
        waterFee: water,
        otherFee: other,
        totalAmount,
        paidAmount: new Prisma.Decimal(0),
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
    if (month) {
      try {
        where.month = normalizeMonth(String(month));
      } catch {
        where.month = String(month);
      }
    }

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

    // Tính số tiền còn lại cần nộp bằng Decimal chính xác
    const totalDec = new Prisma.Decimal(invoice.totalAmount);
    const paidDec = new Prisma.Decimal(invoice.paidAmount);
    const remainingDec = Prisma.Decimal.max(new Prisma.Decimal(0), totalDec.minus(paidDec));

    // Làm tròn số nguyên VND để truyền vào VietQR NAPAS 24/7
    const remainingVnd = Math.round(remainingDec.toNumber());

    // Sinh link mã VietQR động trực tiếp từ chuẩn quốc gia
    const qrUrl = generateVietQRUrl({
      amount: remainingVnd,
      description: `HOA DON PHONG ${invoice.room.roomNumber} T${invoice.month}`,
    });

    res.json({
      success: true,
      data: {
        invoiceId: invoice.id,
        roomNumber: invoice.room.roomNumber,
        totalAmount: invoice.totalAmount,
        paidAmount: invoice.paidAmount,
        remainingAmount: remainingDec,
        vietQrUrl: qrUrl,
      },
      message: 'Sinh mã VietQR thanh toán thành công',
    });
  } catch (error: any) {
    res.status(500).json({ success: false, data: null, message: error.message || 'Lỗi sinh mã VietQR' });
  }
});

// 5. Cập nhật trạng thái thanh toán & Ghi nhận giao dịch (Bảo vệ bằng Database Transaction ACID)
router.put('/:id/status', async (req: Request, res: Response) => {
  try {
    const invoiceId = Number(req.params.id);
    const { status, paidAmount, paymentMethod, transactionCode, note } = req.body;

    // Bọc trong Prisma Transaction để đảm bảo tính nguyên tử (Atomicity): ghi payment & cập nhật invoice đồng thời
    const result = await prisma.$transaction(async (tx) => {
      const invoice = await tx.invoice.findUnique({ where: { id: invoiceId } });
      if (!invoice) {
        throw new Error('NOT_FOUND: Không tìm thấy hóa đơn.');
      }

      let paymentDec: Prisma.Decimal | null = null;
      if (paidAmount !== undefined && paidAmount !== null && paidAmount !== '') {
        paymentDec = parseSafeDecimal(paidAmount, 'Số tiền thanh toán');
        if (paymentDec.isZero()) {
          throw new Error('INVALID_AMOUNT: Số tiền thanh toán phải lớn hơn 0.');
        }

        // Tạo bản ghi Payment
        await tx.payment.create({
          data: {
            invoiceId,
            amount: paymentDec,
            paymentMethod: paymentMethod || 'VIETQR',
            transactionCode: transactionCode || null,
            note: note || null,
          },
        });
      }

      const currentPaid = new Prisma.Decimal(invoice.paidAmount || 0);
      const newPaidAmount = paymentDec ? currentPaid.plus(paymentDec) : currentPaid;
      const totalAmount = new Prisma.Decimal(invoice.totalAmount);

      const calculatedStatus =
        status ||
        (newPaidAmount.greaterThanOrEqualTo(totalAmount)
          ? 'PAID'
          : newPaidAmount.greaterThan(0)
            ? 'PARTIALLY_PAID'
            : 'UNPAID');

      const updated = await tx.invoice.update({
        where: { id: invoiceId },
        data: {
          status: calculatedStatus,
          paidAmount: newPaidAmount,
        },
      });

      return updated;
    });

    res.json({ success: true, data: result, message: 'Cập nhật thanh toán thành công' });
  } catch (error: any) {
    if (error.message?.startsWith('NOT_FOUND:')) {
      return res.status(404).json({ success: false, message: error.message.replace('NOT_FOUND: ', '') });
    }
    if (error.message?.startsWith('INVALID_AMOUNT:') || error.message?.includes('không hợp lệ') || error.message?.includes('không được âm')) {
      return res.status(400).json({ success: false, message: error.message.replace('INVALID_AMOUNT: ', '') });
    }
    res.status(500).json({ success: false, data: null, message: error.message || 'Lỗi cập nhật thanh toán' });
  }
});

export default router;
