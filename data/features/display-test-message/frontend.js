/**
 * Display Test Message Frontend
 * Adds a button that displays a test message when clicked.
 */

(function() {
  console.log('Display Test Message: Frontend loading...');

  if (!window.EmailAssistant) {
    console.error('Display Test Message: EmailAssistant API not available');
    return;
  }

  const API = window.EmailAssistant;

  function displayTestMessage() {
    API.showSuccess('New Feature added!');
  }

  function initialize() {
    API.addHeaderButton('Test', displayTestMessage, {
      className: 'btn btn-primary',
      style: { marginRight: '12px' }
    });
  }

  initialize();

  console.log('Display Test Message: Frontend loaded successfully');
})();