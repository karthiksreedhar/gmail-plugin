/**
 * Email Summarizer and ToDo Extractor Frontend
 * Adds a 'Summarize' button to each email thread that, when clicked, opens a popup with a one-sentence summary and a list of extracted ToDos.
 */

(function() {
  console.log('Email Summarizer and ToDo Extractor: Frontend loading...');

  if (!window.EmailAssistant) {
    console.error('Email Summarizer and ToDo Extractor: EmailAssistant API not available');
    return;
  }

  const API = window.EmailAssistant;

  function summarizeEmail(email) {
    if (!email) {
      API.showError('No email data available.');
      return;
    }

    API.showModal('<div style="text-align: center;">Loading summary...</div>', 'Email Summary');

    API.apiCall('/api/email-summarizer-and-todo-extractor/summarize', {
      method: 'POST',
      body: { emailId: email.id }
    })
    .then(response => {
      if (response.success) {
        const summary = response.data.summary || 'No summary available.';
        const todos = response.data.todos || [];

        let todosHtml = '<ul>';
        if (todos.length > 0) {
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
            <h4>ToDos:</h4>
            ${todosHtml}
          </div>
        `;

        API.showModal(modalContent, 'Email Summary');
      } else {
        API.showError('Failed to summarize email: ' + response.error);
      }
    })
    .catch(error => {
      console.error('Email Summarizer and ToDo Extractor: Error summarizing email:', error);
      API.showError('Failed to summarize email.');
    });
  }

  function addSummarizeButton() {
    try {
      const existingButtons = document.querySelectorAll('.summarize-email-btn');
      existingButtons.forEach(btn => btn.remove());

      const emailItems = document.querySelectorAll('.email-item');

      emailItems.forEach((emailItem) => {
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

        summarizeButton.addEventListener('click', (e) => {
          e.stopPropagation();
          const emailData = extractEmailData(emailItem);
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
      console.error('Email Summarizer and ToDo Extractor: Error adding summarize button:', error);
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
      from: fromText
    };
  }

  function initialize() {
    API.on('emailsLoaded', addSummarizeButton);
    setTimeout(() => addSummarizeButton(), 100);
    setInterval(() => addSummarizeButton(), 2000);

    if (typeof window.displayEmails === 'function') {
      const originalDisplayEmails = window.displayEmails;
      window.displayEmails = async function(...args) {
        const result = await originalDisplayEmails.apply(this, args);
        setTimeout(() => addSummarizeButton(), 50);
        return result;
      };
    }
  }

  initialize();

  console.log('Email Summarizer and ToDo Extractor: Frontend loaded successfully');
})();