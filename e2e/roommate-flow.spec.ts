import { expect, test } from "@playwright/test";
import type { FastifyInstance } from "fastify";

import { createApp } from "../src/server/app";
import { loadConfig } from "../src/server/config";
import { MockZenClient } from "../src/server/providers/mock-zen";

let server: FastifyInstance;
test.beforeAll(async () => {
  server = createApp({
    config: loadConfig({ PORT: "4173", JEV_MODE: "mock", SIMULATION_DAY_MS: "900" }),
    zenClient: new MockZenClient(250),
  });
  await server.listen({ host: "127.0.0.1", port: 4173 });
});
test.afterAll(async () => { await server.close(); });

test("plays and reveals a seven-day roommate ending", async ({ page }) => {
  await page.goto("/");
  await page.getByRole("button", { name: "开始合租" }).click();
  await expect(page.getByText("第 1 天")).toBeVisible();

  const game = page.getByLabel("合租公寓游戏画面");
  await game.press("ArrowRight");
  const box = await game.boundingBox();
  expect(box).toBeTruthy();
  await page.mouse.click(box!.x + box!.width * (50 / 480), box!.y + box!.height * (72 / 270));
  await expect(page.getByRole("dialog", { name: /你的床的可执行动作/ })).toBeVisible();
  await page.getByRole("button", { name: /坐下休息/ }).click();

  await page.waitForTimeout(1_500);
  await page.reload();
  await expect(page.getByLabel("合租公寓游戏画面")).toBeVisible();
  await expect(page.getByText("第 6 天")).toBeVisible({ timeout: 15_000 });
  await expect(page.getByLabel("Jev 的身体状态")).toBeVisible();
  await expect(page.getByRole("button", { name: "选择续租" })).toBeVisible({ timeout: 5_000 });
  await page.getByRole("button", { name: "选择续租" }).click();
  await expect(page.getByText(/你的选择：续租/)).toBeVisible();
  await expect(page.getByText(/Jev 的选择：/)).toBeVisible();
  await page.getByRole("button", { name: "查看七日关键决策" }).click();
  await expect(page.getByRole("region", { name: "七日关键决策" })).toBeVisible();

  const downloadPromise = page.waitForEvent("download");
  await page.getByRole("button", { name: "导出本局 JSON" }).click();
  expect((await downloadPromise).suggestedFilename()).toMatch(/roommate-exe/);
});
