import { Shield } from "lucide-react";
import { motion } from "framer-motion";

export function BlackthornBadge() {
  return (
    <motion.div
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ delay: 1.2 }}
      className="fixed bottom-5 right-5 z-40 flex items-center gap-2 px-3 py-1.5 rounded-full"
      style={{
        background: "rgba(99,102,241,0.1)",
        border: "1px solid rgba(99,102,241,0.2)",
        backdropFilter: "blur(8px)",
      }}
    >
      <Shield size={11} className="text-indigo-400" />
      <span className="text-xs font-medium text-indigo-300/70">Protected by BLACKTHORN</span>
    </motion.div>
  );
}
