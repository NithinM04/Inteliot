import json
import os
import re
from typing import List, Optional, Dict, Tuple


class DeviceType:
    """Represents a device type with patterns and metadata"""
    def __init__(self, type_name: str, data: dict):
        self.type_name = type_name
        self.canonical_name = data.get('canonical_name')
        self.display_name = data.get('display_name')
        self.patterns = data.get('patterns', [])
        self.category = data.get('category')
        self.supports_status = data.get('supports_status', False)
        self.supports_level = data.get('supports_level', False)
    
    def matches(self, text: str) -> bool:
        """Check if text matches any pattern"""
        text_lower = text.lower().strip()
        for pattern in self.patterns:
            if pattern.lower() in text_lower or text_lower == pattern.lower():
                return True
        return False


class DeviceRegistry:
    """Central registry for device type definitions and matching logic"""
    
    def __init__(self, definitions_path: Optional[str] = None):
        """Initialize registry from device definitions JSON"""
        if definitions_path is None:
            # Look for device_definitions.json in the config folder (parent directory)
            definitions_path = os.path.join(
                os.path.dirname(os.path.dirname(os.path.abspath(__file__))),
                'config',
                'device_definitions.json'
            )
        
        self.definitions_path = definitions_path
        self.device_types: Dict[str, DeviceType] = {}
        self.location_keywords: Dict[str, List[str]] = {}
        self.unknown_devices: Dict[str, dict] = {}
        
        self._load_definitions()
    
    def _load_definitions(self):
        """Load and parse device definitions JSON"""
        try:
            with open(self.definitions_path, 'r') as f:
                data = json.load(f)
            
            # Load device types
            for type_name, type_data in data.get('device_types', {}).items():
                self.device_types[type_name] = DeviceType(type_name, type_data)
            
            # Load location keywords
            self.location_keywords = data.get('location_keywords', {})
            
            # Load unknown device mappings
            self.unknown_devices = data.get('unknown_devices', {})
            
            print(f"[INFO] DeviceRegistry loaded {len(self.device_types)} device types")
            
        except FileNotFoundError:
            print(f"[ERROR] Device definitions not found at {self.definitions_path}")
            raise
        except json.JSONDecodeError as e:
            print(f"[ERROR] Invalid JSON in device definitions: {e}")
            raise
    
    def get_device_type(self, name: str) -> Optional[DeviceType]:
        """Get device type by canonical name or type name"""
        name_lower = name.lower().strip()
        
        # Try direct lookup
        if name in self.device_types:
            return self.device_types[name]
        
        # Try canonical name lookup
        for device_type in self.device_types.values():
            if device_type.canonical_name.lower() == name_lower or \
               device_type.canonical_name.lower() == name_lower.replace('_', ' '):
                return device_type
        
        return None
    
    def match_device_name(self, nlp_name: str, device_name: str) -> bool:
        """
        Check if NLP-extracted device name matches a registry device name.
        
        Args:
            nlp_name: Device name extracted by NLP (e.g., 'air_purifier')
            device_name: Actual device name in registry (e.g., 'air purifier')
            
        Returns:
            bool: True if they match
        """
        nlp_name_normalized = nlp_name.lower().strip().replace('_', ' ')
        device_name_normalized = device_name.lower().strip()
        
        # Direct match
        if nlp_name_normalized == device_name_normalized:
            return True
        
        # Check if they're both the same device type
        nlp_type = self.get_device_type(nlp_name)
        if nlp_type:
            # Check if registry device matches this type
            for pattern in nlp_type.patterns:
                if pattern.lower() in device_name_normalized or \
                   device_name_normalized in pattern.lower():
                    return True
        
        # Check reverse: device name matches any type that NLP name could be
        for dtype in self.device_types.values():
            if dtype.matches(nlp_name) and (dtype.matches(device_name) or \
               device_name_normalized == dtype.canonical_name.lower()):
                return True
        
        return False
    
    def find_matching_devices(self, slm_devices: List[dict], registry: List[dict]) -> List[dict]:
        """
        Match SLM-extracted devices to actual registered devices.
        
        Args:
            slm_devices: List of devices extracted by NLP
            registry: List of actual registered devices
            
        Returns:
            List of matched devices with location and status updated
        """
        matched_devices = []
        
        for slm_device in slm_devices:
            slm_name = slm_device.get('name', '').lower().strip()
            slm_location = slm_device.get('location', '').lower().strip()
            slm_status = slm_device.get('status', '').lower().strip()
            
            if not slm_name:
                continue
            
            # Find candidates in registry
            candidates: List[Tuple[dict, float]] = []
            
            for registry_device in registry:
                reg_name = registry_device.get('name', '').lower().strip()
                reg_location = registry_device.get('location', '').lower().strip()
                # Normalize both SLM and registry locations for robust comparison
                reg_location_norm = self.normalize_location(reg_location) if reg_location else ''
                slm_location_norm = self.normalize_location(slm_location) if slm_location else ''
                
                # Check name match using DeviceRegistry
                if not self.match_device_name(slm_name, reg_name):
                    continue
                
                # Calculate location match score
                location_score = 1.0
                if slm_location_norm and reg_location_norm:
                    if slm_location_norm == reg_location_norm or slm_location_norm in reg_location_norm or reg_location_norm in slm_location_norm:
                        location_score = 1.0
                    else:
                        # No location match, skip
                        continue
                
                candidates.append((registry_device, location_score))
            
            # Pick best candidate
            if candidates:
                candidates.sort(key=lambda x: x[1], reverse=True)
                best_match = candidates[0][0].copy()
                best_match['status'] = slm_status
                matched_devices.append({
                    'id': best_match.get('id'),
                    'name': best_match.get('name'),
                    'location': best_match.get('location', ''),
                    'status': slm_status
                })
                # Use ASCII arrow to avoid Unicode issues on some consoles
                print(f"[INFO] Matched: {slm_name} -> {best_match['name']} @ {best_match['location']}")
            else:
                # Fallback: if the device exists elsewhere in the registry, prefer a location
                # that appears in other matched devices (helps when model assigns wrong location)
                other_locations = [d.get('location', '').lower().strip() for d in matched_devices if d.get('location')]
                from collections import Counter
                preferred_loc = None
                if other_locations:
                    cnt = Counter(other_locations)
                    preferred_loc = cnt.most_common(1)[0][0]

                # Find any registry device matching by name ignoring location
                loose_candidates = []
                for registry_device in registry:
                    reg_name = registry_device.get('name', '').lower().strip()
                    if self.match_device_name(slm_name, reg_name):
                        loose_candidates.append(registry_device)

                if loose_candidates:
                    chosen = None
                    if preferred_loc:
                        for rc in loose_candidates:
                            if preferred_loc in rc.get('location', '').lower():
                                chosen = rc
                                break
                    if not chosen:
                        chosen = loose_candidates[0]

                    best_match = chosen.copy()
                    best_match['status'] = slm_status
                    matched_devices.append({
                        'id': best_match.get('id'),
                        'name': best_match.get('name'),
                        'location': best_match.get('location', ''),
                        'status': slm_status
                    })
                    print(f"[INFO] Fallback matched: {slm_name} -> {best_match['name']} @ {best_match['location']}")
                else:
                    print(f"[WARN] No match found for: {slm_name} @ {slm_location}")
        
        # Deduplicate matched devices by (name, location), prefer the last occurrence (last-wins)
        from collections import OrderedDict

        unique = OrderedDict()
        for d in matched_devices:
            # Prefer deduplication by registry id when available
            dev_id = d.get('id')
            if dev_id:
                key = ('id', dev_id)
            else:
                key = ('nl', d.get('name', '').lower().strip(), d.get('location', '').lower().strip())

            # remove existing to ensure last occurrence wins and order reflects last seen
            if key in unique:
                del unique[key]
            unique[key] = d

        deduped = list(unique.values())
        return deduped
    
    def validate_registry(self, devices: List[dict]) -> List[str]:
        """Validate devices in registry against definitions"""
        errors = []
        
        for device in devices:
            device_name = device.get('name', '').lower().strip()
            
            # Try to find matching device type
            found = False
            for dtype in self.device_types.values():
                if self.match_device_name(dtype.type_name, device_name):
                    found = True
                    break
            
            if not found:
                # Check unknown device mappings
                if device_name in self.unknown_devices:
                    mapping = self.unknown_devices[device_name]
                    errors.append(f"⚠ '{device_name}' mapped to {mapping.get('mapped_to')}")
                else:
                    errors.append(f"✗ Unknown device: '{device_name}'")
        
        return errors
    
    def get_all_device_types(self) -> List[str]:
        """Get list of all registered device type canonical names"""
        return [dtype.canonical_name for dtype in self.device_types.values()]
    
    def get_devices_by_category(self, category: str) -> List[DeviceType]:
        """Get all device types in a category"""
        return [dtype for dtype in self.device_types.values() if dtype.category == category]
    
    def normalize_location(self, location: str) -> str:
        """
        Normalize location names using location keywords from definitions.
        
        Examples:
            "hall" → "hall" (canonical form)
            "living room" → "hall" (variant)
            "kitchen" → "kitchen" (already canonical)
        """
        location_lower = location.lower().strip()
        
        # Check location keywords for variants
        for canonical_loc, keywords in self.location_keywords.items():
            if location_lower == canonical_loc.replace('_', ' ') or location_lower == canonical_loc:
                return canonical_loc
            
            # Check if location matches any keyword variant
            for keyword in keywords:
                if location_lower == keyword.lower():
                    return canonical_loc
        
        # If no match in keywords, try to use mapping-based canonicalization (fallback)
        try:
            from mapping import canonicalize_location
            mapped = canonicalize_location(location_lower)
            # If mapped value corresponds to a known canonical location, return it
            if mapped in self.location_keywords:
                return mapped
            if mapped.replace('_', ' ') in self.location_keywords:
                return mapped.replace('_', ' ')
            # Otherwise return mapped (normalized)
            return mapped.replace('_', ' ')
        except Exception:
            # As a last resort, return as-is (normalized to lowercase with spaces)
            return location_lower.replace('_', ' ')
    
    def get_devices_by_location(self, location: str) -> Optional[Dict[str, any]]:
        """
        Get information about devices that should be affected by location-based commands.
        
        Args:
            location (str): Location name (e.g., 'kitchen', 'hall', 'home')
            
        Returns:
            Dict with location info and device types, or None if location not found
            For 'home': returns None (signal to caller to use ALL devices in registry)
        """
        location_lower = location.lower().strip()
        
        # Special case: "home" or "house" = all devices
        if location_lower in ('home', 'house', 'everywhere', 'all'):
            print(f"[INFO] Location '{location}' interpreted as 'home' - will affect all devices")
            return None
        
        # Normalize the location
        normalized_location = self.normalize_location(location)
        
        # Return location info
        return {
            'location': normalized_location,
            'location_keywords': self.location_keywords.get(normalized_location, [normalized_location]),
            'device_types_by_category': {
                category: [dtype.type_name for dtype in self.get_devices_by_category(category)]
                for category in set(dtype.category for dtype in self.device_types.values())
            }
        }
