/**
 * Add Test Button Frontend
 * Adds a 'TEST' button next to the 'Open Feature Generator' button that displays a message when clicked.
 */

(function() {
  console.log('Add Test Button: Frontend loading...');

  if (!window.EmailAssistant) {
    console.error('Add Test Button: EmailAssistant API not available');
    return;
  }

  const API = window.EmailAssistant;

  function showTestMessage() {
    API.showSuccess('NEW FEATURE ADDED!');
  }

  function initialize() {
    API.addHeaderButton('TEST', showTestMessage, {
      className: 'btn btn-primary',
      style: { marginRight: '12px' }
    });
  }

  initialize();

  console.log('Add Test Button: Frontend loaded successfully');
})();