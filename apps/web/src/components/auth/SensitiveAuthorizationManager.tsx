import { useEffect, useRef } from "react";
import { ApiError } from "../../lib/api-client.js";
import { recordSensitiveActivity } from "../../lib/auth-api.js";
import { useAuthStore } from "../../state/auth-store.js";

const DEFAULT_INACTIVITY_TIMEOUT_MS = 3 * 60 * 1000;
const ACTIVITY_HEARTBEAT_THROTTLE_MS = 15 * 1000;

const ACTIVITY_EVENTS = [
  "mousedown",
  "mousemove",
  "keydown",
  "scroll",
  "touchstart",
  "click",
] as const;

export function SensitiveAuthorizationManager() {
  const accessToken = useAuthStore((state) => state.accessToken);
  const sensitiveAuthorization = useAuthStore((state) => state.sensitiveAuthorization);
  const inactivityTimeoutMs = useAuthStore((state) => state.sensitiveAuthorizationInactivityTimeoutMs);
  const setSensitiveAuthorization = useAuthStore((state) => state.setSensitiveAuthorization);
  const clearSensitiveAuthorization = useAuthStore((state) => state.clearSensitiveAuthorization);
  const lastHeartbeatAt = useRef(0);
  const heartbeatInFlight = useRef(false);

  useEffect(() => {
    const authorizationToken = sensitiveAuthorization;
    if (!authorizationToken) return;

    let inactivityTimer: number | null = null;
    const timeoutMs = inactivityTimeoutMs ?? DEFAULT_INACTIVITY_TIMEOUT_MS;
    lastHeartbeatAt.current = Date.now();

    function resetInactivityTimer() {
      if (inactivityTimer !== null) {
        window.clearTimeout(inactivityTimer);
      }

      inactivityTimer = window.setTimeout(() => {
        clearSensitiveAuthorization();
        inactivityTimer = null;
      }, timeoutMs);

      const currentAccessToken = accessToken;
      if (!currentAccessToken || heartbeatInFlight.current) return;
      const now = Date.now();
      if (now - lastHeartbeatAt.current < ACTIVITY_HEARTBEAT_THROTTLE_MS) return;

      lastHeartbeatAt.current = now;
      heartbeatInFlight.current = true;
      void recordSensitiveActivity(authorizationToken!, currentAccessToken!)
        .then((activity) => {
          if (useAuthStore.getState().sensitiveAuthorization !== authorizationToken) return;
          setSensitiveAuthorization({
            token: authorizationToken!,
            expiresAt: activity.expiresAt,
            inactivityTimeoutMs: activity.inactivityTimeoutMs,
          });
        })
        .catch((error: unknown) => {
          if (error instanceof ApiError && error.status === 403) {
            clearSensitiveAuthorization();
          }
        })
        .finally(() => {
          heartbeatInFlight.current = false;
        });
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
  }, [
    accessToken,
    clearSensitiveAuthorization,
    inactivityTimeoutMs,
    sensitiveAuthorization,
    setSensitiveAuthorization,
  ]);

  return null;
}
