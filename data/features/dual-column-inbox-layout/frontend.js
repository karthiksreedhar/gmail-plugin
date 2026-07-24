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
  const LAYOUT_ENABLED_KEY = 'dualColumnLayoutEnabled';
  
  // State
  let layoutEnabled = localStorage.getItem(LAYOUT_ENABLED_KEY) === 'true';
  let originalDisplayEmails = null;
  
  /**
   * Initialize the feature
   */
  function initialize() {
    try {
      console.log('DualColumnInboxLayout: Initializing...');
      
      // Add header button to toggle layout
      API.addHeaderButton('Toggle Dual Column', toggleLayout, {
        className: 'btn btn-info',
        style: { marginRight: '12px' }
      });
      
      // Hook into email display
      if (typeof window.displayEmails === 'function') {
        originalDisplayEmails = window.displayEmails;
        window.displayEmails = async function(...args) {
          const result = await originalDisplayEmails.apply(this, args);
          
          if (layoutEnabled) {
            setTimeout(() => {
              reorganizeInboxLayout();
            }, 100);
          }
          
          return result;
        };
        console.log('DualColumnInboxLayout: Hooked into displayEmails');
      }
      
      // Listen for emails loaded event
      API.on('emailsLoaded', () => {
        if (layoutEnabled) {
          setTimeout(() => {
            reorganizeInboxLayout();
          }, 100);
        }
      });
      
      // Apply layout if enabled on initial load
      if (layoutEnabled) {
        setTimeout(() => {
          reorganizeInboxLayout();
        }, 500);
      }
      
      console.log('DualColumnInboxLayout: Frontend initialized successfully');
    } catch (error) {
      console.error('DualColumnInboxLayout: Initialization failed:', error);
    }
  }
  
  /**
   * Toggle the dual column layout on/off
   */
  function toggleLayout() {
    try {
      layoutEnabled = !layoutEnabled;
      localStorage.setItem(LAYOUT_ENABLED_KEY, layoutEnabled.toString());
      
      if (layoutEnabled) {
        API.showSuccess('Dual column layout enabled');
        reorganizeInboxLayout();
      } else {
        API.showSuccess('Dual column layout disabled');
        restoreOriginalLayout();
      }
      
      console.log('DualColumnInboxLayout: Layout toggled to', layoutEnabled);
    } catch (error) {
      console.error('DualColumnInboxLayout: Error toggling layout:', error);
      API.showError('Failed to toggle layout');
    }
  }
  
  /**
   * Reorganize inbox into dual column layout
   */
  function reorganizeInboxLayout() {
    try {
      const emailListContainer = document.querySelector('.email-list');
      
      if (!emailListContainer) {
        console.warn('DualColumnInboxLayout: Email list container not found');
        return;
      }
      
      // Get all email items
      const emailItems = Array.from(emailListContainer.querySelectorAll('.email-item'));
      
      if (emailItems.length === 0) {
        console.log('DualColumnInboxLayout: No emails to reorganize');
        return;
      }
      
      // Separate emails by category
      const importantEmails = [];
      const starredEmails = [];
      const otherEmails = [];
      
      emailItems.forEach((emailItem) => {
        const categoryPills = emailItem.querySelectorAll('.email-category');
        const categories = Array.from(categoryPills).map(pill => 
          pill.textContent.trim()
        );
        
        if (categories.includes(IMPORTANT_CATEGORY)) {
          importantEmails.push(emailItem.cloneNode(true));
        } else if (categories.includes(STARRED_CATEGORY)) {
          starredEmails.push(emailItem.cloneNode(true));
        } else {
          otherEmails.push(emailItem.cloneNode(true));
        }
      });
      
      console.log(`DualColumnInboxLayout: Found ${importantEmails.length} important, ${starredEmails.length} starred, ${otherEmails.length} other emails`);
      
      // Clear the email list
      emailListContainer.innerHTML = '';
      
      // Create dual column container if it doesn't exist
      let dualColumnContainer = emailListContainer.querySelector('.dual-column-container');
      if (!dualColumnContainer) {
        dualColumnContainer = document.createElement('div');
        dualColumnContainer.className = 'dual-column-container';
        dualColumnContainer.style.cssText = `
          display: grid;
          grid-template-columns: 1fr 1fr;
          gap: 20px;
          margin-bottom: 30px;
          width: 100%;
        `;
        emailListContainer.appendChild(dualColumnContainer);
      } else {
        dualColumnContainer.innerHTML = '';
      }
      
      // Create left column (Important)
      const leftColumn = document.createElement('div');
      leftColumn.className = 'dual-column-left';
      leftColumn.style.cssText = `
        display: flex;
        flex-direction: column;
        gap: 12px;
      `;
      
      const leftHeader = document.createElement('h5');
      leftHeader.textContent = `Important (${importantEmails.length})`;
      leftHeader.style.cssText = `
        color: #d9534f;
        font-weight: bold;
        margin-bottom: 10px;
        padding-bottom: 10px;
        border-bottom: 2px solid #d9534f;
      `;
      leftColumn.appendChild(leftHeader);
      
      importantEmails.forEach(email => {
        leftColumn.appendChild(email);
      });
      
      // Create right column (Starred)
      const rightColumn = document.createElement('div');
      rightColumn.className = 'dual-column-right';
      rightColumn.style.cssText = `
        display: flex;
        flex-direction: column;
        gap: 12px;
      `;
      
      const rightHeader = document.createElement('h5');
      rightHeader.textContent = `Starred (${starredEmails.length})`;
      rightHeader.style.cssText = `
        color: #f0ad4e;
        font-weight: bold;
        margin-bottom: 10px;
        padding-bottom: 10px;
        border-bottom: 2px solid #f0ad4e;
      `;
      rightColumn.appendChild(rightHeader);
      
      starredEmails.forEach(email => {
        rightColumn.appendChild(email);
      });
      
      // Add columns to container
      dualColumnContainer.appendChild(leftColumn);
      dualColumnContainer.appendChild(rightColumn);
      
      // Create remaining emails section
      if (otherEmails.length > 0) {
        const remainingContainer = document.createElement('div');
        remainingContainer.className = 'remaining-emails-container';
        remainingContainer.style.cssText = `
          width: 100%;
          margin-top: 20px;
        `;
        
        const remainingHeader = document.createElement('h5');
        remainingHeader.textContent = `Other Emails (${otherEmails.length})`;
        remainingHeader.style.cssText = `
          color: #5cb85c;
          font-weight: bold;
          margin-bottom: 15px;
          padding-bottom: 10px;
          border-bottom: 2px solid #5cb85c;
        `;
        remainingContainer.appendChild(remainingHeader);
        
        const remainingList = document.createElement('div');
        remainingList.style.cssText = `
          display: flex;
          flex-direction: column;
          gap: 12px;
        `;
        
        otherEmails.forEach(email => {
          remainingList.appendChild(email);
        });
        
        remainingContainer.appendChild(remainingList);
        emailListContainer.appendChild(remainingContainer);
      }
      
      // Re-attach click handlers to cloned emails
      reattachEmailHandlers(emailListContainer);
      
      console.log('DualColumnInboxLayout: Layout reorganized successfully');
    } catch (error) {
      console.error('DualColumnInboxLayout: Error reorganizing layout:', error);
      API.showError('Failed to reorganize layout');
    }
  }
  
  /**
   * Restore original single column layout
   */
  function restoreOriginalLayout() {
    try {
      const emailListContainer = document.querySelector('.email-list');
      
      if (!emailListContainer) {
        console.warn('DualColumnInboxLayout: Email list container not found');
        return;
      }
      
      // Remove dual column container
      const dualColumnContainer = emailListContainer.querySelector('.dual-column-container');
      if (dualColumnContainer) {
        dualColumnContainer.remove();
      }
      
      // Remove remaining emails container
      const remainingContainer = emailListContainer.querySelector('.remaining-emails-container');
      if (remainingContainer) {
        remainingContainer.remove();
      }
      
      // Restore original display if available
      if (originalDisplayEmails) {
        originalDisplayEmails();
      }
      
      console.log('DualColumnInboxLayout: Layout restored to original');
    } catch (error) {
      console.error('DualColumnInboxLayout: Error restoring layout:', error);
    }
  }
  
  /**
   * Re-attach click handlers to cloned email elements
   */
  function reattachEmailHandlers(container) {
    try {
      const emailItems = container.querySelectorAll('.email-item');
      
      emailItems.forEach((emailItem) => {
        // Remove existing click handler
        const newEmailItem = emailItem.cloneNode(true);
        emailItem.parentNode.replaceChild(newEmailItem, emailItem);
        
        // Add new click handler
        newEmailItem.addEventListener('click', function(e) {
          // Don't open email if clicking on action buttons
          if (e.target.closest('.email-actions button')) {
            return;
          }
          
          // Try to find and call the original openEmailThread function
          if (typeof window.openEmailThread === 'function') {
            // Extract email ID from data attribute or other means
            const emailId = newEmailItem.getAttribute('data-email-id');
            if (emailId) {
              window.openEmailThread(emailId);
            }
          }
        });
      });
      
      console.log('DualColumnInboxLayout: Email handlers re-attached');
    } catch (error) {
      console.error('DualColumnInboxLayout: Error re-attaching handlers:', error);
    }
  }
  
  /**
   * Handle responsive layout for smaller screens
   */
  function handleResponsiveLayout() {
    try {
      const dualColumnContainer = document.querySelector('.dual-column-container');
      
      if (!dualColumnContainer) {
        return;
      }
      
      const width = window.innerWidth;
      
      if (width < 1024) {
        // Stack columns on smaller screens
        dualColumnContainer.style.gridTemplateColumns = '1fr';
      } else {
        // Two columns on larger screens
        dualColumnContainer.style.gridTemplateColumns = '1fr 1fr';
      }
    } catch (error) {
      console.error('DualColumnInboxLayout: Error handling responsive layout:', error);
    }
  }
  
  // Add responsive layout handler
  window.addEventListener('resize', handleResponsiveLayout);
  
  // Initialize the feature
  initialize();
  
  console.log('DualColumnInboxLayout: Frontend loaded successfully');
})();