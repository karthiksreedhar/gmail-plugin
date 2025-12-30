/**
 * Quick Reply Templates Frontend
 * Provides UI integration for managing and using category-based email templates
 */

(function() {
  console.log('Quick Reply Templates: Frontend loading...');
  
  if (!window.EmailAssistant) {
    console.error('Quick Reply Templates: EmailAssistant API not available');
    return;
  }
  
  const API = window.EmailAssistant;
  
  // Feature state
  let templates = {};
  let categories = [];
  
  // Initialize the feature
  async function initialize() {
    try {
      // Load initial data
      await loadTemplates();
      await loadCategories();
      
      // Add header button
      API.addHeaderButton('Quick Reply Templates', showTemplatesModal, {
        className: 'generate-btn',
        style: { marginRight: '12px' }
      });
      
      // Listen for email loading events to add Quick Reply buttons
      API.on('emailsLoaded', addQuickReplyButtons);
      
      // Also add buttons immediately if emails are already loaded
      setTimeout(() => {
        try {
          addQuickReplyButtons();
        } catch (e) {
          console.error('Quick Reply Templates: Error adding initial buttons:', e);
        }
      }, 100);
      
      // Set up periodic checking for new emails (more reliable than events)
      setInterval(() => {
        try {
          addQuickReplyButtons();
        } catch (e) {
          console.error('Quick Reply Templates: Error in periodic button check:', e);
        }
      }, 2000);
      
      // Hook into the global displayEmails function if it exists
      if (typeof window.displayEmails === 'function') {
        const originalDisplayEmails = window.displayEmails;
        window.displayEmails = async function(...args) {
          const result = await originalDisplayEmails.apply(this, args);
          // Add buttons after emails are displayed
          setTimeout(() => {
            try {
              addQuickReplyButtons();
            } catch (e) {
              console.error('Quick Reply Templates: Error adding buttons after displayEmails:', e);
            }
          }, 50);
          return result;
        };
      }
      
      console.log('Quick Reply Templates: Frontend initialized successfully');
    } catch (error) {
      console.error('Quick Reply Templates: Initialization failed:', error);
    }
  }
  
  // Load templates from backend
  async function loadTemplates() {
    try {
      const response = await API.apiCall('/api/quick-reply-templates/');
      if (response.success) {
        templates = response.templates || {};
      }
    } catch (error) {
      console.error('Quick Reply Templates: Failed to load templates:', error);
      templates = {};
    }
  }
  
  // Load current categories
  async function loadCategories() {
    try {
      const response = await fetch('/api/current-categories');
      const data = await response.json();
      categories = Array.isArray(data.categories) ? data.categories : [];
    } catch (error) {
      console.error('Quick Reply Templates: Failed to load categories:', error);
      categories = [];
    }
  }
  
  // Show templates management modal
  function showTemplatesModal() {
    const modalContent = createTemplatesModalContent();
    const modal = API.showModal(modalContent, 'Quick Reply Templates');
    
    // Wire up event handlers after modal is created
    setTimeout(() => {
      wireTemplateModalEvents(modal);
    }, 0);
  }
  
  // Create the templates modal content
  function createTemplatesModalContent() {
    if (categories.length === 0) {
      return `
        <div style="padding: 20px; text-align: center;">
          <div style="color: #666; margin-bottom: 16px;">
            <h4>No Categories Found</h4>
            <p>You need to have email categories set up to create templates.</p>
            <p>Load some emails first to establish categories, then return here to create templates.</p>
          </div>
          <button class="popup-btn popup-btn-secondary" onclick="this.closest('.modal').remove()">Close</button>
        </div>
      `;
    }
    
    const categoryRows = categories.map(category => {
      const template = templates[category] || '';
      const hasTemplate = template.trim() !== '';
      
      return `
        <div class="template-category-row" data-category="${category.replace(/"/g, '&quot;')}" style="
          border: 1px solid #e9ecef; 
          border-left: 4px solid #c19a6b; 
          border-radius: 6px; 
          background: #fff; 
          padding: 12px; 
          margin-bottom: 12px;
        ">
          <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 8px;">
            <h4 style="margin: 0; color: #333; font-size: 14px; font-weight: 600;">${category}</h4>
            <div style="display: flex; gap: 8px; align-items: center;">
              <span class="template-status" style="
                font-size: 12px; 
                padding: 3px 8px; 
                border-radius: 12px; 
                ${hasTemplate ? 'background: #d4edda; color: #155724;' : 'background: #f8d7da; color: #721c24;'}
              ">
                ${hasTemplate ? '✓ Template saved' : '⚠ No template'}
              </span>
              <button class="delete-template-btn popup-btn popup-btn-secondary" style="
                padding: 4px 8px; 
                font-size: 12px;
                ${!hasTemplate ? 'display: none;' : ''}
              " data-category="${category.replace(/"/g, '&quot;')}">
                Delete
              </button>
            </div>
          </div>
          <textarea class="template-input" data-category="${category.replace(/"/g, '&quot;')}" 
            placeholder="Enter your template for ${category} emails. Use [SENDER NAME] as a placeholder for the sender's name."
            style="
              width: 100%; 
              min-height: 100px; 
              padding: 10px; 
              border: 1px solid #ddd; 
              border-radius: 6px; 
              font-size: 14px; 
              font-family: inherit; 
              resize: vertical;
              box-sizing: border-box;
            ">${template.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')}</textarea>
          <div style="font-size: 12px; color: #666; margin-top: 6px;">
            Example: "Hello [SENDER NAME], thank you for your email regarding..."
          </div>
        </div>
      `;
    }).join('');
    
    return `
      <div style="padding: 20px; max-height: 60vh; overflow-y: auto;">
        <div style="margin-bottom: 20px;">
          <p style="color: #666; margin: 0; line-height: 1.5;">
            Create templates for each category. Use <strong>[SENDER NAME]</strong> as a placeholder for the sender's name.
            Templates will be available as "Quick Reply" buttons on emails in those categories.
          </p>
        </div>
        
        <div id="templatesContainer">
          ${categoryRows}
        </div>
        
        <div style="
          display: flex; 
          justify-content: center; 
          gap: 12px; 
          padding-top: 16px; 
          border-top: 1px solid #e9ecef; 
          margin-top: 16px;
        ">
          <button class="popup-btn popup-btn-secondary" onclick="this.closest('.modal').remove()">Cancel</button>
          <button id="saveAllTemplatesBtn" class="popup-btn popup-btn-success">
            <span class="btn-text">Save All Templates</span>
            <span class="btn-loading" style="display: none;">Saving...</span>
          </button>
        </div>
      </div>
    `;
  }
  
  // Wire up event handlers for the templates modal
  function wireTemplateModalEvents(modal) {
    if (!modal) return;
    
    // Save all templates button
    const saveBtn = modal.querySelector('#saveAllTemplatesBtn');
    if (saveBtn) {
      saveBtn.addEventListener('click', saveAllTemplates);
    }
    
    // Delete template buttons
    const deleteButtons = modal.querySelectorAll('.delete-template-btn');
    deleteButtons.forEach(btn => {
      btn.addEventListener('click', async (e) => {
        const category = e.target.getAttribute('data-category');
        await deleteTemplate(category);
        // Refresh modal content
        refreshTemplateModal(modal);
      });
    });
    
    // Auto-save on input change with debouncing
    const textareas = modal.querySelectorAll('.template-input');
    textareas.forEach(textarea => {
      let debounceTimer;
      textarea.addEventListener('input', () => {
        clearTimeout(debounceTimer);
        debounceTimer = setTimeout(() => {
          updateTemplateStatus(textarea);
        }, 500);
      });
    });
  }
  
  // Update template status indicator as user types
  function updateTemplateStatus(textarea) {
    const category = textarea.getAttribute('data-category');
    const value = textarea.value.trim();
    const row = textarea.closest('.template-category-row');
    if (!row) return;
    
    const statusEl = row.querySelector('.template-status');
    const deleteBtn = row.querySelector('.delete-template-btn');
    
    if (value) {
      statusEl.textContent = '✓ Template ready';
      statusEl.style.background = '#d4edda';
      statusEl.style.color = '#155724';
      deleteBtn.style.display = 'inline-block';
    } else {
      statusEl.textContent = '⚠ No template';
      statusEl.style.background = '#f8d7da';
      statusEl.style.color = '#721c24';
      deleteBtn.style.display = 'none';
    }
  }
  
  // Save all templates
  async function saveAllTemplates() {
    const saveBtn = document.getElementById('saveAllTemplatesBtn');
    if (!saveBtn) return;
    
    const btnText = saveBtn.querySelector('.btn-text');
    const btnLoading = saveBtn.querySelector('.btn-loading');
    
    // Show loading state
    btnText.style.display = 'none';
    btnLoading.style.display = 'inline';
    saveBtn.disabled = true;
    
    try {
      const textareas = document.querySelectorAll('.template-input');
      let savedCount = 0;
      let errorCount = 0;
      
      for (const textarea of textareas) {
        const category = textarea.getAttribute('data-category');
        const template = textarea.value;
        
        try {
          const response = await API.apiCall('/api/quick-reply-templates/', {
            method: 'POST',
            body: { category, template }
          });
          
          if (response.success) {
            savedCount++;
            // Update local templates cache
            if (template.trim() === '') {
              delete templates[category];
            } else {
              templates[category] = template;
            }
          } else {
            errorCount++;
            console.error(`Failed to save template for ${category}:`, response.error);
          }
        } catch (error) {
          errorCount++;
          console.error(`Error saving template for ${category}:`, error);
        }
      }
      
      // Show result
      if (errorCount === 0) {
        API.showSuccess(`Successfully saved ${savedCount} template${savedCount === 1 ? '' : 's'}!`);
      } else {
        API.showError(`Saved ${savedCount} templates, but ${errorCount} failed. Please try again.`);
      }
      
      // Reload templates and refresh the UI to show Quick Reply buttons
      // while preserving Priority Today email states
      setTimeout(async () => {
        await loadTemplates();
        await refreshUIWithPreservedPriorityEmails();
      }, 100);
      
    } catch (error) {
      console.error('Quick Reply Templates: Error saving templates:', error);
      API.showError('Failed to save templates. Please try again.');
    } finally {
      // Reset loading state
      btnText.style.display = 'inline';
      btnLoading.style.display = 'none';
      saveBtn.disabled = false;
    }
  }
  
  // Delete a specific template
  async function deleteTemplate(category) {
    try {
      const response = await API.apiCall(`/api/quick-reply-templates/${encodeURIComponent(category)}`, {
        method: 'DELETE'
      });
      
      if (response.success) {
        delete templates[category];
        API.showSuccess(`Template for "${category}" deleted successfully!`);
        
        // Refresh Quick Reply buttons
        setTimeout(() => {
          addQuickReplyButtons();
        }, 100);
      } else {
        API.showError(`Failed to delete template: ${response.error}`);
      }
    } catch (error) {
      console.error('Quick Reply Templates: Error deleting template:', error);
      API.showError('Failed to delete template. Please try again.');
    }
  }
  
  // Refresh template modal content
  function refreshTemplateModal(modal) {
    if (!modal) return;
    
    const content = modal.querySelector('.modal-content > div');
    if (content) {
      content.innerHTML = createTemplatesModalContent();
      wireTemplateModalEvents(modal);
    }
  }
  
  // Add Quick Reply buttons to email cards that have templates
  function addQuickReplyButtons() {
    try {
      console.log('Quick Reply Templates: Adding buttons. Templates available:', Object.keys(templates));
      
      // Remove any existing Quick Reply buttons first
      const existingButtons = document.querySelectorAll('.quick-reply-btn');
      existingButtons.forEach(btn => btn.remove());
      
      // Get all email items
      const allEmailItems = document.querySelectorAll('.email-item');
      console.log('Quick Reply Templates: Found', allEmailItems.length, 'email items');
      
      allEmailItems.forEach((emailItem, index) => {
        try {
          // Get email categories from the category pills
          const categoryPills = emailItem.querySelectorAll('.email-category');
          const emailCategories = Array.from(categoryPills).map(pill => 
            pill.textContent.trim()
          );
          
          console.log(`Quick Reply Templates: Email ${index} categories:`, emailCategories);
          
          // Check if any category has a template
          const hasTemplate = emailCategories.some(cat => {
            const hasIt = templates[cat] && templates[cat].trim() !== '';
            if (hasIt) {
              console.log(`Quick Reply Templates: Found template for category "${cat}"`);
            }
            return hasIt;
          });
          
          console.log(`Quick Reply Templates: Email ${index} has template:`, hasTemplate);
          
          if (hasTemplate) {
            // Find the email actions container
            const actionsContainer = emailItem.querySelector('.email-actions');
            console.log(`Quick Reply Templates: Email ${index} actions container:`, !!actionsContainer);
            
            if (actionsContainer) {
              // Create Quick Reply button
              const quickReplyBtn = document.createElement('button');
              quickReplyBtn.className = 'quick-reply-btn';
              quickReplyBtn.textContent = 'Quick Reply';
              quickReplyBtn.title = 'Generate response using template';
              quickReplyBtn.style.cssText = `
                background: #28a745;
                color: white;
                border: none;
                padding: 8px 12px;
                border-radius: 4px;
                cursor: pointer;
                font-size: 14px;
                font-weight: 500;
                transition: all 0.2s ease;
                margin-right: 8px;
                opacity: 1;
                transform: scale(1);
              `;
              
              quickReplyBtn.addEventListener('mouseover', () => {
                quickReplyBtn.style.background = '#218838';
                quickReplyBtn.style.transform = 'scale(1.05)';
              });
              
              quickReplyBtn.addEventListener('mouseout', () => {
                quickReplyBtn.style.background = '#28a745';
                quickReplyBtn.style.transform = 'scale(1)';
              });
              
              // Add click handler
              quickReplyBtn.addEventListener('click', async (e) => {
                e.stopPropagation(); // Prevent opening email thread
                await handleQuickReply(emailItem, emailCategories);
              });
              
              // Insert before the delete button
              const deleteBtn = actionsContainer.querySelector('.delete-thread-btn');
              if (deleteBtn) {
                actionsContainer.insertBefore(quickReplyBtn, deleteBtn);
              } else {
                actionsContainer.appendChild(quickReplyBtn);
              }
              
              console.log(`Quick Reply Templates: Added button to email ${index}`);
            }
          }
        } catch (error) {
          console.error('Quick Reply Templates: Error processing email item:', error);
        }
      });
      
      // No hover animation needed - buttons are always visible
      
    } catch (error) {
      console.error('Quick Reply Templates: Error adding Quick Reply buttons:', error);
    }
  }
  
  // Handle Quick Reply button click
  async function handleQuickReply(emailItem, emailCategories) {
    try {
      // Find the first category that has a template
      let selectedCategory = null;
      let selectedTemplate = null;
      
      for (const category of emailCategories) {
        if (templates[category] && templates[category].trim() !== '') {
          selectedCategory = category;
          selectedTemplate = templates[category];
          break;
        }
      }
      
      if (!selectedCategory || !selectedTemplate) {
        API.showError('No template found for this email\'s categories.');
        return;
      }
      
      // Extract email information
      const emailData = extractEmailData(emailItem);
      if (!emailData) {
        API.showError('Could not extract email information.');
        return;
      }
      
      // Generate response using template
      const response = await API.apiCall('/api/quick-reply-templates/generate', {
        method: 'POST',
        body: {
          category: selectedCategory,
          senderName: emailData.senderName,
          senderEmail: emailData.senderEmail
        }
      });
      
      if (!response.success) {
        API.showError(`Failed to generate quick reply: ${response.error}`);
        return;
      }
      
      // Navigate to response page with template as generated content
      await openResponsePageWithTemplate(emailData, response, emailItem);
      
    } catch (error) {
      console.error('Quick Reply Templates: Error handling quick reply:', error);
      API.showError('Failed to generate quick reply. Please try again.');
    }
  }
  
  // Extract email data from email item DOM
  function extractEmailData(emailItem) {
    try {
      const fromElement = emailItem.querySelector('.email-from');
      const subjectElement = emailItem.querySelector('.email-subject');
      const dateElement = emailItem.querySelector('.email-date');
      
      if (!fromElement || !subjectElement) {
        return null;
      }
      
      let fromText = fromElement.textContent.trim();
      const subject = subjectElement.textContent.trim();
      const date = dateElement ? dateElement.textContent.trim() : '';
      
      // Clean up fromText by removing "Open in Inbox" link text
      fromText = fromText.replace(/\s*Open in Inbox\s*$/, '').trim();
      
      // Extract sender name and email
      let senderName = fromText;
      let senderEmail = fromText;
      
      // Try to parse "Name <email>" format
      const emailMatch = fromText.match(/^([^<]+)<([^>]+)>/);
      if (emailMatch) {
        senderName = emailMatch[1].trim();
        senderEmail = emailMatch[2].trim();
      } else if (fromText.includes('@')) {
        // Just an email address
        senderEmail = fromText;
        senderName = fromText.split('@')[0];
      }
      
      return {
        senderName,
        senderEmail,
        subject,
        date,
        from: fromText
      };
    } catch (error) {
      console.error('Quick Reply Templates: Error extracting email data:', error);
      return null;
    }
  }
  
  // Open response page with template content
  async function openResponsePageWithTemplate(emailData, templateResponse, emailItem) {
    try {
      // Store the template response for injection after thread opens
      window._quickReplyTemplateData = {
        emailData,
        templateResponse,
        timestamp: Date.now()
      };
      
      // Trigger the same click that happens when clicking the email card
      // This ensures we use the exact same data path (stored data, not Gmail API)
      if (emailItem && typeof emailItem.onclick === 'function') {
        console.log('Quick Reply Templates: Triggering email card click to open thread with stored data');
        emailItem.onclick();
        
        // Wait a bit for the thread to open, then inject our template
        setTimeout(() => {
          injectTemplateAfterThreadOpens();
        }, 500);
      } else {
        // Fallback to modal if click handler not available
        console.log('Quick Reply Templates: No onclick handler found, falling back to modal');
        await openGenerateModalWithTemplate(emailData, templateResponse);
      }
      
    } catch (error) {
      console.error('Quick Reply Templates: Error opening response page:', error);
      API.showError('Failed to open response page with template.');
    }
  }
  
  // Inject template after thread opens via normal email click
  async function injectTemplateAfterThreadOpens() {
    try {
      const data = window._quickReplyTemplateData;
      if (!data || (Date.now() - data.timestamp) > 10000) {
        // Template data expired or missing
        return;
      }
      
      // Clear the stored data
      delete window._quickReplyTemplateData;
      
      console.log('Quick Reply Templates: Injecting template into opened thread');
      
      // Wait for thread view to be visible and ready
      let attempts = 0;
      while (attempts < 10) {
        const threadView = document.getElementById('threadView');
        if (threadView && threadView.style.display !== 'none') {
          break;
        }
        await new Promise(resolve => setTimeout(resolve, 100));
        attempts++;
      }
      
      // Trigger reply to create the composer
      if (typeof window.replyToCurrentThread === 'function') {
        window.replyToCurrentThread();
        
        // Wait for composer to be created
        await new Promise(resolve => setTimeout(resolve, 300));
      }
      
      // Inject the template into the reply composer
      await injectTemplateIntoThreadView(data.emailData, data.templateResponse);
      
    } catch (error) {
      console.error('Quick Reply Templates: Error injecting template after thread opens:', error);
    }
  }
  
  // Get email ID from email data and DOM
  function getEmailIdFromData(emailData, emailItem) {
    try {
      // First try to get from the data attribute we stored on the email item
      if (emailItem) {
        const storedId = emailItem.getAttribute('data-email-id');
        if (storedId) {
          return storedId;
        }
        
        // Try to extract from onclick handler
        const onclickStr = emailItem.getAttribute('onclick') || emailItem.onclick?.toString() || '';
        console.log('Quick Reply Templates: onclick string:', onclickStr);
        
        // Try multiple patterns for ID extraction
        let idMatch = onclickStr.match(/openEmailThread\(['"]([^'"]+)['"]/);
        if (!idMatch) {
          idMatch = onclickStr.match(/openEmailThread\(([^,)]+)/);
        }
        if (!idMatch) {
          // Try to find any email-like ID pattern
          idMatch = onclickStr.match(/([a-zA-Z0-9\-_]+@[a-zA-Z0-9\-_.]+|[a-zA-Z0-9\-_]{10,})/);
        }
        
        if (idMatch) {
          console.log('Quick Reply Templates: Extracted email ID:', idMatch[1]);
          return idMatch[1];
        }
      }
      
      // Fallback: search in the global email arrays
      if (typeof window.allEmails !== 'undefined' && Array.isArray(window.allEmails)) {
        const matchingEmail = window.allEmails.find(email => 
          email.subject === emailData.subject && 
          (email.originalFrom === emailData.from || email.from === emailData.from)
        );
        if (matchingEmail) {
          return matchingEmail.id;
        }
      }
      
      // Another fallback: try API.getEmails()
      const emails = API.getEmails();
      if (Array.isArray(emails)) {
        const matchingEmail = emails.find(email => 
          email.subject === emailData.subject && 
          (email.originalFrom === emailData.from || email.from === emailData.from)
        );
        if (matchingEmail) {
          return matchingEmail.id;
        }
      }
      
      return null;
    } catch (error) {
      console.error('Quick Reply Templates: Error getting email ID:', error);
      return null;
    }
  }
  
  // Wait for thread to load completely with messages
  async function waitForThreadToLoad() {
    try {
      let attempts = 0;
      const maxAttempts = 20; // 4 seconds max
      
      while (attempts < maxAttempts) {
        // Check if thread view is visible
        const threadView = document.getElementById('threadView');
        if (!threadView || threadView.style.display === 'none') {
          await new Promise(resolve => setTimeout(resolve, 200));
          attempts++;
          continue;
        }
        
        // Check if thread context is set up
        if (typeof window.currentThreadContext !== 'undefined' && 
            window.currentThreadContext && 
            Array.isArray(window.currentThreadContext.messages) && 
            window.currentThreadContext.messages.length > 0) {
          console.log('Quick Reply Templates: Thread context loaded with', window.currentThreadContext.messages.length, 'messages');
          return true;
        }
        
        // Check for thread messages in DOM
        const threadMessages = document.querySelectorAll('.thread-message-card, .message-preview-body');
        if (threadMessages.length > 0) {
          console.log('Quick Reply Templates: Found', threadMessages.length, 'thread messages in DOM');
          return true;
        }
        
        await new Promise(resolve => setTimeout(resolve, 200));
        attempts++;
      }
      
      console.warn('Quick Reply Templates: Thread loading timeout after', maxAttempts * 200, 'ms');
      return false;
    } catch (error) {
      console.error('Quick Reply Templates: Error waiting for thread to load:', error);
      return false;
    }
  }
  
  // Inject template into thread view after it's opened
  async function injectTemplateIntoThreadView(emailData, templateResponse) {
    try {
      // Trigger the reply function to create the inline composer
      if (typeof window.replyToCurrentThread === 'function') {
        window.replyToCurrentThread();
        
        // Wait for composer to be created
        await new Promise(resolve => setTimeout(resolve, 200));
      }
      
      // Find the inline composer
      const inlineComposer = document.getElementById('inlineReplyCompose');
      if (!inlineComposer) {
        console.error('Quick Reply Templates: Could not find inline composer');
        return;
      }
      
      // Pre-fill the form fields
      const senderInput = document.getElementById('senderInput');
      const subjectInput = document.getElementById('subjectInput');
      const emailBodyInput = document.getElementById('emailBodyInput');
      
      if (senderInput) senderInput.value = emailData.senderEmail;
      if (subjectInput) subjectInput.value = emailData.subject;
      if (emailBodyInput) emailBodyInput.value = `Original email from ${emailData.from}`;
      
      // Set the generated response
      if (typeof window !== 'undefined') {
        window.currentGeneratedResponse = templateResponse.response;
      }
      
      // Show the response area immediately
      const responseArea = document.getElementById('generatedResponseArea');
      const responseDisplay = document.getElementById('responseDisplay');
      const refineSection = document.getElementById('refineSection');
      
      if (responseArea && responseDisplay) {
        responseDisplay.innerHTML = templateResponse.response.replace(/\n/g, '<br>');
        responseArea.style.display = 'block';
        if (refineSection) refineSection.style.display = 'block';
      }
      
      // Create justification section if the function exists
      if (typeof window.createJustificationSection === 'function') {
        window.createJustificationSection(templateResponse.justification);
      }
      
      // Scroll to the generated response
      if (responseArea) {
        responseArea.scrollIntoView({ behavior: 'smooth', block: 'start' });
      }
      
      API.showSuccess('Quick reply template applied!');
      
    } catch (error) {
      console.error('Quick Reply Templates: Error injecting template into thread view:', error);
      API.showError('Template applied but there was an issue displaying it.');
    }
  }
  
  // Open inline composer (for thread view)
  async function openInlineComposerWithTemplate(emailData, templateResponse) {
    try {
      // Check if the inline composer already exists
      let inlineComposer = document.getElementById('inlineReplyCompose');
      
      if (!inlineComposer) {
        // Trigger the reply functionality to create the composer
        if (typeof replyToCurrentThread === 'function') {
          replyToCurrentThread();
          
          // Wait for composer to be created
          await new Promise(resolve => setTimeout(resolve, 100));
          inlineComposer = document.getElementById('inlineReplyCompose');
        }
      }
      
      if (inlineComposer && inlineComposer.style.display !== 'none') {
        // Pre-fill the form
        const senderInput = document.getElementById('senderInput');
        const subjectInput = document.getElementById('subjectInput');
        const emailBodyInput = document.getElementById('emailBodyInput');
        
        if (senderInput) senderInput.value = emailData.senderEmail;
        if (subjectInput) subjectInput.value = emailData.subject;
        if (emailBodyInput) emailBodyInput.value = `Original email from ${emailData.from}`;
        
        // Set the generated response directly
        if (typeof window !== 'undefined') {
          window.currentGeneratedResponse = templateResponse.response;
        }
        
        // Show the response area
        const responseArea = document.getElementById('generatedResponseArea');
        const responseDisplay = document.getElementById('responseDisplay');
        const refineSection = document.getElementById('refineSection');
        
        if (responseArea && responseDisplay) {
          responseDisplay.innerHTML = templateResponse.response.replace(/\n/g, '<br>');
          responseArea.style.display = 'block';
          if (refineSection) refineSection.style.display = 'block';
        }
        
        // Scroll to response
        inlineComposer.scrollIntoView({ behavior: 'smooth', block: 'start' });
        
        API.showSuccess('Quick reply template applied!');
      } else {
        // Fallback to modal
        await openGenerateModalWithTemplate(emailData, templateResponse);
      }
    } catch (error) {
      console.error('Quick Reply Templates: Error with inline composer:', error);
      // Fallback to modal
      await openGenerateModalWithTemplate(emailData, templateResponse);
    }
  }
  
  // Open generate response modal (for email list view)
  async function openGenerateModalWithTemplate(emailData, templateResponse) {
    try {
      // Check if generateResponse function exists and use it
      if (typeof showGenerateResponseModal === 'function') {
        showGenerateResponseModal();
        
        // Wait for modal to be created
        await new Promise(resolve => setTimeout(resolve, 100));
        
        // Pre-fill the form
        const senderInput = document.getElementById('senderInput');
        const subjectInput = document.getElementById('subjectInput');
        const emailBodyInput = document.getElementById('emailBodyInput');
        
        if (senderInput) senderInput.value = emailData.senderEmail;
        if (subjectInput) subjectInput.value = emailData.subject;
        if (emailBodyInput) emailBodyInput.value = `Original email from ${emailData.from}`;
        
        // Set the generated response directly
        if (typeof window !== 'undefined') {
          window.currentGeneratedResponse = templateResponse.response;
        }
        
        // Show the response immediately
        const responseArea = document.getElementById('generatedResponseArea');
        const responseDisplay = document.getElementById('responseDisplay');
        const refineSection = document.getElementById('refineSection');
        
        if (responseArea && responseDisplay) {
          responseDisplay.innerHTML = templateResponse.response.replace(/\n/g, '<br>');
          responseArea.style.display = 'block';
          if (refineSection) refineSection.style.display = 'block';
        }
        
        // Create justification section
        if (typeof createJustificationSection === 'function') {
          createJustificationSection(templateResponse.justification);
        }
        
        API.showSuccess('Quick reply template applied!');
      } else {
        // Fallback: show template in a simple modal
        const content = `
          <div style="padding: 20px;">
            <h3>Quick Reply Template</h3>
            <div style="margin-bottom: 12px;">
              <strong>From:</strong> ${emailData.from}<br>
              <strong>Subject:</strong> ${emailData.subject}
            </div>
            <div style="
              background: #f8f9fa; 
              border: 1px solid #e9ecef; 
              border-radius: 6px; 
              padding: 15px; 
              margin-bottom: 15px;
              line-height: 1.6;
              white-space: pre-wrap;
            ">${templateResponse.response}</div>
            <div style="text-align: center;">
              <button class="popup-btn popup-btn-success" onclick="copyTemplateResponse('${templateResponse.response.replace(/'/g, "\\'")}')">
                Copy to Clipboard
              </button>
              <button class="popup-btn popup-btn-secondary" onclick="this.closest('.modal').remove()" style="margin-left: 8px;">
                Close
              </button>
            </div>
          </div>
        `;
        
        API.showModal(content, 'Quick Reply');
        
        // Add copy function to global scope temporarily
        window.copyTemplateResponse = async (text) => {
          try {
            await navigator.clipboard.writeText(text);
            API.showSuccess('Response copied to clipboard!');
          } catch (error) {
            console.error('Copy failed:', error);
            API.showError('Failed to copy to clipboard.');
          }
        };
      }
    } catch (error) {
      console.error('Quick Reply Templates: Error opening generate modal:', error);
      API.showError('Failed to open response with template.');
    }
  }
  
  // Refresh UI while preserving Priority Today email categories
  async function refreshUIWithPreservedPriorityEmails() {
    try {
      console.log('Quick Reply Templates: Refreshing UI while preserving Priority Today states');
      
      // Step 1: Save current Priority Today email states
      let savedPriorityStates = null;
      if (typeof window.priorityTodayEmails !== 'undefined' && Array.isArray(window.priorityTodayEmails)) {
        savedPriorityStates = window.priorityTodayEmails.map(email => ({
          id: email.id,
          subject: email.subject,
          from: email.from,
          category: email._cat || email.category,
          _cat: email._cat,
          _catReason: email._catReason,
          // Preserve all original data
          ...email
        }));
        console.log('Quick Reply Templates: Saved', savedPriorityStates.length, 'Priority Today email states');
      }
      
      // Step 2: Refresh main emails to get Quick Reply buttons without affecting priority emails
      if (typeof window.loadEmails === 'function') {
        await window.loadEmails();
      }
      
      // Step 3: Restore Priority Today emails with preserved states
      if (savedPriorityStates && savedPriorityStates.length > 0) {
        // Restore the priority emails array with preserved categories
        window.priorityTodayEmails = savedPriorityStates;
        
        // Re-render the Priority Today section with preserved categories
        if (typeof window.renderPriorityToday === 'function') {
          window.renderPriorityToday();
        }
        
        console.log('Quick Reply Templates: Restored Priority Today emails with preserved categories');
      }
      
      // Step 4: Add Quick Reply buttons to the refreshed email list
      addQuickReplyButtons();
      
      console.log('Quick Reply Templates: UI refresh complete with preserved Priority Today states');
      
    } catch (error) {
      console.error('Quick Reply Templates: Error refreshing UI with preserved states:', error);
      // Fallback to simple button refresh
      addQuickReplyButtons();
    }
  }
  
  // Initialize when feature loads
  initialize();
  
  console.log('Quick Reply Templates: Frontend loaded successfully');
})();
