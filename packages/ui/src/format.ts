import { locale } from "./messages";
export const number = (value: number | null | undefined, digits = 0) =>
  value == null || !Number.isFinite(value)
    ? "—"
    : new Intl.NumberFormat(locale, { maximumFractionDigits: digits }).format(
        value,
      );
export const percent = (value: number) =>
  new Intl.NumberFormat(locale, {
    style: "percent",
    maximumFractionDigits: 1,
  }).format(value);
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
  if (value == null || !Number.isFinite(value)) return "—";
  const prefixes = ["", "k", "M", "G", "T", "P", "E"];
  const index = Math.min(
    prefixes.length - 1,
    Math.max(0, Math.floor(Math.log10(Math.max(value, 1)) / 3)),
  );
  return `${number(value / 1000 ** index, 2)} ${prefixes[index]}${unit}`;
}
export function duration(seconds: number | null | undefined): string {
  if (seconds == null || !Number.isFinite(seconds)) return "—";
  const total = Math.max(0, Math.floor(seconds));
  if (total >= 86400)
    return `${number(Math.floor(total / 86400))}d ${Math.floor((total % 86400) / 3600)}h`;
  if (total >= 3600)
    return `${Math.floor(total / 3600)}h ${Math.floor((total % 3600) / 60)}m`;
  return `${Math.floor(total / 60)}m ${total % 60}s`;
}
export type Preferences = { zone: "local" | "UTC"; hour12: boolean };
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
