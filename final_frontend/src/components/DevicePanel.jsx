import React, { useState } from 'react';
import { createPortal } from 'react-dom';
import { FiPlus, FiX, FiTrash2 } from 'react-icons/fi';
import { motion, AnimatePresence } from 'framer-motion';
import './DevicePanel.css';
import apiClient from '../api/client';

// Smart emoji map based on device name keywords
const getDeviceEmoji = (device) => {
  const name = (device.name || '').toLowerCase();

  if (/\bfan\b/.test(name))                          return '🌀';
  if (/\blight\b|\blamp\b|\bbulb\b/.test(name))      return '💡';
  if (/\bac\b|air.?conditioner|aircon/.test(name))   return '❄️';
  if (/\brefrigerator\b|\bfridge\b/.test(name))      return '🧊';
  if (/\btv\b|\btelevision\b|\bdisplay\b/.test(name))return '📺';
  if (/\bheater\b|\bwarm/.test(name))                return '🔥';
  if (/\bspeaker\b|\baudio\b|\bsound\b/.test(name))  return '🔊';
  if (/\bcamera\b|\bcam\b/.test(name))               return '📷';
  if (/\bwasher\b|\bwashing/.test(name))             return '🫧';
  if (/\bdoor\b|\block\b/.test(name))                return '🚪';
  if (/\bpump\b|\bwater/.test(name))                 return '💧';
  if (/\bmotor\b/.test(name))                        return '⚙️';
  if (/\boven\b|\bmicrowave\b/.test(name))           return '🍳';
  if (/\bplug\b|\bsocket\b|\bcharger\b/.test(name)) return '🔌';
  if (/\bbell\b|\bdoor.?bell/.test(name))            return '🔔';

  return '🔌';
};

// Location emoji map
const getLocationEmoji = (location) => {
  const loc = (location || '').toLowerCase().trim();
  if (loc.includes('living') || loc.includes('hall') || loc.includes('drawing') || loc.includes('lounge')) return '🛋️';
  if (loc.includes('bedroom') || loc.includes('bed')) return '🛏️';
  if (loc.includes('kitchen')) return '🍳';
  if (loc.includes('bathroom') || loc.includes('bath') || loc.includes('washroom')) return '🛁';
  if (loc.includes('garage')) return '🚗';
  if (loc.includes('office') || loc.includes('study') || loc.includes('work')) return '💼';
  if (loc.includes('dining')) return '🍽️';
  if (loc.includes('garden') || loc.includes('outdoor') || loc.includes('outside') || loc.includes('patio')) return '🌳';
  if (loc.includes('pooja') || loc.includes('puja')) return '🙏';
  if (loc.includes('parking')) return '🅿️';
  if (loc === 'unassigned' || loc === 'no location' || loc === 'other') return '📍';
  return '📍';
};

/* ── Sliding Toggle Switch ───────────────────────────── */
const ToggleSwitch = ({ isOn, onToggle, disabled }) => (
  <button
    className={`toggle-switch ${isOn ? 'toggle-on' : 'toggle-off'} ${disabled ? 'toggle-disabled' : ''}`}
    onClick={onToggle}
    disabled={disabled}
    title={isOn ? 'Turn Off' : 'Turn On'}
    aria-label={isOn ? 'Turn device off' : 'Turn device on'}
    aria-pressed={isOn}
  >
    <motion.span
      className="toggle-thumb"
      layout
      transition={{ type: 'spring', stiffness: 500, damping: 30 }}
    />
  </button>
);

const DevicePanel = ({ devices, onDeviceAdded }) => {
  const [showAddForm, setShowAddForm] = useState(false);
  const [newDevice, setNewDevice] = useState({ name: '', location: '' });
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [deleteConfirm, setDeleteConfirm] = useState(null);
  const [deleting, setDeleting] = useState(false);
  const [togglingId, setTogglingId] = useState(null);
  const [togglingLocation, setTogglingLocation] = useState(null);

  const handleAddDevice = async (e) => {
    e.preventDefault();
    setError('');

    if (!newDevice.name.trim()) {
      setError('Device name is required');
      return;
    }

    setLoading(true);

    try {
      await apiClient.post('/api/devices', {
        name: newDevice.name,
        location: newDevice.location,
        status: 'off',
      });
      setNewDevice({ name: '', location: '' });
      setShowAddForm(false);
      if (onDeviceAdded) onDeviceAdded();
    } catch (err) {
      setError(err.response?.data?.error || 'Failed to add device');
    } finally {
      setLoading(false);
    }
  };

  const handleDeleteDevice = async (deviceId) => {
    setDeleting(true);
    try {
      await apiClient.delete(`/api/devices/${deviceId}`);
      setDeleteConfirm(null);
      if (onDeviceAdded) onDeviceAdded();
    } catch (err) {
      console.error('Failed to delete device:', err);
      setError(err.response?.data?.error || 'Failed to delete device');
    } finally {
      setDeleting(false);
    }
  };

  /* ── Toggle single device ── */
  const handleToggleDevice = async (device) => {
    if (togglingId === device.id) return;
    setTogglingId(device.id);
    const newStatus = device.status === 'on' ? 'off' : 'on';
    try {
      await apiClient.put(`/api/devices/${device.id}/status`, { status: newStatus });
      if (onDeviceAdded) onDeviceAdded(); // refresh
    } catch (err) {
      console.error('Toggle error:', err);
      setError(err.response?.data?.error || 'Failed to toggle device');
    } finally {
      setTogglingId(null);
    }
  };

  /* ── Toggle all devices in a location ── */
  const handleToggleLocationDevices = async (locationName, status) => {
    if (togglingLocation === locationName) return;
    setTogglingLocation(locationName);
    setError('');
    
    try {
      // Call the bulk toggle endpoint in the backend
      const locationParam = locationName === 'Unassigned' ? 'unassigned' : locationName;
      await apiClient.put(`/api/devices/location/${locationParam}/status`, { status });
      if (onDeviceAdded) onDeviceAdded(); // refresh
    } catch (err) {
      console.error('Bulk location toggle error:', err);
      setError(err.response?.data?.error || `Failed to turn all devices ${status} in ${locationName}`);
    } finally {
      setTogglingLocation(null);
    }
  };

  /* ── Open Add form pre-filled with location ── */
  const handleOpenAddFormForLocation = (locationName) => {
    setError('');
    if (locationName === 'Unassigned') {
      setNewDevice({ name: '', location: '' });
    } else {
      setNewDevice({ name: '', location: locationName });
    }
    setShowAddForm(true);
  };

  // Group devices by location
  const groupedDevices = {};
  (devices || []).forEach(device => {
    const loc = device.location?.trim() || '';
    const locKey = loc || 'Unassigned';
    if (!groupedDevices[locKey]) {
      groupedDevices[locKey] = [];
    }
    groupedDevices[locKey].push(device);
  });

  return (
    <div className="device-panel">
      <div className="panel-header">
        <h2>Connected Devices</h2>
        <button
          className="add-device-btn"
          onClick={() => {
            setError('');
            setShowAddForm(!showAddForm);
          }}
          title="Add new device"
        >
          <FiPlus size={20} />
        </button>
      </div>

      {/* Add Device Form */}
      <AnimatePresence>
        {showAddForm && (
          <motion.form
            className="add-device-form"
            onSubmit={handleAddDevice}
            initial={{ opacity: 0, height: 0 }}
            animate={{ opacity: 1, height: 'auto' }}
            exit={{ opacity: 0, height: 0 }}
            transition={{ duration: 0.3 }}
          >
            <div className="form-group">
              <label htmlFor="device-name">Device Name</label>
              <input
                id="device-name"
                type="text"
                placeholder="e.g., Bedroom Light"
                value={newDevice.name}
                onChange={(e) => setNewDevice({ ...newDevice, name: e.target.value })}
                disabled={loading}
              />
            </div>

            <div className="form-group">
              <label htmlFor="device-location">Location (Optional)</label>
              <input
                id="device-location"
                type="text"
                placeholder="e.g., Living Room"
                value={newDevice.location}
                onChange={(e) => setNewDevice({ ...newDevice, location: e.target.value })}
                disabled={loading}
              />
            </div>

            {error && <div className="error-message">{error}</div>}

            <div className="form-actions">
              <button type="submit" className="submit-btn" disabled={loading}>
                {loading ? 'Registering Device...' : 'Register Device'}
              </button>
              <button
                type="button"
                className="cancel-btn"
                onClick={() => {
                  setShowAddForm(false);
                }}
                disabled={loading}
              >
                <FiX size={18} />
              </button>
            </div>
          </motion.form>
        )}
      </AnimatePresence>

      {/* Devices List Grouped by Location */}
      <div className="devices-list-container">
        {devices && devices.length > 0 ? (
          Object.entries(groupedDevices).map(([locationName, locationDevices], groupIndex) => (
            <div key={locationName} className="location-group">
              <div className="location-group-header">
                <div className="location-title">
                  <span className="location-emoji">{getLocationEmoji(locationName)}</span>
                  <span className="location-name">{locationName}</span>
                  <span className="location-badge">{locationDevices.length}</span>
                </div>
                <div className="location-actions">
                  <button
                    type="button"
                    className="loc-action-btn loc-on-btn"
                    onClick={() => handleToggleLocationDevices(locationName, 'on')}
                    disabled={togglingLocation === locationName}
                    title={`Turn all devices in ${locationName} On`}
                  >
                    All On
                  </button>
                  <button
                    type="button"
                    className="loc-action-btn loc-off-btn"
                    onClick={() => handleToggleLocationDevices(locationName, 'off')}
                    disabled={togglingLocation === locationName}
                    title={`Turn all devices in ${locationName} Off`}
                  >
                    All Off
                  </button>
                  <button
                    type="button"
                    className="loc-action-btn loc-add-btn"
                    onClick={() => handleOpenAddFormForLocation(locationName)}
                    title={`Add device to ${locationName}`}
                  >
                    <FiPlus size={12} />
                  </button>
                </div>
              </div>
              <div className="location-devices-grid">
                {locationDevices.map((device, index) => (
                  <motion.div
                    key={device.id}
                    className={`device-item ${device.status === 'on' ? 'device-item--on' : ''}`}
                    initial={{ opacity: 0, scale: 0.95 }}
                    animate={{ opacity: 1, scale: 1 }}
                    transition={{ delay: (groupIndex * 0.05) + (index * 0.02) }}
                  >
                    {/* Emoji icon */}
                    <span className="device-icon-emoji">
                      {getDeviceEmoji(device)}
                    </span>

                    <div className="device-info">
                      <div className="device-name-small">{device.name}</div>
                    </div>

                    {/* Sliding toggle */}
                    <ToggleSwitch
                      isOn={device.status === 'on'}
                      onToggle={() => handleToggleDevice(device)}
                      disabled={togglingId === device.id}
                    />

                    <button
                      className="delete-device-btn"
                      onClick={() => setDeleteConfirm(device)}
                      title="Remove device"
                    >
                      <FiTrash2 size={13} />
                    </button>
                  </motion.div>
                ))}
              </div>
            </div>
          ))
        ) : (
          <div className="no-devices">
            <div className="no-devices-icon">⬡</div>
            <p>No devices registered</p>
            <p className="hint">Register your first IoT device to begin monitoring and control</p>
          </div>
        )}
      </div>

      {/* Delete Confirmation Modal */}
      {deleteConfirm &&
        createPortal(
          <AnimatePresence>
            {deleteConfirm && (
              <motion.div
                className="confirmation-modal-overlay"
                onClick={() => !deleting && setDeleteConfirm(null)}
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                exit={{ opacity: 0 }}
              >
                <motion.div
                  className="confirmation-modal"
                  onClick={(e) => e.stopPropagation()}
                  initial={{ scale: 0.9, opacity: 0 }}
                  animate={{ scale: 1, opacity: 1 }}
                  exit={{ scale: 0.9, opacity: 0 }}
                >
                  <div className="modal-header">
                    <h3>Remove Device?</h3>
                    <button
                      className="modal-close"
                      onClick={() => !deleting && setDeleteConfirm(null)}
                      disabled={deleting}
                    >
                      <FiX size={20} />
                    </button>
                  </div>
                  <div className="modal-content">
                    <p>Are you sure you want to remove <strong>{deleteConfirm.name}</strong> from your devices?</p>
                    <p className="warning">This action cannot be undone.</p>
                  </div>
                  <div className="modal-actions">
                    <button
                      className="modal-cancel"
                      onClick={() => setDeleteConfirm(null)}
                      disabled={deleting}
                    >
                      Cancel
                    </button>
                    <button
                      className="modal-delete"
                      onClick={() => handleDeleteDevice(deleteConfirm.id)}
                      disabled={deleting}
                    >
                      {deleting ? 'Removing...' : 'Remove Device'}
                    </button>
                  </div>
                </motion.div>
              </motion.div>
            )}
          </AnimatePresence>,
          document.body
        )}
    </div>
  );
};

export default DevicePanel;

