import React, { useEffect, useRef } from 'react';
import { motion } from 'framer-motion';
import './ListeningSphere.css';

function ListeningSphere({ isListening, onCancel }) {
  const canvasRef = useRef(null);
  const animationRef = useRef(null);
  const particlesRef = useRef([]);
  const timeRef = useRef(0);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    const ctx = canvas.getContext('2d');
    
    // Set canvas size to full viewport
    canvas.width = window.innerWidth;
    canvas.height = window.innerHeight;

    // Initialize particles
    const initializeParticles = () => {
      particlesRef.current = [];
      const particleCount = 200;
      for (let i = 0; i < particleCount; i++) {
        const angle = Math.random() * Math.PI * 2;
        const distance = Math.random() * 100 + 50;
        particlesRef.current.push({
          x: canvas.width / 2 + Math.cos(angle) * distance,
          y: canvas.height / 2 + Math.sin(angle) * distance,
          vx: (Math.random() - 0.5) * 4,
          vy: (Math.random() - 0.5) * 4,
          size: Math.random() * 3 + 1,
          opacity: Math.random() * 0.5 + 0.3,
          angle: angle,
        });
      }
    };

    initializeParticles();

    // Animation loop
    const animate = () => {
      timeRef.current += 0.016; // ~60fps

      // Fill with semi-transparent dark overlay for fade effect
      ctx.fillStyle = 'rgba(0, 0, 0, 0.4)';
      ctx.fillRect(0, 0, canvas.width, canvas.height);

      const centerX = canvas.width / 2;
      const centerY = canvas.height / 2;
      const baseRadius = 80 + Math.sin(timeRef.current * 1.5) * 20;

      // Draw main sphere with gradient
      const gradient = ctx.createRadialGradient(centerX, centerY, 0, centerX, centerY, baseRadius + 100);
      gradient.addColorStop(0, 'rgba(100, 200, 255, 0.6)');
      gradient.addColorStop(0.5, 'rgba(50, 150, 255, 0.3)');
      gradient.addColorStop(1, 'rgba(0, 100, 200, 0)');
      
      ctx.fillStyle = gradient;
      ctx.beginPath();
      ctx.arc(centerX, centerY, baseRadius + 100, 0, Math.PI * 2);
      ctx.fill();

      // Draw core sphere with pulsing effect
      const pulseSize = baseRadius * (0.8 + Math.sin(timeRef.current * 2) * 0.2);
      const coreGradient = ctx.createRadialGradient(centerX, centerY, 0, centerX, centerY, pulseSize);
      coreGradient.addColorStop(0, 'rgba(200, 220, 255, 0.9)');
      coreGradient.addColorStop(0.4, 'rgba(100, 180, 255, 0.7)');
      coreGradient.addColorStop(1, 'rgba(50, 120, 220, 0.3)');
      
      ctx.fillStyle = coreGradient;
      ctx.beginPath();
      ctx.arc(centerX, centerY, pulseSize, 0, Math.PI * 2);
      ctx.fill();

      // Draw outer glow rings
      for (let i = 1; i <= 3; i++) {
        const ringRadius = baseRadius + (i * 30) + Math.sin(timeRef.current * 1.2 - i) * 15;
        ctx.strokeStyle = `rgba(100, 180, 255, ${0.4 / i})`;
        ctx.lineWidth = 2;
        ctx.beginPath();
        ctx.arc(centerX, centerY, ringRadius, 0, Math.PI * 2);
        ctx.stroke();
      }

      // Update and draw particles
      particlesRef.current.forEach((particle) => {
        // Move towards center with some variation
        const dx = centerX - particle.x;
        const dy = centerY - particle.y;
        const distance = Math.sqrt(dx * dx + dy * dy);
        
        // Orbital motion around sphere
        const orbitSpeed = 0.02;
        const orbitRadius = Math.sqrt(Math.pow(particle.x - centerX, 2) + Math.pow(particle.y - centerY, 2));
        
        particle.angle += orbitSpeed;
        particle.x = centerX + Math.cos(particle.angle) * orbitRadius;
        particle.y = centerY + Math.sin(particle.angle) * orbitRadius;

        // Add some turbulence
        particle.vx += (Math.random() - 0.5) * 0.5;
        particle.vy += (Math.random() - 0.5) * 0.5;
        particle.vx *= 0.95;
        particle.vy *= 0.95;

        particle.x += particle.vx;
        particle.y += particle.vy;

        // Fade and reset if too far
        if (distance > 400) {
          particle.opacity *= 0.95;
          if (particle.opacity < 0.05) {
            const newAngle = Math.random() * Math.PI * 2;
            const newDistance = Math.random() * 100 + 50;
            particle.x = centerX + Math.cos(newAngle) * newDistance;
            particle.y = centerY + Math.sin(newAngle) * newDistance;
            particle.opacity = Math.random() * 0.5 + 0.3;
            particle.angle = newAngle;
          }
        }

        // Draw particle
        ctx.fillStyle = `rgba(100, 200, 255, ${particle.opacity})`;
        ctx.beginPath();
        ctx.arc(particle.x, particle.y, particle.size, 0, Math.PI * 2);
        ctx.fill();

        // Draw particle trails
        ctx.strokeStyle = `rgba(100, 200, 255, ${particle.opacity * 0.5})`;
        ctx.lineWidth = 0.5;
        ctx.beginPath();
        ctx.moveTo(particle.x, particle.y);
        ctx.lineTo(particle.x - particle.vx * 5, particle.y - particle.vy * 5);
        ctx.stroke();
      });

      // Draw center label
      ctx.fillStyle = 'rgba(200, 220, 255, 0.8)';
      ctx.font = 'bold 24px Arial';
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillText('Listening...', centerX, centerY + baseRadius + 60);

      animationRef.current = requestAnimationFrame(animate);
    };

    animate();

    // Handle window resize
    const handleResize = () => {
      canvas.width = window.innerWidth;
      canvas.height = window.innerHeight;
    };

    window.addEventListener('resize', handleResize);

    return () => {
      if (animationRef.current) {
        cancelAnimationFrame(animationRef.current);
      }
      window.removeEventListener('resize', handleResize);
    };
  }, []);

  return (
    <div className="listening-sphere-container">
      <button
        className="sphere-cancel-button"
        onClick={onCancel}
        type="button"
        title="Cancel recording"
      >
        ×
      </button>

      <canvas ref={canvasRef} className="listening-sphere-canvas" />
      
      <motion.div
        className="sphere-overlay-text"
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        transition={{ delay: 0.3 }}
      >
        <p>Speak clearly to control your devices</p>
      </motion.div>
    </div>
  );
}

export default ListeningSphere;
