/**
 * Newsletter Article Tracker Frontend
 * Adds a top button that opens a dedicated newsletter article tracker page.
 */

(function () {
  if (!window.EmailAssistant) {
    console.error('Newsletter Article Tracker: EmailAssistant API not available');
    return;
  }

  const API = window.EmailAssistant;

  function openTrackerPage() {
    try {
      window.open('/newsletter-article-tracker', '_blank', 'noopener');
    } catch (error) {
      console.error('Newsletter Article Tracker: failed to open page', error);
      API.showError('Failed to open Newsletter Article Tracker.');
    }
  }

  function initialize() {
    API.addHeaderButton('Tracked Articles', openTrackerPage, {
      className: 'generate-btn'
    });
  }

  initialize();
  console.log('Newsletter Article Tracker: Frontend loaded');
})();
