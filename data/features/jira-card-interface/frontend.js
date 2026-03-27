/**
 * Jira Card Interface Frontend
 * Provides a dedicated interface within the Gmail plugin to view and manage Jira cards associated with the user's account.
 */

(function() {
  console.log('Jira Card Interface: Frontend loading...');

  if (!window.EmailAssistant) {
    console.error('Jira Card Interface: EmailAssistant API not available');
    return;
  }

  const API = window.EmailAssistant;

  let jiraCards = [];
  let loadingModal = null;

  // Initialize
  async function initialize() {
    try {
      // Add header button
      API.addHeaderButton('Jira Cards', showJiraCardsModal, {
        className: 'btn btn-primary',
        style: { marginRight: '12px' }
      });

      // Add email action (example)
      API.addEmailAction('Link to Jira Card', linkToJiraCard);

      // Load Jira cards on startup
      await loadJiraCards();

      console.log('Jira Card Interface: Frontend initialized successfully');
    } catch (error) {
      console.error('Jira Card Interface: Initialization failed:', error);
    }
  }

  // Load Jira cards from backend
  async function loadJiraCards() {
    try {
      showLoadingModal('Loading Jira Cards...');
      const response = await API.apiCall('/api/jira-card-interface/get-cards');
      if (response.success) {
        jiraCards = response.data || [];
      } else {
        API.showError('Failed to load Jira cards: ' + response.error);
      }
    } catch (error) {
      console.error('Jira Card Interface: Failed to load Jira cards:', error);
      API.showError('Failed to load Jira cards.');
    } finally {
      hideLoadingModal();
    }
  }

  // Show Jira cards modal
  function showJiraCardsModal() {
    let cardListHtml = '<p>No Jira cards found.</p>';
    if (jiraCards.length > 0) {
      cardListHtml = jiraCards.map(card => `
        <div style="border: 1px solid #ccc; padding: 10px; margin-bottom: 10px;">
          <h4>${card.key} - ${card.summary}</h4>
          <p>Status: ${card.status}</p>
          <a href="${card.url}" target="_blank">View in Jira</a>
        </div>
      `).join('');
    }

    const content = `
      <div style="padding: 20px;">
        <h3>Jira Cards for Akify</h3>
        ${cardListHtml}
        <div style="text-align: center; margin-top: 20px;">
          <button class="btn btn-secondary" onclick="this.closest('.modal').remove()">Close</button>
          <button class="btn btn-primary" onclick="window.jiraCardInterfaceRefresh()">Refresh</button>
        </div>
      </div>
    `;

    API.showModal(content, 'Jira Cards');
  }

  // Link to Jira card action
  async function linkToJiraCard(email) {
    const cardKey = prompt('Enter Jira Card Key:');
    if (cardKey) {
      try {
        showLoadingModal('Linking to Jira Card...');
        const response = await API.apiCall('/api/jira-card-interface/link-email', {
          method: 'POST',
          body: { emailId: email.id, cardKey: cardKey }
        });

        if (response.success) {
          API.showSuccess('Email linked to Jira card successfully!');
        } else {
          API.showError('Failed to link email: ' + response.error);
        }
      } catch (error) {
        console.error('Jira Card Interface: Failed to link email:', error);
        API.showError('Failed to link email.');
      } finally {
        hideLoadingModal();
      }
    }
  }

  // Show loading modal
  function showLoadingModal(message) {
    const content = `
      <div style="padding: 20px; text-align: center;">
        <p>${message}</p>
        <div class="spinner-border" role="status">
          <span class="visually-hidden">Loading...</span>
        </div>
      </div>
    `;
    loadingModal = API.showModal(content, 'Loading...');
  }

  // Hide loading modal
  function hideLoadingModal() {
    if (loadingModal) {
      const modalElement = document.querySelector('.modal');
      if (modalElement) {
        modalElement.remove();
      }
      loadingModal = null;
    }
  }

  // Global function for modal buttons
  window.jiraCardInterfaceRefresh = async function() {
    const modalElement = document.querySelector('.modal');
    if (modalElement) {
      modalElement.remove();
    }
    await loadJiraCards();
    showJiraCardsModal();
  };

  // Initialize when loaded
  initialize();

  console.log('Jira Card Interface: Frontend loaded successfully');
})();