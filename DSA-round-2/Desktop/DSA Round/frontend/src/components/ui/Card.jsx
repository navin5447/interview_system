import { motion } from 'framer-motion';
import clsx from 'clsx';

export function Card({ children, className }) {
  return (
    <motion.section
      initial={{ opacity: 0, y: 6 }}
      animate={{ opacity: 1, y: 0 }}
      whileHover={{ y: -4, boxShadow: '0 18px 45px rgba(16,24,40,0.12)' }}
      transition={{ duration: 0.25, ease: 'easeOut' }}
      className={clsx(
        'bg-surface rounded-2xl shadow-[var(--shadow-soft)] border border-borderSubtle p-5',
        className
      )}
    >
      {children}
    </motion.section>
  );
}
