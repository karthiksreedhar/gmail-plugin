/**
 * Document Thread History Frontend
 * Opens a dedicated page listing document-related threads and PDF attachments.
 */

(function () {
  if (!window.EmailAssistant) {
    console.error('Document Thread History: EmailAssistant API not available');
    return;
  }

  const API = window.EmailAssistant;

  function openDocumentHistoryPage() {
    try {
      window.open('/document-thread-history', '_blank', 'noopener');
    } catch (error) {
      console.error('Document Thread History: failed to open page', error);
      API.showError('Failed to open Document Thread History page.');
    }
  }

  function initialize() {
    API.addHeaderButton('Document History', openDocumentHistoryPage, {
      className: 'generate-btn'
    });
  }

  initialize();
  console.log('Document Thread History: Frontend loaded');
})();
