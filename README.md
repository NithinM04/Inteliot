# 🏠 INTEL·IOT – AI-Powered Smart Home Automation System

## 📖 Overview

INTEL·IOT is an AI-powered Smart Home Automation System that enables users to control home appliances using natural language commands. The system combines Artificial Intelligence, Internet of Things (IoT), MQTT communication, and ESP8266 microcontrollers to provide intelligent and real-time smart home automation.

The Flan-T5 Small Language Model processes user commands, identifies the intended actions, and controls connected devices through MQTT messaging.

---

## 🏆 Achievement

🥉 **3rd Place – PRADARSHANA 2026**

Annual Project Exhibition

Ramaiah Institute of Technology, Bengaluru

Prize Amount: ₹4,000

---

## 🚀 Features

- Natural Language Command Processing
- AI-Powered Device Control
- Multi-Device Command Execution
- Real-Time MQTT Communication
- ESP8266-Based Automation
- Scenario-Based Smart Actions
- Flask REST API Backend
- React Frontend Dashboard
- Real-Time Device Monitoring
- Scalable Smart Home Architecture

---

## 🛠️ Technology Stack

### Software

- Python
- Flask
- React.js
- MQTT
- Mosquitto Broker
- Flan-T5 Small Language Model
- JSON

### Hardware

- ESP8266 NodeMCU
- Relay Modules
- Smart Home Prototype
- Wi-Fi Network

---

## 🏗️ System Architecture

```text
User
 │
 ▼
React Frontend
 │
 ▼
Flask Backend
 │
 ▼
Flan-T5 SLM
 │
 ▼
Intent Extraction
 │
 ▼
Device Registry
 │
 ▼
MQTT Broker
 │
 ▼
ESP8266 Controllers
 │
 ▼
Smart Devices
```

---

## 📸 Project Demonstration

### Smart Home Dashboard

The dashboard allows users to interact with smart devices using natural language commands.

![Dashboard](Screenshot%202026-06-16%20004209.png)

Example command:

```text
I am leaving home, turn off living room light and TV,
turn on kitchen exhaust fan and air purifier
```

The system automatically:

- Turns OFF living room light
- Turns OFF TV
- Turns ON kitchen exhaust fan
- Turns ON kitchen air purifier

---

### Dataset Analysis

The training dataset was analyzed to ensure quality and intent diversity.

![Dataset Analysis](Screenshot%202026-06-16%20004302.png)

Key Observations:

- 100% valid dataset
- Large vocabulary coverage
- Balanced intent distribution
- Supports multi-device commands
- Optimized for natural language understanding

---

### Smart Home Prototype

Physical implementation using ESP8266 controllers, relays, lights, fans, and household appliances.

![Prototype](WhatsApp%20Image%202026-05-29%20at%2012.52.58%20PM.jpeg)

Implemented Rooms:

- Living Room
- Bedroom
- Kitchen
- Bathroom

Controlled Devices:

- Lights
- Fans
- Air Purifier
- TV
- Geyser

---

## ⚙️ Working

### Step 1

User enters a command:

```text
Turn on the bedroom light
```

### Step 2

Flan-T5 processes the command and extracts:

- Intent
- Device
- Location
- Action

### Step 3

Backend generates MQTT messages.

Example:

```json
{
  "device": "bedroom_light",
  "action": "ON"
}
```

### Step 4

ESP8266 receives MQTT messages and controls devices.

### Step 5

Updated device states are reflected on the dashboard.

---

## 💬 Example Commands

```text
Turn on the bedroom light

Turn off the living room fan

Switch on the bathroom geyser

Turn off all devices in the kitchen

Turn on the pooja room light and living room fan

I am leaving home, turn off all lights
```

---

## 📂 Project Structure

```text
INTEL-IOT/
│
├── final_backend/
│
├── final_frontend/
│
├── Screenshot 2026-06-16 004209.png
│
├── Screenshot 2026-06-16 004302.png
│
├── WhatsApp Image 2026-05-29 at 12.52.58 PM.jpeg
│
├── .gitignore
│
└── README.md
```

---

## 🔧 Installation

### Backend

```bash
cd final_backend

pip install -r requirements.txt

python app.py
```

### Frontend

```bash
cd final_frontend

npm install

npm start
```

### MQTT Broker

Install and start Mosquitto:

```bash
mosquitto
```

### ESP8266

1. Open Arduino IDE
2. Upload ESP8266 firmware
3. Connect to Wi-Fi
4. Connect to MQTT Broker

---

## 📊 Key Highlights

- AI + IoT Integration
- Natural Language Device Control
- Multi-Device Automation
- MQTT-Based Communication
- Real-Time Status Monitoring
- Low Latency Execution
- Scalable Architecture

---

## 👨‍🏫 Project Guide

**Mr. Suresh Kumar R**

For his continuous guidance, support, and technical mentorship.

---

## 👥 Team Members

- Nithin M
- Ashwin K Rao
- Keerthan K V
- Kislay Aryan

---

## 🔮 Future Enhancements

- Voice Assistant Integration
- Mobile Application Support
- Cloud Monitoring
- Energy Analytics
- Personalized AI Automation
- Predictive Device Control

---

## 📜 License

Developed for academic and research purposes.

---

⭐ If you found this project interesting, consider starring the repository.
