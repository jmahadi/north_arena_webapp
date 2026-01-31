import axios, { AxiosError, InternalAxiosRequestConfig, AxiosResponse } from 'axios';
import Cookies from 'js-cookie';

const api = axios.create({
  baseURL: process.env.NEXT_PUBLIC_API_URL || 'http://localhost:8000',
  timeout: 15000,
});


// Request interceptor for API calls
api.interceptors.request.use(
  (config: InternalAxiosRequestConfig) => {
    const token = Cookies.get('token');
    if (token && config.headers) {
      config.headers['Authorization'] = `Bearer ${token}`;
    }
    return config;
  },
  (error: AxiosError) => {
    return Promise.reject(error);
  }
);


// Response interceptor for API calls
api.interceptors.response.use(
  (response: AxiosResponse) => response,
  (error: AxiosError) => {
    // Handle 401 (Unauthorized) errors - usually expired token or invalid credentials
    if (error.response?.status === 401) {
      console.log('Authentication error - redirecting to login');
      
      // Clear the token
      Cookies.remove('token');
      
      // Redirect to login page only if we're in a browser environment
      if (typeof window !== 'undefined') {
        // Store the current URL to redirect back after login
        const currentPath = window.location.pathname;
        if (currentPath !== '/login') {
          sessionStorage.setItem('redirectAfterLogin', currentPath);
          window.location.href = '/login?expired=true';
        }
      }
    }
    return Promise.reject(error);
  }
);


export default api;