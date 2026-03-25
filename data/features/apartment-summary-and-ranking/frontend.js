/**
 * Apartment Email Summary and Ranking Frontend
 * Summarizes apartment listings in the 'Apartments' folder, ranks them by price, and summarizes neighborhood availability.
 */

(function() {
  console.log('Apartment Email Summary and Ranking: Frontend loading...');

  if (!window.EmailAssistant) {
    console.error('Apartment Email Summary and Ranking: EmailAssistant API not available');
    return;
  }

  const API = window.EmailAssistant;

  // Function to fetch and display apartment summary
  async function displayApartmentSummary() {
    try {
      API.showModal('<div style="text-align: center;">Loading apartment summary...</div>', 'Apartment Summary');

      const response = await API.apiCall('/api/apartment-summary-and-ranking/summary', { method: 'GET' });

      if (response.success) {
        const summaryData = response.data;
        let summaryContent = `
          <div style="padding: 20px;">
            <h3>Apartment Summary</h3>
            ${summaryData.ranking ? `<h4>Price Ranking:</h4><p>${summaryData.ranking}</p>` : ''}
            ${summaryData.neighborhoodSummary ? `<h4>Neighborhood Availability:</h4><p>${summaryData.neighborhoodSummary}</p>` : ''}
            <div style="text-align: center; margin-top: 20px;">
              <button class="btn btn-secondary" onclick="this.closest('.modal').remove()">Close</button>
            </div>
          </div>
        `;
        API.showModal(summaryContent, 'Apartment Summary');
      } else {
        API.showError('Failed to fetch apartment summary: ' + response.error);
        API.showModal('<div style="text-align: center;">Failed to load apartment summary.</div>', 'Apartment Summary');
      }
    } catch (error) {
      console.error('Apartment Email Summary and Ranking: Error fetching summary:', error);
      API.showError('Failed to fetch apartment summary.');
      API.showModal('<div style="text-align: center;">Failed to load apartment summary.</div>', 'Apartment Summary');
    }
  }

  // Add header button
  API.addHeaderButton('Apartment Summary', displayApartmentSummary, {
    className: 'btn btn-primary',
    style: { marginRight: '12px' }
  });

  console.log('Apartment Email Summary and Ranking: Frontend loaded successfully');
})();