/**
 * Job Application Tracker Frontend
 * Adds a header button that opens the dedicated tracker page.
 */

(function () {
  if (!window.EmailAssistant) {
    console.error('Job Application Tracker: EmailAssistant API not available');
    return;
  }

  const API = window.EmailAssistant;

  function openTrackerPage() {
    try {
      window.open('/job-application-tracker', '_blank', 'noopener');
    } catch (error) {
      console.error('Job Application Tracker: failed to open page', error);
      API.showError('Failed to open Job Application Tracker.');
    }
  }

  function initialize() {
    API.addHeaderButton('Job Tracker', openTrackerPage, {
      className: 'generate-btn'
    });
  }

  initialize();
  console.log('Job Application Tracker: Frontend loaded');
})();
