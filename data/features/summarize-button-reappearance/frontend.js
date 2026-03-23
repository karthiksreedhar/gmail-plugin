/**
 * Restore Summarize Button Frontend
 * Restores the summarize button functionality.
 */

(function() {
  console.log('summarize-button-reappearance: Frontend loading...');

  if (!window.EmailAssistant) {
    console.error('summarize-button-reappearance: EmailAssistant API not available');
    return;
  }

  const API = window.EmailAssistant;

  function addSummarizeButton() {
    API.addHeaderButton('Summarize Emails', handleSummarizeEmails, {
      className: 'btn btn-primary',
      style: { marginRight: '12px' }
    });

    API.addEmailAction('Summarize', handleSummarizeEmail);
  }

  async function handleSummarizeEmails() {
    API.showModal('<div style="text-align: center;">Summarizing emails... <div class="spinner-border" role="status"><span class="visually-hidden">Loading...</span></div></div>', 'Summarizing');

    try {
      const response = await API.apiCall('/api/summarize-button-reappearance/summarize-all', {
        method: 'POST',
        body: {}
      });

      if (response.success) {
        API.showSuccess('Emails summarized successfully!');
        API.showModal('<div style="text-align: center;">Summarization complete.</div>', 'Summary');
      } else {
        API.showError('Failed to summarize emails: ' + response.error);
        API.showModal('<div style="text-align: center;">Summarization failed.</div>', 'Summary');
      }
    } catch (error) {
      console.error('summarize-button-reappearance: Error summarizing emails:', error);
      API.showError('Failed to summarize emails.');
      API.showModal('<div style="text-align: center;">Summarization failed.</div>', 'Summary');
    }
  }

  async function handleSummarizeEmail(email) {
    API.showModal('<div style="text-align: center;">Summarizing email... <div class="spinner-border" role="status"><span class="visually-hidden">Loading...</span></div></div>', 'Summarizing');

    try {
      const response = await API.apiCall('/api/summarize-button-reappearance/summarize-email', {
        method: 'POST',
        body: { emailId: email.id }
      });

      if (response.success) {
        API.showSuccess('Email summarized successfully!');
        API.showModal(`<div style="text-align: center;">${response.summary}</div>`, 'Summary');
      } else {
        API.showError('Failed to summarize email: ' + response.error);
        API.showModal('<div style="text-align: center;">Summarization failed.</div>', 'Summary');
      }
    } catch (error) {
      console.error('summarize-button-reappearance: Error summarizing email:', error);
      API.showError('Failed to summarize email.');
      API.showModal('<div style="text-align: center;">Summarization failed.</div>', 'Summary');
    }
  }

  function initialize() {
    addSummarizeButton();

    API.on('emailsLoaded', addSummarizeButton);
  }

  initialize();

  console.log('summarize-button-reappearance: Frontend loaded successfully');
})();