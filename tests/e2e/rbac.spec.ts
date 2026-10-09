import { expect, test } from "@playwright/test";
import { DEMO_PASSWORD, logIn, PNG } from "./helpers";

test("a Viewer sees no edit actions, and forced write requests are rejected by the server", async ({
  page,
}) => {
  await logIn(page, "dana@auditor.example", DEMO_PASSWORD);
  const base = "/org/northwind-labs";

  // Read access works, including the demo banner.
  await page.goto(`${base}/controls`);
  await expect(page.getByText("Demo workspace")).toBeVisible();
  await expect(page.getByRole("link", { name: "New control" })).toHaveCount(0);
  await page.getByRole("link", { name: "Multi-factor authentication enforced" }).click();
  await expect(page.getByRole("heading", { level: 1 })).toContainText("AC-01");
  for (const name of ["Edit", "Archive", "Create task", "Create risk"]) {
    await expect(page.getByRole("button", { name, exact: true })).toHaveCount(0);
    await expect(page.getByRole("link", { name, exact: true })).toHaveCount(0);
  }
  await expect(page.getByLabel("Owner")).toHaveCount(0);

  await page.goto(`${base}/evidence`);
  await expect(page.getByRole("link", { name: "Upload evidence" })).toHaveCount(0);
  await page.goto(`${base}/tasks`);
  await expect(page.getByRole("button", { name: "New task" })).toHaveCount(0);
  await page.goto(`${base}/audit-log`);
  await expect(page.getByRole("link", { name: "Export CSV" })).toHaveCount(0);
  await expect(page.getByRole("button", { name: "Verify integrity" })).toHaveCount(0);

  // Pages a Viewer may never use render the not-found state (streamed after the loading UI).
  await page.goto(`${base}/controls/new`);
  await expect(page.getByRole("heading", { name: "Not found" })).toBeVisible();
  await expect(page.getByLabel("Name")).toHaveCount(0);

  // Forced requests with the Viewer's session are rejected server-side.
  const meta = Buffer.from(
    JSON.stringify({ title: "Forced", category: "OTHER", collectedAt: "2026-09-01", links: [] }),
  ).toString("base64url");
  const upload = await page.request.post(`${base.replace("/org", "/api/org")}/evidence/upload`, {
    headers: {
      origin: new URL(page.url()).origin,
      "content-type": "image/png",
      "x-file-name": "x.png",
      "x-evidence-metadata": meta,
    },
    data: PNG,
  });
  expect(upload.status()).toBe(403);
  const exportCsv = await page.request.get(`${base.replace("/org", "/api/org")}/audit-log/export`);
  expect(exportCsv.status()).toBe(403);
});
