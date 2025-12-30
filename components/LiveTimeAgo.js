
import React, { useState, useEffect } from 'react';

export function timeAgoCalc(dateString) {
  if (!dateString) return '';
  const date = new Date(dateString);
  const now = new Date();
  const diffMs = now - date;
  const diffMins = Math.floor(diffMs / 60000);
  
  if (diffMins < 1) return 'Just now';
  if (diffMins < 60) return `${diffMins}m ago`;
  const hours = Math.floor(diffMins / 60);
  const mins = diffMins % 60;
  if (hours < 24) return `${hours}h ${mins}m ago`;
  // Days
  const days = Math.floor(hours / 24);
  if (days < 7) return `${days}d ago`;

  return date.toLocaleDateString();
}

export default function LiveTimeAgo({ date }) {
  const [str, setStr] = useState(() => timeAgoCalc(date));

  useEffect(() => {
    setStr(timeAgoCalc(date)); // Initial
    const interval = setInterval(() => {
       setStr(timeAgoCalc(date));
    }, 60000); // Update every minute
    return () => clearInterval(interval);
  }, [date]);

  return <span>{str}</span>;
}
