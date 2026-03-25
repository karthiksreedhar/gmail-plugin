/**
 * Apartment Summary And Ranking Frontend
 * Adds a top header button that opens a dedicated apartment ranking page.
 */

(function () {
  if (!window.EmailAssistant) {
    console.error('Apartment Summary And Ranking: EmailAssistant API not available');
    return;
  }

  const API = window.EmailAssistant;

  function openPage() {
    try {
      window.open('/apartment-summary-and-ranking', '_blank', 'noopener');
    } catch (error) {
      console.error('Apartment Summary And Ranking: failed to open page', error);
      API.showError('Failed to open Apartment Rankings.');
    }
  }

  function initialize() {
    API.addHeaderButton('Apartment Rankings', openPage, {
      className: 'generate-btn'
    });
  }

  initialize();
  console.log('Apartment Summary And Ranking: Frontend loaded');
})();

