/**
 * Deadline Email Prioritization Frontend
 * Prioritizes emails with deadlines within the next three days by moving them to the top of the inbox and highlighting them in yellow.
 */

(function() {
  console.log('Deadline Email Prioritization: Frontend loading...');

  if (!window.EmailAssistant) {
    console.error('Deadline Email Prioritization: EmailAssistant API not available');
    return;
  }

  const API = window.EmailAssistant;

  // Function to highlight emails with deadlines
  function highlightDeadlineEmails() {
    try {
      const emailItems = document.querySelectorAll('.email-item');

      emailItems.forEach(emailItem => {
        const subjectElement = emailItem.querySelector('.email-subject');
        const subject = subjectElement ? subjectElement.textContent.trim() : '';
        const fromElement = emailItem.querySelector('.email-from');
        const from = fromElement ? fromElement.textContent.trim() : '';

        // Extract email data
        const emailData = extractEmailData(emailItem);

        // Check if the email has already been highlighted
        if (emailItem.classList.contains('deadline-highlighted')) {
          return; // Skip if already highlighted
        }

        // Make API call to check for deadlines
        API.apiCall('/api/deadline-email-prioritization/check-deadline', {
          method: 'POST',
          body: { subject: emailData.subject, from: emailData.from }
        })
        .then(response => {
          if (response.success && response.hasDeadline) {
            // Highlight the email item
            emailItem.style.backgroundColor = 'yellow';
            emailItem.classList.add('deadline-highlighted');

            // Move the email to the top of the inbox
            const inbox = emailItem.parentNode;
            if (inbox && inbox.firstChild !== emailItem) {
              inbox.insertBefore(emailItem, inbox.firstChild);
            }
          }
        })
        .catch(error => {
          console.error('Deadline Email Prioritization: Error checking deadline:', error);
        });
      });
    } catch (error) {
      console.error('Deadline Email Prioritization: Error highlighting emails:', error);
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
    
    return {
      senderName,
      senderEmail,
      subject,
      date,
      categories,
      from: fromText
    };
  }

  // Function to add a header button (optional)
  function addHeaderButton() {
    API.addHeaderButton('Prioritize Deadlines', () => {
      highlightDeadlineEmails();
      API.showSuccess('Deadline prioritization applied.');
    }, { className: 'btn btn-primary' });
  }

  // Initialize the feature
  function initialize() {
    // Add header button
    addHeaderButton();

    // Highlight emails on load and refresh
    API.on('emailsLoaded', highlightDeadlineEmails);

    // Initial highlighting
    setTimeout(highlightDeadlineEmails, 500);

    // Periodic refresh
    setInterval(highlightDeadlineEmails, 3000);

    // Hook into displayEmails if it exists
    if (typeof window.displayEmails === 'function') {
      const originalDisplayEmails = window.displayEmails;
      window.displayEmails = async function(...args) {
        const result = await originalDisplayEmails.apply(this, args);
        setTimeout(() => highlightDeadlineEmails(), 50);
        return result;
      };
    }
  }

  // Initialize when the frontend is loaded
  initialize();

  console.log('Deadline Email Prioritization: Frontend loaded successfully');
})();