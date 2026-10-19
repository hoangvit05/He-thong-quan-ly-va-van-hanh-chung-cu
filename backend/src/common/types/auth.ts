import { Role } from '@prisma/client';

export interface AuthUser {
  id: number;
  role: Role;
  username?: string;
  fullName?: string;
  roomId?: number | null;
}

declare global {
  namespace Express {
    interface Request {
      user?: AuthUser;
      authError?: string;
    }
  }
}
