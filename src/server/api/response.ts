import { NextResponse } from "next/server";
import { ZodError } from "zod";

import { logger } from "@/server/logger";
import { MediaQualityError } from "@/server/media/quality";

export function apiError(error: unknown, event: string) {
  if (error instanceof ZodError) {
    return NextResponse.json(
      {
        error: "Dados inválidos.",
        issues: error.issues.map((issue) => ({
          path: issue.path.join("."),
          message: issue.message,
        })),
      },
      { status: 400 },
    );
  }
  if (error instanceof MediaQualityError) {
    logger.error(event, {
      code: error.code,
      stage: error.stage,
      message: error.message,
    });
    return NextResponse.json(
      {
        error: error.message,
        code: error.code,
        stage: error.stage,
        issues: error.issues,
      },
      { status: 422 },
    );
  }
  const message = error instanceof Error ? error.message : "Unexpected error";
  logger.error(event, { message });
  const status = message === "Project not found" ? 404 : 500;
  return NextResponse.json(
    { error: status === 404 ? "Projeto não encontrado." : "Não foi possível concluir a operação." },
    { status },
  );
}
