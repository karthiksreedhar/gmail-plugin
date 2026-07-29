/**
 * Test Button Frontend
 * Adds a "test" button to the top (header) of the UI. When clicked, it shows
 * a popup (modal) containing the message "Feature test".
 */

(function() {
  console.log('Test Button: Frontend loading...');

  if (!window.EmailAssistant) {
    console.error('Test Button: EmailAssistant API not available');
    return;
  }

  const API = window.EmailAssistant;

  // Show the popup with the required message.
  function showTestPopup() {
    const content = `
      <div style="padding: 10px 0; text-align: center;">
        <p style="font-size: 16px; margin: 0;">Feature test</p>
      </div>
    `;
    API.showModal(content, 'Test');
  }

  // Add the "test" button to the header action bar.
  function initialize() {
    try {
      API.addHeaderButton('test', showTestPopup, {
        className: 'btn btn-primary',
        style: { marginRight: '12px' }
      });
      console.log('Test Button: Frontend initialized successfully');
    } catch (error) {
      console.error('Test Button: Initialization failed:', error);
    }
  }

  initialize();

  console.log('Test Button: Frontend loaded successfully');
})();
