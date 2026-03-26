import { useState, useEffect, useCallback } from 'react';

export function useTabDetection(onTabSwitch) {
  const [tabSwitchCount, setTabSwitchCount] = useState(0);
  const [isTabActive, setIsTabActive] = useState(true);
  const [lastSwitchTime, setLastSwitchTime] = useState(null);

  const handleVisibilityChange = useCallback(() => {
    const isHidden = document.hidden;

    if (isHidden) {
      setIsTabActive(false);
      setTabSwitchCount(prev => {
        const newCount = prev + 1;
        if (onTabSwitch) {
          onTabSwitch(newCount);
        }
        return newCount;
      });
      setLastSwitchTime(new Date().toISOString());
    } else {
      setIsTabActive(true);
    }
  }, [onTabSwitch]);

  useEffect(() => {
    document.addEventListener('visibilitychange', handleVisibilityChange);

    return () => {
      document.removeEventListener('visibilitychange', handleVisibilityChange);
    };
  }, [handleVisibilityChange]);

  const resetCount = useCallback(() => {
    setTabSwitchCount(0);
  }, []);

  return {
    tabSwitchCount,
    isTabActive,
    lastSwitchTime,
    resetCount
  };
}

export default useTabDetection;
