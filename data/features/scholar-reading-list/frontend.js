/**
 * Scholar Reading List Frontend
 * Opens a dedicated page for research/publication reading feed.
 */

(function () {
  if (!window.EmailAssistant) {
    console.error('Scholar Reading List: EmailAssistant API not available');
    return;
  }

  const API = window.EmailAssistant;

  function openReadingListPage() {
    try {
      window.open('/scholar-reading-list', '_blank', 'noopener');
    } catch (error) {
      console.error('Scholar Reading List: failed to open page', error);
      API.showError('Failed to open Scholar Reading List.');
    }
  }

  function initialize() {
    API.addHeaderButton('Scholar Reading List', openReadingListPage, {
      className: 'generate-btn'
    });
  }

  initialize();
  console.log('Scholar Reading List: Frontend loaded');
})();
