import { test } from "node:test";
import assert from "node:assert/strict";
import config from "../next.config";

test("production aliases redirect to the configured origin without redirecting previews or the canonical host", async () => {
  const keys = [
    "VERCEL_ENV",
    "APP_ORIGIN",
    "VERCEL_URL",
    "VERCEL_BRANCH_URL",
    "VERCEL_PROJECT_PRODUCTION_URL",
  ] as const;
  const saved = keys.map((key) => process.env[key]);
  try {
    process.env.APP_ORIGIN = "https://zyvara.us";
    process.env.VERCEL_URL = "zyvara-release-test.vercel.app";
    process.env.VERCEL_PROJECT_PRODUCTION_URL = "zyvara.us";
    process.env.VERCEL_ENV = "preview";
    assert.deepEqual(await config.redirects!(), []);
    process.env.VERCEL_ENV = "production";
    const rules = await config.redirects!();
    assert.ok(rules.length > 0);
    assert.ok(
      rules.every(
        (rule) =>
          rule.destination === "https://zyvara.us/:path*" &&
          rule.permanent === false,
      ),
    );
    assert.ok(
      rules.some((rule) =>
        rule.has?.some(
          (condition) =>
            condition.type === "host" &&
            condition.value === "zyvara-release-test\\.vercel\\.app",
        ),
      ),
    );
    assert.ok(
      rules.every(
        (rule) =>
          !rule.has?.some((condition) => condition.value === "zyvara\\.us"),
      ),
    );
  } finally {
    keys.forEach((key, index) => {
      if (saved[index] === undefined) delete process.env[key];
      else process.env[key] = saved[index];
    });
  }
});
