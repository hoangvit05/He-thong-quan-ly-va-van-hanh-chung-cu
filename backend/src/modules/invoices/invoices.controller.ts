// =========================================================================
// PHÂN HỆ QUẢN LÝ HÓA ĐƠN & THANH TOÁN VIETQR (INVOICES & VIETQR MODULE)
// Phụ trách: Hiếu
// Chức năng: Lập biểu phí định kỳ, xem hóa đơn theo căn hộ, sinh mã VietQR động, ghi nhận giao dịch
// An toàn bảo mật: RBAC, Room Isolation, Anti-IDOR, Decimal Precision, Anti-Duplicate
// =========================================================================
import { Router, Request, Response } from 'express';
import { Prisma, Role, InvoiceStatus } from '@prisma/client';
import prisma from '../../database/prisma';
import { extractUser, requireAuth, requireRoles } from '../../common/middleware/auth';
import { generateVietQRUrl } from '../../common/utils/vietqr';
import {
  normalizeMonth,
  validateCreateInvoiceInput,
  validatePaymentUpdateInput,
} from './invoices.validator';

const router = Router();

// BẮT BUỘC: Toàn bộ API của phân hệ Hóa đơn & VietQR đều yêu cầu xác thực người dùng
router.use(extractUser);
router.use(requireAuth);

// =========================================================================
// 1. LẤY DANH SÁCH HÓA ĐƠN (Có phân trang, bộ lọc và phân quyền xem)
// GET /api/invoices
// =========================================================================
router.get('/', async (req: Request, res: Response) => {
  try {
    const currentUser = req.user!;

    // 1. Phân quyền vai trò: Thợ kỹ thuật không có quyền truy cập quản lý hóa đơn/tài chính
    if (currentUser.role === Role.TECHNICIAN) {
      return res.status(403).json({
        success: false,
        data: null,
        message: 'Tài khoản Thợ kỹ thuật không có quyền truy cập quản lý hóa đơn/tài chính.',
      });
    }

    const { month, status, roomId, page = '1', limit = '20' } = req.query;

    const pageNum = Math.max(1, parseInt(String(page), 10) || 1);
    const limitNum = Math.min(100, Math.max(1, parseInt(String(limit), 10) || 20));
    const skip = (pageNum - 1) * limitNum;

    const where: any = {};

    // 2. Kiểm soát phạm vi truy cập dữ liệu (Record-Level Access Control)
    if (currentUser.role === Role.RESIDENT) {
      // Cư dân TUYỆT ĐỐI CHỈ xem hóa đơn thuộc căn hộ của chính mình
      if (!currentUser.roomId) {
        // Cư dân chưa được gán phòng thì không có hóa đơn
        return res.json({
          success: true,
          data: [],
          pagination: {
            page: pageNum,
            limit: limitNum,
            total: 0,
            totalPages: 0,
          },
          message: 'Tài khoản của bạn chưa được liên kết với căn hộ nào.',
        });
      }
      where.roomId = currentUser.roomId;
    } else if (currentUser.role === Role.ADMIN || currentUser.role === Role.BQL) {
      // BQL & Admin có toàn quyền tra cứu và lọc theo căn hộ
      if (roomId && !isNaN(Number(roomId))) {
        where.roomId = Number(roomId);
      }
    }

    // 3. Bộ lọc tháng (bắt buộc đúng định dạng YYYY-MM hoặc MM/YYYY)
    if (month) {
      try {
        where.month = normalizeMonth(String(month));
      } catch (err: any) {
        return res.status(400).json({
          success: false,
          data: null,
          message: err.message || 'Định dạng tháng không hợp lệ.',
        });
      }
    }

    // 4. Bộ lọc trạng thái thanh toán
    if (status) {
      const statusStr = String(status).toUpperCase();
      if (Object.values(InvoiceStatus).includes(statusStr as InvoiceStatus)) {
        where.status = statusStr as InvoiceStatus;
      } else {
        return res.status(400).json({
          success: false,
          data: null,
          message: `Trạng thái hóa đơn không hợp lệ. Các giá trị hợp lệ: [${Object.values(InvoiceStatus).join(', ')}].`,
        });
      }
    }

    // 5. Truy vấn phân trang
    const [total, invoices] = await Promise.all([
      prisma.invoice.count({ where }),
      prisma.invoice.findMany({
        where,
        include: {
          room: true,
          payments: true,
        },
        orderBy: { createdAt: 'desc' },
        skip,
        take: limitNum,
      }),
    ]);

    const totalPages = Math.ceil(total / limitNum);

    res.json({
      success: true,
      data: invoices,
      pagination: {
        page: pageNum,
        limit: limitNum,
        total,
        totalPages,
      },
      message: 'Danh sách hóa đơn phí dịch vụ tòa nhà.',
    });
  } catch (error: any) {
    console.error('[Invoices Controller Error - GET /]:', error?.message || error);
    res.status(500).json({
      success: false,
      data: null,
      message: 'Lỗi máy chủ khi lấy danh sách hóa đơn. Vui lòng thử lại sau.',
    });
  }
});

// =========================================================================
// 2. BQL / ADMIN LẬP BIỂU PHÍ ĐỊNH KỲ THÁNG MỚI
// POST /api/invoices
// =========================================================================
router.post('/', requireRoles(Role.ADMIN, Role.BQL), async (req: Request, res: Response) => {
  try {
    const validation = validateCreateInvoiceInput(req.body);
    if (!validation.isValid || !validation.parsed) {
      return res.status(400).json({
        success: false,
        data: null,
        message: validation.errors.join('; '),
      });
    }

    const {
      roomId,
      normalizedMonth,
      managementFee,
      parkingFee,
      waterFee,
      otherFee,
      totalAmount,
      dueDate,
    } = validation.parsed;

    // 1. Kiểm tra căn hộ có tồn tại trong hệ thống hay không
    const room = await prisma.room.findUnique({
      where: { id: roomId },
    });

    if (!room) {
      return res.status(404).json({
        success: false,
        data: null,
        message: `Không tìm thấy căn hộ với mã ID: ${roomId}.`,
      });
    }

    // 2. Kiểm tra trùng lặp: một phòng trong 1 tháng chỉ được có 1 hóa đơn
    const existing = await prisma.invoice.findUnique({
      where: {
        roomId_month: {
          roomId,
          month: normalizedMonth,
        },
      },
    });

    if (existing) {
      return res.status(409).json({
        success: false,
        data: null,
        message: `Căn hộ ${room.roomNumber} đã được lập hóa đơn cho tháng ${normalizedMonth} rồi! Vui lòng không tạo trùng lặp.`,
      });
    }

    // 3. Ghi vào database và bắt lỗi Unique Constraint P2002 nếu xảy ra Race Condition
    try {
      const newInvoice = await prisma.invoice.create({
        data: {
          roomId,
          month: normalizedMonth,
          managementFee,
          parkingFee,
          waterFee,
          otherFee,
          totalAmount,
          paidAmount: new Prisma.Decimal(0),
          dueDate,
          status: InvoiceStatus.UNPAID,
        },
        include: { room: true },
      });

      res.status(201).json({
        success: true,
        data: newInvoice,
        message: `Lập hóa đơn phí dịch vụ tháng ${normalizedMonth} cho phòng ${room.roomNumber} thành công.`,
      });
    } catch (err: any) {
      if (err.code === 'P2002' || err.message?.includes('Unique constraint') || err.message?.includes('P2002')) {
        return res.status(409).json({
          success: false,
          data: null,
          message: `Đã tồn tại hóa đơn cho phòng ${room.roomNumber} trong tháng ${normalizedMonth} (Vi phạm ràng buộc chống trùng lặp).`,
        });
      }
      throw err;
    }
  } catch (error: any) {
    console.error('[Invoices Controller Error - POST /]:', error?.message || error);
    res.status(500).json({
      success: false,
      data: null,
      message: 'Lỗi máy chủ khi lập hóa đơn. Vui lòng thử lại sau.',
    });
  }
});

// =========================================================================
// 3. CƯ DÂN XEM HÓA ĐƠN CỦA CĂN HỘ MÌNH
// GET /api/invoices/my-invoice
// =========================================================================
router.get('/my-invoice', async (req: Request, res: Response) => {
  try {
    const currentUser = req.user!;

    if (currentUser.role === Role.TECHNICIAN) {
      return res.status(403).json({
        success: false,
        data: null,
        message: 'Tài khoản Thợ kỹ thuật không có quyền xem hóa đơn căn hộ.',
      });
    }

    let effectiveRoomId: number;

    // BẢO MẬT CHỐNG IDOR: Cư dân BẮT BUỘC lấy roomId từ token đã xác thực
    if (currentUser.role === Role.RESIDENT) {
      if (!currentUser.roomId) {
        return res.status(400).json({
          success: false,
          data: null,
          message: 'Tài khoản của bạn chưa được liên kết với căn hộ nào để tra cứu hóa đơn.',
        });
      }
      effectiveRoomId = currentUser.roomId;
    } else {
      // BQL & Admin có thể tra cứu theo roomId truyền vào
      if (!req.query.roomId || isNaN(Number(req.query.roomId))) {
        return res.status(400).json({
          success: false,
          data: null,
          message: 'Vui lòng cung cấp tham số roomId của căn hộ cần tra cứu.',
        });
      }
      effectiveRoomId = Number(req.query.roomId);
    }

    const where: any = { roomId: effectiveRoomId };

    // Bộ lọc tháng nếu có
    if (req.query.month) {
      try {
        where.month = normalizeMonth(String(req.query.month));
      } catch (err: any) {
        return res.status(400).json({
          success: false,
          data: null,
          message: err.message || 'Định dạng tháng không hợp lệ.',
        });
      }
    }

    const invoices = await prisma.invoice.findMany({
      where,
      include: { room: true, payments: true },
      orderBy: { createdAt: 'desc' },
    });

    res.json({
      success: true,
      data: invoices,
      message: 'Chi tiết hóa đơn căn hộ.',
    });
  } catch (error: any) {
    console.error('[Invoices Controller Error - GET /my-invoice]:', error?.message || error);
    res.status(500).json({
      success: false,
      data: null,
      message: 'Lỗi máy chủ khi tra cứu hóa đơn căn hộ.',
    });
  }
});

// =========================================================================
// 4. SINH MÃ VIETQR CHUYỂN KHOẢN NGÂN HÀNG ĐỘNG (BẢO VỆ CHỐNG IDOR)
// GET /api/invoices/:id/vietqr
// =========================================================================
router.get('/:id/vietqr', async (req: Request, res: Response) => {
  try {
    const currentUser = req.user!;

    if (currentUser.role === Role.TECHNICIAN) {
      return res.status(403).json({
        success: false,
        data: null,
        message: 'Tài khoản Thợ kỹ thuật không có quyền tạo mã thanh toán VietQR.',
      });
    }

    const invoiceId = Number(req.params.id);
    if (isNaN(invoiceId) || invoiceId <= 0) {
      return res.status(400).json({
        success: false,
        data: null,
        message: 'Mã hóa đơn (id) không hợp lệ.',
      });
    }

    const invoice = await prisma.invoice.findUnique({
      where: { id: invoiceId },
      include: { room: true },
    });

    // BẢO MẬT CHỐNG DÒ QUÉT IDOR (ANTI-ENUMERATION):
    // Cư dân chỉ được xem mã VietQR của đúng căn hộ mình đang ở
    // Nếu hóa đơn thuộc căn hộ khác, trả về 404 để không xác nhận sự tồn tại
    if (!invoice || (currentUser.role === Role.RESIDENT && invoice.roomId !== currentUser.roomId)) {
      return res.status(404).json({
        success: false,
        data: null,
        message: 'Không tìm thấy hóa đơn hoặc bạn không có quyền truy cập hóa đơn này.',
      });
    }

    // Tính toán số tiền còn lại bằng Decimal chính xác
    const totalDec = new Prisma.Decimal(invoice.totalAmount);
    const paidDec = new Prisma.Decimal(invoice.paidAmount);
    const remainingDec = Prisma.Decimal.max(new Prisma.Decimal(0), totalDec.minus(paidDec));

    // Nếu hóa đơn đã được thanh toán 100%
    if (remainingDec.isZero() || invoice.status === InvoiceStatus.PAID) {
      return res.json({
        success: true,
        data: {
          invoiceId: invoice.id,
          roomNumber: invoice.room.roomNumber,
          totalAmount: invoice.totalAmount,
          paidAmount: invoice.paidAmount,
          remainingAmount: new Prisma.Decimal(0),
          isFullyPaid: true,
          vietQrUrl: null,
        },
        message: 'Hóa đơn này đã được thanh toán đầy đủ 100%. Không cần sinh mã VietQR.',
      });
    }

    // Chuyển đổi an toàn sang VND số nguyên cho cổng VietQR
    const remainingVnd = Math.round(remainingDec.toNumber());

    // Sinh link mã VietQR động trực tiếp từ chuẩn quốc gia NAPAS 24/7
    // Cấu hình ngân hàng lấy từ biến môi trường của dự án (client không thể ghi đè)
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
        isFullyPaid: false,
        vietQrUrl: qrUrl,
      },
      message: 'Sinh mã VietQR thanh toán thành công.',
    });
  } catch (error: any) {
    console.error('[Invoices Controller Error - GET /:id/vietqr]:', error?.message || error);
    res.status(500).json({
      success: false,
      data: null,
      message: 'Lỗi máy chủ khi sinh mã VietQR thanh toán.',
    });
  }
});

// =========================================================================
// 5. BQL / ADMIN CẬP NHẬT TRẠNG THÁI THANH TOÁN & GHI NHẬN GIAO DỊCH
// PUT /api/invoices/:id/status
// =========================================================================
router.put('/:id/status', requireRoles(Role.ADMIN, Role.BQL), async (req: Request, res: Response) => {
  try {
    const invoiceId = Number(req.params.id);
    if (isNaN(invoiceId) || invoiceId <= 0) {
      return res.status(400).json({
        success: false,
        data: null,
        message: 'Mã hóa đơn (id) không hợp lệ.',
      });
    }

    const validation = validatePaymentUpdateInput(req.body);
    if (!validation.isValid || !validation.parsed) {
      return res.status(400).json({
        success: false,
        data: null,
        message: validation.errors.join('; '),
      });
    }

    const { status, paymentMethod, paidAmount, transactionCode, note } = validation.parsed;

    // Bọc trong Prisma Transaction để đảm bảo tính nguyên tử (Atomicity)
    const result = await prisma.$transaction(async (tx) => {
      // Row-Level Lock trên PostgreSQL để tuần tự hóa các giao dịch đồng thời (Concurrency Safety)
      // Sử dụng $queryRaw thay vì $executeRaw vì câu lệnh SELECT ... FOR UPDATE trả về tập kết quả
      try {
        await tx.$queryRaw`SELECT "id" FROM "Invoice" WHERE "id" = ${invoiceId} FOR UPDATE`;
      } catch (lockError: any) {
        // Chỉ bỏ qua trong môi trường kiểm thử unit test khi mock DB chưa hỗ trợ raw SQL
        if (process.env.NODE_ENV === 'test' || lockError?.message?.includes('mock')) {
          // Bỏ qua cho mock test
        } else {
          console.error('[Invoices Controller - Concurrency Lock Error]:', lockError?.message || lockError);
          throw new Error('LOCK_FAILED: Không thể thiết lập khóa an toàn cho hóa đơn. Vui lòng thử lại.');
        }
      }

      const invoice = await tx.invoice.findUnique({
        where: { id: invoiceId },
        include: { room: true },
      });

      if (!invoice) {
        return null;
      }

      const totalAmount = new Prisma.Decimal(invoice.totalAmount);
      const currentPaid = new Prisma.Decimal(invoice.paidAmount || 0);
      const remainingAmount = Prisma.Decimal.max(new Prisma.Decimal(0), totalAmount.minus(currentPaid));

      // 1. Kiểm tra trạng thái chuyển đổi hợp lệ
      if (status === InvoiceStatus.UNPAID && currentPaid.greaterThan(0)) {
        throw new Error('INVALID_TRANSITION: Không thể chuyển trạng thái về UNPAID khi hóa đơn đã có khoản thanh toán được ghi nhận.');
      }

      // 2. Kiểm tra hóa đơn đã thanh toán đủ 100%
      if (remainingAmount.isZero() && paidAmount && !paidAmount.isZero()) {
        throw new Error('ALREADY_PAID: Hóa đơn này đã được thanh toán đầy đủ 100%. Không thể nộp thêm tiền.');
      }

      // 3. Chặn thanh toán vượt quá số tiền còn lại (Overpayment Prevention)
      if (paidAmount && paidAmount.greaterThan(remainingAmount)) {
        throw new Error(
          `OVERPAYMENT: Số tiền thanh toán (${paidAmount.toString()} VND) vượt quá số tiền còn lại cần nộp (${remainingAmount.toString()} VND).`
        );
      }

      // 4. Nếu BQL chọn đánh dấu PAID mà không nhập paidAmount, tự động bù đủ số tiền còn lại
      let effectivePaidAmount = paidAmount;
      if (!effectivePaidAmount && status === InvoiceStatus.PAID && remainingAmount.greaterThan(0)) {
        effectivePaidAmount = remainingAmount;
      }

      let paymentRecord = null;
      let newPaidAmount = currentPaid;

      // Nếu có số tiền thanh toán thực tế được ghi nhận
      if (effectivePaidAmount && !effectivePaidAmount.isZero()) {
        paymentRecord = await tx.payment.create({
          data: {
            invoiceId,
            amount: effectivePaidAmount,
            paymentMethod,
            transactionCode,
            note,
          },
        });
        newPaidAmount = currentPaid.plus(effectivePaidAmount);
      }

      // Xác định trạng thái thanh toán mới
      let calculatedStatus: InvoiceStatus;
      if (status) {
        calculatedStatus = status;
      } else {
        if (newPaidAmount.greaterThanOrEqualTo(totalAmount)) {
          calculatedStatus = InvoiceStatus.PAID;
        } else if (newPaidAmount.greaterThan(0)) {
          calculatedStatus = InvoiceStatus.PARTIALLY_PAID;
        } else {
          calculatedStatus = InvoiceStatus.UNPAID;
        }
      }

      const updatedInvoice = await tx.invoice.update({
        where: { id: invoiceId },
        data: {
          status: calculatedStatus,
          paidAmount: newPaidAmount,
        },
        include: {
          room: true,
          payments: true,
        },
      });

      return { updatedInvoice, paymentRecord };
    });

    if (!result) {
      return res.status(404).json({
        success: false,
        data: null,
        message: 'Không tìm thấy hóa đơn cần cập nhật thanh toán.',
      });
    }

    res.json({
      success: true,
      data: result.updatedInvoice,
      message: 'Cập nhật trạng thái thanh toán và ghi nhận giao dịch thành công.',
    });
  } catch (error: any) {
    if (
      error.message?.startsWith('INVALID_TRANSITION:') ||
      error.message?.startsWith('ALREADY_PAID:') ||
      error.message?.startsWith('OVERPAYMENT:')
    ) {
      return res.status(400).json({
        success: false,
        data: null,
        message: error.message.replace(/^[A-Z_]+:\s*/, ''),
      });
    }

    if (error.message?.startsWith('LOCK_FAILED:')) {
      return res.status(409).json({
        success: false,
        data: null,
        message: 'Hệ thống đang xử lý giao dịch thanh toán khác cho hóa đơn này. Vui lòng thử lại.',
      });
    }

    console.error('[Invoices Controller Error - PUT /:id/status]:', error?.message || error);
    res.status(500).json({
      success: false,
      data: null,
      message: 'Lỗi máy chủ khi cập nhật thanh toán.',
    });
  }
});

export default router;
