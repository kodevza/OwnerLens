import { expect, test } from "@playwright/test";

test("resource groups view renders at least one resource group", async ({ page }) => {
  await page.goto("/");

  await page.getByRole("tab", { name: "Resource groups" }).click();
  await expect(page.getByText("Loading resource groups...")).toBeHidden({ timeout: 120_000 });
  await expect(page.getByText("No resource groups match the filter.")).toBeHidden();
  await expect(page.getByRole("columnheader", { name: /Resource group/i })).toBeVisible();

  const firstResourceGroupCell = page.getByRole("table").locator("tbody tr td").first();

  await expect(firstResourceGroupCell).toBeVisible();
  await expect(firstResourceGroupCell).toHaveText(/\S/);
});
