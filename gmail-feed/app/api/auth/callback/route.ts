import { NextRequest, NextResponse } from 'next/server';
import { exchangeCodeForTokens } from '@/lib/oauth';
import { fetchThreadsForUser } from '@/lib/gmail';

export async function GET(request: NextRequest) {
  const searchParams = request.nextUrl.searchParams;
  const code = searchParams.get('code');
  const error = searchParams.get('error');

  if (error) {
    return NextResponse.redirect(new URL(`/?error=${error}`, request.url));
  }

  if (!code) {
    return NextResponse.redirect(new URL('/?error=no_code', request.url));
  }

  try {
    // Exchange code for tokens and get user email
    const tokenData = await exchangeCodeForTokens(code);
    
    // Fetch initial threads for this user
    await fetchThreadsForUser(tokenData.userEmail, 50);
    
    // Create response with redirect
    const response = NextResponse.redirect(new URL('/', request.url));
    
    // Set a cookie with the user's email for session tracking
    response.cookies.set('user_email', tokenData.userEmail, {
      httpOnly: true,
      secure: process.env.NODE_ENV === 'production',
      sameSite: 'lax',
      maxAge: 60 * 60 * 24 * 30, // 30 days
      path: '/',
    });
    
    return response;
  } catch (err) {
    console.error('OAuth callback error:', err);
    return NextResponse.redirect(new URL('/?error=auth_failed', request.url));
  }
}
