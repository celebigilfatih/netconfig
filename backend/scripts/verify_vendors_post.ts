const API = "http://127.0.0.1:3101";

async function main() {
  const loginRes = await fetch(`${API}/auth/login`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ email: "admin@example.com", password: "admin12345", tenantSlug: "default" }),
  });
  const loginJson = await loginRes.json().catch(() => ({} as any));
  const token = loginJson?.token;
  console.log(`login status=${loginRes.status}`);
  if (!token) {
    console.log("no token");
    return;
  }
  const payload = { slug: `cli_vendor_${Date.now()}`, name: "CLI Vendor", isActive: true };
  const postRes = await fetch(`${API}/vendors`, {
    method: "POST",
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
    body: JSON.stringify(payload),
  });
  const postText = await postRes.text();
  console.log(`post status=${postRes.status}`);
  console.log(postText);
}

main().catch((e) => { console.error(e); process.exit(1); });
