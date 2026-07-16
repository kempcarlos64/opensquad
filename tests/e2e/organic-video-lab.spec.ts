import { expect, test } from "@playwright/test";

test("fluxo mock completo: briefing até vídeo final", async ({ page }) => {
  const consoleErrors: string[] = [];
  const failedRequests: string[] = [];

  page.on("console", (message) => {
    if (message.type() === "error") consoleErrors.push(message.text());
  });
  page.on("requestfailed", (request) => {
    const errorText = request.failure()?.errorText ?? "";
    // Browsers intentionally stop speculative/range media buffering when the
    // element is replaced or the test context closes. Validate the file with an
    // explicit Range request below and keep every other network failure fatal.
    if (request.resourceType() === "media" && errorText === "net::ERR_ABORTED") return;
    failedRequests.push(`${request.method()} ${request.url()} ${errorText}`);
  });
  page.on("response", (response) => {
    if (response.status() >= 500) {
      failedRequests.push(`${response.status()} ${response.request().method()} ${response.url()}`);
    }
  });

  await page.goto("/admin/organic-video-lab");
  await expect(page.getByRole("heading", { name: /Da ideia ao vídeo/i })).toBeVisible();
  await expect(page.getByText(/MODO MOCK/)).toBeVisible();

  await page.getByTestId("discover-instagram").click();
  await expect(page.getByTestId("instagram-results")).toBeVisible();
  await expect(page.getByTestId("instagram-results").locator("article")).toHaveCount(10);
  await page.getByTestId("instagram-results").getByLabel("Usar no roteiro").first().check();

  await page.getByRole("tab", { name: "Pesquisa complementar" }).click();
  await page.getByTestId("discover-references").click();
  await expect(page.getByTestId("reference-results")).toBeVisible();

  await page.getByTestId("generate-scripts").click();
  await expect(page.getByTestId("candidate-grid")).toBeVisible({ timeout: 60_000 });
  await expect(page.getByTestId("candidate-retention")).toBeVisible();
  await expect(page.getByTestId("candidate-conversion")).toBeVisible();
  await expect(page.getByTestId("candidate-naturalness")).toBeVisible();
  await expect(page.getByTestId("judge-panel")).toContainText("Roteiro aprovado");

  const editor = page.getByTestId("final-script-editor");
  await editor.fill(`${await editor.inputValue()} Revisão humana concluída.`);
  await page.getByRole("button", { name: "Salvar revisão" }).click();
  await expect(page.getByText(/Roteiro final revisado/)).toBeVisible();

  await page.getByTestId("generate-video").click();
  await expect(page.getByTestId("base-video")).toBeVisible({ timeout: 60_000 });

  await page.getByRole("button", { name: "Finalizar com Remotion" }).click();
  const finalPlayer = page.getByTestId("final-video");
  await expect(finalPlayer).toBeVisible({ timeout: 180_000 });
  const mp4Link = page.getByRole("link", { name: /Baixar MP4/ });
  await expect(mp4Link).toHaveAttribute("href", /\.mp4/);
  await expect(page.getByRole("link", { name: /Baixar SRT/ })).toHaveAttribute("href", /\.srt/);
  const mp4Href = await mp4Link.getAttribute("href");
  expect(mp4Href).not.toBeNull();
  const mediaResponse = await page.request.get(mp4Href!, {
    headers: { Range: "bytes=0-1023" },
  });
  expect(mediaResponse.status()).toBe(206);
  expect(mediaResponse.headers()["content-type"]).toBe("video/mp4");

  expect(consoleErrors, consoleErrors.join("\n")).toEqual([]);
  expect(failedRequests, failedRequests.join("\n")).toEqual([]);
});
