import { useEffect, useState } from "react";
import type { Preferences } from "./format";
const key = "blaketime.display";
function load(): Preferences {
  try {
    const value = JSON.parse(
      localStorage.getItem(key) ?? "{}",
    ) as Partial<Preferences>;
    return {
      zone: value.zone === "UTC" ? "UTC" : "local",
      hour12: value.hour12 !== false,
    };
  } catch {
    return { zone: "local", hour12: true };
  }
}
export function useDisplay() {
  const [preferences, setPreferences] = useState(load);
  const [now, setNow] = useState(Date.now);
  useEffect(() => {
    const id = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(id);
  }, []);
  useEffect(() => {
    try {
      localStorage.setItem(key, JSON.stringify(preferences));
    } catch {
      return;
    }
  }, [preferences]);
  return { preferences, setPreferences, now };
}
