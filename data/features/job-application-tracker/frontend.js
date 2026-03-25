/**
 * Job Application Tracker Frontend
 * Extracts company, role, and application status from emails in the 'job applications' category and displays them in a structured list.
 */

(function() {
  console.log('Job Application Tracker: Frontend loading...');

  if (!window.EmailAssistant) {
    console.error('Job Application Tracker: EmailAssistant API not available');
    return;
  }

  const API = window.EmailAssistant;

  let applications = [];

  async function initialize() {
    try {
      API.addHeaderButton('Job Applications', showApplicationList, {
        className: 'btn btn-primary',
        style: { marginRight: '12px' }
      });

      API.on('emailsLoaded', refreshApplicationList);

      await refreshApplicationList();

      console.log('Job Application Tracker: Frontend initialized successfully');
    } catch (error) {
      console.error('Job Application Tracker: Initialization failed:', error);
    }
  }

  async function refreshApplicationList() {
    try {
      const response = await API.apiCall('/api/job-application-tracker/applications', { method: 'GET' });
      if (response.success) {
        applications = response.data;
      } else {
        API.showError('Failed to load job applications: ' + response.error);
      }
    } catch (error) {
      console.error('Job Application Tracker: Failed to load job applications:', error);
      API.showError('Failed to load job applications.');
    }
  }

  function showApplicationList() {
    let content = '<div style="padding: 20px;">';
    content += '<h3>Job Applications</h3>';

    if (applications.length === 0) {
      content += '<p>No job applications found in the "job applications" category.</p>';
    } else {
      content += '<table class="table">';
      content += '<thead><tr><th>Company</th><th>Role</th><th>Status</th></tr></thead>';
      content += '<tbody>';
      applications.forEach(app => {
        content += `<tr><td>${app.company}</td><td>${app.role}</td><td>${app.status}</td></tr>`;
      });
      content += '</tbody></table>';
    }

    content += '<div style="text-align: center; margin-top: 20px;">';
    content += '<button class="btn btn-secondary" onclick="this.closest(\'.modal\').remove()">Close</button>';
    content += '</div>';
    content += '</div>';

    API.showModal(content, 'Job Application Tracker');
  }

  initialize();

  console.log('Job Application Tracker: Frontend loaded successfully');
})();