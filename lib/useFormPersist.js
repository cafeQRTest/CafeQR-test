// Custom hook for persisting form data across tab switches
import { useEffect, useRef } from 'react';

export function useFormPersist(key, formData, isOpen) {
  const hasInitialized = useRef(false);

  // Load saved data when component mounts
  useEffect(() => {
    if (isOpen && !hasInitialized.current && typeof window !== 'undefined') {
      const saved = sessionStorage.getItem(key);
      if (saved) {
        try {
          const data = JSON.parse(saved);
          // Return the saved data to be used by the component
          return data;
        } catch (e) {
          console.error('Failed to parse saved form data:', e);
        }
      }
      hasInitialized.current = true;
    }
  }, [isOpen, key]);

  // Save data whenever it changes
  useEffect(() => {
    if (isOpen && hasInitialized.current && typeof window !== 'undefined') {
      sessionStorage.setItem(key, JSON.stringify(formData));
    }
  }, [isOpen, key, formData]);

  // Clear data when form closes
  useEffect(() => {
    if (!isOpen && typeof window !== 'undefined') {
      sessionStorage.removeItem(key);
      hasInitialized.current = false;
    }
  }, [isOpen, key]);

  // Function to manually clear the persisted data
  const clearPersistedData = () => {
    if (typeof window !== 'undefined') {
      sessionStorage.removeItem(key);
      hasInitialized.current = false;
    }
  };

  return { clearPersistedData };
}
