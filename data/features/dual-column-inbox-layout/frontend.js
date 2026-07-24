(function() {
  console.log('DualColumnInboxLayout: Frontend loading...');
  
  if (!window.EmailAssistant) {
    console.error('DualColumnInboxLayout: EmailAssistant API not available');
    return;
  }
  
  const API = window.EmailAssistant;
  
  // Configuration
  const IMPORTANT_CATEGORY = 'Important';
  const STARRED_CATEGORY = 'Starred';
  const LAYOUT_CONTAINER_ID = 'dual-column-layout-container';
  const IMPORTANT_COLUMN_ID = 'important-column';
  const STARRED_COLUMN_ID = 'starred-column';
  const REMAINING_SECTION_ID = 'remaining-emails-section';
  
  // State
  let isLayoutActive = false;
  let originalEmailsContainer = null;
  let dualColumnContainer = null;
  
  // Initialize
  function initialize() {
    try {
      // Add header button to toggle layout
      API.addHeaderButton('Dual Column Layout', toggleDualColumnLayout, {
        className: 'btn btn-info',
        style: { marginRight: '12px' }
      });
      
      // Listen for emails loaded event
      API.on('emailsLoaded', handleEmailsLoaded);
      
      console.log('DualColumnInboxLayout: Frontend initialized successfully');
    } catch (error) {
      console.error('DualColumnInboxLayout: Initialization failed:', error);
    }
  }
  
  // Toggle dual column layout
  function toggleDualColumnLayout() {
    try {
      if (isLayoutActive) {
        deactivateDualColumnLayout();
      } else {
        activateDualColumnLayout();
      }
    } catch (error) {
      console.error('DualColumnInboxLayout: Error toggling layout:', error);
      API.showError('Failed to toggle layout');
    }
  }
  
  // Activate dual column layout
  function activateDualColumnLayout() {
    try {
      console.log('DualColumnInboxLayout: Activating dual column layout...');
      
      // Get all emails
      const allEmails = API.getEmails();
      
      if (!allEmails || allEmails.length === 0) {
        API.showWarning('No emails to display');
        return;
      }
      
      // Find the main emails container
      const emailsContainer = document.querySelector('.emails-container') || 
                             document.querySelector('[class*="email"]');
      
      if (!emailsContainer) {
        console.error('DualColumnInboxLayout: Could not find emails container');
        API.showError('Could not find emails container');
        return;
      }
      
      // Store original container for restoration
      originalEmailsContainer = emailsContainer;
      
      // Separate emails by category
      const importantEmails = [];
      const starredEmails = [];
      const remainingEmails = [];
      
      // Get all email items from DOM
      const emailItems = document.querySelectorAll('.email-item');
      
      emailItems.forEach((emailItem) => {
        const categoryPills = emailItem.querySelectorAll('.email-category');
        const categories = Array.from(categoryPills).map(pill => pill.textContent.trim());
        
        if (categories.includes(IMPORTANT_CATEGORY)) {
          importantEmails.push(emailItem.cloneNode(true));
        } else if (categories.includes(STARRED_CATEGORY)) {
          starredEmails.push(emailItem.cloneNode(true));
        } else {
          remainingEmails.push(emailItem.cloneNode(true));
        }
      });
      
      // Create dual column layout
      createDualColumnLayout(emailsContainer, importantEmails, starredEmails, remainingEmails);
      
      isLayoutActive = true;
      console.log('DualColumnInboxLayout: Dual column layout activated');
      API.showSuccess('Dual column layout activated');
      
    } catch (error) {
      console.error('DualColumnInboxLayout: Error activating layout:', error);
      API.showError('Failed to activate layout');
    }
  }
  
  // Create dual column layout structure
  function createDualColumnLayout(container, importantEmails, starredEmails, remainingEmails) {
    try {
      // Clear container
      container.innerHTML = '';
      
      // Create main layout container
      dualColumnContainer = document.createElement('div');
      dualColumnContainer.id = LAYOUT_CONTAINER_ID;
      dualColumnContainer.style.cssText = `
        width: 100%;
        margin-bottom: 30px;
      `;
      
      // Create two-column section
      const twoColumnSection = document.createElement('div');
      twoColumnSection.style.cssText = `
        display: grid;
        grid-template-columns: 1fr 1fr;
        gap: 20px;
        margin-bottom: 30px;
        width: 100%;
      `;
      
      // Create important column
      const importantColumn = document.createElement('div');
      importantColumn.id = IMPORTANT_COLUMN_ID;
      importantColumn.style.cssText = `
        border: 2px solid #ff6b6b;
        border-radius: 8px;
        padding: 15px;
        background-color: #fff5f5;
      `;
      
      const importantHeader = document.createElement('h4');
      importantHeader.textContent = `Important (${importantEmails.length})`;
      importantHeader.style.cssText = `
        color: #ff6b6b;
        margin-top: 0;
        margin-bottom: 15px;
        font-weight: bold;
      `;
      importantColumn.appendChild(importantHeader);
      
      importantEmails.forEach(email => {
        importantColumn.appendChild(email);
      });
      
      if (importantEmails.length === 0) {
        const emptyMsg = document.createElement('p');
        emptyMsg.textContent = 'No important emails';
        emptyMsg.style.cssText = 'color: #999; font-style: italic;';
        importantColumn.appendChild(emptyMsg);
      }
      
      // Create starred column
      const starredColumn = document.createElement('div');
      starredColumn.id = STARRED_COLUMN_ID;
      starredColumn.style.cssText = `
        border: 2px solid #ffd43b;
        border-radius: 8px;
        padding: 15px;
        background-color: #fffbf0;
      `;
      
      const starredHeader = document.createElement('h4');
      starredHeader.textContent = `Starred (${starredEmails.length})`;
      starredHeader.style.cssText = `
        color: #f59f00;
        margin-top: 0;
        margin-bottom: 15px;
        font-weight: bold;
      `;
      starredColumn.appendChild(starredHeader);
      
      starredEmails.forEach(email => {
        starredColumn.appendChild(email);
      });
      
      if (starredEmails.length === 0) {
        const emptyMsg = document.createElement('p');
        emptyMsg.textContent = 'No starred emails';
        emptyMsg.style.cssText = 'color: #999; font-style: italic;';
        starredColumn.appendChild(emptyMsg);
      }
      
      // Add columns to two-column section
      twoColumnSection.appendChild(importantColumn);
      twoColumnSection.appendChild(starredColumn);
      
      // Add two-column section to main container
      dualColumnContainer.appendChild(twoColumnSection);
      
      // Create remaining emails section
      const remainingSection = document.createElement('div');
      remainingSection.id = REMAINING_SECTION_ID;
      remainingSection.style.cssText = `
        width: 100%;
      `;
      
      if (remainingEmails.length > 0) {
        const remainingHeader = document.createElement('h4');
        remainingHeader.textContent = `Other Emails (${remainingEmails.length})`;
        remainingHeader.style.cssText = `
          color: #495057;
          margin-top: 0;
          margin-bottom: 15px;
          font-weight: bold;
          border-bottom: 2px solid #dee2e6;
          padding-bottom: 10px;
        `;
        remainingSection.appendChild(remainingHeader);
        
        remainingEmails.forEach(email => {
          remainingSection.appendChild(email);
        });
      }
      
      // Add remaining section to main container
      dualColumnContainer.appendChild(remainingSection);
      
      // Add main container to page
      container.appendChild(dualColumnContainer);
      
      // Re-attach event listeners to cloned emails
      reattachEmailEventListeners();
      
      console.log('DualColumnInboxLayout: Layout created successfully');
      
    } catch (error) {
      console.error('DualColumnInboxLayout: Error creating layout:', error);
      throw error;
    }
  }
  
  // Reattach event listeners to cloned email items
  function reattachEmailEventListeners() {
    try {
      const emailItems = document.querySelectorAll(`#${LAYOUT_CONTAINER_ID} .email-item`);
      
      emailItems.forEach((emailItem) => {
        // Add click handler to open email thread
        emailItem.addEventListener('click', function(e) {
          if (e.target.closest('button')) {
            return; // Don't open if clicking a button
          }
          
          // Extract email ID from the item (if available)
          const emailId = emailItem.getAttribute('data-email-id');
          if (emailId) {
            console.log('DualColumnInboxLayout: Opening email:', emailId);
            // Trigger email open action
            if (typeof window.openEmailThread === 'function') {
              window.openEmailThread(emailId);
            }
          }
        });
      });
      
      console.log('DualColumnInboxLayout: Event listeners reattached');
    } catch (error) {
      console.error('DualColumnInboxLayout: Error reattaching listeners:', error);
    }
  }
  
  // Deactivate dual column layout
  function deactivateDualColumnLayout() {
    try {
      console.log('DualColumnInboxLayout: Deactivating dual column layout...');
      
      if (originalEmailsContainer && dualColumnContainer) {
        // Remove dual column layout
        dualColumnContainer.remove();
        
        // Refresh emails to restore original layout
        API.refreshEmails();
        
        isLayoutActive = false;
        console.log('DualColumnInboxLayout: Dual column layout deactivated');
        API.showSuccess('Dual column layout deactivated');
      }
    } catch (error) {
      console.error('DualColumnInboxLayout: Error deactivating layout:', error);
      API.showError('Failed to deactivate layout');
    }
  }
  
  // Handle emails loaded event
  function handleEmailsLoaded() {
    try {
      console.log('DualColumnInboxLayout: Emails loaded event triggered');
      
      // If layout is active, reapply it
      if (isLayoutActive) {
        console.log('DualColumnInboxLayout: Reapplying dual column layout...');
        // Deactivate and reactivate to refresh
        isLayoutActive = false;
        setTimeout(() => {
          activateDualColumnLayout();
        }, 100);
      }
    } catch (error) {
      console.error('DualColumnInboxLayout: Error handling emails loaded:', error);
    }
  }
  
  // Initialize when loaded
  initialize();
  
  console.log('DualColumnInboxLayout: Frontend loaded successfully');
})();