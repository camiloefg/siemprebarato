import type { NextFunction, Request, Response } from "express";
import type { AdminRole } from "@siemprebarato/shared";

export function requireRole(allowedRoles: readonly AdminRole[]) {
  return (req: Request, res: Response, next: NextFunction): void => {
    const role = req.adminSession?.user.role;
    if (!role || !allowedRoles.includes(role)) {
      res.status(403).json({ success: false, message: "Insufficient permissions." });
      return;
    }
    next();
  };
}
