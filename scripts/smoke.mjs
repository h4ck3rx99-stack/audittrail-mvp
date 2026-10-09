// Smoke-checks a running production server: /api/health, /login, and an authenticated page as a
// seeded demo user. Usage: node scripts/smoke.mjs [baseUrl]   (default http://localhost:3000)
import { chromium } from "@playwright/test";

const base = process.argv[2] ?? "http://localhost:3000";
const fail = (msg) => {
  console.error(`SMOKE FAIL: ${msg}`);
  process.exit(1);
};

const health = await fetch(`${base}/api/health`);
const body = await health.json();
if (health.status !== 200 || body.status !== "ok")
  fail(`/api/health returned ${health.status} ${JSON.stringify(body)}`);
console.log("ok   /api/health", JSON.stringify(body));

const browser = await chromium.launch();
try {
  const page = await browser.newPage();
  const login = await page.goto(`${base}/login`);
  if (login?.status() !== 200) fail(`/login returned ${login?.status()}`);
  const csp = login.headers()["content-security-policy"] ?? "";
  if (!csp.includes("frame-ancestors 'none'") || !csp.includes("nonce-"))
    fail("CSP header missing or incomplete");
  console.log("ok   /login (CSP with nonce present)");

  await page.getByLabel("Email").fill("olivia@northwind.example");
  await page.getByLabel("Password").fill("northwind-demo-2026");
  await page.getByRole("button", { name: "Sign in" }).click();
  await page.waitForURL(/\/org\/northwind-labs\/dashboard/, { timeout: 30_000 });
  await page
    .getByText("Internal readiness estimate · not an audit opinion")
    .waitFor({ timeout: 30_000 });
  await page.getByText("Demo workspace").first().waitFor();
  console.log("ok   authenticated dashboard as olivia@northwind.example");
} finally {
  await browser.close();
}
console.log("SMOKE PASS");
