import type { Readable } from "node:stream";

export interface StorageProvider {
  putBuffer(key: string, data: Uint8Array): Promise<string>;
  putWebStream(key: string, body: ReadableStream<Uint8Array>): Promise<string>;
  putFile(key: string, sourcePath: string): Promise<string>;
  downloadUrl(key: string, url: string): Promise<string>;
  resolve(key: string): string;
  createReadStream(key: string): Readable;
  exists(key: string): Promise<boolean>;
  publicUrl(key: string): string;
}
