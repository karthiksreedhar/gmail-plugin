/**
 * Detailed Summarization Error Handling Frontend
 * Improves error reporting for the email summarization feature.
 */

(function() {
  console.log('detailed-error-handling-summarize: Frontend loading...');

  if (!window.EmailAssistant) {
    console.error('detailed-error-handling-summarize: EmailAssistant API not available');
    return;
  }

  const API = window.EmailAssistant;

  // Function to summarize email with detailed error handling
  async function summarizeEmail(email) {
    if (!email) {
      API.showError('Summarize Email Entry: Email object is null.');
      return;
    }

    const emailId = email.id;

    if (!emailId) {
      API.showError('Summarize Email Entry: Email ID is missing.');
      return;
    }

    API.showModal('<div style="text-align: center;">Summarizing email...<br><div class="spinner-border" role="status"><span class="visually-hidden">Loading...</span></div></div>', 'Summarizing Email');

    try {
      const response = await API.apiCall('/api/detailed-error-handling-summarize/summarize', {
        method: 'POST',
        body: { emailId: emailId }
      });

      const modalElement = document.querySelector('.modal');
      if (modalElement) {
          modalElement.remove();
      }

      if (response.success) {
        API.showModal(`<div style="padding: 20px;">${response.data.summary}</div>`, 'Email Summary');
      } else {
        API.showError(`Summarize Email Entry: ${response.error}`);
      }
    } catch (error) {
      console.error('detailed-error-handling-summarize: Error during summarization:', error);
      API.showError(`Summarize Email Entry: An unexpected error occurred: ${error.message}`);
      const modalElement = document.querySelector('.modal');
      if (modalElement) {
          modalElement.remove();
      }
    }
  }

  // Add email action
  API.addEmailAction('Summarize (Detailed Error Handling)', summarizeEmail);

  console.log('detailed-error-handling-summarize: Frontend loaded successfully');
})();