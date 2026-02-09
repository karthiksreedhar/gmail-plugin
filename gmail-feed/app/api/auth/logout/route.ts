import { NextRequest, NextResponse } from 'next/server';
import { deleteTokens, deleteEmailCache } from '@/lib/mongodb';

export async function POST(request: NextRequest) {
  try {
    const userEmail = request.cookies.get('user_email')?.value;
    
    // Create response
    const response = NextResponse.json({ success: true, message: 'Logged out successfully' });
    
    // Clear the session cookie
    response.cookies.set('user_email', '', {
      httpOnly: true,
      secure: process.env.NODE_ENV === 'production',
      sameSite: 'lax',
      maxAge: 0, // Expire immediately
      path: '/',
    });
    
    // Optionally delete user data from MongoDB
    // Uncomment if you want to remove stored tokens on logout
    // if (userEmail) {
    //   await deleteTokens(userEmail);
    //   await deleteEmailCache(userEmail);
    // }
    
    return response;
  } catch (error) {
    console.error('Logout error:', error);
    return NextResponse.json(
      { error: 'Failed to logout' },
      { status: 500 }
    );
  }
}
