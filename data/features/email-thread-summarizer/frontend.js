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

  // Function to summarize the email thread
  async function summarizeEmailThread(emailId) {
    try {
      // Show loading modal
      API.showModal('<div style="text-align: center;">Summarizing email thread...<br><div class="spinner-border" role="status"><span class="visually-hidden">Loading...</span></div></div>', 'Summarizing...');

      // Make API call to backend
      const response = await API.apiCall('/api/email-thread-summarizer/summarize', {
        method: 'POST',
        body: { emailId: emailId }
      });

      // Handle response
      if (response.success) {
        const summary = response.summary;
        const todos = response.todos;

        let modalContent = `
          <div style="padding: 20px;">
            <h4>Summary:</h4>
            <p>${summary}</p>
            ${todos && todos.length > 0 ? `
              <h4>TODOs:</h4>
              <ul>
                ${todos.map(todo => `<li>${todo}</li>`).join('')}
              </ul>
            ` : ''}
            <div style="text-align: center; margin-top: 20px;">
              <button class="btn btn-primary" onclick="this.closest('.modal').remove()">Close</button>
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
        // Extract email data
        const emailId = emailItem.getAttribute('onclick').match(/openEmailThread\('([^']+)'\)/)[1];

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
          summarizeEmailThread(emailId);
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
    // 1. Listen for emailsLoaded event
    API.on('emailsLoaded', addSummarizeButton);

    // 2. Add buttons immediately (emails may already be loaded)
    setTimeout(() => addSummarizeButton(), 100);

    // 3. Periodic refresh (most reliable for dynamic content)
    setInterval(() => addSummarizeButton(), 2000);

    // 4. Hook into displayEmails if it exists
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