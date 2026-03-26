import { Clock } from 'lucide-react';

function Timer({ time, isWarning, isCritical }) {
  const getTimerStyles = () => {
    if (isCritical) {
      return 'bg-red-100 text-red-700 border-red-300 timer-warning';
    }
    if (isWarning) {
      return 'bg-yellow-100 text-yellow-700 border-yellow-300';
    }
    return 'bg-gray-100 text-gray-700 border-gray-300';
  };

  return (
    <div className={`flex items-center gap-2 px-4 py-2 rounded-lg border ${getTimerStyles()}`}>
      <Clock className="w-5 h-5" />
      <span className="font-mono font-bold text-lg">{time}</span>
    </div>
  );
}

export default Timer;
