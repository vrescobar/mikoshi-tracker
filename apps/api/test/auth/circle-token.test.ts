import { afterEach, describe, expect, it } from "vitest";

import {
  createCircleToken,
  findCircleByToken,
  generateCircleToken,
  hashCircleToken,
  revokeCircleToken,
} from "../../src/auth/circle-token";
import { createCircleRecord } from "../../src/modules/circles/circle.repository";
import { createTestContext, signUp, type TestContext } from "../helpers/app";

describe("generateCircleToken / hashCircleToken", () => {
  it("generateCircleToken() returns a string starting with mikoshi_tracker_circle_", () => {
    const token = generateCircleToken();
    expect(token.startsWith("mikoshi_tracker_circle_")).toBe(true);
  });

  it("generateCircleToken() produces a unique value each call", () => {
    const tokens = new Set(Array.from({ length: 20 }, () => generateCircleToken()));
    expect(tokens.size).toBe(20);
  });

  it("hashCircleToken() is deterministic for the same input", () => {
    const token = "mikoshi_tracker_circle_abc123deadbeef";
    expect(hashCircleToken(token)).toBe(hashCircleToken(token));
  });

  it("hashCircleToken() produces different digests for different inputs", () => {
    expect(hashCircleToken("mikoshi_tracker_circle_aaa")).not.toBe(hashCircleToken("mikoshi_tracker_circle_bbb"));
  });

  it("hashCircleToken() output does not contain the plain token", () => {
    const token = "mikoshi_tracker_circle_secret";
    const hash = hashCircleToken(token);
    expect(hash).not.toContain("secret");
    expect(hash).not.toContain("mikoshi_tracker_circle_");
  });
});

describe("circle-token DB operations", () => {
  let context: TestContext | undefined;

  afterEach(async () => {
    if (context) {
      await context.cleanup();
      context = undefined;
    }
  });

  it("findCircleByToken() returns null for an unknown token", async () => {
    context = await createTestContext();
    const result = await findCircleByToken(context.app.db, "mikoshi_tracker_circle_doesnotexist");
    expect(result).toBeNull();
  });

  it("createCircleToken() returns a plain token findCircleByToken() resolves to the correct circle", async () => {
    context = await createTestContext();
    const { body: alice } = await signUp(context.app);
    const circle = await createCircleRecord(context.app.db, {
      ownerId: alice.user.id,
      name: "Lookup Circle",
    });

    const { token, tokenId } = await createCircleToken(context.app.db, circle.id);

    const found = await findCircleByToken(context.app.db, token);
    expect(found).not.toBeNull();
    expect(found!.circle.id).toBe(circle.id);
    expect(found!.circle.ownerId).toBe(alice.user.id);
    expect(found!.tokenId).toBe(tokenId);
  });

  it("createCircleToken() with a label stores the label in the DB", async () => {
    context = await createTestContext();
    const { body: alice } = await signUp(context.app);
    const circle = await createCircleRecord(context.app.db, {
      ownerId: alice.user.id,
      name: "Label Circle",
    });

    const { tokenId } = await createCircleToken(context.app.db, circle.id, "Mikoshi bot");
    const record = await context.app.db.circleToken.findUnique({ where: { id: tokenId } });
    expect(record?.label).toBe("Mikoshi bot");
  });

  it("createCircleToken() stores only the hash, never the plain token", async () => {
    context = await createTestContext();
    const { body: alice } = await signUp(context.app);
    const circle = await createCircleRecord(context.app.db, {
      ownerId: alice.user.id,
      name: "Hash Circle",
    });

    const { token, tokenId } = await createCircleToken(context.app.db, circle.id);
    const record = await context.app.db.circleToken.findUnique({ where: { id: tokenId } });
    expect(record?.token).not.toBe(token);
    expect(record?.token).toBe(hashCircleToken(token));
  });

  it("findCircleByToken() returns null after the token is revoked", async () => {
    context = await createTestContext();
    const { body: alice } = await signUp(context.app);
    const circle = await createCircleRecord(context.app.db, {
      ownerId: alice.user.id,
      name: "Revoke Circle",
    });

    const { token, tokenId } = await createCircleToken(context.app.db, circle.id);
    await revokeCircleToken(context.app.db, tokenId);

    const found = await findCircleByToken(context.app.db, token);
    expect(found).toBeNull();
  });

  it("two tokens for the same circle both resolve independently", async () => {
    context = await createTestContext();
    const { body: alice } = await signUp(context.app);
    const circle = await createCircleRecord(context.app.db, {
      ownerId: alice.user.id,
      name: "Multi-token Circle",
    });

    const { token: token1, tokenId: tokenId1 } = await createCircleToken(context.app.db, circle.id, "Bot A");
    const { token: token2, tokenId: tokenId2 } = await createCircleToken(context.app.db, circle.id, "Bot B");

    const found1 = await findCircleByToken(context.app.db, token1);
    const found2 = await findCircleByToken(context.app.db, token2);

    expect(found1!.tokenId).toBe(tokenId1);
    expect(found2!.tokenId).toBe(tokenId2);
    expect(found1!.circle.id).toBe(circle.id);
    expect(found2!.circle.id).toBe(circle.id);
  });
});
