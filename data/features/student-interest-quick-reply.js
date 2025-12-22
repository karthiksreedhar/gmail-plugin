/**
 * Feature: Student Interest Quick Reply
 * Description: Adds Quick Reply buttons to emails categorized as "Student Interest" 
 * with a popup containing sender name and yes/no selection menu
 */

module.exports = {
  // REQUIRED: Unique identifier for this feature
  name: 'student-interest-quick-reply',
  
  // OPTIONAL: Human-readable description
  description: 'Adds Quick Reply buttons to Student Interest emails with yes/no popup',
  
  // REQUIRED: Which hooks to listen for
  triggers: ['onPriorityEmailsLoaded', 'onEmailThreadsLoaded'],
  
  // OPTIONAL: Feature configuration
  config: {
    enabled: true,
    buttonText: 'Quick Reply',
    yesText: 'Yes',
    noText: 'No',
    popupTitle: 'Quick Reply',
    // Log responses for potential future automation
    logResponses: true
  },
  
  // REQUIRED: Main execution function
  async execute(context) {
    const { hook, emails, threads, user, featureConfig } = context;
    
    console.log(`[Student Interest Quick Reply] Hook triggered: ${hook}`, {
      emails: emails?.length || 0,
      threads: threads?.length || 0,
      user,
      enabled: featureConfig.enabled
    });
    
    if (!featureConfig.enabled) {
      return null;
    }
    
    try {
      if (hook === 'onPriorityEmailsLoaded') {
        // Handle Priority Today emails (yellow cards)
        await this.handlePriorityEmails(emails, featureConfig);
        return { processed: 'priority-emails', count: emails?.length || 0 };
      }
      
      if (hook === 'onEmailThreadsLoaded') {
        // Handle regular email list items  
        await this.handleRegularEmails(threads, featureConfig);
        return { processed: 'email-threads', count: threads?.length || 0 };
      }
      
      return null;
    } catch (error) {
      console.error('Student Interest Quick Reply feature error:', error);
      return { error: error.message };
    }
  },
  
  // Handle Priority Today emails (yellow cards)
  async handlePriorityEmails(emails, config) {
    if (!Array.isArray(emails)) return;
    
    // Wait for DOM to be ready, then inject buttons
    setTimeout(() => {
      this.injectQuickReplyButtons('priority', emails, config);
    }, 500);
  },
  
  // Handle regular email list items
  async handleRegularEmails(threads, config) {
    if (!Array.isArray(threads)) return;
    
    // Extract emails from threads that have Student Interest category
    const relevantEmails = [];
    threads.forEach(thread => {
      if (thread && thread.messages) {
        thread.messages.forEach(message => {
          if (message && this.isStudentInterestEmail(message)) {
            relevantEmails.push({
              id: message.id,
              from: message.from,
              subject: message.subject,
              category: 'Student Interest',
              threadId: thread.id
            });
          }
        });
      }
    });
    
    if (relevantEmails.length > 0) {
      setTimeout(() => {
        this.injectQuickReplyButtons('regular', relevantEmails, config);
      }, 500);
    }
  },
  
  // Check if an email is categorized as Student Interest
  isStudentInterestEmail(email) {
    if (!email) return false;
    
    // Check category field (case-insensitive)
    const category = String(email.category || '').toLowerCase();
    if (category.includes('student interest')) return true;
    
    // Check categories array if present
    if (Array.isArray(email.categories)) {
      if (email.categories.some(cat => 
        String(cat || '').toLowerCase().includes('student interest')
      )) {
        return true;
      }
    }
    
    // TEMPORARY OVERRIDE: Expanded patterns for demo purposes
    const subject = String(email.subject || '').toLowerCase();
    const body = String(email.body || email.snippet || '').toLowerCase();
    const from = String(email.from || '').toLowerCase();
    
    // Enhanced student interest patterns for broader detection
    const studentPatterns = [
      // Direct student interest phrases
      'student interest',
      'student interested',
      'prospective student',
      'master\'s student interested',
      'phd student interested', 
      'undergraduate interested',
      'student seeking',
      'student inquiry',
      
      // Research interest phrases
      'research opportunity',
      'research opportunities',
      'join your lab',
      'interested in your work',
      'interested in your research',
      'interested in your lab',
      'research interest',
      'interested in doubleagents',
      'interested in jumpstarter',
      'doubleagents project',
      'jumpstarter',
      
      // Academic inquiry phrases  
      'phd position',
      'phd opportunity',
      'postdoc position',
      'recommendation letter',
      'letter of recommendation',
      'research collaboration',
      'research assistant',
      'thesis advisor',
      'advisor for',
      'supervision',
      'graduate school',
      'graduate aspirant',
      'apply to your lab',
      'work under your supervision',
      
      // Specific project mentions that indicate student interest
      'doubleagents',
      'computational design lab',
      'human-ai collaboration',
      'ai systems',
      'multi-agent',
      'hci research',
      'human-computer interaction'
    ];
    
    // Check subject and body
    const hasStudentPattern = studentPatterns.some(pattern => 
      subject.includes(pattern) || body.includes(pattern)
    );
    
    // TEMPORARY: Also check for academic email domains as additional signal
    const academicDomains = [
      '@columbia.edu',
      '@cs.columbia.edu', 
      '@seas.upenn.edu',
      '@illinois.edu',
      '@cornell.edu',
      '@uchicago.edu',
      '@gmail.com' // Many students use gmail
    ];
    
    const hasAcademicEmail = academicDomains.some(domain => from.includes(domain));
    
    // Enhanced detection: pattern match + academic context
    if (hasStudentPattern && hasAcademicEmail) {
      console.log(`[Student Interest Detection] Found match: ${email.subject} from ${email.from}`);
      return true;
    }
    
    // Specific subject line patterns that are clearly student inquiries
    const directStudentSubjects = [
      'inquiry about potential research',
      'interested in doubleagents',
      'research interest',
      'prospective phd student',
      'graduate aspirant',
      'undergrad research interest',
      'request for recommendation',
      'joining the humor project',
      'interest in jumpstarter'
    ];
    
    if (directStudentSubjects.some(pattern => subject.includes(pattern))) {
      console.log(`[Student Interest Detection] Direct subject match: ${email.subject}`);
      return true;
    }
    
    return false;
  },
  
  // Inject Quick Reply buttons into email cards
  injectQuickReplyButtons(type, emails, config) {
    if (!Array.isArray(emails)) return;
    
    emails.forEach(email => {
      if (!this.isStudentInterestEmail(email)) return;
      
      let emailCard;
      
      if (type === 'priority') {
        // Find priority card by data attribute
        emailCard = document.querySelector(`[data-pri-id="${email.id}"]`);
      } else {
        // For regular emails, find by email content matching
        emailCard = this.findEmailCard(email);
      }
      
      if (emailCard && !emailCard.querySelector('.quick-reply-btn')) {
        this.addQuickReplyButton(emailCard, email, config, type);
      }
    });
  },
  
  // Find email card in regular email list
  findEmailCard(email) {
    const emailItems = document.querySelectorAll('.email-item');
    
    for (const item of emailItems) {
      const subjectEl = item.querySelector('.email-subject');
      const fromEl = item.querySelector('.email-from');
      
      if (subjectEl && fromEl) {
        const cardSubject = subjectEl.textContent.trim();
        const cardFrom = fromEl.textContent.trim();
        
        // Match by subject and sender
        if (cardSubject === email.subject && 
            (cardFrom.includes(email.from) || email.from.includes(cardFrom))) {
          return item;
        }
      }
    }
    
    return null;
  },
  
  // Add Quick Reply button to an email card
  addQuickReplyButton(emailCard, email, config, type) {
    const button = document.createElement('button');
    button.className = 'quick-reply-btn';
    button.textContent = config.buttonText;
    button.title = 'Quick reply to student inquiry';
    
    // Style the button to match existing UI
    Object.assign(button.style, {
      background: '#1a73e8',
      color: '#fff',
      border: 'none',
      padding: '6px 12px',
      borderRadius: '16px',
      cursor: 'pointer',
      fontSize: '12px',
      fontWeight: '500',
      marginLeft: '8px',
      transition: 'background-color 0.2s ease',
      zIndex: '10'
    });
    
    // Hover effect
    button.addEventListener('mouseenter', () => {
      button.style.background = '#1557b0';
    });
    
    button.addEventListener('mouseleave', () => {
      button.style.background = '#1a73e8';
    });
    
    // Click handler
    button.addEventListener('click', (event) => {
      event.stopPropagation();
      this.showQuickReplyPopup(email, config);
    });
    
    // Insert button in appropriate location based on email card type
    if (type === 'priority') {
      // For priority cards, add to the actions area
      const actionsArea = emailCard.querySelector('.priority-actions');
      if (actionsArea) {
        actionsArea.appendChild(button);
      } else {
        // Fallback: add to card content
        const cardContent = emailCard.querySelector('.priority-card-content');
        if (cardContent) {
          const buttonContainer = document.createElement('div');
          buttonContainer.style.marginTop = '8px';
          buttonContainer.appendChild(button);
          cardContent.appendChild(buttonContainer);
        }
      }
    } else {
      // For regular email cards, add to email actions or meta row
      const emailActions = emailCard.querySelector('.email-actions');
      const metaRow = emailCard.querySelector('.email-meta-row');
      
      if (emailActions) {
        emailActions.appendChild(button);
      } else if (metaRow) {
        metaRow.appendChild(button);
      } else {
        // Fallback: add to email content
        const emailContent = emailCard.querySelector('.email-content');
        if (emailContent) {
          const buttonContainer = document.createElement('div');
          buttonContainer.style.marginTop = '8px';
          buttonContainer.appendChild(button);
          emailContent.appendChild(buttonContainer);
        }
      }
    }
  },
  
  // Show the Quick Reply popup
  showQuickReplyPopup(email, config) {
    // Remove any existing popup
    this.removeExistingPopup();
    
    // Extract sender name from email
    const senderName = this.extractSenderName(email.from || 'Unknown Sender');
    
    // Create modal overlay
    const overlay = document.createElement('div');
    overlay.id = 'quickReplyModal';
    overlay.className = 'popup-modal';
    overlay.style.cssText = `
      display: block;
      position: fixed;
      z-index: 2000;
      left: 0;
      top: 0;
      width: 100%;
      height: 100%;
      background-color: rgba(0,0,0,0.6);
      animation: fadeIn 0.2s ease;
    `;
    
    // Create modal content
    const modalContent = document.createElement('div');
    modalContent.className = 'popup-content';
    modalContent.style.cssText = `
      background-color: white;
      margin: 20% auto;
      padding: 0;
      border-radius: 12px;
      width: 90%;
      max-width: 450px;
      box-shadow: 0 8px 32px rgba(0,0,0,0.3);
      animation: popupSlideIn 0.3s ease;
    `;
    
    // Build modal HTML
    modalContent.innerHTML = `
      <div class="popup-header" style="padding: 24px 24px 16px 24px; border-bottom: 1px solid #e9ecef; text-align: center;">
        <h3 class="popup-title" style="font-size: 18px; font-weight: 600; color: #333; margin: 0; text-align: center;">
          ${config.popupTitle}
        </h3>
      </div>
      <div class="popup-body" style="padding: 20px 24px; text-align: center;">
        <div style="font-size: 16px; color: #333; margin-bottom: 8px;">
          <strong>${this.escapeHtml(senderName)}</strong>
        </div>
        <div style="font-size: 14px; color: #666; margin-bottom: 20px;">
          Would you like to respond to this student inquiry?
        </div>
      </div>
      <div class="popup-actions" style="padding: 16px 24px 24px 24px; display: flex; gap: 12px; justify-content: center;">
        <button class="popup-btn popup-btn-secondary quick-reply-no" style="
          padding: 12px 24px;
          border: none;
          border-radius: 6px;
          font-size: 14px;
          font-weight: 500;
          cursor: pointer;
          transition: all 0.2s ease;
          background: #f8f9fa;
          color: #6c757d;
          border: 1px solid #dee2e6;
        ">${config.noText}</button>
        <button class="popup-btn popup-btn-success quick-reply-yes" style="
          padding: 12px 24px;
          border: none;
          border-radius: 6px;
          font-size: 14px;
          font-weight: 500;
          cursor: pointer;
          transition: all 0.2s ease;
          background: #28a745;
          color: white;
        ">${config.yesText}</button>
      </div>
    `;
    
    overlay.appendChild(modalContent);
    document.body.appendChild(overlay);
    
    // Add event listeners
    const yesBtn = modalContent.querySelector('.quick-reply-yes');
    const noBtn = modalContent.querySelector('.quick-reply-no');
    
    yesBtn.addEventListener('click', () => {
      this.handleQuickReply(email, 'yes', config);
      this.removePopup(overlay);
    });
    
    noBtn.addEventListener('click', () => {
      this.handleQuickReply(email, 'no', config);
      this.removePopup(overlay);
    });
    
    // Close on overlay click
    overlay.addEventListener('click', (event) => {
      if (event.target === overlay) {
        this.removePopup(overlay);
      }
    });
    
    // Close on Escape key
    const handleEscape = (event) => {
      if (event.key === 'Escape') {
        this.removePopup(overlay);
        document.removeEventListener('keydown', handleEscape);
      }
    };
    document.addEventListener('keydown', handleEscape);
    
    // Add hover effects to buttons
    yesBtn.addEventListener('mouseenter', () => {
      yesBtn.style.background = '#218838';
    });
    yesBtn.addEventListener('mouseleave', () => {
      yesBtn.style.background = '#28a745';
    });
    
    noBtn.addEventListener('mouseenter', () => {
      noBtn.style.background = '#e9ecef';
    });
    noBtn.addEventListener('mouseleave', () => {
      noBtn.style.background = '#f8f9fa';
    });
  },
  
  // Handle the quick reply response
  handleQuickReply(email, response, config) {
    const senderName = this.extractSenderName(email.from || 'Unknown Sender');
    
    // Log the response if enabled
    if (config.logResponses) {
      console.log(`[Quick Reply] ${senderName} (${email.from}): ${response.toUpperCase()}`);
      
      // Store in sessionStorage for potential future use
      try {
        const responses = JSON.parse(sessionStorage.getItem('quickReplyResponses') || '[]');
        responses.push({
          timestamp: new Date().toISOString(),
          emailId: email.id,
          sender: email.from,
          senderName: senderName,
          subject: email.subject,
          response: response,
          category: email.category
        });
        // Keep only last 100 responses
        if (responses.length > 100) {
          responses.splice(0, responses.length - 100);
        }
        sessionStorage.setItem('quickReplyResponses', JSON.stringify(responses));
      } catch (error) {
        console.warn('Failed to store quick reply response:', error);
      }
    }
    
    // Show confirmation popup
    this.showConfirmationPopup(senderName, response, config);
  },
  
  // Show confirmation popup after response
  showConfirmationPopup(senderName, response, config) {
    const overlay = document.createElement('div');
    overlay.className = 'popup-modal';
    overlay.style.cssText = `
      display: block;
      position: fixed;
      z-index: 2001;
      left: 0;
      top: 0;
      width: 100%;
      height: 100%;
      background-color: rgba(0,0,0,0.5);
      animation: fadeIn 0.2s ease;
    `;
    
    const modalContent = document.createElement('div');
    modalContent.className = 'popup-content';
    modalContent.style.cssText = `
      background-color: white;
      margin: 25% auto;
      padding: 0;
      border-radius: 12px;
      width: 90%;
      max-width: 400px;
      box-shadow: 0 8px 32px rgba(0,0,0,0.3);
      animation: popupSlideIn 0.3s ease;
    `;
    
    const responseText = response === 'yes' ? 'will respond' : 'will not respond';
    const icon = response === 'yes' ? '✅' : '❌';
    const iconColor = response === 'yes' ? '#28a745' : '#6c757d';
    
    modalContent.innerHTML = `
      <div class="popup-header" style="padding: 24px 24px 16px 24px; text-align: center;">
        <div style="font-size: 24px; margin-bottom: 12px; color: ${iconColor};">${icon}</div>
        <h3 class="popup-title" style="font-size: 16px; font-weight: 600; color: #333; margin: 0;">
          Response Recorded
        </h3>
      </div>
      <div class="popup-body" style="padding: 10px 24px 20px 24px; text-align: center;">
        <p style="font-size: 14px; color: #666; margin: 0; line-height: 1.4;">
          You indicated you <strong>${responseText}</strong> to <strong>${this.escapeHtml(senderName)}</strong>
        </p>
      </div>
      <div class="popup-actions" style="padding: 16px 24px 24px 24px; display: flex; justify-content: center;">
        <button class="popup-btn popup-btn-primary" style="
          padding: 10px 20px;
          border: none;
          border-radius: 6px;
          font-size: 14px;
          font-weight: 500;
          cursor: pointer;
          background: #4285f4;
          color: white;
          transition: background-color 0.2s ease;
        ">OK</button>
      </div>
    `;
    
    overlay.appendChild(modalContent);
    document.body.appendChild(overlay);
    
    // Auto-close after 3 seconds or on button click
    const closeBtn = modalContent.querySelector('.popup-btn');
    const autoClose = setTimeout(() => {
      this.removePopup(overlay);
    }, 3000);
    
    closeBtn.addEventListener('click', () => {
      clearTimeout(autoClose);
      this.removePopup(overlay);
    });
    
    // Add hover effect
    closeBtn.addEventListener('mouseenter', () => {
      closeBtn.style.background = '#3367d6';
    });
    closeBtn.addEventListener('mouseleave', () => {
      closeBtn.style.background = '#4285f4';
    });
    
    // Close on overlay click
    overlay.addEventListener('click', (event) => {
      if (event.target === overlay) {
        clearTimeout(autoClose);
        this.removePopup(overlay);
      }
    });
  },
  
  // Extract clean sender name from email address
  extractSenderName(fromString) {
    if (!fromString) return 'Unknown Sender';
    
    try {
      const str = String(fromString);
      
      // Handle "Name <email@domain.com>" format
      const nameMatch = str.match(/^([^<]+)</);
      if (nameMatch) {
        const name = nameMatch[1].trim();
        // Remove quotes if present
        return name.replace(/^["']|["']$/g, '');
      }
      
      // Handle "email@domain.com" format - extract name from email
      const emailMatch = str.match(/([^@\s]+)@/);
      if (emailMatch) {
        const localPart = emailMatch[1];
        // Convert dots/underscores to spaces and title case
        return localPart
          .replace(/[._-]/g, ' ')
          .replace(/\b\w/g, l => l.toUpperCase());
      }
      
      // Fallback: return as-is, cleaned
      return str.trim();
    } catch (error) {
      console.warn('Error extracting sender name:', error);
      return 'Unknown Sender';
    }
  },
  
  // Remove existing popup if present
  removeExistingPopup() {
    const existingPopup = document.getElementById('quickReplyModal');
    if (existingPopup) {
      existingPopup.remove();
    }
  },
  
  // Remove popup with animation
  removePopup(overlay) {
    if (overlay && overlay.parentNode) {
      overlay.style.opacity = '0';
      setTimeout(() => {
        try {
          overlay.remove();
        } catch (error) {
          // Ignore removal errors
        }
      }, 200);
    }
  },
  
  // HTML escape utility
  escapeHtml(text) {
    const div = document.createElement('div');
    div.textContent = text;
    return div.innerHTML;
  }
};
