import React from 'react';
import { motion } from 'framer-motion';
import './ListeningVisualization.css';

function ListeningVisualization({ isListening }) {
  // Create 12 dots in a sphere pattern
  const dotCount = 12;
  const dots = Array.from({ length: dotCount }, (_, i) => ({
    id: i,
    angle: (i / dotCount) * Math.PI * 2,
  }));

  const containerVariants = {
    animate: {
      transition: {
        staggerChildren: 0.05,
        delayChildren: 0.1,
      },
    },
  };

  const dotVariants = {
    initial: {
      scale: 0.6,
      opacity: 0.4,
    },
    animate: {
      scale: [0.6, 1.2, 0.6],
      opacity: [0.4, 1, 0.4],
      transition: {
        duration: 1.2,
        repeat: Infinity,
        ease: 'easeInOut',
      },
    },
  };

  if (!isListening) return null;

  return (
    <div className="listening-visualization">
      <motion.div
        className="dots-sphere"
        variants={containerVariants}
        animate="animate"
      >
        {dots.map((dot) => {
          const x = Math.cos(dot.angle) * 40;
          const y = Math.sin(dot.angle) * 40;

          return (
            <motion.div
              key={dot.id}
              className="dot"
              style={{
                left: `calc(50% + ${x}px)`,
                top: `calc(50% + ${y}px)`,
              }}
              variants={dotVariants}
              initial="initial"
              animate="animate"
            />
          );
        })}
      </motion.div>
    </div>
  );
}

export default ListeningVisualization;
