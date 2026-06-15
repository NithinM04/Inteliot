# Canonical alias dictionaries used for both preprocessing and post-processing
LOCATION_ALIASES = {
    "living room": "hall",
    "livingroom": "hall",
    "living-room": "hall",
    "drawing room": "hall",
    # bedroom synonyms
    "sleeping room": "bedroom",
    "sleep room": "bedroom",
    "sleep-room": "bedroom",
    "bed room": "bedroom",
    "master bedroom": "bedroom",
    "masterbedroom": "bedroom",
    # pooja / puja synonyms
    "pooja room": "pooja",
    "pooja": "pooja",
    "puja room": "pooja",
    "puja": "pooja",
    # parking / park synonyms
    "parking area": "parking",
    "parking_area": "parking",
    "parking": "parking",
    "park": "parking",
    # bathroom synonyms
    "bath room": "bathroom",
    "washroom": "bathroom",
    "restroom": "bathroom",
    "bathroom": "bathroom",
}

DEVICE_ALIASES = {
    # air conditioning
    "ac": "ac",
    "aircon": "ac",
    "a.c.": "ac",
    "air conditioner": "ac",
    # tv / entertainment
    "tv": "tv",
    "television": "tv",
    "smart tv": "tv",
    "led tv": "tv",
    # lighting
    "light": "light",
    "lights": "light",
    "lamp": "light",
    "bulb": "light",
    # fans
    "fan": "fan",
    "ceiling fan": "fan",
    "exhaust fan": "exhaust_fan",
    # heating / geyser
    "geyser": "geyser",
    "geaser": "geyser",
    "water heater": "geyser",
    "boiler":"geyser",
    # temperature control
    "heater": "heater",
    "room heater": "heater",
    # refrigeration
    "refrigerator": "refrigerator",
    "fridge": "refrigerator",
    # air purification
    "air purifier": "air_purifier",
    "airpurifier": "air_purifier",
    "purifier": "air_purifier",
    # plugs / outlets
    "plug": "plug",
    "socket": "plug",
    "outlet": "plug",
    # appliances mapped to plug (default control via plug)
    "microwave": "plug",
    "oven": "plug",
    "stove": "plug",
    "washing machine": "plug",
    "dishwasher": "plug",
    # multimedia / misc
    "speaker": "plug",
    "projector": "plug",
    "curtain": "plug",
    # water motor / pump mapping
    "watermotor": "watermotor",
    "water motor": "watermotor",
    "waterpump": "watermotor",
    "water pump": "watermotor",
    "pump": "watermotor",
    "motor": "watermotor",
}


def normalize_terms(text):
    """Normalize common location and device aliases before model inference."""
    if not text:
        return ""
    cleaned = text.lower()

    import re

    # Use word-boundary regex replacements to avoid partial matches (e.g., 'park' inside 'parking')
    for src, dst in sorted(LOCATION_ALIASES.items(), key=lambda x: len(x[0]), reverse=True):
        pattern = r"\b" + re.escape(src) + r"\b"
        cleaned = re.sub(pattern, dst, cleaned)

    for src, dst in sorted(DEVICE_ALIASES.items(), key=lambda x: len(x[0]), reverse=True):
        pattern = r"\b" + re.escape(src) + r"\b"
        cleaned = re.sub(pattern, dst, cleaned)

    return cleaned


def canonicalize_location(loc: str) -> str:
    """Map a parsed location token to canonical form."""
    if not loc:
        return "unknown"
    s = loc.replace('_', ' ').strip().lower()
    # exact match
    for src, dst in LOCATION_ALIASES.items():
        if s == src:
            return dst
    # contains match
    for src, dst in LOCATION_ALIASES.items():
        if src in s:
            return dst
    # fallback: return normalized underscored form
    return s.replace(' ', '_')


def canonicalize_device(name: str) -> str:
    """Map a parsed device token to canonical form."""
    if not name:
        return name
    s = name.replace('_', ' ').strip().lower()
    # exact match
    for src, dst in DEVICE_ALIASES.items():
        if s == src:
            return dst
    # contains match
    for src, dst in DEVICE_ALIASES.items():
        if src in s:
            return dst
    # fallback: underscore
    return s.replace(' ', '_')
