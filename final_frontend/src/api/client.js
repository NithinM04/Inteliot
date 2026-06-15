import axios from 'axios';
import { getBackendURL } from '../utils/networkConfig';

// Determine the backend URL
// Priority: env var > proxy (https) > detected hostname > localhost
const isHttps = typeof window !== 'undefined' && window.location?.protocol === 'https:';
const backendURL = process.env.REACT_APP_BACKEND_URL || (isHttps ? '' : getBackendURL());

const apiClient = axios.create({
  baseURL: backendURL,
  timeout: 30000,
  headers: {
    'Content-Type': 'application/json',
  },
});

// Error handling
apiClient.interceptors.response.use(
  response => response,
  error => {
    console.error('API Error:', error.response?.data || error.message);
    return Promise.reject(error);
  }
);

export default apiClient;
export { backendURL };
