// EIP-1193 / EIP-1474 error codes, serialised across the extension boundary.

export const ErrorCode = {
  UserRejected: 4001,
  Unauthorized: 4100,
  UnsupportedMethod: 4200,
  Disconnected: 4900,
  ChainDisconnected: 4901,
  UnrecognizedChain: 4902,
  InvalidParams: -32602,
  Internal: -32603,
  ResourceUnavailable: -32002,
} as const;

export interface SerializedError {
  code: number;
  message: string;
  data?: unknown;
}

export class ProviderError extends Error {
  code: number;
  data?: unknown;
  constructor(code: number, message: string, data?: unknown) {
    super(message);
    this.code = code;
    this.data = data;
  }
}

export const rejected = (msg = "User rejected the request.") => new ProviderError(ErrorCode.UserRejected, msg);
export const unauthorized = (msg = "The requested account and/or method has not been authorized by the user.") =>
  new ProviderError(ErrorCode.Unauthorized, msg);
export const unsupported = (method: string) =>
  new ProviderError(ErrorCode.UnsupportedMethod, `Rizon does not support "${method}".`);
export const invalidParams = (msg: string) => new ProviderError(ErrorCode.InvalidParams, msg);
export const unrecognizedChain = (id: string) =>
  new ProviderError(ErrorCode.UnrecognizedChain, `Unrecognized chain ID "${id}". Rizon does not support this network.`);
export const locked = () => new ProviderError(ErrorCode.Unauthorized, "Rizon is locked.");

export function serializeError(e: unknown): SerializedError {
  if (e instanceof ProviderError) return { code: e.code, message: e.message, data: e.data };
  const anyE = e as { code?: unknown; message?: unknown; shortMessage?: unknown; info?: any };
  // Pass through JSON-RPC errors returned by the node (e.g. execution reverted).
  const rpcErr = anyE?.info?.error;
  if (rpcErr && typeof rpcErr.code === "number") {
    return { code: rpcErr.code, message: String(rpcErr.message ?? "RPC error"), data: rpcErr.data };
  }
  const message =
    (typeof anyE?.shortMessage === "string" && anyE.shortMessage) ||
    (typeof anyE?.message === "string" && anyE.message) ||
    "Internal error";
  return { code: ErrorCode.Internal, message };
}
