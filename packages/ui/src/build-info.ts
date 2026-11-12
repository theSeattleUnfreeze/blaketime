declare const __APP_VERSION__: string;
export const appVersion =
  typeof __APP_VERSION__ === "string" ? __APP_VERSION__ : "0.1.0";
