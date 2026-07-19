function readCookie(name: string): string {
  const prefix = `${name}=`;
  const part = document.cookie.split(";").map((item) => item.trim()).find((item) => item.startsWith(prefix));
  return part ? decodeURIComponent(part.slice(prefix.length)) : "";
}

export async function apiFetch<T>(path: string, init: RequestInit = {}): Promise<T> {
  const method = String(init.method || "GET").toUpperCase();
  const headers = new Headers(init.headers || {});
  if (init.body && !headers.has("content-type")) headers.set("content-type", "application/json");
  if (!["GET", "HEAD", "OPTIONS"].includes(method)) {
    const csrfToken = readCookie("sb_admin_csrf");
    if (csrfToken) headers.set("x-csrf-token", csrfToken);
  }
  const response = await fetch(path, { ...init, headers, credentials: "include" });
  const body = (await response.json().catch(() => ({}))) as T & { message?: string };
  if (!response.ok) throw new Error(body.message || `Request failed (${response.status})`);
  return body;
}
