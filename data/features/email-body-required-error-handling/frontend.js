/**
 * Email Body Required Error Handling Frontend
 * Improves error handling when the email body is missing during summarization, providing a more informative error message to the user.
 */

(function() {
  console.log('Email Body Required Error Handling: Frontend loading...');

  if (!window.EmailAssistant) {
    console.error('Email Body Required Error Handling: EmailAssistant API not available');
    return;
  }

  const API = window.EmailAssistant;

  function handleSummarizeError(emailId) {
    API.showError('Failed to summarize email: Email body is required');
    console.error(`Email Body Required Error Handling: Failed to summarize email ${emailId}: Email body is required`);
  }

  // Override the existing summarize function to handle the error
  const originalSummarizeEmail = window.summarizeEmail;

  if (originalSummarizeEmail) {
    window.summarizeEmail = async function(emailId) {
      try {
        API.showModal('<div style="text-align: center;">Loading summary...</div>', 'Summarizing Email');
        const emails = await API.getEmails();

        if (!emails || emails.length === 0) {
          handleSummarizeError(emailId);
          return;
        }

        const email = emails.find(e => e.id === emailId);

        if (!email || !email.body) {
          handleSummarizeError(emailId);
          return;
        }

        // Call the original function if the email body exists
        originalSummarizeEmail.call(this, emailId);

      } catch (error) {
        API.showError(`Failed to summarize email: ${error.message || error}`);
        console.error('Email Body Required Error Handling: Error during summarization:', error);
      } finally {
        API.showModal('', ''); // Close the modal
      }
    };
  } else {
    console.warn('Email Body Required Error Handling: Original summarizeEmail function not found.');
  }

  console.log('Email Body Required Error Handling: Frontend loaded successfully');
})();