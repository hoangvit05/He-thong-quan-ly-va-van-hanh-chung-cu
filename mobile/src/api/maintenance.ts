export type TicketStatus = 'PENDING' | 'ASSIGNED' | 'IN_PROGRESS' | 'COMPLETED' | 'CLOSED';
export const ticketSteps: { status: TicketStatus; label: string }[] = [
  { status: 'PENDING', label: 'Mới gửi' }, { status: 'ASSIGNED', label: 'Đã gán thợ' },
  { status: 'IN_PROGRESS', label: 'Đang sửa' }, { status: 'COMPLETED', label: 'Đã sửa xong' },
  { status: 'CLOSED', label: 'Đóng phiếu' },
];
export const statusLabel = (status: string) => ticketSteps.find(step => step.status === status)?.label ?? status;
export interface Ticket {
  id: number; title: string | null; category: string; description: string; status: TicketStatus;
  residentId: number; roomId: number | null; isDuplicate: boolean; createdAt: string; updatedAt: string;
  rating: number | null; ratingComment: string | null; materials?: string | null;
  room?: { roomNumber: string } | null; technician?: { fullName: string; phone: string | null } | null;
}
export interface Feedback {
  id: number; title: string; content: string; reply: string | null; isResolved: boolean;
  createdAt: string; repliedAt: string | null;
}
export function validateTicket(title: string, category: string, description: string): string {
  if (title.trim().length > 100) return 'Tiêu đề không được vượt quá 100 ký tự.';
  if (!category.trim() || category.trim().length > 50) return 'Danh mục cần từ 1 đến 50 ký tự.';
  if (description.trim().length < 5 || description.trim().length > 2000) return 'Mô tả cần từ 5 đến 2000 ký tự.';
  return '';
}
export function validateFeedback(title: string, content: string): string {
  if (title.trim().length < 3 || title.trim().length > 200) return 'Tiêu đề cần từ 3 đến 200 ký tự.';
  if (content.trim().length < 5 || content.trim().length > 2000) return 'Nội dung cần từ 5 đến 2000 ký tự.';
  if ([title, content].some(value => /data:(image|video|application)\/[a-zA-Z0-9.+-]+;base64,/i.test(value) || value.includes(';base64,')))
    return 'Không gửi dữ liệu Base64 trong góp ý.';
  return '';
}
