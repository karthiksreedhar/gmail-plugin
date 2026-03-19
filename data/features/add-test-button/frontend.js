/**
 * Add Test Button Frontend
 * Adds a 'Test' button next to the 'Open Feature Generator' button that displays a popup when clicked.
 */

(function() {
  console.log('Add Test Button: Frontend loading...');

  if (!window.EmailAssistant) {
    console.error('Add Test Button: EmailAssistant API not available');
    return;
  }

  const API = window.EmailAssistant;

  function showTestModal() {
    const content = `
      <div style="padding: 20px;">
        <h3>Test Button</h3>
        <p>Flow works appropriately</p>
        <div style="text-align: center; margin-top: 20px;">
          <button class="btn btn-secondary" onclick="this.closest('.modal').remove()">Close</button>
        </div>
      </div>
    `;

    API.showModal(content, 'Test Result');
  }

  function initialize() {
    API.addHeaderButton('Test', showTestModal, {
      className: 'btn btn-primary',
      style: { marginRight: '12px' }
    });

    console.log('Add Test Button: Frontend initialized successfully');
  }

  initialize();

  console.log('Add Test Button: Frontend loaded successfully');
})();