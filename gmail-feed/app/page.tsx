'use client';

import { useState, useEffect, useCallback } from 'react';

interface ThreadMessage {
  id: string;
  snippet: string;
  subject: string;
  from: string;
  to: string;
  date: string;
  body: string;
  isUnread: boolean;
  labels: string[];
  isSent: boolean;
}

interface EmailThread {
  threadId: string;
  subject: string;
  snippet: string;
  participants: string[];
  messageCount: number;
  messages: ThreadMessage[];
  lastMessageDate: string;
  hasUnread: boolean;
  labels: string[];
}

interface ThreadsResponse {
  authenticated: boolean;
  threads: EmailThread[];
  lastFetched?: string;
  userEmail?: string;
  message?: string;
  error?: string;
}

export default function Home() {
  const [threads, setThreads] = useState<EmailThread[]>([]);
  const [loading, setLoading] = useState(true);
  const [authenticated, setAuthenticated] = useState(false);
  const [lastFetched, setLastFetched] = useState<Date | null>(null);
  const [userEmail, setUserEmail] = useState<string>('');
  const [error, setError] = useState<string>('');
  const [expandedThread, setExpandedThread] = useState<string | null>(null);

  const fetchThreads = useCallback(async () => {
    try {
      const response = await fetch('/api/emails');
      const data: ThreadsResponse = await response.json();
      
      if (data.authenticated) {
        setAuthenticated(true);
        setThreads(data.threads || []);
        if (data.lastFetched) {
          setLastFetched(new Date(data.lastFetched));
        }
        if (data.userEmail) {
          setUserEmail(data.userEmail);
        }
        setError('');
      } else {
        setAuthenticated(false);
        setError(data.message || '');
      }
    } catch (err) {
      console.error('Error fetching threads:', err);
      setError('Failed to fetch threads');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchThreads();
    
    // Refresh every 5 minutes
    const interval = setInterval(fetchThreads, 5 * 60 * 1000);
    
    return () => clearInterval(interval);
  }, [fetchThreads]);

  const formatDate = (dateString: string) => {
    try {
      const date = new Date(dateString);
      const now = new Date();
      const diffMs = now.getTime() - date.getTime();
      const diffMins = Math.floor(diffMs / 60000);
      const diffHours = Math.floor(diffMs / 3600000);
      const diffDays = Math.floor(diffMs / 86400000);

      if (diffMins < 1) return 'Just now';
      if (diffMins < 60) return `${diffMins}m ago`;
      if (diffHours < 24) return `${diffHours}h ago`;
      if (diffDays < 7) return `${diffDays}d ago`;
      
      return date.toLocaleDateString();
    } catch {
      return dateString;
    }
  };

  const extractName = (from: string) => {
    const match = from.match(/^([^<]+)/);
    if (match) {
      return match[1].trim().replace(/"/g, '');
    }
    return from.split('@')[0];
  };

  if (loading) {
    return (
      <main className="min-h-screen bg-gray-50 dark:bg-gray-900 flex items-center justify-center">
        <div className="text-center">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-500 mx-auto mb-4"></div>
          <p className="text-gray-600 dark:text-gray-400">Loading your inbox...</p>
        </div>
      </main>
    );
  }

  if (!authenticated) {
    return (
      <main className="min-h-screen bg-gray-50 dark:bg-gray-900 flex items-center justify-center">
        <div className="text-center max-w-md px-6">
          <div className="mb-8">
            <svg className="w-20 h-20 mx-auto text-blue-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 8l7.89 5.26a2 2 0 002.22 0L21 8M5 19h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z" />
            </svg>
          </div>
          <h1 className="text-3xl font-bold text-gray-900 dark:text-white mb-4">Gmail Feed</h1>
          <p className="text-gray-600 dark:text-gray-400 mb-8">
            Connect your Gmail account to view your inbox. Threads are automatically synced every 10 minutes.
          </p>
          <a
            href="/api/auth/login"
            className="inline-flex items-center px-6 py-3 bg-blue-600 hover:bg-blue-700 text-white font-medium rounded-lg transition-colors"
          >
            <svg className="w-5 h-5 mr-2" viewBox="0 0 24 24">
              <path fill="currentColor" d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z"/>
              <path fill="currentColor" d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"/>
              <path fill="currentColor" d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z"/>
              <path fill="currentColor" d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z"/>
            </svg>
            Sign in with Google
          </a>
        </div>
      </main>
    );
  }

  return (
    <main className="min-h-screen bg-gray-50 dark:bg-gray-900">
      {/* Header */}
      <header className="bg-white dark:bg-gray-800 shadow-sm border-b border-gray-200 dark:border-gray-700">
        <div className="max-w-7xl mx-auto px-4 py-4 sm:px-6 lg:px-8">
          <div className="flex justify-between items-center">
            <div className="flex items-center space-x-3">
              <svg className="w-8 h-8 text-red-500" viewBox="0 0 24 24" fill="currentColor">
                <path d="M20 4H4c-1.1 0-1.99.9-1.99 2L2 18c0 1.1.9 2 2 2h16c1.1 0 2-.9 2-2V6c0-1.1-.9-2-2-2zm0 4l-8 5-8-5V6l8 5 8-5v2z"/>
              </svg>
              <h1 className="text-xl font-semibold text-gray-900 dark:text-white">Gmail Feed</h1>
            </div>
            <div className="flex items-center space-x-4">
              <div className="flex items-center space-x-2 bg-gray-100 dark:bg-gray-700 px-3 py-1 rounded-full">
                <div className="w-6 h-6 rounded-full bg-blue-500 flex items-center justify-center text-white text-xs font-medium">
                  {userEmail.charAt(0).toUpperCase()}
                </div>
                <span className="text-sm text-gray-700 dark:text-gray-300">{userEmail}</span>
              </div>
              {lastFetched && (
                <span className="text-xs text-gray-400 dark:text-gray-500 hidden sm:inline">
                  Last synced: {formatDate(lastFetched.toISOString())}
                </span>
              )}
              <button
                onClick={fetchThreads}
                className="p-2 text-gray-500 hover:text-gray-700 dark:text-gray-400 dark:hover:text-gray-200 rounded-full hover:bg-gray-100 dark:hover:bg-gray-700 transition-colors"
                title="Refresh"
              >
                <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
                </svg>
              </button>
              <button
                onClick={async () => {
                  await fetch('/api/auth/logout', { method: 'POST' });
                  window.location.reload();
                }}
                className="px-3 py-1 text-sm text-red-600 hover:text-red-700 dark:text-red-400 dark:hover:text-red-300 hover:bg-red-50 dark:hover:bg-red-900/20 rounded transition-colors"
                title="Logout"
              >
                Logout
              </button>
            </div>
          </div>
        </div>
      </header>

      {/* Thread List */}
      <div className="max-w-7xl mx-auto px-4 py-6 sm:px-6 lg:px-8">
        {error && (
          <div className="mb-4 p-4 bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 rounded-lg text-red-700 dark:text-red-400">
            {error}
          </div>
        )}
        
        {threads.length === 0 ? (
          <div className="text-center py-12">
            <svg className="w-16 h-16 mx-auto text-gray-400 mb-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M20 13V6a2 2 0 00-2-2H6a2 2 0 00-2 2v7m16 0v5a2 2 0 01-2 2H6a2 2 0 01-2-2v-5m16 0h-2.586a1 1 0 00-.707.293l-2.414 2.414a1 1 0 01-.707.293h-3.172a1 1 0 01-.707-.293l-2.414-2.414A1 1 0 006.586 13H4" />
            </svg>
            <p className="text-gray-500 dark:text-gray-400">No threads found. Threads will sync every 10 minutes.</p>
          </div>
        ) : (
          <div className="bg-white dark:bg-gray-800 rounded-lg shadow overflow-hidden">
            <ul className="divide-y divide-gray-200 dark:divide-gray-700">
              {threads.map((thread) => (
                <li
                  key={thread.threadId}
                  className={`transition-colors ${thread.hasUnread ? 'bg-blue-50 dark:bg-blue-900/10' : ''}`}
                >
                  {/* Thread Header */}
                  <div 
                    onClick={() => setExpandedThread(expandedThread === thread.threadId ? null : thread.threadId)}
                    className="p-4 hover:bg-gray-50 dark:hover:bg-gray-750 cursor-pointer"
                  >
                    <div className="flex items-start space-x-4">
                      <div className="flex-shrink-0">
                        <div className={`w-10 h-10 rounded-full flex items-center justify-center text-white font-medium ${
                          thread.hasUnread ? 'bg-blue-500' : 'bg-gray-400'
                        }`}>
                          {thread.participants[0]?.charAt(0).toUpperCase() || '?'}
                        </div>
                      </div>
                      <div className="flex-1 min-w-0">
                        <div className="flex justify-between items-start">
                          <div className="flex items-center space-x-2">
                            <p className={`text-sm ${thread.hasUnread ? 'font-semibold text-gray-900 dark:text-white' : 'text-gray-700 dark:text-gray-300'}`}>
                              {thread.participants.slice(0, 3).join(', ')}
                              {thread.participants.length > 3 && ` +${thread.participants.length - 3}`}
                            </p>
                            {thread.messageCount > 1 && (
                              <span className="text-xs bg-gray-200 dark:bg-gray-600 text-gray-600 dark:text-gray-300 px-2 py-0.5 rounded-full">
                                {thread.messageCount}
                              </span>
                            )}
                          </div>
                          <span className="text-xs text-gray-500 dark:text-gray-400 whitespace-nowrap ml-2">
                            {formatDate(thread.lastMessageDate)}
                          </span>
                        </div>
                        <p className={`text-sm mt-1 ${thread.hasUnread ? 'font-medium text-gray-900 dark:text-white' : 'text-gray-600 dark:text-gray-400'}`}>
                          {thread.subject}
                        </p>
                        <p className="text-sm text-gray-500 dark:text-gray-500 mt-1 truncate">
                          {thread.snippet}
                        </p>
                      </div>
                      {thread.hasUnread && (
                        <div className="flex-shrink-0">
                          <span className="inline-block w-2 h-2 bg-blue-500 rounded-full"></span>
                        </div>
                      )}
                      <div className="flex-shrink-0">
                        <svg 
                          className={`w-5 h-5 text-gray-400 transition-transform ${expandedThread === thread.threadId ? 'rotate-180' : ''}`} 
                          fill="none" 
                          stroke="currentColor" 
                          viewBox="0 0 24 24"
                        >
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
                        </svg>
                      </div>
                    </div>
                  </div>
                  
                  {/* Expanded Thread Messages */}
                  {expandedThread === thread.threadId && (
                    <div className="border-t border-gray-200 dark:border-gray-700 bg-gray-50 dark:bg-gray-850">
                      {thread.messages.map((message, idx) => (
                        <div 
                          key={message.id} 
                          className={`p-4 ${idx > 0 ? 'border-t border-gray-200 dark:border-gray-700' : ''}`}
                        >
                          <div className="flex items-start space-x-3">
                            <div className={`flex-shrink-0 w-8 h-8 rounded-full flex items-center justify-center text-white text-sm font-medium ${
                              message.isSent ? 'bg-green-500' : 'bg-gray-400'
                            }`}>
                              {message.isSent ? 'Me' : extractName(message.from).charAt(0).toUpperCase()}
                            </div>
                            <div className="flex-1 min-w-0">
                              <div className="flex justify-between items-start mb-2">
                                <div>
                                  <p className={`text-sm font-medium ${message.isSent ? 'text-green-700 dark:text-green-400' : 'text-gray-900 dark:text-white'}`}>
                                    {message.isSent ? 'Me' : extractName(message.from)}
                                    {message.isSent && <span className="ml-2 text-xs text-gray-500">(sent)</span>}
                                  </p>
                                  <p className="text-xs text-gray-500 dark:text-gray-400">
                                    To: {message.to}
                                  </p>
                                </div>
                                <span className="text-xs text-gray-500 dark:text-gray-400">
                                  {new Date(message.date).toLocaleString()}
                                </span>
                              </div>
                              <div 
                                className="text-sm text-gray-700 dark:text-gray-300 whitespace-pre-wrap bg-white dark:bg-gray-800 p-3 rounded-lg border border-gray-200 dark:border-gray-700"
                                dangerouslySetInnerHTML={{ 
                                  __html: message.body.substring(0, 3000) + (message.body.length > 3000 ? '...' : '') 
                                }}
                              />
                            </div>
                          </div>
                        </div>
                      ))}
                    </div>
                  )}
                </li>
              ))}
            </ul>
          </div>
        )}
        
        <div className="mt-6 text-center text-sm text-gray-500 dark:text-gray-400">
          <p>Threads are automatically synced every 10 minutes by the server.</p>
          <p>This page refreshes every 5 minutes to show the latest cached threads.</p>
        </div>
      </div>
    </main>
  );
}
