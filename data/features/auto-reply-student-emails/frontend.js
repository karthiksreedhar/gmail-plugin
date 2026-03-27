/**
 * Automated Student Email Responses Frontend
 * Automatically replies to student emails regarding Slack issues and late submissions/extensions.
 */

(function() {
  console.log('auto-reply-student-emails: Frontend loading...');

  if (!window.EmailAssistant) {
    console.error('auto-reply-student-emails: EmailAssistant API not available');
    return;
  }

  const API = window.EmailAssistant;

  // Function to process emails and send automated replies
  async function processStudentEmails() {
    try {
      API.showModal('<div style="text-align: center;">Processing student emails...<br><img src="https://i.imgur.com/Tkzx1J1.gif" width="50"></div>', 'Automated Replies');

      const emails = API.getEmails();
      if (!emails || emails.length === 0) {
        API.showWarning('No emails found to process.');
        API.showModal('', null); // Close the modal
        return;
      }

      const response = await API.apiCall('/api/auto-reply-student-emails/process-emails', {
        method: 'POST',
        body: { emails: emails }
      });

      API.showModal('', null); // Close the modal

      if (response.success) {
        API.showSuccess(`Successfully processed ${response.data.processedCount} emails.`);
        API.refreshEmails(); // Refresh the email list to reflect changes
      } else {
        API.showError(`Failed to process emails: ${response.error}`);
      }
    } catch (error) {
      console.error('auto-reply-student-emails: Error processing emails:', error);
      API.showError('An unexpected error occurred while processing emails.');
      API.showModal('', null); // Ensure modal is closed on error
    }
  }

  // Add a header button to trigger the email processing
  API.addHeaderButton('Auto-Reply Students', processStudentEmails, {
    className: 'btn btn-primary',
    style: { marginRight: '10px' }
  });

  // Add an email action to process a single email
  API.addEmailAction('Auto-Reply', async (email) => {
    try {
      API.showModal('<div style="text-align: center;">Processing email...<br><img src="https://i.imgur.com/Tkzx1J1.gif" width="50"></div>', 'Automated Reply');

      const response = await API.apiCall('/api/auto-reply-student-emails/process-email', {
        method: 'POST',
        body: { email: email }
      });

      API.showModal('', null); // Close the modal

      if (response.success) {
        API.showSuccess('Successfully processed email.');
        API.refreshEmails(); // Refresh the email list to reflect changes
      } else {
        API.showError(`Failed to process email: ${response.error}`);
      }
    } catch (error) {
      console.error('auto-reply-student-emails: Error processing single email:', error);
      API.showError('An unexpected error occurred while processing the email.');
      API.showModal('', null); // Ensure modal is closed on error
    }
  });

  console.log('auto-reply-student-emails: Frontend loaded successfully');
})();