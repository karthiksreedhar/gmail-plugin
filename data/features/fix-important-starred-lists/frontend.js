(function() {
  console.log('Fix Important and Starred Lists: Frontend loading...');
  
  if (!window.EmailAssistant) {
    console.error('Fix Important and Starred Lists: EmailAssistant API not available');
    return;
  }
  
  const API = window.EmailAssistant;
  
  // State
  let importantEmails = [];
  let starredEmails = [];
  let currentView = null; // 'important' or 'starred'
  
  /**
   * Initialize the feature
   */
  function initialize() {
    try {
      // Add header buttons for Important and Starred lists
      API.addHeaderButton('Important', showImportantList, {
        className: 'btn btn-warning',
        style: { marginRight: '8px' }
      });
      
      API.addHeaderButton('Starred', showStarredList, {
        className: 'btn btn-info',
        style: { marginRight: '8px' }
      });
      
      // Listen for email events
      API.on('emailsLoaded', handleEmailsLoaded);
      
      console.log('Fix Important and Starred Lists: Frontend initialized successfully');
    } catch (error) {
      console.error('Fix Important and Starred Lists: Initialization failed:', error);
    }
  }
  
  /**
   * Show Important emails list
   */
  function showImportantList() {
    console.log('Fix Important and Starred Lists: Loading important emails...');
    currentView = 'important';
    showLoadingModal('Loading Important Emails...');
    loadAndDisplayEmails('important');
  }
  
  /**
   * Show Starred emails list
   */
  function showStarredList() {
    console.log('Fix Important and Starred Lists: Loading starred emails...');
    currentView = 'starred';
    showLoadingModal('Loading Starred Emails...');
    loadAndDisplayEmails('starred');
  }
  
  /**
   * Load and display emails for a given type
   */
  async function loadAndDisplayEmails(type) {
    try {
      // First try to sync from Gmail
      console.log(`Fix Important and Starred Lists: Syncing ${type} emails from Gmail...`);
      
      const syncResponse = await API.apiCall('/api/fix-important-starred-lists/sync-lists', {
        method: 'POST',
        body: {}
      });
      
      if (!syncResponse.success) {
        throw new Error(syncResponse.error || 'Failed to sync lists');
      }
      
      // Get the formatted emails
      const emails = type === 'important' 
        ? syncResponse.data.important.emails 
        : syncResponse.data.starred.emails;
      
      if (type === 'important') {
        importantEmails = emails;
      } else {
        starredEmails = emails;
      }
      
      console.log(`Fix Important and Starred Lists: Loaded ${emails.length} ${type} emails`);
      
      // Display the emails
      displayEmailsList(emails, type);
      
    } catch (error) {
      console.error(`Fix Important and Starred Lists: Error loading ${type} emails:`, error);
      API.showError(`Failed to load ${type} emails: ${error.message}`);
      
      // Try to load from cache as fallback
      console.log(`Fix Important and Starred Lists: Attempting to load ${type} emails from cache...`);
      loadFromCache(type);
    }
  }
  
  /**
   * Load emails from cache
   */
  async function loadFromCache(type) {
    try {
      const cacheResponse = await API.apiCall('/api/fix-important-starred-lists/get-cached-lists');
      
      if (!cacheResponse.success) {
        throw new Error(cacheResponse.error || 'Failed to load from cache');
      }
      
      const emails = type === 'important' 
        ? cacheResponse.data.important.emails 
        : cacheResponse.data.starred.emails;
      
      if (type === 'important') {
        importantEmails = emails;
      } else {
        starredEmails = emails;
      }
      
      console.log(`Fix Important and Starred Lists: Loaded ${emails.length} ${type} emails from cache`);
      displayEmailsList(emails, type);
      
    } catch (error) {
      console.error(`Fix Important and Starred Lists: Error loading from cache:`, error);
      API.showError(`No ${type} emails found`);
      displayEmptyState(type);
    }
  }
  
  /**
   * Display emails list in inbox format
   */
  function displayEmailsList(emails, type) {
    if (!emails || emails.length === 0) {
      displayEmptyState(type);
      return;
    }
    
    const title = type === 'important' ? 'Important Emails' : 'Starred Emails';
    const emailsHtml = emails.map(email => createEmailCard(email, type)).join('');
    
    const content = `
      <div style="padding: 20px; max-height: 600px; overflow-y: auto;">
        <h3 style="margin-bottom: 20px; color: #333;">
          ${type === 'important' ? '⚠️' : '⭐'} ${title}
          <span style="font-size: 14px; color: #666; margin-left: 10px;">(${emails.length} emails)</span>
        </h3>
        <div style="display: flex; flex-direction: column; gap: 12px;">
          ${emailsHtml}
        </div>
        <div style="text-align: center; margin-top: 20px; padding-top: 20px; border-top: 1px solid #eee;">
          <button class="btn btn-secondary" onclick="this.closest('.modal').remove()">Close</button>
          <button class="btn btn-primary" onclick="window.fixImportantStarredRefresh('${type}')" style="margin-left: 10px;">Refresh</button>
        </div>
      </div>
    `;
    
    API.showModal(content, title);
  }
  
  /**
   * Create email card HTML
   */
  function createEmailCard(email, type) {
    const fromText = email.from || email.originalFrom || 'Unknown';
    const subject = email.subject || '(No Subject)';
    const snippet = (email.snippet || '').substring(0, 100);
    const date = formatDate(email.date);
    const category = email.category || email._cat || 'Uncategorized';
    
    return `
      <div class="email-item" style="
        border: 1px solid #ddd;
        border-radius: 6px;
        padding: 12px;
        background: #fff;
        cursor: pointer;
        transition: all 0.2s ease;
        box-shadow: 0 1px 3px rgba(0,0,0,0.1);
      " onmouseover="this.style.boxShadow='0 2px 8px rgba(0,0,0,0.15)'" onmouseout="this.style.boxShadow='0 1px 3px rgba(0,0,0,0.1)'">
        <div style="display: flex; justify-content: space-between; align-items: flex-start; margin-bottom: 8px;">
          <div style="flex: 1;">
            <div class="email-from" style="font-weight: 600; color: #333; font-size: 14px; margin-bottom: 4px;">
              ${escapeHtml(fromText)}
            </div>
            <div class="email-subject" style="font-weight: 500; color: #222; font-size: 15px; margin-bottom: 6px;">
              ${escapeHtml(subject)}
            </div>
          </div>
          <div class="email-date" style="color: #999; font-size: 12px; white-space: nowrap; margin-left: 12px;">
            ${date}
          </div>
        </div>
        <div class="email-snippet" style="color: #666; font-size: 13px; margin-bottom: 10px; line-height: 1.4;">
          ${escapeHtml(snippet)}
        </div>
        <div style="display: flex; gap: 8px; align-items: center;">
          <span class="email-category" style="
            display: inline-block;
            background: #e8f4f8;
            color: #0066cc;
            padding: 4px 10px;
            border-radius: 12px;
            font-size: 12px;
            font-weight: 500;
          ">
            ${escapeHtml(category)}
          </span>
          ${type === 'important' ? '<span style="color: #ff9800; font-size: 14px;">⚠️ Important</span>' : ''}
          ${type === 'starred' ? '<span style="color: #ffc107; font-size: 14px;">⭐ Starred</span>' : ''}
        </div>
      </div>
    `;
  }
  
  /**
   * Display empty state
   */
  function displayEmptyState(type) {
    const title = type === 'important' ? 'Important Emails' : 'Starred Emails';
    const icon = type === 'important' ? '⚠️' : '⭐';
    
    const content = `
      <div style="padding: 40px 20px; text-align: center;">
        <div style="font-size: 48px; margin-bottom: 20px;">${icon}</div>
        <h3 style="color: #333; margin-bottom: 10px;">${title}</h3>
        <p style="color: #999; margin-bottom: 20px;">
          No ${type} emails found. Mark emails as ${type} in Gmail to see them here.
        </p>
        <div style="text-align: center; margin-top: 20px;">
          <button class="btn btn-secondary" onclick="this.closest('.modal').remove()">Close</button>
          <button class="btn btn-primary" onclick="window.fixImportantStarredRefresh('${type}')" style="margin-left: 10px;">Refresh</button>
        </div>
      </div>
    `;
    
    API.showModal(content, title);
  }
  
  /**
   * Show loading modal
   */
  function showLoadingModal(message) {
    const content = `
      <div style="padding: 40px 20px; text-align: center;">
        <div style="
          display: inline-block;
          width: 40px;
          height: 40px;
          border: 4px solid #f3f3f3;
          border-top: 4px solid #007bff;
          border-radius: 50%;
          animation: spin 1s linear infinite;
          margin-bottom: 20px;
        "></div>
        <p style="color: #666; font-size: 16px;">${message}</p>
      </div>
      <style>
        @keyframes spin {
          0% { transform: rotate(0deg); }
          100% { transform: rotate(360deg); }
        }
      </style>
    `;
    
    API.showModal(content, 'Loading...');
  }
  
  /**
   * Format date for display
   */
  function formatDate(dateString) {
    if (!dateString) return '';
    
    try {
      const date = new Date(dateString);
      const today = new Date();
      const yesterday = new Date(today);
      yesterday.setDate(yesterday.getDate() - 1);
      
      if (date.toDateString() === today.toDateString()) {
        return date.toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit' });
      } else if (date.toDateString() === yesterday.toDateString()) {
        return 'Yesterday';
      } else if (date.getFullYear() === today.getFullYear()) {
        return date.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
      } else {
        return date.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: '2-digit' });
      }
    } catch (error) {
      return '';
    }
  }
  
  /**
   * Escape HTML special characters
   */
  function escapeHtml(text) {
    if (!text) return '';
    const div = document.createElement('div');
    div.textContent = text;
    return div.innerHTML;
  }
  
  /**
   * Handle emails loaded event
   */
  function handleEmailsLoaded() {
    console.log('Fix Important and Starred Lists: Emails loaded event received');
  }
  
  /**
   * Global refresh function for modal buttons
   */
  window.fixImportantStarredRefresh = function(type) {
    console.log(`Fix Important and Starred Lists: Refreshing ${type} emails...`);
    loadAndDisplayEmails(type);
  };
  
  // Initialize when loaded
  initialize();
  
  console.log('Fix Important and Starred Lists: Frontend loaded successfully');
})();