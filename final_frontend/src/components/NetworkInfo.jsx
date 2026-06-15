import React, { useState, useRef, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { FiWifi } from 'react-icons/fi';
import { QRCodeSVG } from 'qrcode.react';
import { getFrontendURLAsync } from '../utils/networkConfig';
import './NetworkInfo.css';

function NetworkInfo() {
  const [isExpanded, setIsExpanded] = useState(false);
  const defaultScheme = process.env.REACT_APP_FRONTEND_HTTPS === 'true' ? 'https' : 'http';
  const [frontendURL, setFrontendURL] = useState(`${defaultScheme}://localhost:3000`);
  const [useHttpFallback, setUseHttpFallback] = useState(false);
  const [loading, setLoading] = useState(true);
  const qrRef = useRef();

  // Get network IP on component mount
  useEffect(() => {
    const scheme = process.env.REACT_APP_FRONTEND_HTTPS === 'true' ? 'https' : 'http';

    fetch('/api/network', { headers: { Accept: 'application/json' } })
      .then((res) => res.ok ? res.json() : null)
      .then((data) => {
        if (data?.local_ip) {
          setFrontendURL(`${scheme}://${data.local_ip}:3000`);
          setLoading(false);
          return;
        }
        return getFrontendURLAsync().then((url) => {
          setFrontendURL(url);
          setLoading(false);
        });
      })
      .catch(() => {
        getFrontendURLAsync().then((url) => {
          setFrontendURL(url);
          setLoading(false);
        }).catch(() => {
          setLoading(false);
        });
      });
  }, []);

  const httpFallbackURL = frontendURL.startsWith('https://')
    ? frontendURL.replace(/^https:/, 'http:')
    : frontendURL;
  const activeURL = useHttpFallback ? httpFallbackURL : frontendURL;

  const downloadQRCode = () => {
    const svg = qrRef.current.querySelector('svg');
    const canvas = document.createElement('canvas');
    const ctx = canvas.getContext('2d');
    const img = new Image();
    
    const serializer = new XMLSerializer();
    const svgData = serializer.serializeToString(svg);
    const svgBlob = new Blob([svgData], { type: 'image/svg+xml' });
    const url = URL.createObjectURL(svgBlob);
    
    img.onload = () => {
      canvas.width = img.width;
      canvas.height = img.height;
      ctx.drawImage(img, 0, 0);
      const pngUrl = canvas.toDataURL('image/png');
      
      const link = document.createElement('a');
      link.href = pngUrl;
      link.download = 'inteliot-qr-code.png';
      link.click();
      
      URL.revokeObjectURL(url);
    };
    img.src = url;
  };

  return (
    <div className="network-info-container">
      <motion.button
        className="network-info-toggle"
        onClick={() => setIsExpanded(!isExpanded)}
        whileHover={{ scale: 1.05 }}
        whileTap={{ scale: 0.95 }}
      >
        <FiWifi size={18} />
        <span>QR Code Access</span>
      </motion.button>

      <AnimatePresence>
        {isExpanded && (
          <motion.div
            className="network-info-panel"
            initial={{ opacity: 0, scale: 0.92, y: -8 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            exit={{ opacity: 0, scale: 0.92, y: -8 }}
            transition={{ duration: 0.28, ease: [0.25, 0.46, 0.45, 0.94] }}
            style={{ transformOrigin: 'top right' }}
          >
            <div className="network-info-content">
              <div className="qr-section">
                <p className="qr-label">Scan to access the dashboard</p>
                {loading ? (
                  <div className="qr-loading">Detecting network IP...</div>
                ) : (
                  <div className="qr-container" ref={qrRef}>
                    <QRCodeSVG
                      value={activeURL}
                      size={256}
                      level="H"
                      includeMargin={true}
                    />
                  </div>
                )}
                <p className="qr-hint">
                  Scan with any device on the same Wi-Fi network to access the Inteliot platform
                </p>
                {frontendURL.startsWith('https://') && (
                  <motion.button
                    className="download-qr-btn qr-toggle-btn"
                    onClick={() => setUseHttpFallback(!useHttpFallback)}
                    whileHover={{ scale: 1.03 }}
                    whileTap={{ scale: 0.97 }}
                  >
                    {useHttpFallback ? 'Use HTTPS QR (mic enabled)' : 'Use HTTP QR (compatibility)'}
                  </motion.button>
                )}
                <motion.button
                  className="download-qr-btn"
                  onClick={downloadQRCode}
                  whileHover={{ scale: 1.05 }}
                  whileTap={{ scale: 0.95 }}
                >
                  Download QR Code
                </motion.button>
              </div>

              <div className="access-info">
                <p className="info-label">Dashboard Endpoint</p>
                <code className="url-display">{activeURL}</code>
                {useHttpFallback && (
                  <p className="qr-hint qr-warning">
                    HTTP disables mic permissions. Switch back to HTTPS after the link loads.
                  </p>
                )}
              </div>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}

export default NetworkInfo;
