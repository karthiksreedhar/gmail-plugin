/**
 * Document Thread History Frontend
 * Displays a history of PDF documents from email threads within the 'document' folder.
 */

(function() {
  console.log('Document Thread History: Frontend loading...');

  if (!window.EmailAssistant) {
    console.error('Document Thread History: EmailAssistant API not available');
    return;
  }

  const API = window.EmailAssistant;

  // State
  let documentThreads = [];

  // Initialize
  async function initialize() {
    try {
      // Add header button
      API.addHeaderButton('Document History', showDocumentHistory, {
        className: 'btn btn-primary',
        style: { marginRight: '12px' }
      });

      // Listen for emailsLoaded event
      API.on('emailsLoaded', handleEmailsLoaded);

      console.log('Document Thread History: Frontend initialized successfully');
    } catch (error) {
      console.error('Document Thread History: Initialization failed:', error);
    }
  }

  // Handle emails loaded event
  async function handleEmailsLoaded() {
    console.log('Document Thread History: Emails loaded, refreshing document history...');
    // Refresh document history when emails are loaded
    await loadDocumentThreads();
  }

  // Load document threads from backend
  async function loadDocumentThreads() {
    try {
      const response = await API.apiCall('/api/document-thread-history/get-document-threads');
      if (response.success) {
        documentThreads = response.data || [];
      } else {
        API.showError('Failed to load document threads: ' + response.error);
        documentThreads = [];
      }
    } catch (error) {
      console.error('Document Thread History: Failed to load document threads:', error);
      API.showError('Failed to load document threads.');
      documentThreads = [];
    }
  }

  // Show document history modal
  async function showDocumentHistory() {
    API.showModal('<div class="loading-indicator">Loading Document History...</div>', 'Document History');

    try {
      await loadDocumentThreads(); // Ensure documentThreads are loaded

      let content = `
        <div style="padding: 20px;">
          <h3>Document Thread History</h3>
          <p>List of PDF documents from email threads in the 'document' folder.</p>
          <ul style="list-style: none; padding: 0;">
      `;

      if (documentThreads.length === 0) {
        content += `<p>No documents found in 'document' folder.</p>`;
      } else {
        documentThreads.forEach(thread => {
          content += `
            <li style="margin-bottom: 10px; border: 1px solid #ccc; padding: 10px; border-radius: 5px;">
              <strong>Thread Subject:</strong> ${thread.subject}<br>
              <strong>Participants:</strong> ${thread.participants.join(', ')}<br>
              <strong>Documents:</strong>
              <ul style="list-style: none; padding: 0; margin-top: 5px;">
          `;

          thread.documents.forEach(doc => {
            content += `
              <li style="margin-bottom: 5px;">
                <a href="${doc.url}" target="_blank">${doc.filename}</a>
              </li>
            `;
          });

          content += `
              </ul>
            </li>
          `;
        });
      }

      content += `
          </ul>
          <div style="text-align: center; margin-top: 20px;">
            <button class="btn btn-secondary" onclick="this.closest('.modal').remove()">Close</button>
          </div>
        </div>
      `;

      API.showModal(content, 'Document Thread History');
    } catch (error) {
      console.error('Document Thread History: Error showing document history:', error);
      API.showError('Failed to display document history.');
      API.showModal('<p>Failed to load document history.</p>', 'Document History');
    }
  }

  // Initialize when loaded
  initialize();

  console.log('Document Thread History: Frontend loaded successfully');
})();