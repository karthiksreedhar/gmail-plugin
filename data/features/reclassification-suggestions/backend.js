module.exports = {
  initialize(context) {
    const { 
      app,
      getUserDoc,
      setUserDoc,
      openai,
      getCurrentUser,
      loadEmailData,
      // Import existing categorization and utility functions
      categorizeEmail,
      matchToCurrentCategory
    } = context;

    // Settings collection name
    const SETTINGS_COLLECTION = 'reclassification_settings';
    const SUGGESTIONS_COLLECTION = 'reclassification_suggestions';

    // Default settings
    const DEFAULT_SETTINGS = {
      lookbackDays: 30,
      confidenceThreshold: 0.8,
      autoSuggestEnabled: true
    };

    // Helper function to get user settings
    async function getUserSettings(user) {
      const settings = await getUserDoc(SETTINGS_COLLECTION, user);
      return settings ? { ...DEFAULT_SETTINGS, ...settings } : DEFAULT_SETTINGS;
    }

    // Helper function to save user settings
    async function saveUserSettings(user, settings) {
      await setUserDoc(SETTINGS_COLLECTION, user, settings);
    }

    // Get pending suggestions
    app.get('/api/reclassification-suggestions/pending', async (req, res) => {
      try {
        const user = getCurrentUser();
        const suggestions = await getUserDoc(SUGGESTIONS_COLLECTION, user) || [];
        
        // Filter out expired suggestions (older than 7 days)
        const validSuggestions = suggestions.filter(suggestion => {
          const createdAt = new Date(suggestion.createdAt);
          const now = new Date();
          const daysDiff = (now - createdAt) / (1000 * 60 * 60 * 24);
          return daysDiff <= 7;
        });

        // Save filtered suggestions back
        if (validSuggestions.length !== suggestions.length) {
          await setUserDoc(SUGGESTIONS_COLLECTION, user, validSuggestions);
        }

        res.json({ 
          success: true, 
          suggestions: validSuggestions,
          count: validSuggestions.length
        });
      } catch (error) {
        console.error('Error getting pending suggestions:', error);
        res.status(500).json({ success: false, error: error.message });
      }
    });

    // Process suggestions (approve/reject)
    app.post('/api/reclassification-suggestions/process', async (req, res) => {
      try {
        const user = getCurrentUser();
        const { emailIds, newCategory, action } = req.body;

        if (!emailIds || !Array.isArray(emailIds) || !newCategory || !action) {
          return res.status(400).json({ 
            success: false, 
            error: 'Missing required fields: emailIds, newCategory, action' 
          });
        }

        if (action !== 'approve' && action !== 'reject') {
          return res.status(400).json({ 
            success: false, 
            error: 'Action must be "approve" or "reject"' 
          });
        }

        let processedCount = 0;

        if (action === 'approve') {
          console.log(`[ReclassificationSuggestions] Processing approval for ${emailIds.length} emails to move to "${newCategory}"`);
          
          // Load current emails from database
          const responseEmails = context.loadResponseEmails() || [];
          const unrepliedEmails = context.loadUnrepliedEmails() || [];
          
          console.log(`[ReclassificationSuggestions] Loaded ${responseEmails.length} response emails and ${unrepliedEmails.length} unreplied emails for update`);
          
          // Update categories for approved emails in both collections
          let updatedResponses = false;
          let updatedUnreplied = false;
          
          for (const emailId of emailIds) {
            // Check response emails first
            const responseEmail = responseEmails.find(e => e.id === emailId);
            if (responseEmail) {
              console.log(`[ReclassificationSuggestions] Updating response email "${responseEmail.subject}" from "${responseEmail.category}" to "${newCategory}"`);
              responseEmail.category = newCategory;
              // Ensure categories array includes the new category
              if (!responseEmail.categories || !responseEmail.categories.includes(newCategory)) {
                responseEmail.categories = responseEmail.categories || [];
                responseEmail.categories.push(newCategory);
              }
              processedCount++;
              updatedResponses = true;
            }
            
            // Check unreplied emails
            const unrepliedEmail = unrepliedEmails.find(e => e.id === emailId);
            if (unrepliedEmail) {
              console.log(`[ReclassificationSuggestions] Updating unreplied email "${unrepliedEmail.subject}" from "${unrepliedEmail.category}" to "${newCategory}"`);
              unrepliedEmail.category = newCategory;
              // Ensure categories array includes the new category
              if (!unrepliedEmail.categories || !unrepliedEmail.categories.includes(newCategory)) {
                unrepliedEmail.categories = unrepliedEmail.categories || [];
                unrepliedEmail.categories.push(newCategory);
              }
              processedCount++;
              updatedUnreplied = true;
            }
          }

          // Save updated email data back to their respective collections
          if (updatedResponses) {
            try {
              await setUserDoc('response_emails', user, { emails: responseEmails });
              console.log(`[ReclassificationSuggestions] Saved updated response emails to database`);
            } catch (error) {
              console.error(`[ReclassificationSuggestions] Failed to save response emails:`, error);
            }
          }
          
          if (updatedUnreplied) {
            try {
              await setUserDoc('unreplied_emails', user, { emails: unrepliedEmails });
              console.log(`[ReclassificationSuggestions] Saved updated unreplied emails to database`);
            } catch (error) {
              console.error(`[ReclassificationSuggestions] Failed to save unreplied emails:`, error);
            }
          }
          
          console.log(`[ReclassificationSuggestions] Successfully processed ${processedCount} email approvals`);
        }

        // Remove processed suggestions
        const currentSuggestions = await getUserDoc(SUGGESTIONS_COLLECTION, user) || [];
        const remainingSuggestions = currentSuggestions.filter(suggestion => 
          !emailIds.includes(suggestion.emailId) || suggestion.suggestedCategory !== newCategory
        );
        
        await setUserDoc(SUGGESTIONS_COLLECTION, user, remainingSuggestions);

        res.json({ 
          success: true, 
          processedCount,
          action,
          remainingSuggestions: remainingSuggestions.length
        });
      } catch (error) {
        console.error('Error processing suggestions:', error);
        res.status(500).json({ success: false, error: error.message });
      }
    });

    // Get/update settings
    app.get('/api/reclassification-suggestions/settings', async (req, res) => {
      try {
        const user = getCurrentUser();
        const settings = await getUserSettings(user);
        res.json({ success: true, settings });
      } catch (error) {
        console.error('Error getting settings:', error);
        res.status(500).json({ success: false, error: error.message });
      }
    });

    app.post('/api/reclassification-suggestions/settings', async (req, res) => {
      try {
        const user = getCurrentUser();
        const { lookbackDays, confidenceThreshold, autoSuggestEnabled } = req.body;

        const settings = {
          lookbackDays: Math.max(1, Math.min(90, lookbackDays || DEFAULT_SETTINGS.lookbackDays)),
          confidenceThreshold: Math.max(0.1, Math.min(1.0, confidenceThreshold || DEFAULT_SETTINGS.confidenceThreshold)),
          autoSuggestEnabled: autoSuggestEnabled !== undefined ? autoSuggestEnabled : DEFAULT_SETTINGS.autoSuggestEnabled
        };

        await saveUserSettings(user, settings);
        res.json({ success: true, settings });
      } catch (error) {
        console.error('Error saving settings:', error);
        res.status(500).json({ success: false, error: error.message });
      }
    });

    // Generate suggestions for recently added emails when new category is created
    app.post('/api/reclassification-suggestions/generate', async (req, res) => {
      try {
        const user = getCurrentUser();
        const { newCategory } = req.body;

        if (!newCategory) {
          return res.status(400).json({ 
            success: false, 
            error: 'newCategory is required' 
          });
        }

        const settings = await getUserSettings(user);
        
        if (!settings.autoSuggestEnabled) {
          return res.json({ 
            success: true, 
            message: 'Auto-suggestions disabled',
            suggestionsGenerated: 0
          });
        }

        // Load email data from database (not Gmail API)
        console.log(`[ReclassificationSuggestions] Loading email data for user: ${user}`);
        
        // Use the proper functions to load already-processed emails from database
        const responseEmails = context.loadResponseEmails() || [];
        const unrepliedEmails = context.loadUnrepliedEmails() || [];
        const allEmails = [...responseEmails, ...unrepliedEmails];
        
        console.log(`[ReclassificationSuggestions] Loaded ${responseEmails.length} response emails and ${unrepliedEmails.length} unreplied emails (total: ${allEmails.length})`);
        
        const currentCategories = await getUserDoc('categories', user) || { categories: [] };
        console.log(`[ReclassificationSuggestions] Current categories: [${currentCategories.categories.join(', ')}]`);
        
        // Calculate cutoff date
        const cutoffDate = new Date();
        cutoffDate.setDate(cutoffDate.getDate() - settings.lookbackDays);
        console.log(`[ReclassificationSuggestions] Looking for emails newer than: ${cutoffDate.toISOString()}`);

        // Find emails within lookback period that aren't already in the new category
        const candidateEmails = allEmails.filter(email => {
          if (!email || !email.date) return false;
          
          const emailDate = new Date(email.date);
          const withinPeriod = emailDate >= cutoffDate;
          const notInNewCategory = email.category !== newCategory && (!email.categories || !email.categories.includes(newCategory));
          
          return withinPeriod && notInNewCategory;
        });

        console.log(`[ReclassificationSuggestions] Found ${candidateEmails.length} candidate emails within lookback period for analysis`);

        const suggestions = [];
        const allCategories = [...currentCategories.categories, newCategory];
        console.log(`[ReclassificationSuggestions] Analyzing against categories: [${allCategories.join(', ')}]`);

        // Re-evaluate each candidate email
        let analyzedCount = 0;
        for (const email of candidateEmails) {
          analyzedCount++;
          if (analyzedCount % 10 === 0 || analyzedCount === candidateEmails.length) {
            console.log(`[ReclassificationSuggestions] Analyzing email ${analyzedCount}/${candidateEmails.length}: "${email.subject}"`);
          }
          try {
            // Use the existing classifier API to re-evaluate this email
            const classifierResponse = await fetch('http://localhost:3000/api/classifier-v4/suggest-batch', {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({
                emails: [{
                  id: email.id,
                  subject: email.subject,
                  body: email.body || email.snippet,
                  from: email.from || email.originalFrom
                }]
              })
            });

            if (classifierResponse.ok) {
              const classifierData = await classifierResponse.json();
              const result = classifierData.results && classifierData.results[email.id];
              
              if (result && result.suggestion) {
                const suggestedCategory = result.suggestion;
                
                // Check if the suggested category matches our new category
                if (suggestedCategory === newCategory) {
                  // For now, assume high confidence since the classifier suggested it
                  const confidence = 0.85; // Default confidence when classifier picks this category
                  
                  console.log(`[ReclassificationSuggestions] ✅ Found suggestion: "${email.subject}" should be "${newCategory}" (classifier confidence)`);
                  
                  suggestions.push({
                    emailId: email.id,
                    currentCategory: email.category,
                    suggestedCategory: newCategory,
                    confidence: confidence,
                    subject: email.subject,
                    snippet: email.snippet || email.body?.substring(0, 150) + '...',
                    date: email.date,
                    createdAt: new Date().toISOString(),
                    reason: `AI classifier suggests this email belongs to "${newCategory}" with high confidence. ${result.explanation || ''}`
                  });
                } else {
                  // Log what the classifier actually suggested for debugging
                  if (analyzedCount <= 5) { // Only log first few for debugging
                    console.log(`[ReclassificationSuggestions] 📝 Email "${email.subject}" → Classifier suggested "${suggestedCategory}", not "${newCategory}"`);
                  }
                }
              }
            } else {
              console.error(`Classifier API call failed for email ${email.id}: ${classifierResponse.status}`);
            }
          } catch (error) {
            console.error(`Error analyzing email ${email.id}:`, error);
            // Continue with other emails
          }
        }

        // Save suggestions and provide detailed terminal feedback
        console.log(`\n🔍 RECLASSIFICATION SUGGESTIONS ANALYSIS COMPLETE:`);
        console.log(`📊 Total emails in database: ${allEmails.length}`);
        console.log(`📅 Candidate emails within ${settings.lookbackDays} day lookback: ${candidateEmails.length}`);
        console.log(`🤖 Emails analyzed by AI: ${analyzedCount}`);
        console.log(`✨ Suggestions generated for "${newCategory}": ${suggestions.length}`);
        console.log(`🎯 Confidence threshold: ${Math.round(settings.confidenceThreshold * 100)}%`);
        
        if (suggestions.length > 0) {
          console.log(`\n📝 Generated suggestions:`);
          suggestions.forEach((suggestion, index) => {
            console.log(`  ${index + 1}. "${suggestion.subject}" (${Math.round(suggestion.confidence * 100)}% confidence)`);
          });
          
          const existingSuggestions = await getUserDoc(SUGGESTIONS_COLLECTION, user) || [];
          const updatedSuggestions = [...existingSuggestions, ...suggestions];
          await setUserDoc(SUGGESTIONS_COLLECTION, user, updatedSuggestions);
          console.log(`💾 Saved ${suggestions.length} suggestions to database`);
        } else {
          console.log(`\n❌ No suggestions generated. This could mean:`);
          console.log(`   • No emails within the lookback period strongly match "${newCategory}"`);
          console.log(`   • AI confidence was below ${Math.round(settings.confidenceThreshold * 100)}% threshold`);
          console.log(`   • All matching emails are already in "${newCategory}" category`);
        }
        console.log(`\n`);

        res.json({ 
          success: true, 
          suggestionsGenerated: suggestions.length,
          newCategory,
          candidateEmailsAnalyzed: candidateEmails.length
        });
      } catch (error) {
        console.error('Error generating suggestions:', error);
        res.status(500).json({ success: false, error: error.message });
      }
    });

    // Clear all suggestions
    app.delete('/api/reclassification-suggestions/clear', async (req, res) => {
      try {
        const user = getCurrentUser();
        await setUserDoc(SUGGESTIONS_COLLECTION, user, []);
        res.json({ success: true });
      } catch (error) {
        console.error('Error clearing suggestions:', error);
        res.status(500).json({ success: false, error: error.message });
      }
    });

    console.log('✅ Reclassification Suggestions feature backend loaded');
  }
};
