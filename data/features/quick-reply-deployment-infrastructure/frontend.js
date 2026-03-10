/**
 * Quick Reply for Deployment Infrastructure Category Frontend
 * Adds a 'Quick Reply' button to emails categorized under 'Deployment Infrastructure'. Clicking the button opens a popup displaying 'Test'.
 */

(function() {
  console.log('Quick Reply for Deployment Infrastructure: Frontend loading...');

  if (!window.EmailAssistant) {
    console.error('Quick Reply for Deployment Infrastructure: EmailAssistant API not available');
    return;
  }

  const API = window.EmailAssistant;

  function showTestPopup() {
    API.showModal('<p>Test</p>', 'Quick Reply');
  }

  function addQuickReplyButtons() {
    try {
      const existingButtons = document.querySelectorAll('.quick-reply-btn');
      existingButtons.forEach(btn => btn.remove());

      const emailItems = document.querySelectorAll('.email-item');

      emailItems.forEach((emailItem) => {
        const categoryPills = emailItem.querySelectorAll('.email-category');
        const emailCategories = Array.from(categoryPills).map(pill => pill.textContent.trim());

        const hasDeploymentInfrastructureCategory = emailCategories.includes('Deployment Infrastructure');

        if (hasDeploymentInfrastructureCategory) {
          const actionsContainer = emailItem.querySelector('.email-actions');
          if (!actionsContainer) return;

          const quickReplyButton = document.createElement('button');
          quickReplyButton.className = 'quick-reply-btn';
          quickReplyButton.textContent = 'Quick Reply';
          quickReplyButton.style.cssText = `
            background: #28a745;
            color: white;
            border: none;
            padding: 8px 12px;
            border-radius: 4px;
            cursor: pointer;
            font-size: 14px;
            margin-right: 8px;
          `;

          quickReplyButton.addEventListener('click', (e) => {
            e.stopPropagation();
            showTestPopup();
          });

          const deleteBtn = actionsContainer.querySelector('.delete-thread-btn');
          if (deleteBtn) {
            actionsContainer.insertBefore(quickReplyButton, deleteBtn);
          } else {
            actionsContainer.appendChild(quickReplyButton);
          }
        }
      });
    } catch (error) {
      console.error('Quick Reply for Deployment Infrastructure: Error adding buttons:', error);
    }
  }

  function initialize() {
    API.on('emailsLoaded', addQuickReplyButtons);

    setTimeout(() => addQuickReplyButtons(), 100);

    setInterval(() => addQuickReplyButtons(), 2000);

    if (typeof window.displayEmails === 'function') {
      const originalDisplayEmails = window.displayEmails;
      window.displayEmails = async function(...args) {
        const result = await originalDisplayEmails.apply(this, args);
        setTimeout(() => addQuickReplyButtons(), 50);
        return result;
      };
    }
  }

  initialize();

  console.log('Quick Reply for Deployment Infrastructure: Frontend loaded successfully');
})();