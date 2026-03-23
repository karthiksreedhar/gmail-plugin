/**
 * Summarize Email Entry Frontend
 * Moves the summarize button to be next to each email entry and fixes the 'Failed to summarize emails' error.
 */

(function() {
  console.log('Summarize Email Entry: Frontend loading...');

  if (!window.EmailAssistant) {
    console.error('Summarize Email Entry: EmailAssistant API not available');
    return;
  }

  const API = window.EmailAssistant;

  function summarizeEmail(email) {
    if (!email || !email.id) {
      API.showError('Summarize Email Entry: Invalid email data.');
      return;
    }

    API.showModal('<div style="text-align: center;">Loading summary...</div>', 'Email Summary');

    API.apiCall('/api/aryan-test-email-entry/summarize', {
      method: 'POST',
      body: { emailId: email.id }
    })
    .then(response => {
      if (response.success) {
        const summary = response.data.summary;
        const todos = response.data.todos;

        const content = `
          <div style="padding: 20px;">
            <p><strong>Summary:</strong> ${summary}</p>
            <p><strong>TODOs:</strong></p>
            <ul>
              ${todos.length > 0 ? todos.map(todo => `<li>${todo}</li>`).join('') : '<li>None</li>'}
            </ul>
            <div style="text-align: center; margin-top: 20px;">
              <button class="btn btn-secondary" onclick="this.closest('.modal').remove()">Close</button>
            </div>
          </div>
        `;
        API.showModal(content, 'Email Summary');
      } else {
        API.showError('Summarize Email Entry: Failed to summarize email: ' + response.error);
      }
    })
    .catch(error => {
      console.error('Summarize Email Entry: Error summarizing email:', error);
      API.showError('Summarize Email Entry: Failed to summarize email.');
    });
  }

  function addSummarizeButtons() {
    try {
      // Remove existing buttons first to prevent duplicates
      const existingButtons = document.querySelectorAll('.summarize-email-btn');
      existingButtons.forEach(btn => btn.remove());

      const emailItems = document.querySelectorAll('.email-item');

      emailItems.forEach((emailItem) => {
        const actionsContainer = emailItem.querySelector('.email-actions');
        if (!actionsContainer) return;

        const emailData = extractEmailData(emailItem);

        const summarizeButton = document.createElement('button');
        summarizeButton.className = 'summarize-email-btn';
        summarizeButton.textContent = 'Summarize';
        summarizeButton.style.cssText = `
          background: #007bff;
          color: white;
          border: none;
          padding: 8px 12px;
          border-radius: 4px;
          cursor: pointer;
          font-size: 14px;
          margin-right: 8px;
        `;

        summarizeButton.addEventListener('click', (e) => {
          e.stopPropagation();
          summarizeEmail(emailData);
        });

        const deleteBtn = actionsContainer.querySelector('.delete-thread-btn');
        if (deleteBtn) {
          actionsContainer.insertBefore(summarizeButton, deleteBtn);
        } else {
          actionsContainer.appendChild(summarizeButton);
        }
      });
    } catch (error) {
      console.error('Summarize Email Entry: Error adding summarize buttons:', error);
    }
  }

  function extractEmailData(emailItem) {
    const fromElement = emailItem.querySelector('.email-from');
    const subjectElement = emailItem.querySelector('.email-subject');
    const dateElement = emailItem.querySelector('.email-date');
    const categoryPills = emailItem.querySelectorAll('.email-category');

    const fromText = fromElement ? fromElement.textContent.trim() : '';
    const subject = subjectElement ? subjectElement.textContent.trim() : '';
    const date = dateElement ? dateElement.textContent.trim() : '';
    const categories = Array.from(categoryPills).map(pill => pill.textContent.trim());

    let senderName = fromText;
    let senderEmail = fromText;

    const emailMatch = fromText.match(/^([^<]+)<([^>]+)>/);
    if (emailMatch) {
      senderName = emailMatch[1].trim();
      senderEmail = emailMatch[2].trim();
    } else if (fromText.includes('@')) {
      senderEmail = fromText;
      senderName = fromText.split('@')[0];
    }

    return {
      senderName,
      senderEmail,
      subject,
      date,
      categories,
      from: fromText,
      id: emailItem.onclick.toString().match(/openEmailThread\('([^']+)'\)/)?.[1] || null
    };
  }

  function initialize() {
    API.on('emailsLoaded', addSummarizeButtons);

    setTimeout(() => addSummarizeButtons(), 100);

    setInterval(() => addSummarizeButtons(), 2000);

    if (typeof window.displayEmails === 'function') {
      const originalDisplayEmails = window.displayEmails;
      window.displayEmails = async function(...args) {
        const result = await originalDisplayEmails.apply(this, args);
        setTimeout(() => addSummarizeButtons(), 50);
        return result;
      };
    }
  }

  initialize();

  console.log('Summarize Email Entry: Frontend loaded successfully');
})();