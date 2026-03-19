/**
 * Email Thread Summarizer Frontend
 * Adds a 'Summarize' button to each email thread that generates a short summary (max 3 sentences) and lists any identified TODOs.
 */

(function() {
  console.log('Email Thread Summarizer: Frontend loading...');

  if (!window.EmailAssistant) {
    console.error('Email Thread Summarizer: EmailAssistant API not available');
    return;
  }

  const API = window.EmailAssistant;

  function escapeHtml(text) {
    return String(text || '')
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#39;');
  }

  function getThreadIdFromEmailItem(emailItem) {
    if (!emailItem) return '';

    // Primary source: the delete button carries the thread/email id in inline onclick.
    const deleteBtn = emailItem.querySelector('.delete-thread-btn');
    const onclickAttr = deleteBtn ? String(deleteBtn.getAttribute('onclick') || '') : '';
    if (onclickAttr) {
      const match = onclickAttr.match(/deleteEmailThread\('([^']+)'/);
      if (match && match[1]) return match[1];
    }

    // Fallback: the id text appears in the date area.
    const idNode = emailItem.querySelector('.email-date span');
    if (idNode && idNode.textContent) return String(idNode.textContent).trim();

    return '';
  }

  // Function to summarize the email thread
  async function summarizeEmailThread(threadId) {
    try {
      if (!threadId) {
        API.showError('Missing thread ID for this email thread.');
        return;
      }

      // Show loading modal
      API.showModal(
        '<div style="text-align:center; padding:12px 0;">Summarizing email thread...</div>',
        'Summarizing...'
      );

      // Make API call to backend
      const response = await API.apiCall('/api/email-thread-summarizer/summarize', {
        method: 'POST',
        body: { threadId }
      });

      // Handle response
      if (response.success) {
        const summary = response.summary || response?.data?.summary || '';
        const todos = response.todos || response?.data?.todos || [];

        let modalContent = `
          <div style="padding: 20px;">
            <h4>Summary:</h4>
            <p>${escapeHtml(summary || 'No summary generated.')}</p>
            ${todos && todos.length > 0 ? `
              <h4>TODOs:</h4>
              <ul>
                ${todos.map(todo => `<li>${escapeHtml(todo)}</li>`).join('')}
              </ul>
            ` : ''}
            <div style="text-align: center; margin-top: 20px;">
              <button style="background:#1a73e8;color:#fff;border:none;border-radius:6px;padding:8px 14px;cursor:pointer;" onclick="this.closest('.modal').remove()">Close</button>
            </div>
          </div>
        `;

        API.showModal(modalContent, 'Email Thread Summary');
        API.showSuccess('Email thread summarized successfully!');
      } else {
        API.showError('Failed to summarize email thread: ' + response.error);
      }
    } catch (error) {
      console.error('Email Thread Summarizer: Error summarizing email thread:', error);
      API.showError('Failed to summarize email thread.');
    }
  }

  // Function to add the "Summarize" button to each email thread
  function addSummarizeButton() {
    try {
      // Remove existing buttons first to prevent duplicates
      const existingButtons = document.querySelectorAll('.summarize-thread-btn');
      existingButtons.forEach(btn => btn.remove());

      // Get all email items
      const emailItems = document.querySelectorAll('.email-item');

      emailItems.forEach((emailItem) => {
        const threadId = getThreadIdFromEmailItem(emailItem);
        if (!threadId) return;

        // Find the actions container
        const actionsContainer = emailItem.querySelector('.email-actions');
        if (!actionsContainer) return;

        // Create the "Summarize" button
        const summarizeButton = document.createElement('button');
        summarizeButton.className = 'summarize-thread-btn';
        summarizeButton.textContent = 'Summarize';
        summarizeButton.style.cssText = `
          background: #28a745;
          color: white;
          border: none;
          padding: 8px 12px;
          border-radius: 4px;
          cursor: pointer;
          font-size: 14px;
          margin-right: 8px;
        `;

        // Add click handler (prevent opening the email)
        summarizeButton.addEventListener('click', (e) => {
          e.stopPropagation(); // Prevent email from opening
          summarizeEmailThread(threadId);
        });

        // Insert before delete button
        const deleteBtn = actionsContainer.querySelector('.delete-thread-btn');
        if (deleteBtn) {
          actionsContainer.insertBefore(summarizeButton, deleteBtn);
        } else {
          actionsContainer.appendChild(summarizeButton);
        }
      });
    } catch (error) {
      console.error('Email Thread Summarizer: Error adding summarize button:', error);
    }
  }

  // Initialize the feature
  function initialize() {
    // Add buttons immediately (emails may already be loaded)
    setTimeout(() => addSummarizeButton(), 100);

    // Periodic refresh (most reliable for dynamic content)
    setInterval(() => addSummarizeButton(), 2000);

    // Hook into displayEmails if it exists
    if (typeof window.displayEmails === 'function') {
      const originalDisplayEmails = window.displayEmails;
      window.displayEmails = async function(...args) {
        const result = await originalDisplayEmails.apply(this, args);
        setTimeout(() => addSummarizeButton(), 50);
        return result;
      };
    }
  }

  // Initialize when loaded
  initialize();

  console.log('Email Thread Summarizer: Frontend loaded successfully');
})();
