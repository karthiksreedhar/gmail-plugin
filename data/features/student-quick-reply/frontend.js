/**
 * Student Quick Reply Frontend
 * Adds Quick Reply buttons to Student Interest emails
 */

(function() {
  console.log('Student Quick Reply: Frontend loading...');
  
  // Check for EmailAssistant API availability
  if (!window.EmailAssistant) {
    console.error('Student Quick Reply: EmailAssistant API not available');
    return;
  }
  
  const API = window.EmailAssistant;
  
  /**
   * Check if an email belongs to "Student Interest" category
   */
  function isStudentInterestEmail(email) {
    try {
      // Check single category field
      if (email.category) {
        const cat = String(email.category).toLowerCase().trim();
        if (cat === 'student interest') return true;
      }
      
      // Check categories array
      if (Array.isArray(email.categories)) {
        const hasStudentInterest = email.categories.some(c => 
          String(c).toLowerCase().trim() === 'student interest'
        );
        if (hasStudentInterest) return true;
      }
      
      return false;
    } catch (e) {
      console.error('Student Quick Reply: Error checking category:', e);
      return false;
    }
  }
  
  /**
   * Extract sender name from email
   */
  function extractSenderName(email) {
    try {
      // Try originalFrom first
      if (email.originalFrom) {
        const match = email.originalFrom.match(/^([^<]+)/);
        if (match) {
          return match[1].trim();
        }
      }
      
      // Try from field
      if (email.from) {
        const match = email.from.match(/^([^<]+)/);
        if (match) {
          return match[1].trim();
        }
        // If no name found, use email address before @
        return email.from.split('@')[0];
      }
      
      return 'Unknown Sender';
    } catch (e) {
      console.error('Student Quick Reply: Error extracting sender name:', e);
      return 'Unknown Sender';
    }
  }
  
  /**
   * Show Quick Reply modal
   */
  function showQuickReplyModal(email) {
    try {
      const senderName = extractSenderName(email);
      
      const content = `
        <div style="padding: 20px; text-align: center;">
          <div style="margin-bottom: 24px;">
            <div style="font-size: 16px; color: #666; margin-bottom: 8px;">Quick Reply to:</div>
            <div style="font-size: 22px; font-weight: 600; color: #202124;">${escapeHtml(senderName)}</div>
          </div>
          
          <div style="display: flex; gap: 16px; justify-content: center;">
            <button 
              onclick="window.handleStudentQuickReply('${email.id}', '${escapeHtml(senderName)}', 'yes')" 
              style="
                background: #28a745;
                color: white;
                border: none;
                padding: 16px 40px;
                border-radius: 8px;
                cursor: pointer;
                font-size: 18px;
                font-weight: 600;
                transition: all 0.2s ease;
                box-shadow: 0 2px 4px rgba(0,0,0,0.1);
              "
              onmouseover="this.style.background='#218838'; this.style.transform='scale(1.05)'"
              onmouseout="this.style.background='#28a745'; this.style.transform='scale(1)'"
            >
              ✓ Yes
            </button>
            
            <button 
              onclick="window.handleStudentQuickReply('${email.id}', '${escapeHtml(senderName)}', 'no')" 
              style="
                background: #dc3545;
                color: white;
                border: none;
                padding: 16px 40px;
                border-radius: 8px;
                cursor: pointer;
                font-size: 18px;
                font-weight: 600;
                transition: all 0.2s ease;
                box-shadow: 0 2px 4px rgba(0,0,0,0.1);
              "
              onmouseover="this.style.background='#c82333'; this.style.transform='scale(1.05)'"
              onmouseout="this.style.background='#dc3545'; this.style.transform='scale(1)'"
            >
              ✗ No
            </button>
          </div>
          
          <div style="margin-top: 24px; padding-top: 16px; border-top: 1px solid #e9ecef;">
            <div style="font-size: 13px; color: #999;">
              Your response will be recorded for tracking purposes
            </div>
          </div>
        </div>
      `;
      
      API.showModal(content, 'Quick Reply');
    } catch (e) {
      console.error('Student Quick Reply: Error showing modal:', e);
      API.showError('Failed to show Quick Reply modal');
    }
  }
  
  /**
   * HTML escape utility
   */
  function escapeHtml(text) {
    const div = document.createElement('div');
    div.textContent = text;
    return div.innerHTML;
  }
  
  /**
   * Handle quick reply response
   * This function is exposed globally so the modal buttons can call it
   */
  window.handleStudentQuickReply = async function(emailId, senderName, response) {
    try {
      console.log(`Student Quick Reply: Recording ${response} for ${senderName}`);
      
      // Close the modal
      const modals = document.querySelectorAll('#feature-modals .modal');
      modals.forEach(modal => modal.remove());
      
      // Record the response via backend
      const result = await API.apiCall('/api/student-quick-reply/record', {
        method: 'POST',
        body: {
          emailId,
          senderName,
          response,
          timestamp: new Date().toISOString()
        }
      });
      
      if (result.success) {
        const responseText = response === 'yes' ? 'Yes ✓' : 'No ✗';
        API.showSuccess(`Quick Reply recorded: ${responseText} to ${senderName}`);
      } else {
        throw new Error(result.error || 'Unknown error');
      }
    } catch (e) {
      console.error('Student Quick Reply: Error recording response:', e);
      API.showError('Failed to record response');
    }
  };
  
  /**
   * Add Quick Reply buttons to Student Interest emails
   */
  function addQuickReplyButtons() {
    try {
      const emails = API.getEmails();
      
      // Find all email items in the DOM
      const emailItems = document.querySelectorAll('.email-item');
      
      emailItems.forEach((emailItem) => {
        // Check if this email already has a Quick Reply button
        if (emailItem.querySelector('.quick-reply-btn')) {
          return; // Skip if already added
        }
        
        // Find email data by matching subject text from DOM
        // This is more reliable than index-based matching
        const subjectElement = emailItem.querySelector('.email-subject');
        if (!subjectElement) return;
        
        const subjectText = subjectElement.textContent.trim();
        
        // Find matching email in data array by subject
        const email = emails.find(e => e && e.subject && e.subject.trim() === subjectText);
        if (!email) {
          console.log('Student Quick Reply: Could not find email data for subject:', subjectText);
          return;
        }
        
        // Check if this is a Student Interest email
        if (!isStudentInterestEmail(email)) {
          return;
        }
        
        console.log('Student Quick Reply: Adding button to email:', email.subject);
        
        // Find the email-actions container
        let actionsContainer = emailItem.querySelector('.email-actions');
        
        // If no actions container exists, create one
        if (!actionsContainer) {
          actionsContainer = document.createElement('div');
          actionsContainer.className = 'email-actions';
          actionsContainer.style.display = 'flex';
          actionsContainer.style.alignItems = 'center';
          actionsContainer.style.marginLeft = '16px';
          emailItem.appendChild(actionsContainer);
        }
        
        // Create Quick Reply button
        const quickReplyBtn = document.createElement('button');
        quickReplyBtn.className = 'quick-reply-btn';
        quickReplyBtn.textContent = 'Quick Reply';
        quickReplyBtn.title = 'Quick Reply: Yes/No';
        
        // Style the button - ALWAYS VISIBLE (no opacity transitions)
        quickReplyBtn.style.background = '#4285f4';
        quickReplyBtn.style.color = 'white';
        quickReplyBtn.style.border = 'none';
        quickReplyBtn.style.padding = '8px 16px';
        quickReplyBtn.style.borderRadius = '4px';
        quickReplyBtn.style.cursor = 'pointer';
        quickReplyBtn.style.fontSize = '14px';
        quickReplyBtn.style.fontWeight = '500';
        quickReplyBtn.style.transition = 'all 0.2s ease';
        quickReplyBtn.style.marginRight = '8px';
        // Button is always visible - removed opacity and transform
        
        // Add hover effects (color and scale only)
        quickReplyBtn.addEventListener('mouseenter', function() {
          this.style.background = '#3367d6';
          this.style.transform = 'scale(1.05)';
        });
        
        quickReplyBtn.addEventListener('mouseleave', function() {
          this.style.background = '#4285f4';
          this.style.transform = 'scale(1)';
        });
        
        // Add click handler
        quickReplyBtn.addEventListener('click', function(e) {
          e.stopPropagation(); // Prevent opening the email thread
          showQuickReplyModal(email);
        });
        
        // Insert button before the delete button (or at the start if no delete button)
        const deleteBtn = actionsContainer.querySelector('.delete-thread-btn');
        if (deleteBtn) {
          actionsContainer.insertBefore(quickReplyBtn, deleteBtn);
        } else {
          actionsContainer.appendChild(quickReplyBtn);
        }
      });
      
      console.log('Student Quick Reply: Finished processing emails');
    } catch (e) {
      console.error('Student Quick Reply: Error adding buttons:', e);
    }
  }
  
  /**
   * Initialize the feature
   */
  function initialize() {
    try {
      // Add buttons when emails are loaded
      API.on('emailsLoaded', (data) => {
        console.log('Student Quick Reply: Emails loaded event received');
        // Use setTimeout to ensure DOM is fully updated
        setTimeout(addQuickReplyButtons, 100);
      });
      
      // Add buttons when filter changes
      API.on('filterChanged', (data) => {
        console.log('Student Quick Reply: Filter changed event received');
        setTimeout(addQuickReplyButtons, 100);
      });
      
      // Add buttons on initial load (if emails are already present)
      setTimeout(() => {
        const emails = API.getEmails();
        if (emails && emails.length > 0) {
          addQuickReplyButtons();
        }
      }, 500);
      
      // Also add a MutationObserver as a fallback to catch any dynamically added emails
      const emailContainer = document.getElementById('emailContainer');
      if (emailContainer) {
        const observer = new MutationObserver((mutations) => {
          // Check if new email items were added
          const hasNewEmails = mutations.some(mutation => 
            Array.from(mutation.addedNodes).some(node => 
              node.classList && node.classList.contains('email-item')
            )
          );
          
          if (hasNewEmails) {
            setTimeout(addQuickReplyButtons, 50);
          }
        });
        
        observer.observe(emailContainer, {
          childList: true,
          subtree: true
        });
        
        console.log('Student Quick Reply: MutationObserver initialized');
      }
      
      console.log('Student Quick Reply: Frontend initialized successfully');
    } catch (e) {
      console.error('Student Quick Reply: Error during initialization:', e);
    }
  }
  
  // Initialize the feature
  initialize();
  
  console.log('Student Quick Reply: Frontend loaded successfully');
})();
