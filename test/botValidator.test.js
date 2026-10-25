import test from "node:test";
import assert from "node:assert/strict";
import { validateBotSource } from "../net/botValidator.js";

test("bot validation fails closed when Python cannot be started", async () => {
  const result = await validateBotSource("def make_move(): return None", {
    python: "ltm-missing-python-executable",
  });
  assert.equal(result.ok, false);
  assert.match(result.message, /Python/);
});
