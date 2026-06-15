import { HardHat } from "lucide-react";
import { motion } from "framer-motion";

/** "Protected by Baret" badge — fixed bottom-right on every demo site. */
export function BlackthornBadge() {
  return (
    <motion.div
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ delay: 1.2 }}
      className="fixed bottom-5 right-5 z-40 flex items-center gap-2 px-3 py-1.5 rounded-full shadow-card"
      style={{
        background: "rgba(255,255,255,0.92)",
        border: "1px solid rgba(255,107,0,0.40)",
        backdropFilter: "blur(8px)",
      }}
    >
      <HardHat size={12} className="text-brand-500" />
      <span className="text-xs font-semibold text-ink-700">Protected by Baret</span>
    </motion.div>
  );
}
