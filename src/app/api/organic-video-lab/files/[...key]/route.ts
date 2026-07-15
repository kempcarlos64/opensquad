import { createReadStream } from "node:fs";
import fs from "node:fs/promises";
import { NextResponse } from "next/server";
import path from "node:path";
import { Readable } from "node:stream";

import { getStorage } from "@/server/storage/local";

export const runtime = "nodejs";

type Context = { params: Promise<{ key: string[] }> };

const contentTypes: Record<string, string> = {
  ".mp4": "video/mp4",
  ".srt": "application/x-subrip; charset=utf-8",
  ".png": "image/png",
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
};

export async function GET(request: Request, context: Context) {
  try {
    const { key: parts } = await context.params;
    const key = parts.join("/");
    const storage = getStorage();
    const filePath = storage.resolve(key);
    const stat = await fs.stat(filePath);
    const range = request.headers.get("range");
    const type = contentTypes[path.extname(filePath).toLowerCase()] ?? "application/octet-stream";

    if (range) {
      const match = /bytes=(\d+)-(\d*)/.exec(range);
      if (!match?.[1]) return new NextResponse(null, { status: 416 });
      const start = Number(match[1]);
      if (!Number.isSafeInteger(start) || start < 0 || start >= stat.size) {
        return new NextResponse(null, {
          status: 416,
          headers: { "Content-Range": `bytes */${stat.size}` },
        });
      }
      const requestedEnd = match[2] ? Number(match[2]) : stat.size - 1;
      const end = Math.min(
        Number.isSafeInteger(requestedEnd) ? requestedEnd : stat.size - 1,
        stat.size - 1,
      );
      if (end < start) {
        return new NextResponse(null, {
          status: 416,
          headers: { "Content-Range": `bytes */${stat.size}` },
        });
      }
      const ranged = createReadStream(filePath, { start, end });
      return new NextResponse(Readable.toWeb(ranged) as ReadableStream, {
        status: 206,
        headers: {
          "Content-Type": type,
          "Content-Length": String(end - start + 1),
          "Content-Range": `bytes ${start}-${end}/${stat.size}`,
          "Accept-Ranges": "bytes",
          "Cache-Control": "private, max-age=3600",
        },
      });
    }

    const stream = storage.createReadStream(key);
    return new NextResponse(Readable.toWeb(stream) as ReadableStream, {
      headers: {
        "Content-Type": type,
        "Content-Length": String(stat.size),
        "Accept-Ranges": "bytes",
        "Cache-Control": "private, max-age=3600",
      },
    });
  } catch {
    return NextResponse.json({ error: "Arquivo não encontrado." }, { status: 404 });
  }
}
