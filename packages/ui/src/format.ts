import { locale } from "./messages";
export const number = (value: number | null | undefined, digits = 0) =>
  value == null || !Number.isFinite(value)
    ? "—"
    : new Intl.NumberFormat(locale, { maximumFractionDigits: digits }).format(
        value,
      );
export const percent = (value: number, digits = 1) =>
  new Intl.NumberFormat(locale, {
    style: "percent",
    minimumFractionDigits: digits,
    maximumFractionDigits: digits,
  }).format(value);
export function freshSample(
  updatedAt: number,
  reference: number | null | undefined,
  maxAge: number,
): boolean {
  if (
    reference == null ||
    !Number.isFinite(updatedAt) ||
    !Number.isFinite(reference)
  ) {
    return false;
  }
  const age = reference - updatedAt;
  return age <= maxAge && age >= -5;
}
export function amount(sats: string | null | undefined): string {
  if (sats == null || !/^\d+$/.test(sats)) return "—";
  const value = BigInt(sats);
  const fraction = (value % 100000000n)
    .toString()
    .padStart(8, "0")
    .replace(/0+$/, "");
  return (
    new Intl.NumberFormat(locale).format(value / 100000000n) +
    (fraction ? `.${fraction}` : "")
  );
}
export function scaled(value: number | null | undefined, unit: string): string {
  if (value == null || !Number.isFinite(value) || value < 0) return "—";
  const prefixes = ["", "k", "M", "G", "T", "P", "E", "Z", "Y"];
  let index = Math.min(
    prefixes.length - 1,
    Math.max(0, Math.floor(Math.log10(Math.max(value, 1)) / 3)),
  );
  let scaledValue = value / 1000 ** index;
  if (scaledValue >= 999.995 && index < prefixes.length - 1) {
    index += 1;
    scaledValue /= 1000;
  }
  return `${number(scaledValue, 2)} ${prefixes[index]}${unit}`.trim();
}
export function duration(seconds: number | null | undefined): string {
  if (seconds == null || !Number.isFinite(seconds)) return "—";
  const total = Math.max(0, Math.floor(seconds));
  if (total >= 86400) {
    const days = Math.floor(total / 86400);
    const hours = Math.floor((total % 86400) / 3600);
    const minutes = Math.floor((total % 3600) / 60);
    return `${number(days)}d ${hours}h ${minutes}m`;
  }
  if (total >= 3600)
    return `${Math.floor(total / 3600)}h ${Math.floor((total % 3600) / 60)}m`;
  return `${Math.floor(total / 60)}m ${total % 60}s`;
}
export type Preferences = { zone: "local" | "UTC"; hour12: boolean };
export function timestamp(
  epochSeconds: number,
  nowMs: number,
  preferences: Preferences,
): string {
  const timeZone = preferences.zone === "UTC" ? "UTC" : undefined;
  const updated = new Date(epochSeconds * 1000);
  const current = new Date(nowMs);
  const day = new Intl.DateTimeFormat(locale, {
    timeZone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  });
  const sameDay = day.format(updated) === day.format(current);
  return new Intl.DateTimeFormat(locale, {
    timeZone,
    month: sameDay ? undefined : "short",
    day: sameDay ? undefined : "numeric",
    hour: "numeric",
    minute: "2-digit",
    second: "2-digit",
    hour12: preferences.hour12,
  }).format(updated);
}
export function clockParts(now: number, preferences: Preferences) {
  const timeZone = preferences.zone === "UTC" ? "UTC" : undefined;
  const date = new Date(now);
  return {
    time: new Intl.DateTimeFormat(locale, {
      hour: "numeric",
      minute: "2-digit",
      hour12: preferences.hour12,
      timeZone,
    }).format(date),
    day: new Intl.DateTimeFormat(locale, { weekday: "long", timeZone }).format(
      date,
    ),
    date: new Intl.DateTimeFormat(locale, {
      month: "short",
      day: "numeric",
      year: "numeric",
      timeZone,
    }).format(date),
  };
}
