/**
 * Fix Important and Starred Lists Formatting
 * Restores proper formatting and display of Important and Starred email lists
 */

module.exports = {
  /**
   * Initialize the feature
   * @param {Object} context - Feature context with server resources
   */
  initialize(context) {
    const { app, getUserDoc, setUserDoc, getCurrentUser, searchGmailEmails } = context;
    
    console.log('Fix Important and Starred Lists: Initializing backend...');
    
    /**
     * GET /api/fix-important-starred-lists/important-emails
     * Fetch emails marked as important in Gmail
     */
    app.get('/api/fix-important-starred-lists/important-emails', async (req, res) => {
      try {
        const user = getCurrentUser();
        
        if (!user) {
          return res.status(401).json({ 
            success: false, 
            error: 'User not authenticated' 
          });
        }
        
        // Search for emails with the important label in Gmail
        const importantEmails = await searchGmailEmails('label:important', 50);
        
        if (!importantEmails || importantEmails.length === 0) {
          console.log('Fix Important and Starred Lists: No important emails found');
          return res.json({ 
            success: true, 
            data: [],
            count: 0
          });
        }
        
        console.log(`Fix Important and Starred Lists: Found ${importantEmails.length} important emails`);
        
        res.json({ 
          success: true, 
          data: importantEmails,
          count: importantEmails.length
        });
      } catch (error) {
        console.error('Fix Important and Starred Lists: Error fetching important emails:', error);
        res.status(500).json({ 
          success: false, 
          error: 'Failed to fetch important emails: ' + error.message
        });
      }
    });
    
    /**
     * GET /api/fix-important-starred-lists/starred-emails
     * Fetch emails marked as starred in Gmail
     */
    app.get('/api/fix-important-starred-lists/starred-emails', async (req, res) => {
      try {
        const user = getCurrentUser();
        
        if (!user) {
          return res.status(401).json({ 
            success: false, 
            error: 'User not authenticated' 
          });
        }
        
        // Search for emails with the starred label in Gmail
        const starredEmails = await searchGmailEmails('is:starred', 50);
        
        if (!starredEmails || starredEmails.length === 0) {
          console.log('Fix Important and Starred Lists: No starred emails found');
          return res.json({ 
            success: true, 
            data: [],
            count: 0
          });
        }
        
        console.log(`Fix Important and Starred Lists: Found ${starredEmails.length} starred emails`);
        
        res.json({ 
          success: true, 
          data: starredEmails,
          count: starredEmails.length
        });
      } catch (error) {
        console.error('Fix Important and Starred Lists: Error fetching starred emails:', error);
        res.status(500).json({ 
          success: false, 
          error: 'Failed to fetch starred emails: ' + error.message
        });
      }
    });
    
    /**
     * GET /api/fix-important-starred-lists/format-emails
     * Format emails for display in the inbox layout
     */
    app.get('/api/fix-important-starred-lists/format-emails', async (req, res) => {
      try {
        const user = getCurrentUser();
        const { type } = req.query; // 'important' or 'starred'
        
        if (!user) {
          return res.status(401).json({ 
            success: false, 
            error: 'User not authenticated' 
          });
        }
        
        if (!type || !['important', 'starred'].includes(type)) {
          return res.status(400).json({ 
            success: false, 
            error: 'Invalid type parameter. Must be "important" or "starred"' 
          });
        }
        
        let emails = [];
        
        if (type === 'important') {
          emails = await searchGmailEmails('label:important', 50);
        } else if (type === 'starred') {
          emails = await searchGmailEmails('is:starred', 50);
        }
        
        // Format emails for display
        const formattedEmails = emails.map(email => ({
          id: email.id || '',
          threadId: email.threadId || '',
          subject: email.subject || '(No Subject)',
          from: email.from || email.originalFrom || 'Unknown',
          originalFrom: email.originalFrom || '',
          to: email.to || '',
          date: email.date || new Date().toISOString(),
          snippet: email.snippet || '',
          body: email.body || '',
          category: email.category || email._cat || 'Uncategorized',
          _cat: email.category || email._cat || 'Uncategorized',
          _catReason: email._catReason || '',
          isImportant: type === 'important',
          isStarred: type === 'starred'
        }));
        
        console.log(`Fix Important and Starred Lists: Formatted ${formattedEmails.length} ${type} emails`);
        
        res.json({ 
          success: true, 
          data: formattedEmails,
          count: formattedEmails.length,
          type: type
        });
      } catch (error) {
        console.error('Fix Important and Starred Lists: Error formatting emails:', error);
        res.status(500).json({ 
          success: false, 
          error: 'Failed to format emails: ' + error.message
        });
      }
    });
    
    /**
     * POST /api/fix-important-starred-lists/sync-lists
     * Sync important and starred lists from Gmail
     */
    app.post('/api/fix-important-starred-lists/sync-lists', async (req, res) => {
      try {
        const user = getCurrentUser();
        
        if (!user) {
          return res.status(401).json({ 
            success: false, 
            error: 'User not authenticated' 
          });
        }
        
        // Fetch both important and starred emails
        const importantEmails = await searchGmailEmails('label:important', 50);
        const starredEmails = await searchGmailEmails('is:starred', 50);
        
        // Format emails
        const formatEmails = (emails, type) => {
          return (emails || []).map(email => ({
            id: email.id || '',
            threadId: email.threadId || '',
            subject: email.subject || '(No Subject)',
            from: email.from || email.originalFrom || 'Unknown',
            originalFrom: email.originalFrom || '',
            to: email.to || '',
            date: email.date || new Date().toISOString(),
            snippet: email.snippet || '',
            body: email.body || '',
            category: email.category || email._cat || 'Uncategorized',
            _cat: email.category || email._cat || 'Uncategorized',
            _catReason: email._catReason || '',
            type: type
          }));
        };
        
        const formattedImportant = formatEmails(importantEmails, 'important');
        const formattedStarred = formatEmails(starredEmails, 'starred');
        
        // Save to database
        await setUserDoc('important_emails_list', user, {
          emails: formattedImportant,
          lastSynced: new Date().toISOString(),
          count: formattedImportant.length
        });
        
        await setUserDoc('starred_emails_list', user, {
          emails: formattedStarred,
          lastSynced: new Date().toISOString(),
          count: formattedStarred.length
        });
        
        console.log(`Fix Important and Starred Lists: Synced ${formattedImportant.length} important and ${formattedStarred.length} starred emails`);
        
        res.json({ 
          success: true, 
          data: {
            important: {
              count: formattedImportant.length,
              emails: formattedImportant
            },
            starred: {
              count: formattedStarred.length,
              emails: formattedStarred
            }
          },
          message: 'Lists synced successfully'
        });
      } catch (error) {
        console.error('Fix Important and Starred Lists: Error syncing lists:', error);
        res.status(500).json({ 
          success: false, 
          error: 'Failed to sync lists: ' + error.message
        });
      }
    });
    
    /**
     * GET /api/fix-important-starred-lists/get-cached-lists
     * Get cached important and starred lists from database
     */
    app.get('/api/fix-important-starred-lists/get-cached-lists', async (req, res) => {
      try {
        const user = getCurrentUser();
        
        if (!user) {
          return res.status(401).json({ 
            success: false, 
            error: 'User not authenticated' 
          });
        }
        
        const importantDoc = await getUserDoc('important_emails_list', user);
        const starredDoc = await getUserDoc('starred_emails_list', user);
        
        const important = importantDoc ? importantDoc.emails || [] : [];
        const starred = starredDoc ? starredDoc.emails || [] : [];
        
        console.log(`Fix Important and Starred Lists: Retrieved ${important.length} important and ${starred.length} starred emails from cache`);
        
        res.json({ 
          success: true, 
          data: {
            important: {
              count: important.length,
              emails: important,
              lastSynced: importantDoc ? importantDoc.lastSynced : null
            },
            starred: {
              count: starred.length,
              emails: starred,
              lastSynced: starredDoc ? starredDoc.lastSynced : null
            }
          }
        });
      } catch (error) {
        console.error('Fix Important and Starred Lists: Error getting cached lists:', error);
        res.status(500).json({ 
          success: false, 
          error: 'Failed to get cached lists: ' + error.message
        });
      }
    });
    
    console.log('Fix Important and Starred Lists: Backend initialized');
  }
};