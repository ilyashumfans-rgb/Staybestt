import { useState, useEffect } from 'react';

const STORE_KEY = 'staybest_guest_email';

export function useGuestIdentity() {
  const [email, setEmailState] = useState<string>(() => {
    return localStorage.getItem(STORE_KEY) || '';
  });

  const setEmail = (newEmail: string) => {
    localStorage.setItem(STORE_KEY, newEmail);
    setEmailState(newEmail);
  };

  const clearEmail = () => {
    localStorage.removeItem(STORE_KEY);
    setEmailState('');
  };

  return { email, setEmail, clearEmail, isAuthenticated: !!email };
}
