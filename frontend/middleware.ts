import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';


// Function to check if a JWT token is expired
function isTokenExpired(token: string): boolean {
  try {
    // Extract the payload part of the JWT (the middle part between the dots)
    const base64Url = token.split('.')[1];
    const base64 = base64Url.replace(/-/g, '+').replace(/_/g, '/');
    // Use atob to decode base64
    const jsonPayload = decodeURIComponent(
      Array.from(atob(base64))
        .map(c => '%' + ('00' + c.charCodeAt(0).toString(16)).slice(-2))
        .join('')
    );

    const { exp } = JSON.parse(jsonPayload);
    // Check if the expiration timestamp is less than the current time
    return exp * 1000 < Date.now();
  } catch (error) {
    // If there's any error parsing the token, consider it expired
    console.error('Error checking token expiration:', error);
    return true;
  }
}


export function middleware(request: NextRequest) {
  const token = request.cookies.get('token')?.value;
  const protectedPaths = ['/dashboard', '/bookings' , '/transactions']; // Add more paths as needed

  // Check if the path requires authentication
  if (protectedPaths.some(path => request.nextUrl.pathname.startsWith(path))) {
    // If no token exists or token is expired, redirect to login
    if (!token || isTokenExpired(token)) {
      // Clear the token cookie if it exists but is expired
      const response = NextResponse.redirect(new URL('/login', request.url));
      if (token) {
        response.cookies.delete('token');
      }
      return response;
    }
  }

  // If user is trying to access login page with a valid token, redirect to dashboard
  if (request.nextUrl.pathname === '/login' && token && !isTokenExpired(token)) {
    return NextResponse.redirect(new URL('/dashboard', request.url));
  }

  return NextResponse.next();
}

export const config = {
  matcher: ['/dashboard/:path*', '/bookings/:path*', '/transactions/:path*', '/login'],
};