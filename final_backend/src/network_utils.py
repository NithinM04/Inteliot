import socket

def get_local_ip():
    """
    Get the local IP address of the machine
    Returns the IP that would be used to connect to external networks
    """
    try:
        # Connect to a remote socket (doesn't actually send data)
        # This determines which local IP would be used to reach that address
        s = socket.socket(socket.AF_INET, socket.SOCK_DGRAM)
        s.connect(("8.8.8.8", 80))
        ip = s.getsockname()[0]
        s.close()
        return ip
    except Exception:
        # Fallback to localhost
        return "127.0.0.1"

def get_network_urls(port=5000):
    """
    Get formatted network URLs for the Flask backend
    """
    local_ip = get_local_ip()
    return {
        'localhost': f"http://localhost:{port}",
        'local_ip': f"http://{local_ip}:{port}",
        'api_health': f"http://{local_ip}:{port}/api/health",
        'api_devices': f"http://{local_ip}:{port}/api/devices",
    }
