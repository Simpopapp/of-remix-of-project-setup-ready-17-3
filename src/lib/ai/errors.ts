/**
 * Erros tipados da fronteira de IA.
 *
 * São deliberadamente pequenos e sem conteúdo sensível: carregam apenas um
 * `code` estável. O adaptador traduz cada código em abstenção/revisão — nunca
 * em nota determinística substituta.
 */

export type EvaluationErrorCode =
  | "missing_api_key"
  | "schema"
  | "rate_limited"
  | "server_error"
  | "unauthorized"
  | "forbidden"
  | "bad_request"
  | "not_found"
  | "network"
  | "aborted"
  | "invalid_input"
  | "unknown";

export class MissingApiKeyError extends Error {
  readonly code = "missing_api_key" as const;
  constructor() {
    super("LOVABLE_API_KEY ausente no ambiente do servidor");
    this.name = "MissingApiKeyError";
  }
}

export class EvaluationOutputError extends Error {
  readonly code = "schema" as const;
  constructor(message = "saída do avaliador fora do contrato") {
    super(message);
    this.name = "EvaluationOutputError";
  }
}

export function errorCodeOf(error: unknown): EvaluationErrorCode | undefined {
  if (typeof error !== "object" || error === null) return undefined;
  const code = (error as { code?: unknown }).code;
  return typeof code === "string" ? (code as EvaluationErrorCode) : undefined;
}
