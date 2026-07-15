import fs from "node:fs";
import fsPromises from "node:fs/promises";
import path from "node:path";
import { Readable } from "node:stream";
import { pipeline } from "node:stream/promises";

import { getEnv } from "@/server/env";

import type { StorageProvider } from "./types";

export class LocalStorageProvider implements StorageProvider {
  private readonly root: string;

  constructor(
    root = path.resolve(
      /* turbopackIgnore: true */ process.cwd(),
      getEnv().STORAGE_ROOT,
    ),
  ) {
    this.root = root;
  }

  resolve(key: string): string {
    const normalized = key.replaceAll("\\", "/").replace(/^\/+/, "");
    const resolved = path.resolve(this.root, normalized);
    const relative = path.relative(this.root, resolved);
    if (relative.startsWith("..") || path.isAbsolute(relative)) {
      throw new Error("Invalid storage key");
    }
    return resolved;
  }

  async putBuffer(key: string, data: Uint8Array): Promise<string> {
    const destination = this.resolve(key);
    await fsPromises.mkdir(path.dirname(destination), { recursive: true });
    await fsPromises.writeFile(destination, data);
    return key;
  }

  async putWebStream(key: string, body: ReadableStream<Uint8Array>): Promise<string> {
    const destination = this.resolve(key);
    await fsPromises.mkdir(path.dirname(destination), { recursive: true });
    await pipeline(
      Readable.fromWeb(
        body as unknown as import("node:stream/web").ReadableStream,
      ),
      fs.createWriteStream(destination),
    );
    return key;
  }

  async putFile(key: string, sourcePath: string): Promise<string> {
    const destination = this.resolve(key);
    await fsPromises.mkdir(path.dirname(destination), { recursive: true });
    if (path.resolve(sourcePath) !== destination) await fsPromises.copyFile(sourcePath, destination);
    return key;
  }

  async downloadUrl(key: string, url: string): Promise<string> {
    const response = await fetch(url, { redirect: "follow" });
    if (!response.ok || !response.body) throw new Error(`Video download failed (${response.status})`);
    const destination = this.resolve(key);
    await fsPromises.mkdir(path.dirname(destination), { recursive: true });
    await pipeline(
      Readable.fromWeb(
        response.body as unknown as import("node:stream/web").ReadableStream,
      ),
      fs.createWriteStream(destination),
    );
    return key;
  }

  createReadStream(key: string): Readable {
    return fs.createReadStream(this.resolve(key));
  }

  async exists(key: string): Promise<boolean> {
    try {
      await fsPromises.access(this.resolve(key));
      return true;
    } catch {
      return false;
    }
  }

  publicUrl(key: string): string {
    return `/api/organic-video-lab/files/${key
      .split("/")
      .map((part) => encodeURIComponent(part))
      .join("/")}`;
  }
}

let storage: StorageProvider | undefined;

export function getStorage(): StorageProvider {
  storage ??= new LocalStorageProvider();
  return storage;
}
