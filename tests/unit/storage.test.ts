import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it } from "vitest";

import { LocalStorageProvider } from "@/server/storage/local";

const roots: string[] = [];

afterEach(async () => {
  await Promise.all(roots.splice(0).map((root) => fs.rm(root, { recursive: true, force: true })));
});

describe("LocalStorageProvider", () => {
  it("stores a buffer under its configured root", async () => {
    const root = await fs.mkdtemp(path.join(os.tmpdir(), "besorah-storage-"));
    roots.push(root);
    const storage = new LocalStorageProvider(root);
    await storage.putBuffer("videos/test.srt", new TextEncoder().encode("hello"));
    await expect(fs.readFile(path.join(root, "videos/test.srt"), "utf8")).resolves.toBe("hello");
  });

  it("rejects path traversal", async () => {
    const root = await fs.mkdtemp(path.join(os.tmpdir(), "besorah-storage-"));
    roots.push(root);
    const storage = new LocalStorageProvider(root);
    expect(() => storage.resolve("../../secret.txt")).toThrow("Invalid storage key");
  });
});
