/**
 * JIRA Card Interface Frontend
 * Opens a dedicated page showing parsed JIRA cards from Akify emails.
 */

(function () {
  if (!window.EmailAssistant) {
    console.error('JIRA Card Interface: EmailAssistant API not available');
    return;
  }

  const API = window.EmailAssistant;

  function openJiraCardsPage() {
    try {
      window.open('/jira-card-interface', '_blank', 'noopener');
    } catch (error) {
      console.error('JIRA Card Interface: failed to open page', error);
      API.showError('Failed to open JIRA Cards page.');
    }
  }

  function initialize() {
    API.addHeaderButton('JIRA Cards', openJiraCardsPage, {
      className: 'generate-btn'
    });
  }

  initialize();
  console.log('JIRA Card Interface: Frontend loaded');
})();
