import { NextRequest, NextResponse } from 'next/server';
import { fetchThreadsForUser } from '@/lib/gmail';
import { getAllUsers } from '@/lib/mongodb';

// This endpoint is called by Vercel Cron every 10 minutes
// It fetches threads for ALL authenticated users
export async function GET(request: NextRequest) {
  try {
    // Optional: Verify cron secret for security
    const authHeader = request.headers.get('authorization');
    const cronSecret = process.env.CRON_SECRET;
    
    if (cronSecret && authHeader !== `Bearer ${cronSecret}`) {
      // Allow Vercel's internal cron calls (they don't send auth header)
      const isVercelCron = request.headers.get('x-vercel-cron') === '1';
      if (!isVercelCron) {
        return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
      }
    }

    // Get all authenticated users
    const users = await getAllUsers();
    
    if (users.length === 0) {
      return NextResponse.json({
        success: true,
        message: 'No authenticated users found',
        usersProcessed: 0,
      });
    }

    console.log(`Cron job: Fetching threads for ${users.length} users`);

    const results: { userEmail: string; success: boolean; threadCount?: number; error?: string }[] = [];

    // Fetch threads for each user
    for (const user of users) {
      try {
        const result = await fetchThreadsForUser(user.userEmail, 50);
        results.push({
          userEmail: user.userEmail,
          success: true,
          threadCount: result?.threads.length || 0,
        });
        console.log(`Fetched ${result?.threads.length || 0} threads for ${user.userEmail}`);
      } catch (error) {
        console.error(`Error fetching threads for ${user.userEmail}:`, error);
        results.push({
          userEmail: user.userEmail,
          success: false,
          error: error instanceof Error ? error.message : 'Unknown error',
        });
      }
    }

    const successCount = results.filter(r => r.success).length;

    return NextResponse.json({
      success: true,
      message: `Processed ${users.length} users`,
      usersProcessed: users.length,
      successCount,
      failedCount: users.length - successCount,
      results,
      timestamp: new Date().toISOString(),
    });
  } catch (error) {
    console.error('Cron job error:', error);
    return NextResponse.json(
      { success: false, error: 'Failed to process cron job' },
      { status: 500 }
    );
  }
}
