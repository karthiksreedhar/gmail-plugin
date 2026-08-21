/**
 * Spend Dashboard Frontend
 * Adds a header button that opens the dedicated Spend Dashboard page.
 */

(function () {
  console.log('Spend Dashboard: Frontend loading...');

  if (!window.EmailAssistant) {
    console.error('Spend Dashboard: EmailAssistant API not available');
    return;
  }

  const API = window.EmailAssistant;

  function openDashboard() {
    try {
      window.open('/spend-dashboard', '_blank', 'noopener');
    } catch (error) {
      console.error('Spend Dashboard: failed to open page', error);
      API.showError('Failed to open Spend Dashboard.');
    }
  }

  function initialize() {
    API.addHeaderButton('Spend', openDashboard, {
      className: 'generate-btn'
    });
  }

  initialize();
  console.log('Spend Dashboard: Frontend loaded successfully');
})();
