(function() {
  const API = window.EmailAssistant;
  
  let pendingSuggestions = [];
  let userSettings = null;

  // Initialize the feature
  async function init() {
    try {
      // Load user settings
      await loadSettings();
      
      // Check for pending suggestions
      await checkPendingSuggestions();
      
      // Add header button for reviewing suggestions
      updateHeaderButton();
      
      // Listen for email loads to refresh suggestions
      API.on('emailsLoaded', async () => {
        await checkPendingSuggestions();
        updateHeaderButton();
      });

      console.log('✅ Reclassification Suggestions frontend initialized');
    } catch (error) {
      console.error('❌ Error initializing Reclassification Suggestions feature:', error);
    }
  }

  // Load user settings
  async function loadSettings() {
    try {
      const response = await API.apiCall('/api/reclassification-suggestions/settings');
      if (response.success) {
        userSettings = response.settings;
      }
    } catch (error) {
      console.error('Error loading settings:', error);
    }
  }

  // Check for pending suggestions
  async function checkPendingSuggestions() {
    try {
      const response = await API.apiCall('/api/reclassification-suggestions/pending');
      if (response.success) {
        pendingSuggestions = response.suggestions || [];
      }
    } catch (error) {
      console.error('Error checking pending suggestions:', error);
    }
  }

  // Update the header button based on pending suggestions
  function updateHeaderButton() {
    // Remove existing button
    const existingButton = document.querySelector('[data-feature="reclassification-suggestions"]');
    if (existingButton) {
      existingButton.remove();
    }

    // Add new button if there are pending suggestions
    if (pendingSuggestions.length > 0) {
      API.addHeaderButton(`Review Suggestions (${pendingSuggestions.length})`, showSuggestionsModal, {
        'data-feature': 'reclassification-suggestions',
        style: 'background-color: #2196F3; color: white; border: none; padding: 8px 12px; border-radius: 4px; cursor: pointer; font-size: 12px; margin-left: 8px;'
      });
    }
  }

  // Show suggestions review modal
  function showSuggestionsModal() {
    if (pendingSuggestions.length === 0) {
      API.showSuccess('No pending suggestions at this time.');
      return;
    }

    // Group suggestions by category
    const suggestionsByCategory = {};
    pendingSuggestions.forEach(suggestion => {
      if (!suggestionsByCategory[suggestion.suggestedCategory]) {
        suggestionsByCategory[suggestion.suggestedCategory] = [];
      }
      suggestionsByCategory[suggestion.suggestedCategory].push(suggestion);
    });

    let modalContent = `
      <div style="max-width: 800px; max-height: 600px; overflow-y: auto;">
        <h2 style="margin-bottom: 20px; color: #333;">📧 Email Reclassification Suggestions</h2>
        <p style="margin-bottom: 20px; color: #666;">
          AI has found emails that might belong to your newly created categories. Review and approve the suggestions below.
        </p>
    `;

    Object.keys(suggestionsByCategory).forEach(category => {
      const suggestions = suggestionsByCategory[category];
      modalContent += `
        <div style="margin-bottom: 30px; border: 1px solid #ddd; border-radius: 8px; padding: 20px;">
          <h3 style="margin-bottom: 15px; color: #2196F3;">
            Move to "${category}" (${suggestions.length} emails)
          </h3>
          
          <div style="margin-bottom: 15px;">
            <button onclick="selectAllInCategory('${category}')" 
                    style="background: #4CAF50; color: white; border: none; padding: 6px 12px; border-radius: 4px; cursor: pointer; margin-right: 8px;">
              Select All
            </button>
            <button onclick="deselectAllInCategory('${category}')" 
                    style="background: #757575; color: white; border: none; padding: 6px 12px; border-radius: 4px; cursor: pointer;">
              Deselect All
            </button>
          </div>
          
          <div style="max-height: 200px; overflow-y: auto; border: 1px solid #eee; border-radius: 4px; padding: 10px;">
      `;

      suggestions.forEach((suggestion, index) => {
        const truncatedSubject = suggestion.subject.length > 50 
          ? suggestion.subject.substring(0, 50) + '...' 
          : suggestion.subject;
        
        modalContent += `
          <div style="margin-bottom: 12px; padding: 10px; background: #f9f9f9; border-radius: 4px;">
            <label style="display: flex; align-items: center; cursor: pointer;">
              <input type="checkbox" 
                     id="suggestion-${suggestion.emailId}" 
                     data-category="${category}"
                     data-email-id="${suggestion.emailId}"
                     style="margin-right: 10px; transform: scale(1.2);"
                     checked>
              <div>
                <div style="font-weight: bold; margin-bottom: 4px;">${truncatedSubject}</div>
                <div style="font-size: 12px; color: #666; margin-bottom: 4px;">
                  From: ${suggestion.currentCategory} → ${suggestion.suggestedCategory} 
                  (${Math.round(suggestion.confidence * 100)}% confidence)
                </div>
                <div style="font-size: 11px; color: #888;">
                  ${suggestion.snippet}
                </div>
              </div>
            </label>
          </div>
        `;
      });

      modalContent += `
          </div>
        </div>
      `;
    });

    modalContent += `
        <div style="margin-top: 30px; text-align: center; border-top: 1px solid #eee; padding-top: 20px;">
          <button onclick="processSelectedSuggestions('approve')" 
                  style="background: #4CAF50; color: white; border: none; padding: 12px 24px; border-radius: 6px; cursor: pointer; margin-right: 12px; font-size: 14px;">
            ✅ Approve Selected
          </button>
          <button onclick="processSelectedSuggestions('reject')" 
                  style="background: #f44336; color: white; border: none; padding: 12px 24px; border-radius: 6px; cursor: pointer; margin-right: 12px; font-size: 14px;">
            ❌ Reject Selected
          </button>
          <button onclick="closeModal()" 
                  style="background: #757575; color: white; border: none; padding: 12px 24px; border-radius: 6px; cursor: pointer; font-size: 14px;">
            Cancel
          </button>
        </div>
        
        <div style="margin-top: 15px; text-align: center;">
          <button onclick="showSettings()" 
                  style="background: none; color: #2196F3; border: 1px solid #2196F3; padding: 8px 16px; border-radius: 4px; cursor: pointer; font-size: 12px;">
            ⚙️ Settings
          </button>
        </div>
      </div>
    `;

    // Add helper functions to window for button callbacks
    window.selectAllInCategory = function(category) {
      const checkboxes = document.querySelectorAll(`input[data-category="${category}"]`);
      checkboxes.forEach(cb => cb.checked = true);
    };

    window.deselectAllInCategory = function(category) {
      const checkboxes = document.querySelectorAll(`input[data-category="${category}"]`);
      checkboxes.forEach(cb => cb.checked = false);
    };

    window.processSelectedSuggestions = async function(action) {
      const selectedCheckboxes = document.querySelectorAll('input[type="checkbox"]:checked');
      
      if (selectedCheckboxes.length === 0) {
        API.showError('Please select at least one email to process.');
        return;
      }

      // Group by category
      const selections = {};
      selectedCheckboxes.forEach(cb => {
        const category = cb.getAttribute('data-category');
        const emailId = cb.getAttribute('data-email-id');
        
        if (!selections[category]) {
          selections[category] = [];
        }
        selections[category].push(emailId);
      });

      let totalProcessed = 0;

      try {
        // Process each category group
        for (const [category, emailIds] of Object.entries(selections)) {
          const response = await API.apiCall('/api/reclassification-suggestions/process', {
            method: 'POST',
            body: {
              emailIds,
              newCategory: category,
              action
            }
          });

          if (response.success) {
            totalProcessed += response.processedCount;
          }
        }

        // Refresh data
        await checkPendingSuggestions();
        updateHeaderButton();
        
        // Close modal and show success
        closeModal();
        
        if (action === 'approve') {
          API.showSuccess(`✅ Successfully moved ${totalProcessed} emails to their new categories!`);
          // Reload emails to reflect changes
          API.loadEmails();
        } else {
          API.showSuccess(`❌ Rejected ${selectedCheckboxes.length} suggestions.`);
        }
      } catch (error) {
        console.error('Error processing suggestions:', error);
        API.showError('Failed to process suggestions. Please try again.');
      }
    };

    window.closeModal = function() {
      const modal = document.querySelector('.email-assistant-modal');
      if (modal) {
        modal.remove();
      }
    };

    window.showSettings = function() {
      showSettingsModal();
    };

    API.showModal(modalContent, 'Review Reclassification Suggestions');
  }

  // Show settings modal
  function showSettingsModal() {
    const settingsContent = `
      <div style="max-width: 500px;">
        <h2 style="margin-bottom: 20px; color: #333;">⚙️ Reclassification Settings</h2>
        
        <div style="margin-bottom: 20px;">
          <label style="display: block; margin-bottom: 8px; font-weight: bold;">
            📅 Lookback Period (days):
          </label>
          <input type="number" 
                 id="lookbackDays" 
                 value="${userSettings?.lookbackDays || 30}"
                 min="1" 
                 max="90"
                 style="width: 100%; padding: 8px; border: 1px solid #ddd; border-radius: 4px;">
          <small style="color: #666;">How far back to look for emails when a new category is created (1-90 days)</small>
        </div>
        
        <div style="margin-bottom: 20px;">
          <label style="display: block; margin-bottom: 8px; font-weight: bold;">
            🎯 Confidence Threshold:
          </label>
          <input type="range" 
                 id="confidenceThreshold" 
                 value="${userSettings?.confidenceThreshold || 0.8}"
                 min="0.1" 
                 max="1.0" 
                 step="0.1"
                 style="width: 100%;"
                 oninput="document.getElementById('confidenceValue').textContent = Math.round(this.value * 100) + '%'">
          <div style="text-align: center; margin-top: 4px;">
            <span id="confidenceValue">${Math.round((userSettings?.confidenceThreshold || 0.8) * 100)}%</span>
          </div>
          <small style="color: #666;">Minimum AI confidence required to suggest reclassification</small>
        </div>
        
        <div style="margin-bottom: 30px;">
          <label style="display: flex; align-items: center; cursor: pointer;">
            <input type="checkbox" 
                   id="autoSuggestEnabled" 
                   ${userSettings?.autoSuggestEnabled !== false ? 'checked' : ''}
                   style="margin-right: 10px; transform: scale(1.2);">
            <span style="font-weight: bold;">🤖 Enable Auto-Suggestions</span>
          </label>
          <small style="color: #666; margin-left: 30px;">Automatically generate suggestions when new categories are created</small>
        </div>
        
        <div style="text-align: center; border-top: 1px solid #eee; padding-top: 20px;">
          <button onclick="saveSettings()" 
                  style="background: #4CAF50; color: white; border: none; padding: 12px 24px; border-radius: 6px; cursor: pointer; margin-right: 12px; font-size: 14px;">
            💾 Save Settings
          </button>
          <button onclick="closeModal()" 
                  style="background: #757575; color: white; border: none; padding: 12px 24px; border-radius: 6px; cursor: pointer; font-size: 14px;">
            Cancel
          </button>
        </div>
        
        <div style="margin-top: 20px; text-align: center;">
          <button onclick="clearAllSuggestions()" 
                  style="background: none; color: #f44336; border: 1px solid #f44336; padding: 8px 16px; border-radius: 4px; cursor: pointer; font-size: 12px;">
            🗑️ Clear All Suggestions
          </button>
        </div>
      </div>
    `;

    window.saveSettings = async function() {
      try {
        const lookbackDays = parseInt(document.getElementById('lookbackDays').value);
        const confidenceThreshold = parseFloat(document.getElementById('confidenceThreshold').value);
        const autoSuggestEnabled = document.getElementById('autoSuggestEnabled').checked;

        const response = await API.apiCall('/api/reclassification-suggestions/settings', {
          method: 'POST',
          body: {
            lookbackDays,
            confidenceThreshold,
            autoSuggestEnabled
          }
        });

        if (response.success) {
          userSettings = response.settings;
          closeModal();
          API.showSuccess('⚙️ Settings saved successfully!');
        } else {
          API.showError('Failed to save settings: ' + response.error);
        }
      } catch (error) {
        console.error('Error saving settings:', error);
        API.showError('Failed to save settings. Please try again.');
      }
    };

    window.clearAllSuggestions = async function() {
      API.showConfirm('Are you sure you want to clear all pending suggestions? This cannot be undone.', async () => {
        try {
          const response = await API.apiCall('/api/reclassification-suggestions/clear', {
            method: 'DELETE'
          });

          if (response.success) {
            pendingSuggestions = [];
            updateHeaderButton();
            closeModal();
            API.showSuccess('🗑️ All suggestions cleared.');
          } else {
            API.showError('Failed to clear suggestions.');
          }
        } catch (error) {
          console.error('Error clearing suggestions:', error);
          API.showError('Failed to clear suggestions. Please try again.');
        }
      });
    };

    API.showModal(settingsContent, 'Reclassification Settings');
  }

  // Utility function to generate suggestions for a new category
  async function generateSuggestions(newCategory) {
    try {
      const response = await API.apiCall('/api/reclassification-suggestions/generate', {
        method: 'POST',
        body: { newCategory }
      });

      if (response.success && response.suggestionsGenerated > 0) {
        await checkPendingSuggestions();
        updateHeaderButton();
        
        API.showSuccess(
          `🔍 Found ${response.suggestionsGenerated} emails that might belong to "${newCategory}". ` +
          `Click "Review Suggestions" to approve or reject them.`
        );
      }
    } catch (error) {
      console.error('Error generating suggestions:', error);
    }
  }

  // Listen for category creation events (this would need to be triggered from the main app)
  API.on('categoryCreated', async (data) => {
    if (userSettings?.autoSuggestEnabled !== false) {
      await generateSuggestions(data.categoryName);
    }
  });

  // Add menu item for manual suggestion generation
  API.on('featureLoaded', () => {
    // Add a utility function to manually generate suggestions
    if (!window.ReclassificationSuggestions) {
      window.ReclassificationSuggestions = {
        generateForCategory: generateSuggestions,
        showModal: showSuggestionsModal,
        showSettings: showSettingsModal,
        refresh: async () => {
          await checkPendingSuggestions();
          updateHeaderButton();
        }
      };
    }
  });

  // Periodic check for suggestions (every 5 minutes)
  setInterval(async () => {
    await checkPendingSuggestions();
    updateHeaderButton();
  }, 5 * 60 * 1000);

  // Initialize when DOM is ready
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }

  // Add some custom CSS for better styling
  const style = document.createElement('style');
  style.textContent = `
    .reclassification-suggestion-item:hover {
      background-color: #f0f8ff !important;
    }
    
    .reclassification-confidence-high {
      color: #4CAF50;
      font-weight: bold;
    }
    
    .reclassification-confidence-medium {
      color: #FF9800;
      font-weight: bold;
    }
    
    .reclassification-confidence-low {
      color: #f44336;
      font-weight: bold;
    }
  `;
  document.head.appendChild(style);

})();
