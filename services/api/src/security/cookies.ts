import type { Request } from "express";

export function parseCookies(req: Request): Record<string, string> {
  return String(req.headers.cookie || "")
    .split(";")
    .reduce<Record<string, string>>((cookies, part) => {
      const [rawName, ...rawValue] = part.trim().split("=");
      if (!rawName) return cookies;
      try {
        cookies[rawName] = decodeURIComponent(rawValue.join("="));
      } catch {
        cookies[rawName] = rawValue.join("=");
      }
      return cookies;
    }, {});
}
