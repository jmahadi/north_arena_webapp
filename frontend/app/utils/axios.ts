import axios from 'axios';

const api = axios.create({
  baseURL: 'http://localhost:8000', // Replace with your actual backend URL
  withCredentials: true, // This is important for handling cookies if your backend uses them
});

export default api;