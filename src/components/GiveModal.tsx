"use client";

import { X } from "lucide-react";
import { AnimatePresence, motion } from "framer-motion";

type GiveModalProps = {
  open: boolean;
  onClose: () => void;
};

export function GiveModal({ open, onClose }: GiveModalProps) {
  return (
    <AnimatePresence>
      {open ? (
        <motion.div
          className="modal-backdrop"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          onClick={onClose}
        >
          <motion.div
            className="modal-panel"
            role="dialog"
            aria-modal="true"
            aria-labelledby="give-title"
            initial={{ opacity: 0, y: 16, scale: 0.96 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: 12, scale: 0.98 }}
            transition={{ type: "spring", stiffness: 420, damping: 30 }}
            onClick={(event) => event.stopPropagation()}
          >
            <button className="modal-close" type="button" aria-label="Close give panel" onClick={onClose}>
              <X size={18} />
            </button>
            <h2 id="give-title">Coming soon 🍮</h2>
            <p>The jelly is accepting affection, not payments, in V0.1.</p>
          </motion.div>
        </motion.div>
      ) : null}
    </AnimatePresence>
  );
}
