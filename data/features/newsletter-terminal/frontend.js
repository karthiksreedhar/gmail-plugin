/**
 * Newsletter Terminal Frontend
 * Provides a Bloomberg Terminal-like interface to preview recent newsletters in the inbox.
 */

(function() {
  console.log('Newsletter Terminal: Frontend loading...');

  if (!window.EmailAssistant) {
    console.error('Newsletter Terminal: EmailAssistant API not available');
    return;
  }

  const API = window.EmailAssistant;

  let newsletterData = [];
  let isLoading = false;

  async function initialize() {
    try {
      API.addHeaderButton('Newsletter Terminal', showNewsletterTerminal, {
        className: 'btn btn-primary',
        style: { marginRight: '12px' }
      });

      API.on('emailsLoaded', refreshNewsletterData);

      await refreshNewsletterData();

      console.log('Newsletter Terminal: Frontend initialized successfully');
    } catch (error) {
      console.error('Newsletter Terminal: Initialization failed:', error);
    }
  }

  async function refreshNewsletterData() {
    if (isLoading) return;

    isLoading = true;
    updateModalContent('Loading newsletters...');

    try {
      const response = await API.apiCall('/api/newsletter-terminal/newsletters', { method: 'GET' });

      if (response.success) {
        newsletterData = response.data;
        updateModalContent(renderNewsletterList(newsletterData));
        API.showSuccess('Newsletters loaded successfully!');
      } else {
        API.showError('Failed to load newsletters: ' + response.error);
        updateModalContent('Failed to load newsletters.');
      }
    } catch (error) {
      console.error('Newsletter Terminal: Error fetching newsletters:', error);
      API.showError('Failed to load newsletters.');
      updateModalContent('Failed to load newsletters.');
    } finally {
      isLoading = false;
    }
  }

  function showNewsletterTerminal() {
    if (isLoading) {
      API.showModal('Loading newsletters...', 'Newsletter Terminal');
      return;
    }

    API.showModal(renderNewsletterList(newsletterData), 'Newsletter Terminal');
  }

  function renderNewsletterList(newsletters) {
    if (!newsletters || newsletters.length === 0) {
      return '<div style="padding: 20px;">No newsletters found.</div>';
    }

    let html = '<div style="padding: 20px;">';
    html += '<h3 style="margin-bottom: 15px;">Recent Newsletters</h3>';
    html += '<ul style="list-style: none; padding: 0;">';

    newsletters.forEach(newsletter => {
      html += `<li style="margin-bottom: 10px; border-bottom: 1px solid #eee; padding-bottom: 5px;">
                <strong>${newsletter.subject}</strong><br>
                From: ${newsletter.from}<br>
                Date: ${newsletter.date}<br>
                <button class="btn btn-sm btn-outline-primary" onclick="window.showNewsletterContent('${newsletter.id}')">View</button>
              </li>`;
    });

    html += '</ul>';
    html += '</div>';
    return html;
  }

  window.showNewsletterContent = async function(emailId) {
    if (isLoading) return;

    isLoading = true;
    updateModalContent('Loading newsletter content...');

    try {
      const response = await API.apiCall('/api/newsletter-terminal/newsletter-content', {
        method: 'POST',
        body: { emailId: emailId }
      });

      if (response.success) {
        updateModalContent(`
          <div style="padding: 20px;">
            <h3>Newsletter Content</h3>
            <p>${response.data.body}</p>
            <button class="btn btn-secondary" onclick="showNewsletterTerminal()">Back to List</button>
          </div>
        `);
      } else {
        API.showError('Failed to load newsletter content: ' + response.error);
        updateModalContent('Failed to load newsletter content.');
      }
    } catch (error) {
      console.error('Newsletter Terminal: Error fetching newsletter content:', error);
      API.showError('Failed to load newsletter content.');
      updateModalContent('Failed to load newsletter content.');
    } finally {
      isLoading = false;
    }
  };

  function updateModalContent(content) {
    const modal = document.querySelector('.modal');
    if (modal) {
      modal.innerHTML = `
        <div class="modal-dialog">
          <div class="modal-content">
            <div class="modal-header">
              <h5 class="modal-title">Newsletter Terminal</h5>
              <button type="button" class="btn-close" data-bs-dismiss="modal" aria-label="Close" onclick="this.closest('.modal').remove()"></button>
            </div>
            <div class="modal-body">
              ${content}
            </div>
          </div>
        </div>
      `;
    } else {
      API.showModal(content, 'Newsletter Terminal');
    }
  }

  initialize();

  console.log('Newsletter Terminal: Frontend loaded successfully');
})();