/**
 * Robotics Talk Highlighter Frontend
 * Highlights emails related to robotics talks based on keywords and user-defined rules.
 */

(function() {
  console.log('Robotics Talk Highlighter: Frontend loading...');

  if (!window.EmailAssistant) {
    console.error('Robotics Talk Highlighter: EmailAssistant API not available');
    return;
  }

  const API = window.EmailAssistant;

  // State
  let keywords = ['robotics', 'robot', 'automation', 'AI', 'motion planning', 'SLAM', 'computer vision', 'ROS', 'sensors', 'actuators']; // Default keywords
  let highlightedEmails = [];

  // Initialize
  async function initialize() {
    try {
      // Load keywords from backend
      await loadKeywords();

      // Add header button
      API.addHeaderButton('Robotics Talks', showSettingsModal, {
        className: 'btn btn-primary',
        style: { marginRight: '12px' }
      });

      // Add email action
      API.addEmailAction('Highlight Robotics Talk', highlightEmail);

      // Listen for emails loaded event
      API.on('emailsLoaded', highlightRoboticsTalks);

      // Initial highlight
      highlightRoboticsTalks();

      console.log('Robotics Talk Highlighter: Frontend loaded successfully');
    } catch (error) {
      console.error('Robotics Talk Highlighter: Initialization failed:', error);
      API.showError('Failed to initialize Robotics Talk Highlighter');
    }
  }

  // Load keywords from backend
  async function loadKeywords() {
    try {
      const response = await API.apiCall('/api/robotics-talk-highlighter/keywords', { method: 'GET' });
      if (response.success) {
        keywords = response.keywords || keywords;
      } else {
        API.showError('Failed to load keywords: ' + response.error);
      }
    } catch (error) {
      console.error('Robotics Talk Highlighter: Failed to load keywords:', error);
      API.showError('Failed to load keywords');
    }
  }

  // Save keywords to backend
  async function saveKeywords(newKeywords) {
    try {
      const response = await API.apiCall('/api/robotics-talk-highlighter/keywords', {
        method: 'POST',
        body: { keywords: newKeywords }
      });
      if (response.success) {
        keywords = newKeywords;
        API.showSuccess('Keywords saved successfully!');
      } else {
        API.showError('Failed to save keywords: ' + response.error);
      }
    } catch (error) {
      console.error('Robotics Talk Highlighter: Failed to save keywords:', error);
      API.showError('Failed to save keywords');
    }
  }

  // Highlight emails based on keywords
  function highlightRoboticsTalks() {
    try {
      const emails = API.getEmails();
      if (!emails) return;

      emails.forEach(emailItem => {
        const emailData = extractEmailData(emailItem);
        const subject = emailData.subject.toLowerCase();
        const body = emailItem.textContent.toLowerCase(); // Use textContent for full content

        const isRoboticsTalk = keywords.some(keyword => subject.includes(keyword) || body.includes(keyword));

        if (isRoboticsTalk && !highlightedEmails.includes(emailData.senderEmail + emailData.subject)) {
          emailItem.style.border = '2px solid #ffc107'; // Highlight with yellow border
          highlightedEmails.push(emailData.senderEmail + emailData.subject);
        } else {
          emailItem.style.border = ''; // Remove highlight
        }
      });
    } catch (error) {
      console.error('Robotics Talk Highlighter: Error highlighting emails:', error);
    }
  }

  // Extract email data from DOM
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

  // Show settings modal
  function showSettingsModal() {
    const keywordList = keywords.map(keyword => `<li>${keyword}</li>`).join('');

    const content = `
      <div style="padding: 20px;">
        <h3>Robotics Talk Highlighter Settings</h3>
        <p>Keywords used to identify robotics talks:</p>
        <ul>${keywordList}</ul>
        <label for="new-keywords">New Keywords (comma-separated):</label>
        <input type="text" id="new-keywords" style="width: 100%; padding: 8px; margin-bottom: 10px;">
        <div style="text-align: center;">
          <button class="btn btn-secondary" onclick="this.closest('.modal').remove()">Close</button>
          <button class="btn btn-primary" onclick="window.saveRoboticsTalkKeywords()">Save</button>
        </div>
      </div>
    `;

    API.showModal(content, 'Robotics Talk Highlighter Settings');
  }

  // Save keywords (global function for modal button)
  window.saveRoboticsTalkKeywords = async function() {
    const newKeywordsInput = document.getElementById('new-keywords');
    const newKeywordsString = newKeywordsInput.value.trim();
    const newKeywords = newKeywordsString.split(',').map(keyword => keyword.trim()).filter(keyword => keyword !== '');

    if (newKeywords.length > 0) {
      await saveKeywords(newKeywords);
    } else {
      API.showWarning('No keywords entered.');
    }

    // Refresh highlighting
    highlightRoboticsTalks();

    // Close modal
    document.querySelector('.modal').remove();
  };

  // Highlight email action
  async function highlightEmail(email) {
    try {
      const emailItem = Array.from(document.querySelectorAll('.email-item')).find(item => {
        const emailData = extractEmailData(item);
        return emailData.senderEmail === email.originalFrom && emailData.subject === email.subject;
      });

      if (emailItem) {
        emailItem.style.border = '2px solid #ffc107';
        API.showSuccess('Email highlighted as a robotics talk.');
      } else {
        API.showError('Could not find email to highlight.');
      }
    } catch (error) {
      console.error('Robotics Talk Highlighter: Error highlighting email:', error);
      API.showError('Failed to highlight email.');
    }
  }

  // Initialize when loaded
  initialize();

  console.log('Robotics Talk Highlighter: Frontend loaded successfully');
})();