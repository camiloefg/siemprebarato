import type { AdminRole } from "@siemprebarato/shared";

declare global {
  namespace Express {
    interface Request {
      adminSession?: {
        sessionId: string;
        csrfTokenHash: string;
        user: {
          id: string;
          email: string;
          displayName: string;
          role: AdminRole;
        };
      };
    }
  }
}

export {};
