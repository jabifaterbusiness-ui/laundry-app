import { useEffect } from "react";
import { useAuthStore } from "../../state/auth-store.js";

const INACTIVITY_TIMEOUT_MS = 3 * 60 * 1000;

const ACTIVITY_EVENTS = [
  "mousedown",
  "mousemove",
  "keydown",
  "scroll",
  "touchstart",
  "click",
] as const;

export function SensitiveAuthorizationManager() {
  const clearSensitiveAuthorization = useAuthStore(
    (state) => state.clearSensitiveAuthorization,
  );

  useEffect(() => {
    let inactivityTimer: number | null = null;

    function resetInactivityTimer() {
      if (inactivityTimer !== null) {
        window.clearTimeout(inactivityTimer);
      }

      inactivityTimer = window.setTimeout(() => {
        clearSensitiveAuthorization();
        inactivityTimer = null;
      }, INACTIVITY_TIMEOUT_MS);
    }

    ACTIVITY_EVENTS.forEach((eventName) => {
      window.addEventListener(eventName, resetInactivityTimer);
    });

    resetInactivityTimer();

    return () => {
      if (inactivityTimer !== null) {
        window.clearTimeout(inactivityTimer);
      }

      ACTIVITY_EVENTS.forEach((eventName) => {
        window.removeEventListener(eventName, resetInactivityTimer);
      });
    };
  }, [clearSensitiveAuthorization]);

  return null;
}
