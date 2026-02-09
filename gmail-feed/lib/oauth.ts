import { google, Auth } from 'googleapis';
import { storeTokens, getStoredTokens } from './mongodb';

// OAuth configuration from environment variables
const CLIENT_ID = process.env.GOOGLE_CLIENT_ID!;
const CLIENT_SECRET = process.env.GOOGLE_CLIENT_SECRET!;
const REDIRECT_URI = process.env.GOOGLE_REDIRECT_URI || 'http://localhost:3000/api/auth/callback';

// Gmail API scopes
const SCOPES = [
  'https://www.googleapis.com/auth/gmail.readonly',
  'https://www.googleapis.com/auth/userinfo.email',
];

export function getOAuth2Client(): Auth.OAuth2Client {
  return new google.auth.OAuth2(CLIENT_ID, CLIENT_SECRET, REDIRECT_URI);
}

export function getAuthUrl(): string {
  const oauth2Client = getOAuth2Client();
  return oauth2Client.generateAuthUrl({
    access_type: 'offline',
    scope: SCOPES,
    prompt: 'consent', // Force to get refresh token
  });
}

export async function exchangeCodeForTokens(code: string): Promise<{
  accessToken: string;
  refreshToken: string;
  expiryDate: number;
  userEmail: string;
}> {
  const oauth2Client = getOAuth2Client();
  const { tokens } = await oauth2Client.getToken(code);
  
  oauth2Client.setCredentials(tokens);
  
  // Get user email
  const oauth2 = google.oauth2({ version: 'v2', auth: oauth2Client });
  const userInfo = await oauth2.userinfo.get();
  const userEmail = userInfo.data.email || '';
  
  const tokenData = {
    accessToken: tokens.access_token || '',
    refreshToken: tokens.refresh_token || '',
    expiryDate: tokens.expiry_date || Date.now() + 3600000,
    userEmail,
  };
  
  // Store tokens in MongoDB (keyed by userEmail for multi-user)
  await storeTokens(tokenData);
  
  return tokenData;
}

export async function refreshAccessToken(oauth2Client: Auth.OAuth2Client, userEmail: string): Promise<void> {
  try {
    const { credentials } = await oauth2Client.refreshAccessToken();
    
    const existingTokens = await getStoredTokens(userEmail);
    if (existingTokens) {
      await storeTokens({
        accessToken: credentials.access_token || '',
        refreshToken: existingTokens.refreshToken,
        expiryDate: credentials.expiry_date || Date.now() + 3600000,
        userEmail: existingTokens.userEmail,
      });
    }
    
    oauth2Client.setCredentials(credentials);
  } catch (error) {
    console.error('Error refreshing access token:', error);
    throw error;
  }
}

export async function isAuthenticated(userEmail: string): Promise<boolean> {
  const tokens = await getStoredTokens(userEmail);
  return tokens !== null && tokens.refreshToken !== '';
}
