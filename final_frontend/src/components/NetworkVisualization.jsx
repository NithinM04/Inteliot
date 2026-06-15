import React, { useEffect, useState, useCallback } from 'react';
import { motion } from 'framer-motion';
import './NetworkVisualization.css';
import apiClient from '../api/client';

/* ── Emoji helper ─────────────────────────────────────── */
const getDeviceEmoji = (device) => {
  const name = (device.name || '').toLowerCase();
  if (/\bfan\b/.test(name))                           return '🌀';
  if (/\blight\b|\blamp\b|\bbulb\b/.test(name))       return '💡';
  if (/\bac\b|air.?conditioner|aircon/.test(name))    return '❄️';
  if (/\brefrigerator\b|\bfridge\b/.test(name))       return '🧊';
  if (/\btv\b|\btelevision\b|\bdisplay\b/.test(name)) return '📺';
  if (/\bheater\b|\bwarm/.test(name))                 return '🔥';
  if (/\bspeaker\b|\baudio\b|\bsound\b/.test(name))   return '🔊';
  if (/\bcamera\b|\bcam\b/.test(name))                return '📷';
  if (/\bwasher\b|\bwashing/.test(name))              return '🫧';
  if (/\bdoor\b|\block\b/.test(name))                 return '🚪';
  if (/\bpump\b|\bwater/.test(name))                  return '💧';
  if (/\bmotor\b/.test(name))                         return '⚙️';
  if (/\boven\b|\bmicrowave\b/.test(name))            return '🍳';
  if (/\bplug\b|\bsocket\b|\bcharger\b/.test(name))   return '🔌';
  if (/\bbell\b|\bdoor.?bell/.test(name))             return '🔔';
  return '🔌';
};

/* ── Layout helpers ─────────────────────────────────── */
const NODE_R = 26;
const PAD    = 50;

/**
 * Place N devices in a compact cluster around (gx, gy).
 */
const placeDevicesInGroup = (devs, gx, gy) => {
  const n = devs.length;
  if (n === 1) return [{ ...devs[0], x: gx, y: gy }];

  // Adaptive sub-radius so clusters don't overlap
  const subR = Math.max(44, 28 + n * 10);
  return devs.map((d, i) => {
    const a = (i / n) * Math.PI * 2 - Math.PI / 2;
    return { ...d, x: gx + subR * Math.cos(a), y: gy + subR * Math.sin(a) };
  });
};

const boundingRect = (positioned) => {
  const xs = positioned.map(d => d.x);
  const ys = positioned.map(d => d.y);
  const x  = Math.min(...xs) - PAD;
  const y  = Math.min(...ys) - PAD - 14;
  const w  = Math.max(...xs) - Math.min(...xs) + PAD * 2;
  const h  = Math.max(...ys) - Math.min(...ys) + PAD * 2 + 14;
  return { x, y, w, h };
};

/**
 * Compute dynamic viewBox dimensions based on all device positions.
 * Adds extra margin so nothing is clipped.
 */
const computeViewBox = (groups, cx, cy) => {
  if (groups.length === 0) return { vw: 800, vh: 580, cx, cy };
  const allX = groups.flatMap(g => [g.bbox.x, g.bbox.x + g.bbox.w]);
  const allY = groups.flatMap(g => [g.bbox.y, g.bbox.y + g.bbox.h]);
  allX.push(cx - 60, cx + 60);
  allY.push(cy - 60, cy + 60);
  const margin = 40;
  const minX = Math.min(...allX) - margin;
  const minY = Math.min(...allY) - margin;
  const maxX = Math.max(...allX) + margin;
  const maxY = Math.max(...allY) + margin;
  return {
    vx: minX,
    vy: minY,
    vw: maxX - minX,
    vh: maxY - minY,
  };
};

/* ── Component ───────────────────────────────────────── */
const NetworkVisualization = ({ devices, command, isProcessing, theme, onDevicesChanged }) => {
  const [animatingDevices, setAnimatingDevices] = useState([]);
  const [togglingDevice, setTogglingDevice] = useState(null);
  const isLight = theme === 'light';

  /* ── Theme-aware color tokens ─────────────────────── */
  const T = {
    canvasShadow: isLight
      ? 'drop-shadow(0 0 20px rgba(0,100,200,0.15))'
      : 'drop-shadow(0 0 24px rgba(0,212,255,0.35))',
    hubFrom:   isLight ? '#7c3aed' : '#ff6eb0',
    hubTo:     isLight ? '#4f46e5' : '#8338ec',
    hubLabel:  '#ffffff',
    hubLabel2: 'rgba(255,255,255,0.8)',
    onFrom: isLight ? '#0ea5a0' : '#4dd9ac',
    onTo:   isLight ? '#0369a1' : '#1a7fa8',
    offFrom: isLight ? '#cbd5e1' : '#32324a',
    offTo:   isLight ? '#94a3b8' : '#1e1e2a',
    activeFrom: isLight ? '#f59e0b' : '#f5c842',
    activeTo:   isLight ? '#b45309' : '#d45f00',
    lineStroke:   isLight ? '#94a3b8' : '#5566aa',
    lineOpacity:  isLight ? '0.4'    : '0.45',
    boundFillActive:   isLight ? 'rgba(16,185,129,0.07)' : 'rgba(60,200,160,0.06)',
    boundFillInactive: isLight ? 'rgba(59,130,246,0.04)' : 'rgba(59,130,246,0.03)',
    boundGlowStroke:   isLight ? 'rgba(16,185,129,0.5)'  : 'rgba(60,200,155,0.45)',
    boundActiveStroke: isLight ? 'rgba(16,185,129,0.55)' : 'rgba(70,210,165,0.5)',
    boundIdleStroke:   isLight ? 'rgba(100,130,200,0.35)': 'rgba(100,120,180,0.28)',
    labelActive: isLight ? 'rgba(5,150,105,0.9)'    : 'rgba(100,220,180,0.85)',
    labelIdle:   isLight ? 'rgba(100,116,139,0.75)'  : 'rgba(140,160,210,0.6)',
    nodeOnStroke:  isLight ? 'rgba(16,185,129,0.35)' : 'rgba(60,200,155,0.3)',
    nodeOffStroke: isLight ? 'rgba(148,163,184,0.5)' : 'rgba(70,70,100,0.4)',
    nameOn:  isLight ? '#065f46' : '#5ecba8',
    nameOff: isLight ? '#94a3b8' : '#52526a',
    ringOn:     isLight ? '#0ea5a0' : '#4dd9ac',
    ringActive: isLight ? '#f59e0b' : '#f5c842',
    emojiOffOpacity: isLight ? 0.25 : 0.3,
    dotOn:       isLight ? '#059669' : '#3ecf96',
    dotOnStroke: isLight ? 'rgba(5,150,105,0.25)' : 'rgba(62,207,150,0.25)',
    dotOff:      isLight ? '#cbd5e1' : '#3a3a50',
    dotOffStroke:isLight ? 'rgba(0,0,0,0.15)' : 'rgba(0,0,0,0.3)',
    processingStroke: isLight ? '#0ea5e9' : '#00d4ff',
    toggleHover: isLight ? 'rgba(59,130,246,0.12)' : 'rgba(0,212,255,0.12)',
  };

  /* Animate command targets */
  useEffect(() => {
    if (command?.devices?.length > 0) {
      const targets = command.devices.map((d) => {
        if (typeof d === 'string') return d.toLowerCase();
        if (d?.id) return `id:${d.id}`;
        const name = (d?.name || '').toLowerCase();
        const location = (d?.location || '').toLowerCase();
        return `nl:${name}::${location}`;
      });
      setAnimatingDevices(targets);
      const t = setTimeout(() => setAnimatingDevices([]), 2500);
      return () => clearTimeout(t);
    }
  }, [command]);

  /* ── Toggle device on/off via API ─────────────────── */
  const handleNodeClick = useCallback(async (device) => {
    if (togglingDevice === device.id) return;
    setTogglingDevice(device.id);
    const newStatus = device.status === 'on' ? 'off' : 'on';
    try {
      await apiClient.put(`/api/devices/${device.id}/status`, { status: newStatus });
      if (onDevicesChanged) onDevicesChanged();
    } catch (err) {
      console.error('Toggle device error:', err);
    } finally {
      setTogglingDevice(null);
    }
  }, [togglingDevice, onDevicesChanged]);

  /* ── Group devices by location ───────────────────── */
  const groupMap = {};
  (devices || []).forEach(d => {
    const loc = (d.location || 'Unknown').trim();
    if (!groupMap[loc]) groupMap[loc] = [];
    groupMap[loc].push(d);
  });
  const groupEntries = Object.entries(groupMap);
  const numGroups = groupEntries.length;

  /* Dynamic hub position and group orbit radius */
  // Scale GROUP_R up as more groups are added
  const GROUP_R = Math.max(180, 120 + numGroups * 30);
  // Hub center — fixed at 0,0; viewBox will shift to fit
  const CX = 0;
  const CY = 0;

  const groups = groupEntries.map(([location, devs], gi) => {
    const angle = (gi / numGroups) * Math.PI * 2 - Math.PI / 2;
    const gx = CX + GROUP_R * Math.cos(angle);
    const gy = CY + GROUP_R * Math.sin(angle);
    const positioned = placeDevicesInGroup(devs, gx, gy);
    const bbox = boundingRect(positioned);
    return { location, positioned, gx, gy, bbox };
  });

  /* Compute dynamic viewBox */
  const vb = computeViewBox(groups, CX, CY);
  const viewBox = `${vb.vx ?? -400} ${vb.vy ?? -290} ${vb.vw} ${vb.vh}`;

  return (
    <div className="network-visualization">
      <div className="network-canvas-wrapper">
        <svg
          className="network-canvas"
          viewBox={viewBox}
          preserveAspectRatio="xMidYMid meet"
        >
          <defs>
            <radialGradient id="hubGrad" cx="50%" cy="50%" r="50%">
              <stop offset="0%" stopColor={T.hubFrom} />
              <stop offset="100%" stopColor={T.hubTo} />
            </radialGradient>
            <radialGradient id="onGrad" cx="35%" cy="35%" r="65%">
              <stop offset="0%" stopColor={T.onFrom} />
              <stop offset="100%" stopColor={T.onTo} />
            </radialGradient>
            <radialGradient id="offGrad" cx="40%" cy="40%" r="60%">
              <stop offset="0%" stopColor={T.offFrom} />
              <stop offset="100%" stopColor={T.offTo} />
            </radialGradient>
            <radialGradient id="activeGrad" cx="35%" cy="35%" r="65%">
              <stop offset="0%" stopColor={T.activeFrom} />
              <stop offset="100%" stopColor={T.activeTo} />
            </radialGradient>
            <filter id="hubGlow" x="-50%" y="-50%" width="200%" height="200%">
              <feGaussianBlur stdDeviation="5" result="blur" />
              <feMerge><feMergeNode in="blur" /><feMergeNode in="SourceGraphic" /></feMerge>
            </filter>
            <filter id="onGlow" x="-50%" y="-50%" width="200%" height="200%">
              <feGaussianBlur stdDeviation="3.5" result="blur" />
              <feMerge><feMergeNode in="blur" /><feMergeNode in="SourceGraphic" /></feMerge>
            </filter>
            <filter id="offGlow" x="-15%" y="-15%" width="130%" height="130%">
              <feGaussianBlur stdDeviation="1" result="blur" />
              <feMerge><feMergeNode in="blur" /><feMergeNode in="SourceGraphic" /></feMerge>
            </filter>
            <filter id="boundaryGlow" x="-10%" y="-10%" width="120%" height="120%">
              <feGaussianBlur stdDeviation="4" result="blur" />
              <feMerge><feMergeNode in="blur" /><feMergeNode in="SourceGraphic" /></feMerge>
            </filter>
            <filter id="toggleHoverGlow" x="-30%" y="-30%" width="160%" height="160%">
              <feGaussianBlur stdDeviation="6" result="blur" />
              <feMerge><feMergeNode in="blur" /><feMergeNode in="SourceGraphic" /></feMerge>
            </filter>
          </defs>

          {/* Dashed lines: hub → group centroid */}
          {groups.map(({ location, gx, gy }) => (
            <line
              key={`link-${location}`}
              x1={CX} y1={CY}
              x2={gx} y2={gy}
              stroke={T.lineStroke}
              strokeWidth="1.5"
              strokeDasharray="6 4"
              opacity={T.lineOpacity}
            />
          ))}

          {/* Group boundaries */}
          {groups.map(({ location, bbox, positioned }) => {
            const hasActiveDevice = positioned.some(d => d.status === 'on');
            return (
              <g key={`bound-${location}`}>
                <rect
                  x={bbox.x} y={bbox.y}
                  width={bbox.w} height={bbox.h}
                  rx="18" ry="18"
                  fill={hasActiveDevice ? T.boundFillActive : T.boundFillInactive}
                />
                {hasActiveDevice && (
                  <motion.rect
                    x={bbox.x} y={bbox.y}
                    width={bbox.w} height={bbox.h}
                    rx="18" ry="18"
                    fill="none"
                    stroke={T.boundGlowStroke}
                    strokeWidth="2"
                    filter="url(#boundaryGlow)"
                    initial={{ opacity: 0.5 }}
                    animate={{ opacity: [0.5, 0.15, 0.5] }}
                    transition={{ duration: 3, repeat: Infinity, ease: 'easeInOut' }}
                  />
                )}
                <rect
                  x={bbox.x} y={bbox.y}
                  width={bbox.w} height={bbox.h}
                  rx="18" ry="18"
                  fill="none"
                  stroke={hasActiveDevice ? T.boundActiveStroke : T.boundIdleStroke}
                  strokeWidth="1.5"
                  strokeDasharray="7 4"
                />
                <text
                  x={bbox.x + bbox.w / 2}
                  y={bbox.y + 15}
                  textAnchor="middle"
                  fontSize="10"
                  fontWeight="700"
                  letterSpacing="1.8"
                  fill={hasActiveDevice ? T.labelActive : T.labelIdle}
                  style={{ fontFamily: 'inherit' }}
                >
                  {location.toUpperCase()}
                </text>
              </g>
            );
          })}

          {/* Device nodes — clickable buttons */}
          {groups.map(({ positioned }) =>
            positioned.map((device, di) => {
              const isOn        = device.status === 'on';
              const nameKey = `nl:${(device.name || '').toLowerCase()}::${(device.location || '').toLowerCase()}`;
              const idKey = `id:${device.id}`;
              const isAnimating = animatingDevices.includes(idKey)
                || animatingDevices.includes(nameKey)
                || animatingDevices.includes((device.name || '').toLowerCase());
              const isToggling  = togglingDevice === device.id;
              const fillId      = isAnimating ? 'activeGrad' : isOn ? 'onGrad' : 'offGrad';
              const filterId    = isAnimating || isOn ? 'onGlow' : 'offGlow';
              const ringColor   = isAnimating ? T.ringActive : T.ringOn;
              const nameColor   = isOn ? T.nameOn : T.nameOff;

              return (
                <motion.g
                  key={`node-${device.id}`}
                  initial={{ scale: 0, opacity: 0 }}
                  animate={{ scale: 1, opacity: 1 }}
                  transition={{ delay: di * 0.07, duration: 0.45, type: 'spring', stiffness: 120 }}
                  style={{ cursor: 'pointer' }}
                  onClick={() => handleNodeClick(device)}
                  role="button"
                  aria-label={`Toggle ${device.name}`}
                  tabIndex={0}
                  onKeyDown={e => e.key === 'Enter' && handleNodeClick(device)}
                >
                  {/* Invisible hit area (larger than visible circle) */}
                  <circle
                    cx={device.x} cy={device.y}
                    r={NODE_R + 10}
                    fill="transparent"
                  />

                  {/* Hover highlight ring */}
                  <motion.circle
                    cx={device.x} cy={device.y}
                    r={NODE_R + 8}
                    fill={T.toggleHover}
                    opacity={0}
                    whileHover={{ opacity: 1 }}
                    transition={{ duration: 0.15 }}
                  />

                  {/* Pulsing ring when ON or animating */}
                  {(isOn || isAnimating) && (
                    <motion.circle
                      cx={device.x} cy={device.y} r={NODE_R + 6}
                      fill="none"
                      stroke={ringColor}
                      strokeWidth="1"
                      initial={{ opacity: 0.45, scale: 1 }}
                      animate={{ opacity: 0, scale: 1.45 }}
                      transition={{ duration: isAnimating ? 0.7 : 2.8, repeat: Infinity, ease: 'easeOut' }}
                    />
                  )}

                  {/* Toggling spinner ring */}
                  {isToggling && (
                    <motion.circle
                      cx={device.x} cy={device.y} r={NODE_R + 4}
                      fill="none"
                      stroke={T.processingStroke}
                      strokeWidth="2"
                      strokeDasharray="20 40"
                      animate={{ rotate: 360 }}
                      transition={{ duration: 0.8, repeat: Infinity, ease: 'linear' }}
                      style={{ transformOrigin: `${device.x}px ${device.y}px` }}
                    />
                  )}

                  {/* Device circle */}
                  <circle
                    cx={device.x} cy={device.y}
                    r={NODE_R}
                    fill={`url(#${fillId})`}
                    filter={`url(#${filterId})`}
                    stroke={isOn || isAnimating ? T.nodeOnStroke : T.nodeOffStroke}
                    strokeWidth="1.5"
                    className="device-node"
                  />

                  {/* Emoji */}
                  <text
                    x={device.x} y={device.y + 5}
                    textAnchor="middle"
                    dominantBaseline="middle"
                    fontSize="14"
                    opacity={isOn || isAnimating ? 1 : T.emojiOffOpacity}
                    style={{ pointerEvents: 'none', userSelect: 'none' }}
                  >
                    {getDeviceEmoji(device)}
                  </text>

                  {/* Device name */}
                  <text
                    x={device.x}
                    y={device.y + NODE_R + 14}
                    textAnchor="middle"
                    fontSize="9.5"
                    fontWeight="600"
                    fill={nameColor}
                    style={{ fontFamily: 'inherit', pointerEvents: 'none', userSelect: 'none' }}
                  >
                    {device.name.length > 12 ? device.name.slice(0, 11) + '…' : device.name}
                  </text>

                  {/* ON/OFF status dot */}
                  <circle
                    cx={device.x + NODE_R - 6}
                    cy={device.y - NODE_R + 6}
                    r="5"
                    fill={isOn ? T.dotOn : T.dotOff}
                    stroke={isOn ? T.dotOnStroke : T.dotOffStroke}
                    strokeWidth="1"
                  />
                </motion.g>
              );
            })
          )}

          {/* Centre hub */}
          <motion.g
            initial={{ scale: 0 }}
            animate={{ scale: 1 }}
            transition={{ duration: 0.7, type: 'spring', stiffness: 100 }}
          >
            <circle cx={CX} cy={CY} r="52" fill="url(#hubGrad)" filter="url(#hubGlow)" />
            <text
              x={CX} y={CY - 6}
              textAnchor="middle" fontSize="12" fontWeight="800"
              fill={T.hubLabel} letterSpacing="1.5"
              style={{ fontFamily: 'inherit' }}
            >
              INTEL
            </text>
            <text
              x={CX} y={CY + 10}
              textAnchor="middle" fontSize="12" fontWeight="700"
              fill={T.hubLabel2} letterSpacing="1.5"
              style={{ fontFamily: 'inherit' }}
            >
              IOT
            </text>
            {isProcessing && (
              <motion.circle
                cx={CX} cy={CY} r="52"
                fill="none" stroke={T.processingStroke} strokeWidth="2.5"
                initial={{ r: 52, opacity: 1 }}
                animate={{ r: 78, opacity: 0 }}
                transition={{ duration: 1, repeat: Infinity }}
              />
            )}
          </motion.g>
        </svg>
      </div>

      {/* Command text */}
      {command?.devices?.length > 0 && (
        <motion.div
          className="command-display"
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          exit={{ opacity: 0, y: -20 }}
        >
          <p className="command-text">
            {command.instruction}
          </p>
        </motion.div>
      )}

      {/* Click-to-toggle hint */}
      {devices && devices.length > 0 && (
        <p className="viz-hint">Click any device node to toggle on / off</p>
      )}
    </div>
  );
};

export default NetworkVisualization;
