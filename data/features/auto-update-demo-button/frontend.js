/**
 * Auto-Update Demo Button Frontend
 * Adds a button next to the 'Open Feature Generator' button that displays a message demonstrating auto-updates.
 */

(function() {
  console.log('Auto-Update Demo Button: Frontend loading...');

  if (!window.EmailAssistant) {
    console.error('Auto-Update Demo Button: EmailAssistant API not available');
    return;
  }

  const API = window.EmailAssistant;

  function showDemoMessage() {
    API.showModal('<div style="padding: 20px;">Demonstration of auto-updates!</div>', 'Auto-Update Demo');
  }

  function initialize() {
    API.addHeaderButton('Test', showDemoMessage, {
      className: 'btn btn-secondary',
      style: { marginRight: '12px' }
    });
    console.log('Auto-Update Demo Button: Frontend initialized successfully');
  }

  initialize();

  console.log('Auto-Update Demo Button: Frontend loaded successfully');
})();