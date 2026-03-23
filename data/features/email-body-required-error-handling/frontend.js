/**
 * Email Body Required Error Handling Frontend
 * Improves error handling when the email body is missing during summarization.
 */

(function() {
  console.log('Email Body Required Error Handling: Frontend loading...');

  if (!window.EmailAssistant) {
    console.error('Email Body Required Error Handling: EmailAssistant API not available');
    return;
  }

  const API = window.EmailAssistant;

  /**
   * Handles the summarization process, including error handling for missing email bodies.
   * @param {object} email - The email object.
   */
  async function handleSummarizeEmail(email) {
    if (!email) {
      API.showError('Email object is missing.');
      return;
    }

    API.showModal('<div style="text-align: center;">Summarizing email...<br><img src="https://i.imgur.com/Tkzx1J4.gif" width="50"></div>', 'Summarizing...');

    try {
      const response = await API.apiCall('/api/email-body-required-error-handling/summarize', {
        method: 'POST',
        body: { emailId: email.id }
      });

      document.querySelector('.modal').remove(); // Close loading modal

      if (response.success) {
        API.showSuccess('Email summarized successfully!');
        API.showModal(`<div style="padding: 20px;">${response.data.summary}</div>`, 'Summary');
      } else {
        API.showError(`Failed to summarize email: ${response.error}`);
      }
    } catch (error) {
      console.error('Email Body Required Error Handling: Error during summarization:', error);
      document.querySelector('.modal').remove(); // Close loading modal
      API.showError(`Failed to summarize email: ${error.message || 'Unknown error'}`);
    }
  }

  /**
   * Adds a "Summarize" action to the email context menu.
   */
  function addSummarizeAction() {
    API.addEmailAction('Summarize', handleSummarizeEmail);
  }

  /**
   * Initializes the frontend by adding the "Summarize" action.
   */
  function initialize() {
    addSummarizeAction();
    console.log('Email Body Required Error Handling: Frontend initialized successfully');
  }

  // Initialize when loaded
  initialize();

  console.log('Email Body Required Error Handling: Frontend loaded successfully');
})();