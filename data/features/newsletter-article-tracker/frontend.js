/**
 * Newsletter Article Tracker Frontend
 * Allows users to track articles found within their newsletter subscriptions.
 */

(function() {
  console.log('Newsletter Article Tracker: Frontend loading...');

  if (!window.EmailAssistant) {
    console.error('Newsletter Article Tracker: EmailAssistant API not available');
    return;
  }

  const API = window.EmailAssistant;

  // State
  let trackedArticles = [];

  // Initialize
  async function initialize() {
    try {
      // Add header button
      API.addHeaderButton('Tracked Articles', showTrackedArticlesModal, {
        className: 'btn btn-primary',
        style: { marginRight: '12px' }
      });

      // Add email action
      API.addEmailAction('Track Article', trackArticle);

      // Load initial data (if needed)
      // await loadTrackedArticles();

      // Listen for emails loaded event
      API.on('emailsLoaded', handleEmailsLoaded);

      console.log('Newsletter Article Tracker: Frontend initialized successfully');
    } catch (error) {
      console.error('Newsletter Article Tracker: Initialization failed:', error);
    }
  }

  // Load tracked articles from backend (example)
  async function loadTrackedArticles() {
    try {
      const response = await API.apiCall('/api/newsletter-article-tracker/tracked-articles');
      if (response.success) {
        trackedArticles = response.data || [];
      } else {
        API.showError('Failed to load tracked articles: ' + response.error);
      }
    } catch (error) {
      console.error('Newsletter Article Tracker: Failed to load tracked articles:', error);
      API.showError('Failed to load tracked articles.');
    }
  }

  // Show tracked articles in a modal
  function showTrackedArticlesModal() {
    const articleList = trackedArticles.map(article => `<li>${article.title} - ${article.newsletter}</li>`).join('');

    const content = `
      <div style="padding: 20px;">
        <h3>Tracked Articles</h3>
        ${articleList ? `<ul>${articleList}</ul>` : '<p>No articles tracked yet.</p>'}
        <div style="text-align: center; margin-top: 20px;">
          <button class="btn btn-secondary" onclick="this.closest('.modal').remove()">Close</button>
        </div>
      </div>
    `;

    API.showModal(content, 'Tracked Articles');
  }

  // Track article action
  async function trackArticle(email) {
    try {
      const loadingContent = '<div style="padding: 20px; text-align: center;">Loading...</div>';
      API.showModal(loadingContent, 'Tracking Article');

      const response = await API.apiCall('/api/newsletter-article-tracker/track-article', {
        method: 'POST',
        body: {
          emailId: email.id,
          subject: email.subject,
          from: email.from
        }
      });

      document.querySelector('.modal').remove(); // Close loading modal

      if (response.success) {
        API.showSuccess('Article tracked successfully!');
        // Optionally, refresh tracked articles list
        // await loadTrackedArticles();
      } else {
        API.showError('Failed to track article: ' + response.error);
      }
    } catch (error) {
      console.error('Newsletter Article Tracker: Failed to track article:', error);
      API.showError('Failed to track article.');
      if (document.querySelector('.modal')) {
        document.querySelector('.modal').remove();
      }
    }
  }

  // Handle emails loaded event
  function handleEmailsLoaded() {
    console.log('Newsletter Article Tracker: Emails loaded, refreshing UI...');
    // Add any UI updates needed after emails are loaded
  }

  // Initialize when loaded
  initialize();

  console.log('Newsletter Article Tracker: Frontend loaded successfully');
})();