import React, { useState, useEffect, useRef } from 'react';
import ReactDOM from 'react-dom';
import { FiMic } from 'react-icons/fi';
import { motion, AnimatePresence } from 'framer-motion';
import ListeningSphere from './ListeningSphere';
import './VoiceRecorder.css';

function VoiceRecorder({ onSetInput, disabled = false }) {
  const [listening, setListening] = useState(false);
  const [showSphere, setShowSphere] = useState(false);
  const [supported, setSupported] = useState(false);
  const [errorMessage, setErrorMessage] = useState('');
  const recognitionRef = useRef(null);
  const interimRef = useRef('');

  // Initialize Speech Recognition on mount
  useEffect(() => {
    try {
      const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;
      
      if (!SpeechRecognition) {
        console.error('Speech Recognition API not supported');
        setSupported(false);
        setErrorMessage('Voice input is not supported in this browser.');
        return;
      }

      const recognition = new SpeechRecognition();
      recognition.continuous = false;
      recognition.interimResults = true;
      recognition.language = 'en-US';

      recognition.onstart = () => {
        console.log('Speech recognition started');
        setErrorMessage('');
        setListening(true);
      };

      recognition.onend = () => {
        console.log('Speech recognition ended');
        setListening(false);
      };

      recognition.onresult = (event) => {
        let finalTranscript = '';
        let interimTranscript = '';

        for (let i = event.resultIndex; i < event.results.length; i++) {
          const transcript = event.results[i][0].transcript;
          
          if (event.results[i].isFinal) {
            finalTranscript += transcript + ' ';
          } else {
            interimTranscript += transcript + ' ';
          }
        }

        if (interimTranscript.trim() && onSetInput) {
          interimRef.current = interimTranscript.trim();
          onSetInput(interimRef.current);
        }

        if (finalTranscript.trim()) {
          console.log('Final transcript:', finalTranscript);
          // Put text in input field instead of sending
          if (onSetInput) {
            onSetInput(finalTranscript.trim());
          }
          interimRef.current = '';
          // Stop listening and close sphere
          recognition.stop();
          setShowSphere(false);
        }
      };

      recognition.onerror = (event) => {
        console.error('Speech recognition error:', event.error);
        setErrorMessage(`Voice input error: ${event.error}`);
        setListening(false);
        // Keep sphere visible to show error
      };

      recognition.onend = () => {
        console.log('Speech recognition ended');
        setListening(false);
        if (!interimRef.current) return;
        if (onSetInput) {
          onSetInput(interimRef.current);
        }
        interimRef.current = '';
      };

      recognitionRef.current = recognition;
      setSupported(true);
    } catch (err) {
      console.error('Error initializing Speech Recognition:', err);
      setSupported(false);
      setErrorMessage('Voice input is not available on this device.');
    }
  }, [onSetInput]);

  const handleClick = () => {
    if (disabled || !recognitionRef.current) return;

    try {
      if (showSphere) {
        // Close sphere
        recognitionRef.current.stop();
        setShowSphere(false);
        setListening(false);
      } else {
        // Show sphere immediately and start recognition
        setShowSphere(true);
        setListening(false);
        interimRef.current = '';
        recognitionRef.current.start();
      }
    } catch (err) {
      console.error('Error:', err);
      setErrorMessage('Voice input could not start. Try again.');
      setShowSphere(false);
      setListening(false);
    }
  };

  const handleCancel = () => {
    if (recognitionRef.current) {
      recognitionRef.current.stop();
    }
    setShowSphere(false);
    setListening(false);
  };

  if (!supported) {
    return (
      <div 
        className="voice-recorder-button voice-recorder-unsupported" 
        title={errorMessage || 'Speech Recognition not supported in your browser'}
      >
        <FiMic size={20} />
      </div>
    );
  }

  return (
    <>
      <motion.button
        onClick={handleClick}
        className={`voice-recorder-button ${listening || showSphere ? 'listening' : ''}`}
        disabled={disabled}
        title={showSphere ? 'Stop listening' : 'Start voice input'}
        whileHover={!disabled ? { scale: 1.05 } : {}}
        whileTap={!disabled ? { scale: 0.95 } : {}}
        type="button"
      >
        <motion.div
          animate={listening || showSphere ? { scale: [1, 1.2, 1] } : { scale: 1 }}
          transition={{ duration: 0.6, repeat: listening || showSphere ? Infinity : 0 }}
        >
          <FiMic size={20} />
        </motion.div>
      </motion.button>

      {showSphere && ReactDOM.createPortal(
        <AnimatePresence>
          <ListeningSphere isListening={listening} onCancel={handleCancel} />
        </AnimatePresence>,
        document.body
      )}
    </>
  );
}

export default VoiceRecorder;
