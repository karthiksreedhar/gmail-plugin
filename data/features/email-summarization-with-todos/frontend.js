/**
 * Email Summarization with To-Do Extraction Frontend
 * Adds a 'Summarize' button to each email thread that generates a one-sentence summary and extracts to-do items using Gemini.
 */

(function() {
  console.log('Email Summarization with To-Do Extraction: Frontend loading...');

  if (!window.EmailAssistant) {
    console.error('Email Summarization with To-Do Extraction: EmailAssistant API not available');
    return;
  }

  const API = window.EmailAssistant;

  // Function to summarize email and extract todos
  async function summarizeEmail(email) {
    try {
      API.showModal('<div style="text-align: center;">Summarizing email...<br><img src="https://upload.wikimedia.org/wikipedia/commons/b/b1/Loading_icon.gif" width="50"></div>', 'Summarizing...');

      const response = await API.apiCall('/api/email-summarization-with-todos/summarize', {
        method: 'POST',
        body: {
          emailId: email.id || '',
          emailBody: email.body || '',
          subject: email.subject || '',
          from: email.from || ''
        }
      });

      if (response.success) {
        const summary = response.data.summary;
        const todos = response.data.todos;

        let todosHtml = '<ul>';
        if (todos && todos.length > 0) {
          todos.forEach(todo => {
            todosHtml += `<li>${todo}</li>`;
          });
        } else {
          todosHtml += '<li>None</li>';
        }
        todosHtml += '</ul>';

        const modalContent = `
          <div style="padding: 20px;">
            <h4>Summary:</h4>
            <p>${summary}</p>
            <h4>To-Do Items:</h4>
            ${todosHtml}
          </div>
        `;

        API.showModal(modalContent, 'Email Summary and To-Dos');
      } else {
        API.showError('Failed to summarize email: ' + response.error);
      }
    } catch (error) {
      console.error('Email Summarization with To-Do Extraction: Error summarizing email:', error);
      API.showError('Failed to summarize email.');
    }
  }

  // Function to add the "Summarize" button to each email
  function addSummarizeButton() {
    try {
      // Remove existing buttons first to prevent duplicates
      const existingButtons = document.querySelectorAll('.summarize-email-btn');
      existingButtons.forEach(btn => btn.remove());

      const emailItems = document.querySelectorAll('.email-item');

      emailItems.forEach(emailItem => {
        const actionsContainer = emailItem.querySelector('.email-actions');
        if (!actionsContainer) return;

        const summarizeButton = document.createElement('button');
        summarizeButton.className = 'summarize-email-btn';
        summarizeButton.textContent = 'Summarize';
        summarizeButton.style.cssText = `
          background: #6c757d;
          color: white;
          border: none;
          padding: 8px 12px;
          border-radius: 4px;
          cursor: pointer;
          font-size: 14px;
          margin-right: 8px;
        `;

        summarizeButton.addEventListener('click', async (e) => {
          e.stopPropagation(); // Prevent email from opening
          const emailData = extractEmailData(emailItem);
          await summarizeEmail(emailData);
        });

        const deleteBtn = actionsContainer.querySelector('.delete-thread-btn');
        if (deleteBtn) {
          actionsContainer.insertBefore(summarizeButton, deleteBtn);
        } else {
          actionsContainer.appendChild(summarizeButton);
        }
      });
    } catch (error) {
      console.error('Email Summarization with To-Do Extraction: Error adding summarize button:', error);
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

    // Parse sender name and email from "Name <email@domain.com>" format
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

    let emailId = '';
    const notesPreview = emailItem.querySelector('.notes-preview[data-email-notes]');
    if (notesPreview) {
      emailId = String(notesPreview.getAttribute('data-email-notes') || '').trim();
    }
    if (!emailId) {
      const deleteBtn = emailItem.querySelector('.delete-thread-btn');
      const onclickRaw = deleteBtn ? String(deleteBtn.getAttribute('onclick') || '') : '';
      const idMatch = onclickRaw.match(/deleteEmailThread\('([^']+)'/);
      if (idMatch && idMatch[1]) {
        emailId = idMatch[1];
      }
    }

    return {
      id: emailId,
      senderName,
      senderEmail,
      subject,
      date,
      categories,
      from: fromText
    };
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

  // Call initialize when the frontend loads
  initialize();

  console.log('Email Summarization with To-Do Extraction: Frontend loaded successfully');
})();
