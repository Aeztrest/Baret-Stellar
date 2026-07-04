import { HardHat } from "lucide-react";
import { motion } from "framer-motion";

/**
 * "Protected by Baret" badge, fixed bottom-right on every demo site.
 * Token-driven so it reads correctly in both themes.
 */
export function BaretBadge() {
  return (
    <motion.div
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ delay: 1.2 }}
      className="fixed bottom-5 right-5 z-40 flex items-center gap-2 rounded-full border px-3 py-1.5 shadow-card backdrop-blur-md"
      style={{
        background: "color-mix(in oklab, var(--card) 92%, transparent)",
        borderColor: "color-mix(in oklab, var(--primary) 40%, transparent)",
      }}
    >
      <HardHat size={12} className="text-primary" />
      <span className="text-xs font-semibold text-foreground">Protected by Baret</span>
    </motion.div>
  );
}
