// hooks/useSubscriptionGuard.js
import { useEffect, useState } from 'react';
import { useRouter } from 'next/router';

export function useSubscriptionGuard(restaurantId) {
  const router = useRouter();
  const [loading, setLoading] = useState(true);
  const [isActive, setIsActive] = useState(false);
  const [subscriptionInfo, setSubscriptionInfo] = useState(null);

  useEffect(() => {
    if (!restaurantId) {
      setLoading(false);
      return;
    }

    async function checkSubscription() {
      try {
        const response = await fetch(`/api/subscription/status?restaurant_id=${restaurantId}`);
        const data = await response.json();

        setIsActive(data.is_active);
        setSubscriptionInfo(data);

        // Redirect to subscription page if inactive
        if (!data.is_active && !router.pathname.includes('/subscription')) {
          router.push('/owner/subscription');
        }
      } catch (error) {
        console.error('Failed to check subscription:', error);
        setIsActive(false);
      } finally {
        setLoading(false);
      }
    }

    checkSubscription();
  }, [restaurantId, router]);

  return { loading, isActive, subscriptionInfo };
}
