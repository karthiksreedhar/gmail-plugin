/**
 * Updated Test Frontend
 * Adds an "updated-test" button to the top (header) of the UI. When clicked,
 * it shows a popup (modal) containing the message "claude-test".
 */

(function() {
  console.log('Updated Test: Frontend loading...');

  if (!window.EmailAssistant) {
    console.error('Updated Test: EmailAssistant API not available');
    return;
  }

  const API = window.EmailAssistant;

  // Show the popup with the required message.
  function showUpdatedTestPopup() {
    const content = `
      <div style="padding: 10px 0; text-align: center;">
        <p style="font-size: 16px; margin: 0;">claude-test</p>
      </div>
    `;
    API.showModal(content, 'Updated Test');
  }

  // Add the "updated-test" button to the header action bar.
  function initialize() {
    try {
      API.addHeaderButton('updated-test', showUpdatedTestPopup, {
        className: 'btn btn-primary',
        style: { marginRight: '12px' }
      });
      console.log('Updated Test: Frontend initialized successfully');
    } catch (error) {
      console.error('Updated Test: Initialization failed:', error);
    }
  }

  initialize();

  console.log('Updated Test: Frontend loaded successfully');
})();
