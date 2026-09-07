import { useEffect } from "react";
import { replayOfflineSyncQueue } from "../../lib/offline-sync-replay.js";
import { useAuthStore } from "../../state/auth-store.js";

export function OfflineSyncManager() {
  const accessToken = useAuthStore((state) => state.accessToken);
  const user = useAuthStore((state) => state.user);
  const activeBranchId = useAuthStore((state) => state.activeBranchId);

  useEffect(() => {
    if (!accessToken || !user?.businessId || !activeBranchId) {
      return;
    }

    const context = {
      businessId: user.businessId,
      branchId: activeBranchId,
      accessToken,
    };

    const replay = () => {
      if (!navigator.onLine) {
        return;
      }

      void replayOfflineSyncQueue(context);
    };

    replay();

    window.addEventListener("online", replay);

    return () => {
      window.removeEventListener("online", replay);
    };
  }, [accessToken, user?.businessId, activeBranchId]);

  return null;
}
