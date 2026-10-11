import { test, expect } from "@playwright/test";

test("voice entry protects the API and requires transcript review before changing or publishing a draft", async ({
  page,
  request,
}) => {
  const denied = await request.post("/api/voice/transcribe", {
    headers: { Origin: "http://127.0.0.1:3100" },
    data: "invalid audio",
  });
  expect(denied.status()).toBe(401);
  const foreign = await request.post("/api/voice/transcribe", {
    headers: { Origin: "https://foreign.example" },
    data: "invalid",
  });
  expect(foreign.status()).toBe(403);
  await page.route("**/api/config", async (route) => {
    const response = await route.fetch();
    await route.fulfill({
      json: { ...(await response.json()), voiceConfigured: true },
    });
  });
  let calls = 0;
  await page.addInitScript(() => {
    Object.defineProperty(navigator, "mediaDevices", {
      configurable: true,
      value: {
        getUserMedia: async () => {
          throw new DOMException("Test permission denial", "NotAllowedError");
        },
      },
    });
  });
  await page.route("**/api/voice/transcribe", (route) => {
    calls++;
    return route.fulfill({
      json: { text: "Pick up litter safely in a permitted park." },
    });
  });
  let publishes = 0;
  page.on("request", (req) => {
    if (
      req.method() === "POST" &&
      new URL(req.url()).pathname === "/api/challenges"
    )
      publishes++;
  });
  await page.goto("/signin?returnTo=/create");
  await page.getByLabel("Demo profile name").fill("Voice tester " + Date.now());
  await page.getByLabel("Demo access code").fill("local-zyvara-demo");
  await page.getByRole("button", { name: "Enter restricted demo" }).click();
  await expect(page).toHaveURL(/\/create$/);
  await page.getByRole("button", { name: "Record audio", exact: true }).click();
  await expect(
    page.getByText(
      "Microphone access was unavailable. Allow it in your browser or upload an audio file.",
    ),
  ).toBeVisible();
  await page.getByLabel("Describe the mission").fill("Existing draft.");
  await page.getByLabel("Or upload audio").setInputFiles({
    name: "voice.wav",
    mimeType: "audio/wav",
    buffer: Buffer.from("test audio"),
  });
  expect(calls).toBe(0);
  await page
    .getByRole("button", { name: "Transcribe audio", exact: true })
    .click();
  await expect(page.getByLabel("Review transcript for mission")).toHaveValue(
    "Pick up litter safely in a permitted park.",
  );
  await expect(page.getByLabel("Describe the mission")).toHaveValue(
    "Existing draft.",
  );
  await page
    .getByLabel("Review transcript for mission")
    .fill("Clean a permitted park safely.");
  await page.getByRole("button", { name: "Add to draft", exact: true }).click();
  await expect(page.getByLabel("Describe the mission")).toHaveValue(
    "Existing draft. Clean a permitted park safely.",
  );
  expect(publishes).toBe(0);
  await page.setViewportSize({ width: 390, height: 844 });
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= innerWidth,
    ),
  ).toBe(true);
  await page.getByLabel("Or upload audio").setInputFiles({
    name: "voice.wav",
    mimeType: "audio/wav",
    buffer: Buffer.from("test audio"),
  });
  await page.getByRole("button", { name: "Discard voice entry" }).click();
  expect(calls).toBe(1);
  await expect(page.getByLabel("Describe the mission")).toHaveValue(
    "Existing draft. Clean a permitted park safely.",
  );
});
