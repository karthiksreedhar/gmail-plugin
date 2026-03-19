/**
 * Test-2 Frontend
 * Adds a button that displays a popup when clicked.
 */

(function() {
  console.log('Test-2: Frontend loading...');

  if (!window.EmailAssistant) {
    console.error('Test-2: EmailAssistant API not available');
    return;
  }

  const API = window.EmailAssistant;

  function showTestModal() {
    const content = `
      <div style="padding: 20px;">
        <h3>Test</h3>
        <p>Flow works appropriately</p>
        <div style="text-align: center; margin-top: 20px;">
          <button class="btn btn-secondary" onclick="this.closest('.modal').remove()">Close</button>
        </div>
      </div>
    `;

    API.showModal(content, 'Test Popup');
  }

  function initialize() {
    API.addHeaderButton('Test', showTestModal, {
      className: 'btn btn-primary',
      style: { marginRight: '12px' }
    });

    console.log('Test-2: Frontend initialized successfully');
  }

  initialize();

  console.log('Test-2: Frontend loaded successfully');
})();