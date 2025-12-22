import assert from "node:assert";

const BASE = process.env.API_BASE_URL || "http://localhost:43101";

async function login(): Promise<string> {
  const res = await fetch(`${BASE}/auth/login`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ email: "admin@example.com", password: "admin12345", tenantSlug: "default" }),
  });
  assert.ok(res.ok, `login failed: ${res.status}`);
  const j: any = await res.json();
  assert.ok(j.token, "token missing");
  return String(j.token);
}

async function getRecentErrors(token: string): Promise<any[]> {
  const res = await fetch(`${BASE}/errors/recent`, { headers: { Authorization: `Bearer ${token}` } });
  assert.ok(res.ok, `errors/recent failed: ${res.status}`);
  const j: any = await res.json();
  return Array.isArray(j.items) ? j.items : [];
}

async function main() {
  const token = await login();
  await fetch(`${BASE}/devices/not-a-uuid`, { headers: { Authorization: `Bearer ${token}` } });
  await fetch(`${BASE}/errors`, {
    method: "POST",
    headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
    body: JSON.stringify({ route: "/ui/test", method: "GET", statusCode: 0, code: "ui_test_error", message: "test" }),
  });
  const items = await getRecentErrors(token);
  assert.ok(items.length >= 2, `expected >=2 errors, got ${items.length}`);
  console.log("ok", { count: items.length });
}

main().catch((e) => { console.error(e); process.exit(1); });

