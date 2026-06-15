import os
from dotenv import load_dotenv

load_dotenv()

# Flask Configuration
FLASK_ENV = os.getenv('FLASK_ENV', 'development')
FLASK_PORT = int(os.getenv('FLASK_PORT', 5000))
FLASK_DEBUG = FLASK_ENV == 'development'

# SLM Model Configuration
SLM_MODEL_PATH = './models/Flan-t5'
SLM_MAX_LENGTH = 100
SLM_TEMPERATURE = 0.3
SLM_DEVICE = 'cuda' if os.getenv('USE_CUDA', 'False') == 'True' else 'cpu'

# Frontend URL (for CORS)
FRONTEND_URL = os.getenv('FRONTEND_URL', 'http://localhost:3000')

# MQTT Configuration
MQTT_BROKER = os.getenv('MQTT_BROKER', 'localhost')
MQTT_PORT = int(os.getenv('MQTT_PORT', 1883))
MQTT_TOPIC_PREFIX = os.getenv('MQTT_TOPIC_PREFIX', 'inteliot')
MQTT_ENABLED = os.getenv('MQTT_ENABLED', 'False').lower() in ('true', '1', 't')

print(f"Config loaded: ENV={FLASK_ENV}, PORT={FLASK_PORT}, DEVICE={SLM_DEVICE}")
