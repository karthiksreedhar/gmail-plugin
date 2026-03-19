/**
 * Add Test Button Frontend
 * Adds a 'Test' button next to the 'Open Feature Generator' button that displays a message on click.
 */

(function() {
  console.log('Add Test Button: Frontend loading...');

  if (!window.EmailAssistant) {
    console.error('Add Test Button: EmailAssistant API not available');
    return;
  }

  const API = window.EmailAssistant;

  function showTestMessage() {
    API.showModal('<div style="padding: 20px;">Demonstration of Feature Addition Workflow</div>', 'Test Message');
  }

  function initialize() {
    API.addHeaderButton('Test', showTestMessage, {
      className: 'btn btn-primary',
      style: { marginRight: '12px' }
    });

    console.log('Add Test Button: Frontend initialized successfully');
  }

  initialize();

  console.log('Add Test Button: Frontend loaded successfully');
})();