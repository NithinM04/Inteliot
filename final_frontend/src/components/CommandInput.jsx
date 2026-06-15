import React, { useState } from 'react';
import { FiSend } from 'react-icons/fi';
import { motion } from 'framer-motion';
import VoiceRecorder from './VoiceRecorder';
import './CommandInput.css';

const CommandInput = ({ onSubmit, isLoading, lastCommand }) => {
  const [input, setInput] = useState('');

  const handleSubmit = (e) => {
    e.preventDefault();
    if (input.trim() && !isLoading) {
      onSubmit(input);
      setInput('');
    }
  };

  const handleSetVoiceInput = (transcript) => {
    setInput(transcript);
  };

  return (
    <motion.form
      className="command-input-container"
      onSubmit={handleSubmit}
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      transition={{ duration: 0.5 }}
    >
      {/* Last Command Summary — above the input bar */}
      {lastCommand && (
        <motion.div
          className="last-command-summary"
          initial={{ opacity: 0, y: 6 }}
          animate={{ opacity: 1, y: 0 }}
          exit={{ opacity: 0, y: -6 }}
        >
          <div className="summary-content">
            <span className="summary-label">Last Executed:</span>
            <span className="summary-text">"{lastCommand.instruction}"</span>
            {lastCommand.devices && lastCommand.devices.length > 0 && (
              <div className="commands-list">
                {lastCommand.devices.map((device, idx) => (
                  <span key={idx} className="command-tag">
                    {device.name} @ {device.location} ({device.status})
                  </span>
                ))}
              </div>
            )}
          </div>
        </motion.div>
      )}

      {/* ── WhatsApp-style single-line bar ── */}
      <div className="chat-bar">
        {/* Voice button — LEFT inside bar */}
        <VoiceRecorder
          onSetInput={handleSetVoiceInput}
          disabled={isLoading}
        />

        {/* Text input */}
        <input
          type="text"
          placeholder="Issue a command or describe an action..."
          value={input}
          onChange={(e) => setInput(e.target.value)}
          disabled={isLoading}
          className="command-input"
          autoFocus
        />

        {/* Typed indicator */}
        {input.trim() && (
          <motion.span
            className="input-indicator"
            initial={{ opacity: 0, scale: 0.8 }}
            animate={{ opacity: 1, scale: 1 }}
          >
            ✓
          </motion.span>
        )}

        {/* Send button — RIGHT inside bar */}
        <button
          type="submit"
          className="send-btn"
          disabled={!input.trim() || isLoading}
          title="Send command"
        >
          <motion.div
            animate={isLoading ? { rotate: 360 } : { rotate: 0 }}
            transition={{ duration: 0.6, repeat: isLoading ? Infinity : 0 }}
          >
            {isLoading ? '⚙️' : <FiSend size={18} />}
          </motion.div>
        </button>
      </div>
    </motion.form>
  );
};

export default CommandInput;
