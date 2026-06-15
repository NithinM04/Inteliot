import React, { useState, useEffect } from 'react';
import { motion } from 'framer-motion';
import { FiSun, FiMoon } from 'react-icons/fi';
import { useTheme } from './context/ThemeContext';
import { getFrontendURL, getBackendURL } from './utils/networkConfig';
import NetworkVisualization from './components/NetworkVisualization';
import DevicePanel from './components/DevicePanel';
import CommandInput from './components/CommandInput';
import NetworkInfo from './components/NetworkInfo';
import apiClient from './api/client';
import './App.css';

function App() {
  const { theme, toggleTheme } = useTheme();
  const [devices, setDevices] = useState([]);
  const [loading, setLoading] = useState(true);
  const [isProcessing, setIsProcessing] = useState(false);
  const [lastCommand, setLastCommand] = useState(null);
  const [error, setError] = useState('');

  // Load devices on mount
  useEffect(() => {
    loadDevices();
  }, []);

  // Log network URLs on mount
  useEffect(() => {
    const frontendURL = getFrontendURL();
    const backendURL = getBackendURL();
    
    // Print to console with styling
    console.clear();
    console.log(
      '%c INTEL·IOT — Industrial IoT Control Platform',
      'font-size: 16px; font-weight: 700; color: #3b82f6; letter-spacing: 1px;'
    );
    console.log('%c─────────────────────────────────────────', 'color: #475569;');
    console.log(`%cFrontend Endpoint:\n  %c${frontendURL}`, 'color: #94a3b8; font-weight: 600;', 'color: #3b82f6; font-family: monospace; font-size: 13px;');
    console.log(`%cBackend API Endpoint:\n  %c${backendURL}/api`, 'color: #94a3b8; font-weight: 600;', 'color: #3b82f6; font-family: monospace; font-size: 13px;');
    console.log('%c─────────────────────────────────────────', 'color: #475569;');
    console.log('%cAccess the dashboard from any device on the same local network by navigating to the Frontend Endpoint above.', 'color: #64748b; font-style: italic;');
    console.log('%c─────────────────────────────────────────\n', 'color: #475569;');
  }, []);

  const loadDevices = async () => {
    try {
      const response = await apiClient.get('/api/devices');
      setDevices(response.data.devices || []);
      setError('');
    } catch (err) {
      console.error('Error loading devices:', err);
      setError('Failed to load devices');
    } finally {
      setLoading(false);
    }
  };

  const handleCommand = async (text) => {
    if (!text.trim()) return;

    setIsProcessing(true);
    setError('');

    try {
      const response = await apiClient.post('/api/command', { text });

      setLastCommand({
        instruction: response.data.instruction,
        devices: response.data.devices || [],
        timestamp: response.data.timestamp,
      });

      // Refresh device list so status changes are reflected immediately
      loadDevices();
    } catch (err) {
      setError(err.response?.data?.error || 'Failed to process command');
      console.error('Command error:', err);
    } finally {
      setIsProcessing(false);
    }
  };

  const handleDeviceAdded = () => {
    loadDevices();
  };

  return (
    <div className="app-container">
      {/* Header */}
      <motion.header
        className="app-header"
        initial={{ opacity: 0, y: -20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.6 }}
      >
        <div className="header-content">
          <h1>
            <span className="brand-intel">INTEL</span><span className="brand-dot">·</span><span className="brand-iot">IOT</span>
          </h1>
          <p>Intelligent IoT Device Management &amp; Automation Platform</p>
        </div>
        <div className="header-actions">
          <NetworkInfo />
          <button className="theme-toggle-btn" onClick={toggleTheme} title="Toggle theme">
            {theme === 'dark' ? <FiSun size={20} /> : <FiMoon size={20} />}
          </button>
        </div>
      </motion.header>


      {/* Main Content */}
      <div className="main-content">
        {/* Left Side - Network Visualization */}
        <div className="visualization-section">
          {loading ? (
            <div className="loading-state">
              <motion.div
                animate={{ rotate: 360 }}
                transition={{ duration: 2, repeat: Infinity, ease: 'linear' }}
                className="loading-spinner"
              />
              <p>Initializing device registry...</p>
            </div>
          ) : (
            <NetworkVisualization
              devices={devices}
              command={lastCommand}
              isProcessing={isProcessing}
              theme={theme}
              onDevicesChanged={loadDevices}
            />
          )}
        </div>

        {/* Right Side - Device Panel */}
        <div className="panel-section">
          <DevicePanel devices={devices} onDeviceAdded={handleDeviceAdded} />
        </div>
      </div>

      {/* Error Display */}
      {error && (
        <motion.div
          className="error-notification"
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          exit={{ opacity: 0, y: 20 }}
        >
          <span className="error-icon">⚠</span> {error}
        </motion.div>
      )}

      {/* Command Input */}
      <motion.footer
        className="app-footer"
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.6, delay: 0.2 }}
      >
        <CommandInput
          onSubmit={handleCommand}
          isLoading={isProcessing}
          lastCommand={lastCommand}
        />
      </motion.footer>
    </div>
  );
}

export default App;
