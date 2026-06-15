import re
from mapping import normalize_terms


LEAVING_PATTERN = re.compile(
    r"\b(?:i\s+am\s+|i'm\s+|im\s+|i\s+)?(?:leaving|exit(?:ing)?|going\s+to\s+leave|heading\s+out|stepping\s+out)\s+(?P<location>[a-z_ ]+)\b",
    re.IGNORECASE,
)


def preprocess_text(text):
    """Normalize common phrasing and typos for better model output."""
    if not text:
        return ""

    cleaned = text.strip().lower()
    cleaned = normalize_terms(cleaned)

    # Common typos/variants
    replacements = {
        "lisght": "light",
        "geaser": "geyser",
        "livingroom": "living room",
    }
    for src, dst in replacements.items():
        cleaned = cleaned.replace(src, dst)

    # Separate intents with commas for clarity
    cleaned = cleaned.replace(" then ", ", ")
    cleaned = cleaned.replace(" and then ", ", ")

    # Expand multi-device lists to repeat the location for each device
    cleaned = _expand_location_device_lists(cleaned)

    # Normalize grouped phrases of the form "device1, device2 and device3 of bedroom"
    cleaned = _expand_device_list_with_trailing_location(cleaned)

    # If no location hint is present but a device is mentioned, assume unknown location
    location_words = [
        "room",
        "area",
        "hall",
        "kitchen",
        "bedroom",
        "bathroom",
        "pooja",
        "parking",
        "living",
    ]
    device_pattern = r"\b(light|fan|tv|geyser|exhaust_fan|ac|heater|plug|refrigerator|air_purifier|microwave|fridge|watermotor|waterpump|pump|motor)\b"
    has_device = re.search(device_pattern, cleaned)
    has_location = any(re.search(r"\b" + w + r"\b", cleaned) for w in location_words)
    if has_device and not has_location:
        # Append an explicit unknown location hint to help the model
        cleaned = cleaned + " in unknown"

    # Normalize spacing
    cleaned = " ".join(cleaned.split())
    return cleaned


def detect_leaving_intent(text):
    """Detect location-scoped leaving commands such as 'I am leaving bedroom'."""
    if not text:
        return None

    cleaned = normalize_terms(text.strip().lower())
    match = LEAVING_PATTERN.search(cleaned)
    if not match:
        return None

    location = match.group('location').strip().lower()
    location = location.replace('the ', '').strip()
    if not location:
        return None

    # Treat home/house as a global shutdown scenario.
    if location in ('home', 'house', 'everywhere', 'all'):
        return {
            'intent': 'leaving',
            'location': 'home',
            'action': 'off',
        }

    return {
        'intent': 'leaving',
        'location': location,
        'action': 'off',
    }


def extract_expected_devices(text):
    """Extract expected devices and actions from the user's raw input.

    Returns a list of tuples: (device_keyword, action) where action is 'on' or 'off'.
    """
    if not text:
        return []

    t = text.lower()
    t = normalize_terms(t)

    device_pattern = r"light|fan|tv|geyser|exhaust fan|ac|heater|plug|refrigerator|air purifier|watermotor|waterpump|pump|motor"

    results = []

    # Split into clauses by commas
    clauses = re.split(r",|;", t)
    for clause in clauses:
        clause = clause.strip()
        if not clause:
            continue

        # Determine action in clause
        action = None
        if re.search(r"turn\s+on|switch\s+on|enable", clause):
            action = "on"
        elif re.search(r"turn\s+off|switch\s+off|disable", clause):
            action = "off"

        # Find all device mentions in clause
        devices = re.findall(device_pattern, clause)
        for d in devices:
            # normalize
            name = d.replace(' ', '_')
            if not action:
                # fallback: default to 'on' if 'turn on' appears earlier in clause
                action = 'on'
            results.append((name, action))

    return results


def _expand_location_device_lists(text):
    device_pattern = r"light|fan|tv|geyser|exhaust_fan|ac|heater|plug|refrigerator|air_purifier|watermotor|waterpump|pump|motor"
    location_hint = r"(?:living room|bed room|sleep room|sleeping room|pooja room|puja room|parking area|bath room|hall|kitchen|bedroom|bathroom|pooja|parking|living)"

    normalized = text
    normalized = normalized.replace("exhaust fan", "exhaust_fan")
    normalized = normalized.replace("air purifier", "air_purifier")

    pattern = re.compile(
        rf"(?:(?P<action>\b(?:turn\s+on|turn\s+off|switch\s+on|switch\s+off|enable|disable)\b)\s+)?"
        rf"(?P<location>{location_hint})\s+(?P<device>{device_pattern})"
        rf"(?P<trail>(?:\s*(?:,|and)\s*(?:{device_pattern}))+)",
        re.IGNORECASE,
    )

    def repl(match):
        location = " ".join(match.group("location").split())
        action = match.group("action") or ""
        first_device = match.group("device")
        rest_devices = re.findall(device_pattern, match.group("trail"), re.IGNORECASE)
        devices = [first_device] + rest_devices
        expanded = ", ".join(f"{location} {d}" for d in devices)
        if action:
            expanded = f"{action.strip()} {expanded}"
        return expanded

    expanded = pattern.sub(repl, normalized)
    expanded = expanded.replace("exhaust_fan", "exhaust fan")
    expanded = expanded.replace("air_purifier", "air purifier")
    return expanded


def _expand_device_list_with_trailing_location(text):
    """Expand phrases like 'turn on light, fan and air conditioner of bedroom'."""
    normalized = text
    action_pattern = r"\b(?:turn\s+on|turn\s+off|switch\s+on|switch\s+off|enable|disable)\b"

    pattern = re.compile(
        rf"(?P<action>{action_pattern})\s+(?P<body>.+?)\s+(?:of|in|for)\s+(?P<location>[a-z_ ]+)\b",
        re.IGNORECASE,
    )

    def repl(match):
        action = match.group('action').strip()
        body = match.group('body').strip()
        location = " ".join(match.group('location').split())

        devices = [d.strip() for d in re.split(r"\s*(?:,|and)\s*", body) if d.strip()]
        if not devices:
            return match.group(0)

        expanded_devices = ", ".join(f"{location} {device}" for device in devices)
        return f"{action} {expanded_devices}"

    return pattern.sub(repl, normalized)
