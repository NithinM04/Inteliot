import paho.mqtt.client as mqtt
import json
import logging
from config import MQTT_BROKER, MQTT_PORT, MQTT_TOPIC_PREFIX, MQTT_ENABLED

logging.basicConfig(level=logging.INFO)

class MQTTClient:
    def __init__(self):
        if not MQTT_ENABLED:
            logging.info("MQTT is disabled in the configuration.")
            self.client = None
            return

        self.client = mqtt.Client()
        self.client.on_connect = self.on_connect
        self.client.on_disconnect = self.on_disconnect
        self.broker = MQTT_BROKER
        self.port = MQTT_PORT
        self.topic_prefix = MQTT_TOPIC_PREFIX
        try:
            self.client.connect(self.broker, self.port, 60)
            self.client.loop_start()
            logging.info(f"Connecting to MQTT Broker at {self.broker}:{self.port}")
        except Exception as e:
            logging.error(f"Could not connect to MQTT Broker: {e}")
            self.client = None

    def on_connect(self, client, userdata, flags, rc):
        if rc == 0:
            logging.info("Successfully connected to MQTT Broker.")
        else:
            logging.error(f"Failed to connect to MQTT Broker, return code {rc}\n")

    def on_disconnect(self, client, userdata, rc):
        logging.info("Disconnected from MQTT Broker.")

    def publish(self, device):
        if not self.client:
            logging.warning("MQTT client not available. Cannot publish.")
            return
        
        device_location = device.get("location", "unknown")
        device_name = device.get("name", "unknown")
        device_type = device.get("type", "switch")
        topic = f"{self.topic_prefix}/{device_location}/{device_name}"
        payload = json.dumps({
            "status": device.get("status", "off"),
            "type": device_type,
            "location": device_location
        })
        
        try:
            self.client.publish(topic, payload, qos=1)
            logging.info(f"Published message to topic '{topic}': {payload}")
        except Exception as e:
            logging.error(f"Failed to publish to topic {topic}: {e}")

    def disconnect(self):
        if self.client:
            self.client.loop_stop()
            self.client.disconnect()

# Singleton instance
mqtt_client = MQTTClient()
