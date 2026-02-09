import { google, gmail_v1 } from 'googleapis';
import { getOAuth2Client, refreshAccessToken } from './oauth';
import { getStoredTokens, cacheThreads, EmailThread, ThreadMessage } from './mongodb';

function decodeBase64(data: string): string {
  const base64 = data.replace(/-/g, '+').replace(/_/g, '/');
  return Buffer.from(base64, 'base64').toString('utf-8');
}

function getHeader(headers: gmail_v1.Schema$MessagePartHeader[] | undefined, name: string): string {
  if (!headers) return '';
  const header = headers.find(h => h.name?.toLowerCase() === name.toLowerCase());
  return header?.value || '';
}

function extractBody(payload: gmail_v1.Schema$MessagePart | undefined): string {
  if (!payload) return '';

  if (payload.body?.data) {
    return decodeBase64(payload.body.data);
  }

  if (payload.parts) {
    for (const part of payload.parts) {
      if (part.mimeType === 'text/plain' && part.body?.data) {
        return decodeBase64(part.body.data);
      }
    }
    for (const part of payload.parts) {
      if (part.mimeType === 'text/html' && part.body?.data) {
        return decodeBase64(part.body.data);
      }
    }
    for (const part of payload.parts) {
      const nestedBody = extractBody(part);
      if (nestedBody) return nestedBody;
    }
  }

  return '';
}

function extractEmailAddress(fromHeader: string): string {
  const match = fromHeader.match(/<([^>]+)>/);
  if (match) {
    return match[1].toLowerCase();
  }
  return fromHeader.toLowerCase();
}

function extractName(fromHeader: string): string {
  const match = fromHeader.match(/^([^<]+)/);
  if (match) {
    return match[1].trim().replace(/"/g, '');
  }
  return fromHeader.split('@')[0];
}

// Fetch threads for a specific user (multi-user support)
export async function fetchThreadsForUser(userEmail: string, maxResults: number = 50): Promise<{ threads: EmailThread[]; userEmail: string } | null> {
  const tokens = await getStoredTokens(userEmail);
  if (!tokens) {
    console.log(`No tokens found for user: ${userEmail}`);
    return null;
  }

  const oauth2Client = getOAuth2Client();
  oauth2Client.setCredentials({
    access_token: tokens.accessToken,
    refresh_token: tokens.refreshToken,
    expiry_date: tokens.expiryDate,
  });

  // Refresh token if expired
  if (tokens.expiryDate < Date.now()) {
    console.log(`Token expired for ${userEmail}, refreshing...`);
    await refreshAccessToken(oauth2Client, userEmail);
  }

  const gmail = google.gmail({ version: 'v1', auth: oauth2Client });

  try {
    // List threads from inbox (includes sent messages in threads)
    const listResponse = await gmail.users.threads.list({
      userId: 'me',
      maxResults,
      labelIds: ['INBOX'],
    });

    const threadList = listResponse.data.threads || [];
    const threads: EmailThread[] = [];

    for (const thread of threadList) {
      if (!thread.id) continue;

      // Get full thread with all messages
      const threadResponse = await gmail.users.threads.get({
        userId: 'me',
        id: thread.id,
        format: 'full',
      });

      const fullThread = threadResponse.data;
      const messages = fullThread.messages || [];
      
      if (messages.length === 0) continue;

      const threadMessages: ThreadMessage[] = [];
      const participants = new Set<string>();
      let hasUnread = false;
      let threadSubject = '';
      const allLabels = new Set<string>();

      // Process all messages in the thread (oldest first)
      for (const msg of messages) {
        const headers = msg.payload?.headers;
        const from = getHeader(headers, 'From');
        const to = getHeader(headers, 'To');
        const subject = getHeader(headers, 'Subject');
        const date = getHeader(headers, 'Date');
        const labels = msg.labelIds || [];
        
        const fromEmail = extractEmailAddress(from);
        const isSent = labels.includes('SENT') || fromEmail === userEmail.toLowerCase();
        const isUnread = labels.includes('UNREAD');
        
        if (isUnread) hasUnread = true;
        
        // Collect participants
        participants.add(extractName(from));
        if (to) {
          // Parse multiple recipients
          const toAddresses = to.split(',');
          for (const addr of toAddresses) {
            participants.add(extractName(addr.trim()));
          }
        }
        
        // Use the first message's subject as thread subject (without Re:, Fwd:)
        if (!threadSubject && subject) {
          threadSubject = subject.replace(/^(Re:|Fwd:|FW:)\s*/gi, '').trim();
        }
        
        // Collect all labels
        labels.forEach(l => allLabels.add(l));

        const message: ThreadMessage = {
          id: msg.id || '',
          snippet: msg.snippet || '',
          subject: subject,
          from: from,
          to: to,
          date: date,
          body: extractBody(msg.payload),
          isUnread: isUnread,
          labels: labels,
          isSent: isSent,
        };

        threadMessages.push(message);
      }

      // Get the latest message for thread preview
      const latestMessage = threadMessages[threadMessages.length - 1];
      
      // Remove the current user from participants display
      const participantList = Array.from(participants).filter(p => {
        const pLower = p.toLowerCase();
        return !userEmail.toLowerCase().includes(pLower) && pLower !== 'me';
      });

      const emailThread: EmailThread = {
        threadId: fullThread.id || '',
        subject: threadSubject || '(No subject)',
        snippet: latestMessage.snippet,
        participants: participantList.length > 0 ? participantList : ['me'],
        messageCount: threadMessages.length,
        messages: threadMessages,
        lastMessageDate: latestMessage.date,
        hasUnread: hasUnread,
        labels: Array.from(allLabels),
      };

      threads.push(emailThread);
    }

    // Cache the threads for this user
    await cacheThreads(threads, userEmail);

    return { threads, userEmail };
  } catch (error) {
    console.error(`Error fetching threads for ${userEmail}:`, error);
    throw error;
  }
}

// Legacy function for backwards compatibility
export async function fetchEmailsForUser(userEmail: string, maxResults: number = 50) {
  return fetchThreadsForUser(userEmail, maxResults);
}
