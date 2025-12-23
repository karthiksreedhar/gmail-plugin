/**
 * Example Feature Frontend
 * Demonstrates how to create a client-side feature plugin
 */

(function() {
  console.log('Example Feature: Frontend loading...');
  
  // Wait for EmailAssistant API to be available
  if (!window.EmailAssistant) {
    console.error('Example Feature: EmailAssistant API not available');
    return;
  }
  
  const API = window.EmailAssistant;
  
  // Add a button to the header
  API.addHeaderButton('Example', async function() {
    console.log('Example Feature: Button clicked');
    
    try {
      // Fetch data from the backend
      const response = await API.apiCall('/api/example-feature/hello');
      
      // Show a modal with the response
      const content = `
        <div style="padding: 20px;">
          <h3 style="margin-bottom: 16px;">Example Feature Demo</h3>
          <p style="margin-bottom: 12px;"><strong>Message:</strong> ${response.message}</p>
          <p style="margin-bottom: 12px;"><strong>Current User:</strong> ${response.user}</p>
          <p style="margin-bottom: 12px;"><strong>Total Emails:</strong> ${API.getEmails().length}</p>
          <p style="margin-bottom: 12px;"><strong>Current Filter:</strong> ${API.getCurrentFilter()}</p>
          
          <div style="margin-top: 20px;">
            <button onclick="exampleFeatureAnalyze()" style="
              background: #4285f4;
              color: white;
              border: none;
              padding: 10px 20px;
              border-radius: 6px;
              cursor: pointer;
              font-size: 14px;
            ">Analyze Latest Email</button>
          </div>
          
          <div id="example-analysis-result" style="margin-top: 16px;"></div>
        </div>
      `;
      
      API.showModal(content, 'Example Feature');
    } catch (error) {
      console.error('Example Feature: Error:', error);
      API.showError('Failed to load example feature data');
    }
  }, {
    className: 'generate-btn',
    style: { background: '#34a853' }
  });
  
  // Global function for the modal button
  window.exampleFeatureAnalyze = async function() {
    const resultDiv = document.getElementById('example-analysis-result');
    if (!resultDiv) return;
    
    resultDiv.innerHTML = '<div style="color: #666;">Analyzing...</div>';
    
    try {
      const emails = API.getEmails();
      if (emails.length === 0) {
        resultDiv.innerHTML = '<div style="color: #dc3545;">No emails to analyze</div>';
        return;
      }
      
      // Get the latest email
      const latest = emails[0];
      const text = `Subject: ${latest.subject}\nFrom: ${latest.from}\nBody: ${latest.body || latest.snippet}`;
      
      // Call the backend AI endpoint
      const response = await API.apiCall('/api/example-feature/analyze', {
        method: 'POST',
        body: { text }
      });
      
      if (response.success) {
        resultDiv.innerHTML = `
          <div style="border: 1px solid #e0e0e0; border-radius: 6px; padding: 12px; background: #f8f9fa;">
            <strong style="display: block; margin-bottom: 8px;">Analysis:</strong>
            <div style="white-space: pre-wrap; line-height: 1.5;">${response.analysis}</div>
          </div>
        `;
      } else {
        resultDiv.innerHTML = `<div style="color: #dc3545;">Error: ${response.error}</div>`;
      }
    } catch (error) {
      console.error('Example Feature: Analysis error:', error);
      resultDiv.innerHTML = `<div style="color: #dc3545;">Failed to analyze email</div>`;
    }
  };
  
  // Listen for events
  API.on('emailsLoaded', (data) => {
    console.log('Example Feature: Emails loaded:', data);
  });
  
  API.on('filterChanged', (data) => {
    console.log('Example Feature: Filter changed:', data);
  });
  
  // Add custom email action
  API.addEmailAction('Example Action', async (email) => {
    console.log('Example Feature: Email action triggered for:', email.subject);
    API.showSuccess(`Example action triggered for: ${email.subject}`);
  });
  
  console.log('Example Feature: Frontend loaded successfully');
})();
