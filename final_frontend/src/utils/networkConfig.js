/**
 * Network Configuration Utility
 * Detects the local IP address and provides network access URLs
 */

// Cache for detected network IP
let cachedNetworkIP = null;
let cachedNetworkIPAt = 0;

const NETWORK_IP_TTL_MS = 5000;

const isPrivateIP = (ip) => {
  if (!ip) return false;
  if (ip.startsWith('10.')) return true;
  if (ip.startsWith('192.168.')) return true;
  if (ip.startsWith('172.')) {
    const parts = ip.split('.');
    const second = Number(parts[1]);
    return second >= 16 && second <= 31;
  }
  return false;
};

const isIPv4 = (value) => /^([0-9]{1,3}\.){3}[0-9]{1,3}$/.test(value);

/**
 * Gets the network IP asynchronously
 * Detects the local network IP address using WebRTC
 * Falls back to window.location.hostname if WebRTC fails
 */
export function getNetworkIP() {
  return new Promise((resolve) => {
    const now = Date.now();
    // If already cached and fresh, use it
    if (cachedNetworkIP && now - cachedNetworkIPAt < NETWORK_IP_TTL_MS) {
      resolve(cachedNetworkIP);
      return;
    }

    const hostname = window.location.hostname;

    if (isIPv4(hostname) && isPrivateIP(hostname)) {
      cachedNetworkIP = hostname;
      cachedNetworkIPAt = now;
      resolve(hostname);
      return;
    }
    
    // If not localhost, we're already on the network IP
    if (hostname !== 'localhost' && hostname !== '127.0.0.1') {
      cachedNetworkIP = hostname;
      cachedNetworkIPAt = now;
      resolve(hostname);
      return;
    }

    // Try backend-reported IP first when running locally
    fetch('/api/network', { headers: { Accept: 'application/json' } })
      .then((res) => res.ok ? res.json() : null)
      .then((data) => {
        if (data?.local_ip && isPrivateIP(data.local_ip)) {
          cachedNetworkIP = data.local_ip;
          cachedNetworkIPAt = Date.now();
          resolve(data.local_ip);
        }
      })
      .catch(() => {});

    // Try to detect IP using WebRTC
    try {
      const candidates = [];
      const pc = new (window.RTCPeerConnection || window.webkitRTCPeerConnection)({
        iceServers: []
      });

      pc.onicecandidate = (ice) => {
        if (!ice || !ice.candidate) return;
        
        const candidate = ice.candidate.candidate;
        const ipMatch = /([0-9]{1,3}(\.[0-9]{1,3}){3})/.exec(candidate);
        
        if (ipMatch && ipMatch[1]) {
          const ip = ipMatch[1];
          if (ip.startsWith('127.') || ip === '255.255.255.255') return;
          candidates.push(ip);
        }
      };

      pc.createDataChannel('dummy');
      pc.createOffer()
        .then(offer => pc.setLocalDescription(offer))
        .catch(() => {
          pc.close();
          resolve('localhost');
        });

      // Timeout fallback
      setTimeout(() => {
        pc.close();
        if (cachedNetworkIP) return;
        const privateCandidates = candidates.filter(isPrivateIP);
        const selected = privateCandidates[0] || candidates[0] || hostname;
        cachedNetworkIP = selected;
        cachedNetworkIPAt = Date.now();
        resolve(selected);
      }, 1500);
    } catch (error) {
      console.log('WebRTC IP detection failed, using hostname');
      cachedNetworkIP = hostname;
      resolve(hostname);
    }
  });
}

export function getLocalIP() {
  // Get the hostname or IP from window.location
  const hostname = window.location.hostname;
  
  // If running on localhost/127.0.0.1, try to detect actual IP
  if (hostname === 'localhost' || hostname === '127.0.0.1') {
    return 'localhost';
  }
  
  return hostname;
}

const getFrontendScheme = () => {
  if (process.env.REACT_APP_FRONTEND_HTTPS === 'true') return 'https';
  if (typeof window !== 'undefined' && window.location?.protocol === 'https:') return 'https';
  return 'http';
};

const getFrontendHostOverride = () => {
  const host = process.env.REACT_APP_FRONTEND_PUBLIC_HOST || '';
  return host.trim();
};

// Synchronous versions for immediate use (API client, etc.)
export function getBackendURL() {
  const hostname = getLocalIP();
  const backendPort = process.env.REACT_APP_BACKEND_PORT || 5000;
  return `http://${hostname}:${backendPort}`;
}

export function getFrontendURL() {
  const hostname = getFrontendHostOverride() || getLocalIP();
  const frontendPort = process.env.REACT_APP_FRONTEND_PORT || 3000;
  const scheme = getFrontendScheme();
  return `${scheme}://${hostname}:${frontendPort}`;
}

// Async versions for getting actual network IP (QR code, etc.)
export async function getBackendURLAsync() {
  const ip = await getNetworkIP();
  const backendPort = process.env.REACT_APP_BACKEND_PORT || 5000;
  return `http://${ip}:${backendPort}`;
}

export async function getFrontendURLAsync() {
  const hostOverride = getFrontendHostOverride();
  const ip = hostOverride || await getNetworkIP();
  const frontendPort = process.env.REACT_APP_FRONTEND_PORT || 3000;
  const scheme = getFrontendScheme();
  return `${scheme}://${ip}:${frontendPort}`;
}

export function getNetworkInfo() {
  return {
    hostname: getLocalIP(),
    frontendURL: getFrontendURL(),
    backendURL: getBackendURL(),
    isLocalhost: getLocalIP() === 'localhost',
  };
}
