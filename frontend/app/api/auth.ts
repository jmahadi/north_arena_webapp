import api from '../utils/axios';
import Cookies from 'js-cookie';

interface LoginResponse {
  access_token: string;
  token_type: string;
}

export interface DashboardData {
  bookings_this_month: number;
  upcoming_bookings: number;
  revenue_this_month: number;
  revenue_change: number;
  avg_bookings_per_day: number;
}

export const login = async (email: string, password: string): Promise<LoginResponse> => {
  try {
    console.log('Sending login request...');
    const response = await api.post<LoginResponse>('/api/login', 
      new URLSearchParams({
        username: email,
        password: password
      }),
      {
        headers: {
          'Content-Type': 'application/x-www-form-urlencoded'
        }
      }
    );
    console.log('Login response:', response.data);
    return response.data;
  } catch (error) {
    console.error('Login error in auth.ts:', error);
    throw error;
  }
};

export const fetchDashboardData = async (): Promise<DashboardData> => {
  const token = Cookies.get('token');
  if (!token) {
    throw new Error('No authentication token found');
  }

  try {
    console.log('Fetching dashboard data...');
    const response = await api.get<DashboardData>('/api/dashboard', {
      headers: {
        'Authorization': `Bearer ${token}`
      }
    });
    console.log('Dashboard data response:', response.data);
    return response.data;
  } catch (error) {
    console.error('Error fetching dashboard data:', error);
    throw error;
  }
};

export const logout = async () => {
  try {
    await api.post('/api/logout');
    Cookies.remove('token');
  } catch (error) {
    console.error('Logout error:', error);
    throw error;
  }
};