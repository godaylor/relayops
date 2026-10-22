import { AnimatePresence, motion, useReducedMotion } from "framer-motion";
import { useTranslation } from "react-i18next";

export function AnimatedMetric({ value }: { value: number }) {
  const reduce = useReducedMotion();
  const { i18n } = useTranslation();
  const formatted = new Intl.NumberFormat(i18n.language).format(value);
  return (
    <span className="sbor-metric-number">
      <span className="sr-only">{formatted}</span>
      <AnimatePresence initial={false} mode="popLayout">
        <motion.span
          key={value}
          aria-hidden="true"
          initial={{
            opacity: 0,
            transform: reduce ? "none" : "translateY(5px)",
          }}
          animate={{ opacity: 1, transform: "translateY(0px)" }}
          exit={{ opacity: 0, transform: reduce ? "none" : "translateY(-5px)" }}
          transition={{
            duration: reduce ? 0.12 : 0.2,
            ease: [0.23, 1, 0.32, 1],
          }}
        >
          {formatted}
        </motion.span>
      </AnimatePresence>
    </span>
  );
}
