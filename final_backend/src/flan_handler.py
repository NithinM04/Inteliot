import torch
from transformers import AutoTokenizer, AutoModelForSeq2SeqLM
from preprocessing import preprocess_text, extract_expected_devices
from mapping import canonicalize_device, canonicalize_location


class FlanHandler:
    """Direct Flan-T5 inference with no preprocessing or pattern matching."""

    def __init__(self, model_path="./models/Flan-t5"):
        self.model_path = model_path
        self.model = None
        self.tokenizer = None
        self.device = None
        self.ready = False

        try:
            self._load_model()
        except Exception as e:
            print(f"[ERROR] Failed to load Flan-T5 model: {e}")
            self.ready = False

    def _load_model(self):
        self.device = torch.device("cuda" if torch.cuda.is_available() else "cpu")

        print(f"[INFO] Loading Flan-T5 tokenizer from {self.model_path}...")
        self.tokenizer = AutoTokenizer.from_pretrained(
            self.model_path,
            local_files_only=True,
            trust_remote_code=True,
        )
        if self.tokenizer.pad_token is None:
            self.tokenizer.pad_token = self.tokenizer.eos_token

        print(f"[INFO] Loading Flan-T5 model from {self.model_path}...")
        self.model = AutoModelForSeq2SeqLM.from_pretrained(
            self.model_path,
            local_files_only=True,
            trust_remote_code=True,
        ).to(self.device)

        print(f"[OK] Flan-T5 loaded on device: {self.device}")
        self.ready = True

    def generate(self, user_input, max_length=100, temperature=0.3):
        """Generate raw model output from user input."""
        if not self.ready:
            raise RuntimeError("Flan-T5 model not loaded")

        cleaned_input = preprocess_text(user_input)
        # store expected devices for post-processing
        self._expected_devices = extract_expected_devices(user_input)
        prompt = (
            "Convert the user command into one or more comma-separated entries in the exact format:"
            " device:location:action."
            " Output one entry per intent, lowercase, and use only 'on' or 'off' for action." 
            " If the location is unknown, use the literal 'unknown' as the location."
            " Do not add explanatory text, and do not repeat the same device:location:action." 
            "\nExample input: turn off hall light and fan, turn on bedroom light"
            "\nExample output: light:hall:off, fan:hall:off, light:bedroom:on"
            f"\nCommand: {cleaned_input}"
        )
        inputs = self.tokenizer(prompt, return_tensors="pt").to(self.device)
        outputs = self.model.generate(
            **inputs,
            max_length=max_length,
            num_beams=4,
            early_stopping=True,
            do_sample=False,
            pad_token_id=self.tokenizer.eos_token_id,
        )
        output_text = self.tokenizer.decode(outputs[0], skip_special_tokens=True).strip()
        print(f"[DEBUG] Flan-T5 Raw Output: {output_text}")
        return output_text


    def parse_output_to_devices(self, output_text):
        """
        Parse Flan-T5 output lines formatted as device:location:action.
        Example: "light:hall:on"
        """
        devices = []
        last_location = ""
        device_keywords = {
            "light",
            "fan",
            "tv",
            "geyser",
            "exhaust_fan",
            "ac",
            "heater",
            "plug",
            "refrigerator",
            "air_purifier",
            "watermotor",
            "water_motor",
            "water_pump",
            "waterpump",
            "pump",
            "motor",
        }
        default_device = "light"

        if not output_text:
            return devices

        raw_lines = output_text.splitlines()
        for raw_line in raw_lines:
            line = raw_line.strip()
            if not line:
                continue

            # Allow multiple entries separated by commas on one line
            entries = [entry.strip() for entry in line.split(',') if entry.strip()]
            for entry in entries:
                parts = [part.strip() for part in entry.split(':') if part.strip()]
                if not parts:
                    continue

                name = ""
                location = ""
                action = ""

                if len(parts) == 3:
                    name, location, action = parts
                elif len(parts) == 2:
                    left, action = parts
                    left_tokens = [token for token in left.replace('_', ' ').split(' ') if token]
                    if len(left_tokens) >= 2:
                        name = left_tokens[-1]
                        location = ' '.join(left_tokens[:-1])
                    else:
                        name = left
                        location = ""
                elif len(parts) >= 4:
                    action = parts[-1]
                    name = parts[-2]
                    location = ':'.join(parts[:-2])

                if not name or not action:
                    continue

                name = name.lower().replace(' ', '_')
                location = location.lower().replace(' ', '_')
                action = action.lower()

                # Normalize common variants
                if name == "geaser":
                    name = "geyser"

                # Heuristic: swap if device/location are reversed
                if name not in device_keywords and location in device_keywords:
                    name, location = location, name

                # Heuristic: if name is not a known device, treat it as location
                if name not in device_keywords:
                    if location:
                        location = f"{name}_{location}"
                    else:
                        location = name
                    name = default_device

                # Heuristic: fill missing location from previous entry; default to 'unknown'
                if not location:
                    if last_location:
                        location = last_location
                    else:
                        location = 'unknown'

                if location:
                    last_location = location

                devices.append({
                    "name": canonicalize_device(name),
                    "location": canonicalize_location(location),
                    "status": action,
                })

        # Post-process: ensure expected devices from the original input are present
        try:
            expected = getattr(self, '_expected_devices', [])
        except Exception:
            expected = []

        # Build a quick lookup of parsed device names and locations
        parsed_keys = set((d['name'], d['location']) for d in devices)

        for exp_name, exp_action in expected:
            en = exp_name.lower().replace(' ', '_')
            # If not present at all, try to infer a location and add it
            if not any(d['name'] == en for d in devices):
                inferred_loc = last_location or ''
                devices.append({
                    'name': canonicalize_device(en),
                    'location': canonicalize_location(inferred_loc),
                    'status': exp_action or 'on'
                })

        # Normalize statuses: if model returned non 'on'/'off', try to use expected action
        for d in devices:
            if d.get('status') not in ('on', 'off'):
                # try to find expected action for this device
                fallback = None
                for exp_name, exp_action in expected:
                    if exp_name.lower().replace(' ', '_') == d['name']:
                        fallback = exp_action
                        break
                d['status'] = fallback or 'on'

        return devices

    def is_ready(self):
        """Check if model is loaded and ready."""
        return self.ready
