import { useState, useEffect, useCallback } from 'react';

export function useTimer(endTime, onExpire) {
  const [timeRemaining, setTimeRemaining] = useState(null);
  const [isExpired, setIsExpired] = useState(false);

  const calculateTimeRemaining = useCallback(() => {
    if (!endTime) return null;
    // Ensure endTime is parsed as UTC if it doesn't have timezone info
    let endTimeStr = endTime;
    if (!endTimeStr.endsWith('Z') && !endTimeStr.includes('+')) {
      endTimeStr = endTimeStr + 'Z';
    }
    const end = new Date(endTimeStr).getTime();
    const now = Date.now();
    const remaining = Math.max(0, Math.floor((end - now) / 1000));
    return remaining;
  }, [endTime]);

  useEffect(() => {
    if (!endTime) return;

    const updateTimer = () => {
      const remaining = calculateTimeRemaining();
      setTimeRemaining(remaining);

      if (remaining <= 0 && !isExpired) {
        setIsExpired(true);
        if (onExpire) {
          onExpire();
        }
      }
    };

    // Initial update
    updateTimer();

    // Update every second
    const interval = setInterval(updateTimer, 1000);

    return () => clearInterval(interval);
  }, [endTime, calculateTimeRemaining, isExpired, onExpire]);

  const formatTime = useCallback((seconds) => {
    if (seconds === null) return '--:--:--';

    const hours = Math.floor(seconds / 3600);
    const minutes = Math.floor((seconds % 3600) / 60);
    const secs = seconds % 60;

    if (hours > 0) {
      return `${hours.toString().padStart(2, '0')}:${minutes.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}`;
    }
    return `${minutes.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}`;
  }, []);

  const isWarning = timeRemaining !== null && timeRemaining <= 300; // 5 minutes
  const isCritical = timeRemaining !== null && timeRemaining <= 60; // 1 minute

  return {
    timeRemaining,
    formattedTime: formatTime(timeRemaining),
    isExpired,
    isWarning,
    isCritical
  };
}

export default useTimer;
