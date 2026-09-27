import { apiFetch } from "./api-client.js";

export interface ExecuteQuickOperationResponse {
  data: {
    code: string;
    result: unknown;
  };
}

export interface ExecuteQuickOperationInput {
  code: string;
  input?: Record<string, unknown>;
  confirmed?: boolean;
  reason?: string;
}

export async function executeQuickOperation(
  input: ExecuteQuickOperationInput,
  auth: { accessToken: string | null },
  branchId?: string | null,
): Promise<ExecuteQuickOperationResponse["data"]> {
  const response = await apiFetch<ExecuteQuickOperationResponse>(
    "/quick-operations/execute",
    {
      method: "POST",
      accessToken: auth.accessToken,
      branchId,
      body: JSON.stringify({
        code: input.code,
        input: input.input ?? {},
        confirmed: input.confirmed ?? false,
        ...(input.reason !== undefined
          ? { reason: input.reason }
          : {}),
      }),
    },
  );

  return response.data;
}
