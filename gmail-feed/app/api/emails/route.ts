import { NextRequest, NextResponse } from 'next/server';
import { getCachedThreads } from '@/lib/mongodb';
import { fetchThreadsForUser } from '@/lib/gmail';

export async function GET(request: NextRequest) {
  try {
    // Get user email from cookie
    const userEmail = request.cookies.get('user_email')?.value;
    
    if (!userEmail) {
      return NextResponse.json(
        { error: 'Not authenticated', authenticated: false },
        { status: 401 }
      );
    }

    const searchParams = request.nextUrl.searchParams;
    const refresh = searchParams.get('refresh') === 'true';

    // If refresh requested, fetch fresh threads from Gmail
    if (refresh) {
      const result = await fetchThreadsForUser(userEmail, 50);
      if (result) {
        return NextResponse.json({
          authenticated: true,
          userEmail: result.userEmail,
          threads: result.threads,
          lastFetched: new Date(),
          fromCache: false,
        });
      }
    }

    // Otherwise, return cached threads
    const cached = await getCachedThreads(userEmail);
    if (cached) {
      return NextResponse.json({
        authenticated: true,
        userEmail: cached.userEmail,
        threads: cached.threads,
        lastFetched: cached.lastFetched,
        fromCache: true,
      });
    }

    // No cached threads, try fetching fresh
    const result = await fetchThreadsForUser(userEmail, 50);
    if (result) {
      return NextResponse.json({
        authenticated: true,
        userEmail: result.userEmail,
        threads: result.threads,
        lastFetched: new Date(),
        fromCache: false,
      });
    }

    return NextResponse.json(
      { error: 'Failed to fetch threads', authenticated: true, userEmail },
      { status: 500 }
    );
  } catch (error) {
    console.error('Error in emails API:', error);
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}
