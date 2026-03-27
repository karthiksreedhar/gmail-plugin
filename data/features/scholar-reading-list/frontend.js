/**
 * Scholar Reading List Frontend
 * Creates a reading list from Google Scholar articles, summarizing key takeaways for efficient skimming.
 */

(function() {
  console.log('Scholar Reading List: Frontend loading...');

  if (!window.EmailAssistant) {
    console.error('Scholar Reading List: EmailAssistant API not available');
    return;
  }

  const API = window.EmailAssistant;

  let readingList = [];

  async function initialize() {
    try {
      API.addHeaderButton('Scholar Reading List', showReadingListModal, {
        className: 'btn btn-primary',
        style: { marginRight: '12px' }
      });

      API.addEmailAction('Add to Reading List', addToReadingList);

      API.on('emailsLoaded', refreshReadingList);

      console.log('Scholar Reading List: Frontend initialized successfully');
    } catch (error) {
      console.error('Scholar Reading List: Initialization failed:', error);
    }
  }

  async function addToReadingList(email) {
    try {
      API.showModal('<div style="padding: 20px;">Adding to reading list...</div>', 'Scholar Reading List');

      const response = await API.apiCall('/api/scholar-reading-list/add-article', {
        method: 'POST',
        body: {
          emailId: email.id,
          subject: email.subject,
          from: email.from
        }
      });

      if (response.success) {
        API.showSuccess('Article added to reading list!');
        await refreshReadingList();
      } else {
        API.showError('Failed to add article: ' + response.error);
      }
    } catch (error) {
      API.showError('Failed to add article: ' + error.message);
    } finally {
      setTimeout(() => {
        const modal = document.querySelector('.modal');
        if (modal) {
          modal.remove();
        }
      }, 1000);
    }
  }

  async function refreshReadingList() {
    try {
      const response = await API.apiCall('/api/scholar-reading-list/get-reading-list', {
        method: 'GET'
      });

      if (response.success) {
        readingList = response.data || [];
      } else {
        API.showError('Failed to refresh reading list: ' + response.error);
        readingList = [];
      }
    } catch (error) {
      API.showError('Failed to refresh reading list: ' + error.message);
      readingList = [];
    }
  }

  function showReadingListModal() {
    let content = '<div style="padding: 20px;">';

    if (readingList.length === 0) {
      content += '<p>Your reading list is empty.</p>';
    } else {
      content += '<ul>';
      readingList.forEach(item => {
        content += `<li>
                      <strong>${item.subject}</strong><br>
                      <em>${item.from}</em><br>
                      Summary: ${item.summary || 'No summary available'}<br>
                      <button class="btn btn-sm btn-danger" onclick="window.removeFromReadingList('${item.emailId}')">Remove</button>
                    </li>`;
      });
      content += '</ul>';
    }

    content += `
      <div style="text-align: center; margin-top: 20px;">
        <button class="btn btn-secondary" onclick="this.closest('.modal').remove()">Close</button>
      </div>
    </div>`;

    API.showModal(content, 'Scholar Reading List');
  }

  window.removeFromReadingList = async function(emailId) {
    try {
      API.showModal('<div style="padding: 20px;">Removing from reading list...</div>', 'Scholar Reading List');

      const response = await API.apiCall('/api/scholar-reading-list/remove-article', {
        method: 'POST',
        body: { emailId: emailId }
      });

      if (response.success) {
        API.showSuccess('Article removed from reading list!');
        await refreshReadingList();
        showReadingListModal(); // Refresh the modal content
      } else {
        API.showError('Failed to remove article: ' + response.error);
      }
    } catch (error) {
      API.showError('Failed to remove article: ' + error.message);
    } finally {
      setTimeout(() => {
        const modal = document.querySelector('.modal');
        if (modal) {
          modal.remove();
        }
      }, 1000);
    }
  };

  initialize();

  console.log('Scholar Reading List: Frontend loaded successfully');
})();