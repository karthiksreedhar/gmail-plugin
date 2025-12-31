/**
 * Response Suggestions Frontend
 * Displays old email threads that require urgent responses
 */

(function() {
  console.log('Response Suggestions: Frontend loading...');
  
  // Check API availability
  if (!window.EmailAssistant) {
    console.error('Response Suggestions: EmailAssistant API not available');
    return;
  }
  
  const API = window.EmailAssistant;
  
  // State management
  let responseSuggestions = [];
  let isAnalyzing = false;
  
  // Create response suggestions container
  function createResponseSuggestionsContainer() {
    const priorityContainer = document.getElementById('priorityContainer');
    if (!priorityContainer) {
      console.error('Response Suggestions: Priority container not found');
      return null;
    }
    
    // Check if container already exists
    let container = document.getElementById('responseSuggestionsContainer');
    if (container) {
      return container;
    }
    
    // Create new container above priority container
    container = document.createElement('div');
    container.id = 'responseSuggestionsContainer';
    container.style.marginBottom = '8px';
    
    // Insert before priority container
    priorityContainer.parentNode.insertBefore(container, priorityContainer);
    
    return container;
  }
  
  // Render response suggestions
  function renderResponseSuggestions() {
    const container = createResponseSuggestionsContainer();
    if (!container) return;
    
    container.innerHTML = '';
    
    if (!responseSuggestions || responseSuggestions.length === 0) {
      return; // Don't show anything if no suggestions
    }
    
    // Title row
    const header = document.createElement('div');
    header.style.display = 'flex';
    header.style.alignItems = 'center';
    header.style.justifyContent = 'space-between';
    header.style.padding = '8px 28px 0 28px';
    header.innerHTML = `
      <div style="color:#5f6368; font-size:12px; text-transform:uppercase; letter-spacing:0.4px;">
        Response Suggestions — ${responseSuggestions.length} email${responseSuggestions.length === 1 ? '' : 's'} need${responseSuggestions.length === 1 ? 's' : ''} response
      </div>
      <button id="refreshResponseSuggestions" style="background:#ff9800; color:white; border:none; padding:4px 8px; border-radius:4px; font-size:11px; cursor:pointer;">
        ${isAnalyzing ? 'Analyzing...' : 'Refresh'}
      </button>
    `;
    container.appendChild(header);
    
    // Suggestion cards
    responseSuggestions.forEach((suggestion, idx) => {
      const card = document.createElement('div');
      card.className = 'response-suggestion-card';
      card.style.cssText = `
        border: 1px solid #e9ecef;
        border-radius: 8px;
        padding: 12px;
        background: #FFE5CC;
        margin: 10px 28px;
        position: relative;
        cursor: pointer;
        transition: background-color 0.1s, box-shadow 0.1s;
        display: flex;
        align-items: flex-start;
        gap: 12px;
      `;
      
      card.addEventListener('mouseenter', () => {
        card.style.backgroundColor = '#FFD4B3';
        card.style.boxShadow = '0 4px 10px rgba(0,0,0,0.08)';
      });
      
      card.addEventListener('mouseleave', () => {
        card.style.backgroundColor = '#FFE5CC';
        card.style.boxShadow = 'none';
      });
      
      const from = suggestion.from || 'Unknown Sender';
      const subject = suggestion.subject || 'No Subject';
      const date = suggestion.date || '';
      const justification = suggestion.justification || 'Requires response based on analysis';
      
      // Calculate days since last activity
      const daysSince = suggestion.date ? Math.floor((new Date() - new Date(suggestion.date)) / (1000 * 60 * 60 * 24)) : 0;
      
      card.innerHTML = `
        <div style="flex-shrink: 0; display: flex; flex-direction: column; align-items: center; gap: 8px;">
          <button class="response-reply-btn" onclick="replyToSuggestion('${suggestion.id}', event)" 
                  style="width: 48px; height: 48px; border-radius: 50%; border: none; background: #1a73e8; color: #fff; font-size: 20px; cursor: pointer; display: flex; align-items: center; justify-content: center; transition: all 0.2s ease; box-shadow: 0 2px 6px rgba(26, 115, 232, 0.3);"
                  title="Reply to this email">
            ↩️
          </button>
          <button class="response-dismiss-btn" onclick="dismissSuggestion('${suggestion.id}', event)"
                  style="border: none; border-radius: 6px; padding: 6px 10px; font-size: 12px; cursor: pointer; transition: all 0.15s ease; background: #6c757d; color: #fff;"
                  title="Dismiss this suggestion">
            Dismiss
          </button>
        </div>
        <div style="flex: 1; min-width: 0; padding-right: 60px;">
          <div style="display: flex; align-items: center; justify-content: space-between; gap: 8px;">
            <div style="font-weight: 600; color: #333; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; padding-right: 12px; font-size: 16px;">
              ${escapeHtml(subject)}
            </div>
            <div style="font-size: 16px; color: #5f6368; white-space: nowrap; font-weight: 500; display:flex; align-items:center; gap:8px;">
              ${formatDate(date)} (${daysSince} days ago)
              <span style="font-size: 11px; color: #9aa0a6; font-weight: 400;">${escapeHtml(suggestion.id || '')}</span>
            </div>
          </div>
          <div style="font-size: 12px; color: #666; margin-top: 2px;">${escapeHtml(from)}</div>
          <div style="font-size: 12px; color: #c65d00; display: block; max-width: 100%; white-space: normal; overflow: visible; text-overflow: clip; word-break: break-word; overflow-wrap: anywhere; margin-top: 6px; font-weight: 500;">
            💡 ${escapeHtml(justification)}
          </div>
        </div>
      `;
      
      // Open thread on card click (excluding buttons)
      card.addEventListener('click', (ev) => {
        const target = ev.target;
        if (target && (target.classList.contains('response-reply-btn') || 
                      target.classList.contains('response-dismiss-btn') || 
                      target.closest('.response-reply-btn') || 
                      target.closest('.response-dismiss-btn'))) {
          return; // Don't open thread if clicking buttons
        }
        
        if (typeof openEmailThread === 'function') {
          openEmailThread(suggestion.id, suggestion.subject);
        }
      });
      
      container.appendChild(card);
    });
    
    // Wire refresh button
    const refreshBtn = document.getElementById('refreshResponseSuggestions');
    if (refreshBtn && !refreshBtn.onclick) {
      refreshBtn.onclick = analyzeResponseSuggestions;
    }
  }
  
  // Load current suggestions
  async function loadResponseSuggestions() {
    try {
      const response = await API.apiCall('/api/response-suggestions/get');
      
      if (response.success) {
        responseSuggestions = response.suggestions || [];
        console.log(`Response Suggestions: Loaded ${responseSuggestions.length} suggestions`);
        renderResponseSuggestions();
      } else {
        console.error('Response Suggestions: Failed to load suggestions:', response.error);
      }
    } catch (error) {
      console.error('Response Suggestions: Error loading suggestions:', error);
    }
  }
  
  // Analyze email threads for response suggestions
  async function analyzeResponseSuggestions() {
    if (isAnalyzing) return;
    
    isAnalyzing = true;
    
    try {
      // Show loading state
      const refreshBtn = document.getElementById('refreshResponseSuggestions');
      if (refreshBtn) {
        refreshBtn.textContent = 'Analyzing...';
        refreshBtn.disabled = true;
      }
      
      console.log('Response Suggestions: Starting analysis...');
      
      const response = await API.apiCall('/api/response-suggestions/analyze', {
        method: 'POST'
      });
      
      if (response.success) {
        responseSuggestions = response.suggestions || [];
        console.log(`Response Suggestions: Analysis complete. Found ${responseSuggestions.length} suggestions`);
        
        renderResponseSuggestions();
        
        // Show success message if suggestions found
        if (responseSuggestions.length > 0) {
          API.showSuccess(`Found ${responseSuggestions.length} email${responseSuggestions.length === 1 ? '' : 's'} that need${responseSuggestions.length === 1 ? 's' : ''} your response!`);
        } else {
          API.showSuccess('No urgent email responses needed at this time.');
        }
      } else {
        console.error('Response Suggestions: Analysis failed:', response.error);
        API.showError('Failed to analyze emails for response suggestions. Please try again.');
      }
    } catch (error) {
      console.error('Response Suggestions: Error during analysis:', error);
      API.showError('An error occurred while analyzing emails. Please try again.');
    } finally {
      isAnalyzing = false;
      
      // Reset refresh button
      const refreshBtn = document.getElementById('refreshResponseSuggestions');
      if (refreshBtn) {
        refreshBtn.textContent = 'Refresh';
        refreshBtn.disabled = false;
      }
    }
  }
  
  // Reply to a suggested email - go directly to REPLY PAGE
  window.replyToSuggestion = function(suggestionId, event) {
    if (event) event.stopPropagation();
    
    const suggestion = responseSuggestions.find(s => s.id === suggestionId);
    if (!suggestion) {
      API.showError('Suggestion not found');
      return;
    }
    
    console.log(`Response Suggestions: Opening reply interface for ${suggestion.subject}`);
    
    // Load the thread data and go directly to reply interface
    loadThreadAndOpenReply(suggestion);
  };
  
  // Load thread data and open inline reply interface
  async function loadThreadAndOpenReply(suggestion) {
    try {
      console.log(`Response Suggestions: Opening thread ${suggestion.id} and triggering inline reply...`);
      
      // First, open the email thread in the main view (this replaces the email list)
      if (typeof openEmailThread === 'function') {
        await openEmailThread(suggestion.id, suggestion.subject);
        
        // Wait a moment for the thread to load, then trigger the inline reply
        setTimeout(() => {
          if (typeof replyToCurrentThread === 'function') {
            console.log('Response Suggestions: Triggering inline reply interface...');
            replyToCurrentThread();
          } else {
            console.error('Response Suggestions: replyToCurrentThread function not available');
            API.showError('Unable to open inline reply interface');
          }
        }, 800); // Increased delay to ensure thread loads completely
        
      } else {
        console.error('Response Suggestions: openEmailThread function not available');
        API.showError('Unable to open email thread');
      }
      
    } catch (error) {
      console.error('Response Suggestions: Error opening thread for reply:', error);
      API.showError('Failed to open email for reply');
    }
  }
  
  // Dismiss a suggestion
  window.dismissSuggestion = function(suggestionId, event) {
    if (event) event.stopPropagation();
    
    API.apiCall(`/api/response-suggestions/dismiss/${suggestionId}`, {
      method: 'POST'
    }).then(response => {
      if (response.success) {
        // Remove suggestion from local state
        responseSuggestions = responseSuggestions.filter(s => s.id !== suggestionId);
        renderResponseSuggestions();
        
        console.log(`Response Suggestions: Dismissed suggestion ${suggestionId}`);
      } else {
        console.error('Response Suggestions: Failed to dismiss suggestion:', response.error);
        API.showError('Failed to dismiss suggestion');
      }
    }).catch(error => {
      console.error('Response Suggestions: Error dismissing suggestion:', error);
      API.showError('An error occurred while dismissing the suggestion');
    });
  };
  
  // Utility functions
  function escapeHtml(text) {
    const div = document.createElement('div');
    div.textContent = text;
    return div.innerHTML;
  }
  
  function formatDate(dateString) {
    if (!dateString) return '';
    
    try {
      const date = new Date(dateString);
      const now = new Date();
      const diffTime = Math.abs(now - date);
      const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24));
      
      if (diffDays === 1) return 'Yesterday';
      if (diffDays < 7) return `${diffDays} days ago`;
      return date.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
    } catch (error) {
      return dateString;
    }
  }
  
  // Add header button for manual refresh
  API.addHeaderButton('Analyze Responses', analyzeResponseSuggestions, {
    className: 'generate-btn',
    style: { background: '#ff9800' }
  });
  
  // Load suggestions when emails are loaded
  API.on('emailsLoaded', loadResponseSuggestions);
  
  // Load suggestions on feature initialization
  loadResponseSuggestions();
  
  // Auto-analyze on page load (after a short delay to let other systems initialize)
  setTimeout(() => {
    if (responseSuggestions.length === 0) {
      console.log('Response Suggestions: Auto-analyzing on page load...');
      analyzeResponseSuggestions();
    }
  }, 2000);
  
  console.log('Response Suggestions: Frontend loaded successfully');
})();
