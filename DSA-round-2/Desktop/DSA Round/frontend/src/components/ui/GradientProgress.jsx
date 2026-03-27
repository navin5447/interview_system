import { motion } from 'framer-motion';

export function GradientProgress({ value }) {
  const clamped = Math.min(100, Math.max(0, value ?? 0));

  return (
    <div className="w-full h-2 rounded-full bg-primary-50 overflow-hidden">
      <motion.div
        className="h-full rounded-full"
        style={{ backgroundImage: 'var(--gradient-primary)' }}
        initial={{ width: 0 }}
        animate={{ width: `${clamped}%` }}
        transition={{ duration: 0.7, ease: 'easeOut' }}
      />
    </div>
  );
}
