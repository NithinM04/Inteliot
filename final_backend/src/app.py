import os
import json
import uuid
from datetime import datetime
from flask import Flask, request, jsonify
from flask_cors import CORS
from dotenv import load_dotenv
from flan_handler import FlanHandler
from device_registry import DeviceRegistry
from preprocessing import detect_leaving_intent
from network_utils import get_local_ip, get_network_urls
from mqtt_client import mqtt_client
import atexit

# ── Environment ──────────────────────────────────────────────────────────────
load_dotenv()

# Graceful shutdown for MQTT client
atexit.register(mqtt_client.disconnect)

# ── Path helpers (robust regardless of CWD) ──────────────────────────────────
BASE_DIR   = os.path.dirname(os.path.abspath(__file__))
PROJECT_ROOT = os.path.dirname(BASE_DIR)  # Go up one level from src/
DATA_DIR   = os.path.join(PROJECT_ROOT, 'data')
DEVICES_FILE = os.path.join(DATA_DIR, 'devices.json')

# ── Flask app ─────────────────────────────────────────────────────────────────
app = Flask(__name__)
CORS(app, resources={r"/api/*": {"origins": "*"}})

# ── Flan-T5 Model ────────────────────────────────────────────────────────────
flan = FlanHandler(model_path=os.path.join(PROJECT_ROOT, "models", "Flan-t5"))

# ── Device Registry ──────────────────────────────────────────────────────────
try:
    device_registry = DeviceRegistry(definitions_path=os.path.join(PROJECT_ROOT, "config", "device_definitions.json"))
except Exception as e:
    print(f"[WARN] Failed to load DeviceRegistry: {e}. Falling back to legacy matching.")
    device_registry = None

# ── Device persistence ────────────────────────────────────────────────────────
def save_devices(devices_list):
    try:
        os.makedirs(DATA_DIR, exist_ok=True)
        with open(DEVICES_FILE, 'w') as f:
            json.dump(devices_list, f, indent=2)
        return True
    except Exception as e:
        print(f"Error saving devices: {e}")
        return False

def load_devices():
    try:
        with open(DEVICES_FILE, 'r') as f:
            loaded = json.load(f)
            # Ensure all devices default to off status on startup and write to JSON
            changed = False
            for device in loaded:
                if device.get('status') != 'off':
                    device['status'] = 'off'
                    changed = True
            if changed:
                save_devices(loaded)
            return loaded
    except FileNotFoundError:
        print(f"Warning: {DEVICES_FILE} not found. Starting with empty device list.")
        return []
    except json.JSONDecodeError as e:
        print(f"Warning: devices.json is malformed ({e}). Starting fresh.")
        return []

devices = load_devices()
print(f"Loaded {len(devices)} devices from devices.json")


# ═══════════════════════════════════════════════════════════════════════════════
# ROUTES
# ═══════════════════════════════════════════════════════════════════════════════

@app.route('/api/command', methods=['POST'])
def process_command():
    """
    Process a natural-language command through Flan-T5.
    ---
    tags:
      - Commands
    parameters:
      - in: body
        name: body
        required: true
        schema:
          type: object
          required:
            - text
          properties:
            text:
              type: string
              example: "Turn on the bedroom light"
              description: Natural-language command from the user
    responses:
      200:
        description: Command processed successfully
        schema:
          type: object
          properties:
            devices:
              type: array
              items:
                type: object
                properties:
                  id:
                    type: integer
                    example: 2
                  name:
                    type: string
                    example: light
                  location:
                    type: string
                    example: hall
                  status:
                    type: string
                    example: "off"
            instruction:
              type: string
              example: Turn on the bedroom light
            timestamp:
              type: string
              example: "2026-05-04T01:00:00.000000"
            status:
              type: string
              example: completed
      400:
        description: Missing or empty 'text' field
        schema:
          type: object
          properties:
            error:
              type: string
      500:
        description: Internal server error / model inference failure
    """
    try:
        data = request.get_json(force=True, silent=True)

        if not data or 'text' not in data:
            return jsonify({"error": "Missing 'text' field in request body"}), 400

        user_text = data['text'].strip()
        if not user_text:
            return jsonify({"error": "'text' field cannot be empty"}), 400

        # Route clear leaving commands before Flan-T5 to avoid model hallucination
        leaving_intent = detect_leaving_intent(user_text)
        if leaving_intent:
          affected_devices = apply_leaving_command(leaving_intent)
          for device in affected_devices:
            mqtt_client.publish(device)

          response = {
            "instruction": user_text,
            "raw_output": None,
            "devices": affected_devices,
            "id": f"cmd_{uuid.uuid4().hex[:8]}",
            "timestamp": datetime.now().isoformat(),
            "status": "completed" if affected_devices else "no_devices_matched",
            "intent": "leaving",
            "location": leaving_intent.get("location", "home"),
          }
          return jsonify(response), 200

        # Generate raw Flan-T5 output and parse to device commands
        raw_output = flan.generate(user_text)
        parsed_devices = flan.parse_output_to_devices(raw_output)

        # Match parsed devices to registry and update statuses
        affected_devices = apply_slm_devices_to_registry(parsed_devices)

        # Publish device updates to MQTT
        for device in affected_devices:
            mqtt_client.publish(device)

        response = {
            "instruction":  user_text,
          "raw_output":   raw_output,
            "devices":      affected_devices,
            "id":           f"cmd_{uuid.uuid4().hex[:8]}",
            "timestamp":    datetime.now().isoformat(),
            "status":       "completed" if affected_devices else "no_devices_matched",
        }
        return jsonify(response), 200

    except Exception as e:
        return jsonify({"error": str(e), "status": "error"}), 500


def _device_matches_keyword(device_name: str, keyword: str) -> bool:
    """
    Return True if the device name matches the NLP keyword.
    Uses DeviceRegistry for pattern matching if available, otherwise falls back to substring matching.
    """
    # Direct match for water motor variations (water motor, water_motor, water pump, waterpump etc)
    kw_clean = keyword.lower().replace(' ', '').replace('_', '')
    dn_clean = device_name.lower().replace(' ', '').replace('_', '')
    is_kw_water_motor = ('water' in kw_clean and ('motor' in kw_clean or 'pump' in kw_clean)) or kw_clean in ('watermotor', 'waterpump')
    if is_kw_water_motor and dn_clean == 'watermotor':
        return True

    if device_registry:
        return device_registry.match_device_name(keyword, device_name)
    
    # Fallback to simple substring matching if registry not available
    name_lower = device_name.lower().strip()
    keyword_lower = keyword.lower().strip()
    return keyword_lower in name_lower or name_lower in keyword_lower


def apply_slm_devices_to_registry(slm_devices: list) -> list:
    """
    Match SLM output devices (with name, location, status) to actual device registry.
    Returns list of device objects with id, name, location, and status.
    Updates the device registry with new statuses.

    Args:
        slm_devices (list): List of dicts from SLM with keys: name, location, status
        
    Returns:
        list: Device objects with id, name, location, status
    """
    result_devices = []
    
    for slm_device in slm_devices:
        slm_name = slm_device.get('name', '').lower().strip()
        slm_location = slm_device.get('location', '').lower().strip()
        slm_status = slm_device.get('status', '').lower().strip()
        
        if not slm_name:
            continue
            
        # Direct matching override for water motor variations to bypass location checks
        slm_name_clean = slm_name.lower().replace('_', '').replace(' ', '')
        is_water_motor = ('water' in slm_name_clean and ('motor' in slm_name_clean or 'pump' in slm_name_clean)) or slm_name_clean in ('watermotor', 'waterpump')
        if is_water_motor:
            matched_motor = None
            for device in devices:
                if device.get('name', '').lower().strip() == 'watermotor':
                    matched_motor = device
                    break
            if matched_motor:
                if slm_status not in ('on', 'off'):
                    slm_status = 'off'
                matched_motor['status'] = slm_status
                result_devices.append({
                    'id': matched_motor['id'],
                    'name': matched_motor['name'],
                    'location': matched_motor.get('location', ''),
                    'status': slm_status
                })
                print(f"[INFO] Water motor matched directly via '{slm_name}' (bypassing location check) -> {slm_status}")
                continue
        
        # Find matching device in registry
        candidates = []
        
        for device in devices:
            device_name = device.get('name', '').lower().strip()
            device_location = device.get('location', '').lower().strip()
            
            # Use the proper device matching function that respects DEVICE_ALIASES
            if not _device_matches_keyword(device_name, slm_name):
                continue
            
            # Location scoring logic
            location_score = 1.0  # Default for no location specified

            if slm_location:
              if device_registry:
                slm_normalized = device_registry.normalize_location(slm_location)
                device_normalized = device_registry.normalize_location(device_location)

                if slm_normalized != device_normalized:
                  print(f"[DEBUG] No location match: '{slm_location}' vs '{device_location}'")
                  continue

                print(f"[DEBUG] Device: {device_name} ({device_location}), Location score for '{slm_location}': 1.0")
              else:
                slm_location_words = [word for word in slm_location.split() if word != 'room']
                device_location_words = [word for word in device_location.split() if word != 'room']

                matching_words = sum(1 for word in slm_location_words if word in device_location_words)

                if matching_words > 0:
                  location_score = matching_words / len(slm_location_words)
                  print(f"[DEBUG] Device: {device_name} ({device_location}), Location score for '{slm_location}': {location_score}")
                else:
                  print(f"[DEBUG] No location match: '{slm_location}' vs '{device_location}'")
                  continue
            
            candidates.append((device, location_score))
        
        # Pick the best candidate
        if candidates:
            # Sort by location match score (best matches first)
            candidates.sort(key=lambda x: x[1], reverse=True)
            best_match = candidates[0][0]
            
            # Update device status - ensure status is valid
            if slm_status not in ('on', 'off'):
                print(f"[WARN] Invalid status '{slm_status}' for {slm_name}, defaulting to 'off'")
                slm_status = 'off'
            
            best_match['status'] = slm_status
            result_devices.append({
                'id': best_match['id'],
                'name': best_match['name'],
                'location': best_match.get('location', ''),
                'status': slm_status
            })
            print(f"[INFO] Matched device: {best_match['name']} at {best_match.get('location', 'unknown')} -> {slm_status}")
        else:
            print(f"[INFO] No device matched for: {slm_name} at {slm_location}")
    
    if result_devices:
        save_devices(devices)
    # Deduplicate result_devices by registry id (prefer last occurrence)
    from collections import OrderedDict
    unique = OrderedDict()
    for d in result_devices:
      dev_id = d.get('id')
      if dev_id:
        key = ('id', dev_id)
      else:
        key = ('nl', d.get('name', '').lower().strip(), d.get('location', '').lower().strip())
      if key in unique:
        del unique[key]
      unique[key] = d

    deduped = list(unique.values())
    if len(deduped) != len(result_devices):
      print(f"[INFO] Deduplicated {len(result_devices) - len(deduped)} device(s) from SLM output")

    return deduped


def apply_leaving_command(leaving_info: dict) -> list:
    """
    Handle 'leaving' intent: turn off all devices in a location.
    
    Args:
        leaving_info (dict): Intent info with keys: intent, location, action
                            e.g. {'intent': 'leaving', 'location': 'kitchen', 'action': 'off'}
    
    Returns:
        list: Device objects that were turned off
    """
    location = leaving_info.get('location', 'home').lower().strip()
    affected_devices = []
    
    print(f"[INFO] Processing leaving command for location: {location}")
    
    if location == 'home':
        # Turn off all devices in the house
        print(f"[INFO] Leaving home - turning off all devices")
        for device in devices:
            if device.get('status') != 'off':  # Only if not already off
                device['status'] = 'off'  # Modify the actual device object
                affected_devices.append({
                    'id': device['id'],
                    'name': device['name'],
                    'location': device.get('location', 'unknown'),
                    'status': 'off'
                })
                print(f"[INFO] Will turn off: {device['name']} at {device.get('location', 'unknown')}")
    else:
        # Turn off devices only in specified location
        print(f"[INFO] Leaving location '{location}' - turning off devices in that location")
        
        # Normalize location using device registry if available
        normalized_location = location
        if device_registry:
            normalized_location = device_registry.normalize_location(location)

        # Match devices by location
        for device in devices:
            device_location = device.get('location', '').lower().strip()
            device_location_normalized = device_location
            if device_registry and device_location:
                device_location_normalized = device_registry.normalize_location(device_location)

            # Match logic: check if location word appears in device location or vice versa
            location_matches = False

            if normalized_location in device_location_normalized or device_location_normalized in normalized_location:
                location_matches = True
            # Also check with underscores replaced
            elif normalized_location.replace(' ', '_') in device_location_normalized.replace(' ', '_'):
                location_matches = True

            if location_matches and device.get('status') != 'off':
                device['status'] = 'off'  # Modify the actual device object
                affected_devices.append({
                    'id': device['id'],
                    'name': device['name'],
                    'location': device.get('location', 'unknown'),
                    'status': 'off'
                })
                print(f"[INFO] Will turn off: {device['name']} at {device.get('location', 'unknown')}")
    
    # Save if any devices were affected
    if affected_devices:
        save_devices(devices)
        print(f"[INFO] Leaving command affected {len(affected_devices)} device(s)")
    else:
        print(f"[WARN] No devices to turn off for location: {location}")
    
    return affected_devices


def apply_scenario_command(scenario_info: dict) -> list:
    """
    Handle scenario-based intents like 'good night', 'arriving home', 'movie mode', etc.
    
    Args:
        scenario_info (dict): Scenario info with keys: scenario, actions, name
                             e.g. {'intent': 'scenario', 'scenario': 'good_night', 'actions': {...}}
    
    Returns:
        list: Device objects that were affected by the scenario
    """
    scenario_name = scenario_info.get('scenario', 'unknown')
    scenario_actions = scenario_info.get('actions', {})
    scenario_display_name = scenario_info.get('name', scenario_name)
    affected_devices = []
    
    print(f"[INFO] Processing scenario: {scenario_display_name}")
    
    # Helper function to match devices
    def matches_device_type(device, device_type_keyword):
        """Check if device matches a device type keyword"""
        device_name = device.get('name', '').lower()
        device_type = device.get('type', '').lower()
        
        if device_name == device_type_keyword.lower():
            return True
        if device_type_keyword.lower() in device_name:
            return True
        
        # Use device registry if available
        if device_registry:
            try:
                dtype = device_registry.get_device_type(device_type_keyword)
                if dtype:
                    for pattern in dtype.patterns:
                        if pattern.lower() in device_name:
                            return True
            except:
                pass
        
        return False
    
    # Apply actions from scenario
    for device_type, target_state in scenario_actions.items():
        print(f"[INFO] Scenario action: {device_type} → {target_state}")
        
        # Find all devices matching this type
        for device in devices:
            if matches_device_type(device, device_type):
                # Determine old status before change
                old_status = device.get('status')
                
                # Handle different action types
                if target_state.lower() == 'on':
                    device['status'] = 'on'
                elif target_state.lower() == 'off':
                    device['status'] = 'off'
                elif target_state.lower() == 'low':
                    device['status'] = 'low'
                elif target_state.lower() == 'medium':
                    device['status'] = 'medium'
                elif target_state.lower() == 'high':
                    device['status'] = 'high'
                else:
                    # Assume it's a numeric value (like temperature)
                    try:
                        # Try to set as numeric value (for thermostats, levels, etc)
                        float(target_state)
                        device['status'] = target_state
                    except ValueError:
                        # Invalid action, skip
                        print(f"[WARN] Unknown action '{target_state}' for {device_type}")
                        continue
                
                # Only include if status changed
                if old_status != device['status']:
                    affected_devices.append({
                        'id': device['id'],
                        'name': device['name'],
                        'location': device.get('location', 'unknown'),
                        'old_status': old_status,
                        'new_status': device['status']
                    })
                    print(f"[INFO] Scenario updated: {device['name']} at {device.get('location', 'unknown')} from {old_status} → {device['status']}")
    
    # Save if any devices were affected
    if affected_devices:
        save_devices(devices)
        print(f"[INFO] Scenario '{scenario_display_name}' affected {len(affected_devices)} device(s)")
    else:
        print(f"[INFO] Scenario '{scenario_display_name}' completed (no device changes needed)")
    
    return affected_devices


def apply_commands_to_devices(commands: list) -> list:
    """
    Parse SLM commands like ["light:on", "fan:off", "ac:on"] and update
    the matching devices in the global 'devices' list.

    Commands with a location hint (e.g. "bedroom_light:on") will also try
    to match on device location for disambiguation.

    Returns a list of dicts describing what was changed:
    [{"device_id": ..., "device_name": ..., "old_status": ..., "new_status": ...}]
    """
    changes = []
    for cmd in commands:
        if ':' not in cmd:
            continue
        raw_device, action = cmd.split(':', 1)
        action = action.strip().lower()
        if action not in ('on', 'off'):
            # thermostat setpoint — skip status update (not on/off)
            continue

        # Override for water motor variations in legacy parsing to bypass location checks
        raw_device_clean = raw_device.strip().lower().replace('_', '').replace(' ', '')
        is_water_motor = ('water' in raw_device_clean and ('motor' in raw_device_clean or 'pump' in raw_device_clean)) or raw_device_clean in ('watermotor', 'waterpump')
        if is_water_motor:
            for device in devices:
                if device.get('name', '').lower().strip() == 'watermotor':
                    old_status = device['status']
                    device['status'] = action
                    changes.append({
                        'device_id':   device['id'],
                        'device_name': device['name'],
                        'location':    device.get('location', ''),
                        'old_status':  old_status,
                        'new_status':  action,
                    })
            continue

        # Optional location hint: "bedroom_light" → keyword="light", location_hint="bedroom"
        parts = raw_device.strip().lower().split('_')
        if len(parts) >= 2:
            keyword       = parts[-1]
            location_hint = '_'.join(parts[:-1])
        else:
            keyword       = parts[0]
            location_hint = ''

        for device in devices:
            if _device_matches_keyword(device.get('name', ''), keyword):
                # If there is a location hint, prefer devices whose location matches;
                # but if no match is found at all, still update all matching name devices.
                if location_hint and location_hint not in device.get('location', '').lower():
                    continue
                old_status      = device['status']
                device['status'] = action
                changes.append({
                    'device_id':   device['id'],
                    'device_name': device['name'],
                    'location':    device.get('location', ''),
                    'old_status':  old_status,
                    'new_status':  action,
                })

    if changes:
        save_devices(devices)
        print(f"[INFO] Status updated for {len(changes)} device(s): {changes}")

    return changes

@app.route('/api/devices', methods=['GET'])
def get_devices():
    """
    Retrieve all registered IoT devices.
    ---
    tags:
      - Devices
    responses:
      200:
        description: List of registered devices
        schema:
          type: object
          properties:
            devices:
              type: array
              items:
                type: object
                properties:
                  id:
                    type: integer
                    example: 1
                  name:
                    type: string
                    example: Bedroom Light
                  type:
                    type: string
                    enum: [switch, thermostat, sensor]
                    example: switch
                  location:
                    type: string
                    example: Bedroom
                  status:
                    type: string
                    enum: [on, off]
                    example: off
    """
    return jsonify({"devices": devices}), 200


@app.route('/api/devices', methods=['POST'])
def add_device():
    """
    Register a new IoT device.
    ---
    tags:
      - Devices
    parameters:
      - in: body
        name: body
        required: true
        schema:
          type: object
          required:
            - name
          properties:
            name:
              type: string
              example: Hall Fan
              description: Human-readable device name (required)
            type:
              type: string
              enum: [switch, thermostat, sensor]
              default: switch
              description: Device category
            location:
              type: string
              example: Hall
              description: Physical location (optional)
            status:
              type: string
              enum: [on, off]
              default: off
              description: Initial power state
    responses:
      201:
        description: Device registered successfully
        schema:
          type: object
          properties:
            status:
              type: string
              example: success
            message:
              type: string
              example: Device 'Hall Fan' added successfully
            device:
              type: object
      400:
        description: Missing required 'name' field
      500:
        description: Failed to persist device to storage
    """
    global devices
    try:
        data = request.get_json(force=True, silent=True)

        if not data or 'name' not in data:
            return jsonify({"error": "Missing required field: 'name'"}), 400

        name = data['name'].strip()
        if not name:
            return jsonify({"error": "'name' cannot be empty"}), 400

        new_device = {
            "id":       str(uuid.uuid4()),
            "name":     name,
            "location": data.get('location', ''),
            "status":   data.get('status', 'off'),
        }

        devices.append(new_device)

        if save_devices(devices):
            mqtt_client.publish(new_device)
            return jsonify({
                "status":  "success",
                "message": f"Device '{new_device['name']}' registered successfully",
                "device":  new_device,
            }), 201
        else:
            devices.pop()          # roll back in-memory change
            return jsonify({"error": "Failed to persist device — check server storage"}), 500

    except Exception as e:
        return jsonify({"error": str(e), "status": "error"}), 500


@app.route('/api/devices/<device_id>', methods=['DELETE'])
def delete_device(device_id):
    """
    Remove a registered device by ID.
    ---
    tags:
      - Devices
    parameters:
      - in: path
        name: device_id
        type: string
        required: true
        description: Unique device ID
    responses:
      200:
        description: Device removed successfully
      404:
        description: Device not found
      500:
        description: Failed to persist change
    """
    global devices
    original = [d for d in devices if str(d.get('id')) == str(device_id)]
    if not original:
        return jsonify({"error": f"Device '{device_id}' not found"}), 404

    devices = [d for d in devices if str(d.get('id')) != str(device_id)]
    if save_devices(devices):
        return jsonify({"status": "success", "message": f"Device '{device_id}' removed"}), 200
    else:
        devices = original + [d for d in devices]
        return jsonify({"error": "Failed to persist deletion"}), 500


@app.route('/api/devices/<device_id>', methods=['GET'])
def get_device(device_id):
    """
    Retrieve a specific device by ID.
    ---
    tags:
      - Devices
    parameters:
      - in: path
        name: device_id
        type: string
        required: true
        description: Unique device ID
    responses:
      200:
        description: Device found
        schema:
          type: object
          properties:
            device:
              type: object
      404:
        description: Device not found
    """
    for device in devices:
        if str(device.get('id')) == str(device_id):
            return jsonify({"device": device}), 200
    return jsonify({"error": f"Device '{device_id}' not found"}), 404


@app.route('/api/devices/<device_id>/status', methods=['PUT'])
def update_device_status(device_id):
    """
    Update device status (on/off) for devices.json.
    ---
    tags:
      - Devices
    parameters:
      - in: path
        name: device_id
        type: string
        required: true
        description: Unique device ID
      - in: body
        name: body
        required: true
        schema:
          type: object
          required:
            - status
          properties:
            status:
              type: string
              enum: [on, off]
              description: New power status
    responses:
      200:
        description: Status updated successfully
      400:
        description: Invalid status value
      404:
        description: Device not found
      500:
        description: Failed to persist change
    """
    global devices
    data = request.get_json(force=True, silent=True)
    
    if not data or 'status' not in data:
        return jsonify({"error": "Missing required field: 'status'"}), 400
    
    new_status = data['status'].lower().strip()
    if new_status not in ('on', 'off'):
        return jsonify({"error": "Status must be 'on' or 'off'"}), 400
    
    for device in devices:
        if str(device.get('id')) == str(device_id):
            old_status = device.get('status')
            device['status'] = new_status
            
            if save_devices(devices):
                mqtt_client.publish(device)
                return jsonify({
                    "status": "success",
                    "message": f"Device status updated: {old_status} -> {new_status}",
                    "device": device
                }), 200
            else:
                device['status'] = old_status  # Roll back
                return jsonify({"error": "Failed to persist status update"}), 500
    
    return jsonify({"error": f"Device '{device_id}' not found"}), 404


@app.route('/api/devices/location/<location>/status', methods=['PUT'])
def update_devices_status_by_location(location):
    """
    Update status of all devices in a specific location.
    """
    global devices
    data = request.get_json(force=True, silent=True)
    
    if not data or 'status' not in data:
        return jsonify({"error": "Missing required field: 'status'"}), 400
    
    new_status = data['status'].lower().strip()
    if new_status not in ('on', 'off'):
        return jsonify({"error": "Status must be 'on' or 'off'"}), 400
        
    location_lower = location.lower().strip()
    
    # We also support normalized location matching
    normalized_target = device_registry.normalize_location(location_lower) if device_registry else location_lower
    
    updated = []
    for device in devices:
        dev_loc = device.get('location', '').lower().strip()
        dev_loc_norm = device_registry.normalize_location(dev_loc) if (device_registry and dev_loc) else dev_loc
        
        is_match = False
        if location_lower in ('unassigned', 'no location', 'other'):
            is_match = not dev_loc
        else:
            is_match = (dev_loc_norm == normalized_target) or (dev_loc == location_lower)
            
        if is_match:
            device['status'] = new_status
            mqtt_client.publish(device)
            updated.append(device)
            
    if updated:
        save_devices(devices)
        
    return jsonify({
        "status": "success",
        "message": f"Updated {len(updated)} device(s) in location '{location}' to '{new_status}'",
        "devices": updated
    }), 200



@app.route('/api/devices/<device_id>', methods=['PUT'])
def update_device(device_id):
    """
    Update device details (name, location, status).
    ---
    tags:
      - Devices
    parameters:
      - in: path
        name: device_id
        type: string
        required: true
        description: Unique device ID
      - in: body
        name: body
        schema:
          type: object
          properties:
            name:
              type: string
              description: New device name
            location:
              type: string
              description: New device location
            status:
              type: string
              enum: [on, off]
              description: New device status
    responses:
      200:
        description: Device updated successfully
      404:
        description: Device not found
      500:
        description: Failed to persist changes
    """
    global devices
    data = request.get_json(force=True, silent=True) or {}
    
    for device in devices:
        if str(device.get('id')) == str(device_id):
            old_device = dict(device)
            
            # Update only provided fields
            if 'name' in data and data['name'].strip():
                device['name'] = data['name'].strip()
            if 'location' in data:
                device['location'] = data['location']
            if 'status' in data and data['status'].lower() in ('on', 'off'):
                device['status'] = data['status'].lower()
            
            if save_devices(devices):
                mqtt_client.publish(device)
                return jsonify({
                    "status": "success",
                    "message": "Device updated successfully",
                    "device": device
                }), 200
            else:
                # Roll back changes
                for key in old_device:
                    device[key] = old_device[key]
                return jsonify({"error": "Failed to persist changes"}), 500
    
    return jsonify({"error": f"Device '{device_id}' not found"}), 404


@app.route('/api/devices/location/<location>', methods=['GET'])
def get_devices_by_location(location):
    """
    Get all devices in a specific location.
    ---
    tags:
      - Devices
    parameters:
      - in: path
        name: location
        type: string
        required: true
        description: Device location (e.g., bedroom, kitchen)
    responses:
      200:
        description: List of devices in the location
        schema:
          type: object
          properties:
            location:
              type: string
            devices:
              type: array
              items:
                type: object
    """
    location_lower = location.lower().strip()
    location_devices = [d for d in devices if d.get('location', '').lower().strip() == location_lower]
    return jsonify({
        "location": location,
        "count": len(location_devices),
        "devices": location_devices
    }), 200


@app.route('/api/health', methods=['GET'])
def health_check():
    """
    System health check.
    ---
    tags:
      - System
    responses:
      200:
        description: Service status
        schema:
          type: object
          properties:
            status:
              type: string
              example: ok
            service:
              type: string
              example: inteliot_backend
            model_loaded:
              type: boolean
              example: true
            device_count:
              type: integer
              example: 3
            timestamp:
              type: string
    """
    return jsonify({
        "status":       "ok",
        "service":      "inteliot_backend",
        "model_loaded": flan.is_ready(),
        "device_count": len(devices),
        "timestamp":    datetime.now().isoformat(),
    }), 200


@app.route('/api/network', methods=['GET'])
def network_info():
    """
    Provide LAN network info for frontend QR generation.
    """
    port = int(os.getenv('FLASK_PORT', 5000))
    local_ip = get_local_ip()
    return jsonify({
        "local_ip": local_ip,
        "backend_url": f"http://{local_ip}:{port}/api",
        "frontend_url": f"https://{local_ip}:3000",
    }), 200


# ═══════════════════════════════════════════════════════════════════════════════
# STARTUP
# ═══════════════════════════════════════════════════════════════════════════════
if __name__ == '__main__':
    port        = int(os.getenv('FLASK_PORT', 5000))
    debug       = os.getenv('FLASK_ENV', 'development') == 'development'
    local_ip    = get_local_ip()
    network_urls = get_network_urls(port)

    print("\n" + "─" * 65)
    print("  INTEL·IOT  —  Enterprise IoT Backend")
    print("─" * 65)
    print(f"  Flan-T5 loaded    : {flan.is_ready()}")
    print(f"  Devices loaded   : {len(devices)}")
    print(f"  Listening on     : http://0.0.0.0:{port}")
    print(f"  Local API        : http://{local_ip}:{port}/api")
    print(f"  Swagger UI       : http://{local_ip}:{port}/docs/")
    print("─" * 65 + "\n")

    app.run(host='0.0.0.0', port=port, debug=debug)
