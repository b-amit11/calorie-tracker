import { NextRequest } from "next/server";
import { describe, expect, it } from "vitest";
import { proxy } from "@/proxy";

const request = (path: string, init: { method?: string; origin?: string; cookie?: string } = {}) =>
  new NextRequest(`http://localhost:3000${path}`, {
    method: init.method ?? "GET",
    headers: {
      host: "localhost:3000",
      ...(init.origin && { origin: init.origin }),
      ...(init.cookie && { cookie: init.cookie }),
    },
  });

describe("proxy", () => {
  it("blocks cross-site and origin-less API writes", () => {
    expect(proxy(request("/api/entries", { method: "POST", origin: "https://evil.example" })).status).toBe(403);
    expect(proxy(request("/api/entries", { method: "POST" })).status).toBe(403);
  });

  it("allows same-origin writes and all reads", () => {
    expect(proxy(request("/api/entries", { method: "POST", origin: "http://localhost:3000" })).status).toBe(200);
    expect(proxy(request("/api/day?date=2026-10-07")).status).toBe(200);
  });

  it("redirects signed-out page views to login, keeping the destination", () => {
    const res = proxy(request("/progress"));
    expect(res.status).toBe(307);
    expect(res.headers.get("location")).toBe("http://localhost:3000/login?next=%2Fprogress");
    expect(proxy(request("/login")).status).toBe(200);
    expect(proxy(request("/", { cookie: "session=abc" })).status).toBe(200);
  });
});
