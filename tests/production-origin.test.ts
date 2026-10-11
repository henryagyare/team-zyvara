import { test } from "node:test";
import assert from "node:assert/strict";
import config from "../next.config";

test("production aliases redirect to the configured origin without redirecting previews or the canonical host", async () => {
  const environment: Record<string, string | undefined> = process.env;
  const keys = [
    "NODE_ENV",
    "VERCEL_ENV",
    "APP_ORIGIN",
    "VERCEL_URL",
    "VERCEL_BRANCH_URL",
    "VERCEL_PROJECT_PRODUCTION_URL",
  ] as const;
  const saved = keys.map((key) => environment[key]);
  try {
    environment.NODE_ENV = "production";
    environment.APP_ORIGIN = "https://zyvara.us";
    environment.VERCEL_URL = "zyvara-release-test.vercel.app";
    environment.VERCEL_PROJECT_PRODUCTION_URL = "zyvara.us";
    environment.VERCEL_ENV = "preview";
    assert.deepEqual(await config.redirects!(), []);
    environment.VERCEL_ENV = "production";
    const rules = await config.redirects!();
    assert.ok(rules.length > 0);
    assert.ok(
      rules.every(
        (rule) =>
          rule.destination === "https://zyvara.us/:path*" &&
          rule.permanent === false,
      ),
    );
    delete environment.VERCEL_ENV;
    delete environment.APP_ORIGIN;
    assert.ok(
      (await config.redirects!()).some((rule) =>
        rule.has?.some(
          (condition) => condition.value === "zyvara-five\\.vercel\\.app",
        ),
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
      if (saved[index] === undefined) delete environment[key];
      else environment[key] = saved[index];
    });
  }
});
