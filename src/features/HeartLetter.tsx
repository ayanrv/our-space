import { useState } from "react";
import { Heart, RotateCcw } from "lucide-react";
import { motion, useReducedMotion } from "motion/react";
export function HeartLetter({ name }: { name: string }) {
  const [replay, setReplay] = useState(0);
  const reduced = useReducedMotion();
  return (
    <section className="heart-letter" aria-label={`A heart from ${name}`}>
      <span className="eyebrow">A little love, just for you</span>
      <div key={replay} className="heart-letter-scene" aria-hidden="true">
        {!reduced &&
          Array.from({ length: 8 }, (_, i) => (
            <span
              className="letter-heart-orbit"
              key={i}
              style={{ "--i": i } as React.CSSProperties}
            >
              <Heart fill="currentColor" size={18 + (i % 3) * 5} />
            </span>
          ))}
        <motion.div
          className="heart-letter-center"
          initial={reduced ? false : { scale: 0.3, rotate: -14 }}
          animate={
            reduced
              ? { scale: 1 }
              : { scale: [0.3, 1.13, 1, 0.94, 1], rotate: [-14, 8, 0] }
          }
          transition={{ duration: 1.25, ease: "easeOut" }}
        >
          <Heart size={76} fill="currentColor" strokeWidth={1.4} />
        </motion.div>
      </div>
      <h3>A heart from {name}.</h3>
      <p>Someone’s thinking of you.</p>
      <button className="text-button" onClick={() => setReplay((n) => n + 1)}>
        <RotateCcw size={14} /> Play it again
      </button>
    </section>
  );
}
