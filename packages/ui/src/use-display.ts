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
    let timer: ReturnType<typeof setTimeout> | undefined;
    const tick = () => {
      setNow(Date.now());
      timer = setTimeout(tick, 1000 - (Date.now() % 1000));
    };
    const wake = () => setNow(Date.now());
    timer = setTimeout(tick, 1000 - (Date.now() % 1000));
    document.addEventListener("visibilitychange", wake);
    window.addEventListener("focus", wake);
    window.addEventListener("pageshow", wake);
    window.addEventListener("online", wake);
    return () => {
      if (timer) clearTimeout(timer);
      document.removeEventListener("visibilitychange", wake);
      window.removeEventListener("focus", wake);
      window.removeEventListener("pageshow", wake);
      window.removeEventListener("online", wake);
    };
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
