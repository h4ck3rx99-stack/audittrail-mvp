import { expect, test } from "@playwright/test";
import { PNG, signUp, unique } from "./helpers";

test("core loop: sign up → adopt SOC 2 → own a control → evidence → independent approval → task → audit trail", async ({
  page,
  browser,
}) => {
  const id = unique("e2e");
  const ownerEmail = `${id}-owner@example.test`;
  const adminEmail = `${id}-admin@example.test`;
  const password = `pass-${id}-long-enough`;

  // 1. Sign up.
  await signUp(page, "Erin Owner", ownerEmail, password);
  await expect(page).toHaveURL(/\/onboarding/);

  // 2. Create an organization and adopt SOC 2 with the starter controls.
  await page.getByLabel("Organization name").fill(`Org ${id}`);
  await expect(page.getByText(/^Available:/)).toBeVisible();
  await page.getByRole("button", { name: "Continue" }).click();
  await expect(page.getByText("Categories in scope")).toBeVisible();
  await page.getByRole("button", { name: "Continue" }).click();
  await page.getByRole("button", { name: "Create workspace" }).click();
  await expect(page).toHaveURL(/\/org\/[a-z0-9-]+\/dashboard/, { timeout: 60_000 });
  const slug = new URL(page.url()).pathname.split("/")[2]!;
  const base = `/org/${slug}`;
  const coverageMetric = page.getByRole("link", { name: /Evidence coverage/ });
  await expect(coverageMetric).toContainText("0%");

  // 3. Assign a control owner.
  await page.goto(`${base}/controls?q=AC-01`);
  await page.getByRole("link", { name: "Multi-factor authentication enforced" }).click();
  await expect(page).toHaveURL(/\/controls\/[0-9a-f-]+/);
  const controlUrl = page.url().split("?")[0]!;
  await page.getByLabel("Owner").selectOption({ label: "Erin Owner" });
  await expect(page.getByText("Owner updated")).toBeVisible();

  // 4. Upload evidence against a requirement.
  await page.goto(`${controlUrl}?tab=evidence`);
  await expect(page.getByText("User list showing MFA status").first()).toBeVisible();
  await page.getByRole("link", { name: "Upload" }).nth(1).click();
  await expect(page).toHaveURL(/\/evidence\/new\?controlId=/);
  await page
    .getByLabel("File", { exact: true })
    .setInputFiles({ name: "mfa-users.png", mimeType: "image/png", buffer: PNG });
  await page.getByLabel("Title").fill("MFA user list");
  await page.getByRole("button", { name: "Submit for review" }).click();
  await expect(page).toHaveURL(/\/evidence\/[0-9a-f-]{36}$/);
  const evidenceUrl = page.url();
  await expect(
    page.getByText("You uploaded this version; independent review is required."),
  ).toBeVisible();

  // Invite a second admin (independent reviewer).
  await page.goto(`${base}/settings/members`);
  await page.getByLabel("Email").fill(adminEmail);
  await page.getByLabel("Role").selectOption("ADMIN");
  await page.getByRole("button", { name: "Send invitation" }).click();
  const inviteLink = (await page.locator("code").first().textContent())!.trim();
  expect(inviteLink).toMatch(/\/invite\/[A-Za-z0-9_-]{43}$/);

  // 5. A second admin accepts and approves the evidence.
  const adminContext = await browser.newContext();
  const admin = await adminContext.newPage();
  await admin.goto(new URL(inviteLink).pathname);
  await admin.getByRole("link", { name: "Create an account" }).click();
  await admin.getByLabel("Full name").fill("Avery Admin");
  await expect(admin.getByLabel("Work email")).toHaveValue(adminEmail);
  await admin.getByLabel("Password").fill(password);
  await admin.getByRole("button", { name: "Create account" }).click();
  await admin.getByRole("button", { name: "Accept invitation" }).click();
  await expect(admin).toHaveURL(new RegExp(`${base}/dashboard`));
  await admin.goto(new URL(evidenceUrl).pathname);
  await admin.getByRole("button", { name: "Approve evidence" }).click();
  await expect(admin.getByText("Approved by Avery Admin")).toBeVisible();
  await adminContext.close();

  // 6. The requirement is satisfied and readiness metrics update.
  await page.goto(`${controlUrl}?tab=evidence`);
  await expect(page.getByText("Satisfied").first()).toBeVisible();
  await page.goto(`${base}/dashboard`);
  await expect(coverageMetric).toContainText("1%");

  // 7. Create and complete a task.
  await page.goto(`${base}/tasks`);
  await page.getByRole("button", { name: "New task" }).click();
  await page.getByLabel("Title", { exact: true }).fill("Export MFA list quarterly");
  await page.getByRole("button", { name: "Create task" }).click();
  await expect(page).toHaveURL(/\/tasks\/[0-9a-f-]{36}$/);
  await page.getByRole("button", { name: "Mark complete" }).click();
  await expect(page.getByText("Task completed")).toBeVisible();
  await expect(page.getByRole("button", { name: "Reopen" })).toBeVisible();

  // 8. The audit log shows these events and integrity verification passes.
  await page.goto(`${base}/audit-log`);
  for (const text of [
    "created task TSK-1",
    "completed TSK-1",
    'approved evidence "MFA user list"',
    'uploaded evidence "MFA user list"',
    "assigned AC-01 to Erin Owner",
  ]) {
    await expect(page.getByText(text).first()).toBeVisible();
  }
  await page.getByRole("button", { name: "Verify integrity" }).click();
  await expect(page.getByText("Chain intact").first()).toBeVisible();
});
