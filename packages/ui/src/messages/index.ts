import messages from "./en-US.json";
import type { ErrorCode } from "@blaketime/contracts";
export type MessageKey = keyof typeof messages;
export const locale = "en-US";
export function t(
  key: MessageKey,
  values: Record<string, string | number> = {},
) {
  return messages[key].replace(/\{(\w+)\}/g, (match, name: string) =>
    String(values[name] ?? match),
  );
}
const errors: Record<ErrorCode, MessageKey> = {
  invalidConfig: "errors.config",
  networkMismatch: "errors.network",
  unsupported: "errors.unsupported",
  auth: "errors.auth",
  permission: "errors.permission",
  unreachable: "errors.unreachable",
  invalidResponse: "errors.response",
  busy: "status.checking",
};
export function errorText(code: unknown) {
  return t(
    typeof code === "string" && Object.hasOwn(errors, code)
      ? errors[code as ErrorCode]
      : "errors.app",
  );
}
