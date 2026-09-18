import { useEffect } from "react";
import { replayOfflineSubscriptionPaymentQueue } from "../../lib/offline-subscription-payment-replay.js";
import { SUBSCRIPTION_PAYMENT_QUEUE_EVENT } from "../../lib/offline-subscription-payment-queue.js";
import { useAuthStore } from "../../state/auth-store.js";

export function OfflineSubscriptionPaymentManager() {
  const accessToken = useAuthStore((state) => state.accessToken);
  const user = useAuthStore((state) => state.user);

  useEffect(() => {
    if (!accessToken || !user?.businessId || !user.id) {
      return;
    }

    const context = {
      businessId: user.businessId,
      actorUserId: user.id,
      accessToken,
    };

    const replay = () => {
      if (!navigator.onLine) {
        return;
      }

      void replayOfflineSubscriptionPaymentQueue(context);
    };

    replay();
    window.addEventListener("online", replay);
    window.addEventListener(SUBSCRIPTION_PAYMENT_QUEUE_EVENT, replay);

    return () => {
      window.removeEventListener("online", replay);
      window.removeEventListener(SUBSCRIPTION_PAYMENT_QUEUE_EVENT, replay);
    };
  }, [accessToken, user?.businessId, user?.id]);

  return null;
}
