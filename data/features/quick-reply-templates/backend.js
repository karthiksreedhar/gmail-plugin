/**
 * Quick Reply Templates Backend
 * Provides CRUD operations for category-based email templates with [SENDER NAME] placeholder support
 */

module.exports = {
  /**
   * Initialize the Quick Reply Templates feature
   * @param {Object} context - Feature context with server resources
   */
  initialize(context) {
    const { app, getUserDoc, setUserDoc, getCurrentUser } = context;
    
    console.log('Quick Reply Templates: Initializing backend...');
    
    // Get all templates for current user
    app.get('/api/quick-reply-templates/', async (req, res) => {
      try {
        const user = getCurrentUser();
        const doc = await getUserDoc('quick_reply_templates_data', user);
        
        res.json({ 
          success: true, 
          templates: (doc && doc.templates) ? doc.templates : {},
          updatedAt: doc ? doc.updatedAt : null
        });
      } catch (error) {
        console.error('Quick Reply Templates: Error getting templates:', error);
        res.status(500).json({ 
          success: false, 
          error: 'Failed to load templates' 
        });
      }
    });
    
    // Save or update template for a specific category
    app.post('/api/quick-reply-templates/', async (req, res) => {
      try {
        const user = getCurrentUser();
        const { category, template } = req.body;
        
        if (!category || typeof template !== 'string') {
          return res.status(400).json({ 
            success: false, 
            error: 'Category and template are required' 
          });
        }
        
        // Get current templates
        const doc = await getUserDoc('quick_reply_templates_data', user);
        const templates = (doc && doc.templates) ? { ...doc.templates } : {};
        
        // Update the specific category template
        if (template.trim() === '') {
          // Empty template means delete
          delete templates[category];
        } else {
          templates[category] = template;
        }
        
        // Save back to database
        await setUserDoc('quick_reply_templates_data', user, {
          templates,
          updatedAt: new Date().toISOString()
        });
        
        console.log(`Quick Reply Templates: Saved template for category "${category}"`);
        
        res.json({ 
          success: true, 
          templates,
          category,
          message: template.trim() === '' ? 'Template deleted' : 'Template saved'
        });
      } catch (error) {
        console.error('Quick Reply Templates: Error saving template:', error);
        res.status(500).json({ 
          success: false, 
          error: 'Failed to save template' 
        });
      }
    });
    
    // Delete template for a specific category
    app.delete('/api/quick-reply-templates/:category', async (req, res) => {
      try {
        const user = getCurrentUser();
        const category = decodeURIComponent(req.params.category);
        
        if (!category) {
          return res.status(400).json({ 
            success: false, 
            error: 'Category is required' 
          });
        }
        
        // Get current templates
        const doc = await getUserDoc('quick_reply_templates_data', user);
        const templates = (doc && doc.templates) ? { ...doc.templates } : {};
        
        // Remove the category template
        delete templates[category];
        
        // Save back to database
        await setUserDoc('quick_reply_templates_data', user, {
          templates,
          updatedAt: new Date().toISOString()
        });
        
        console.log(`Quick Reply Templates: Deleted template for category "${category}"`);
        
        res.json({ 
          success: true, 
          templates,
          category,
          message: 'Template deleted'
        });
      } catch (error) {
        console.error('Quick Reply Templates: Error deleting template:', error);
        res.status(500).json({ 
          success: false, 
          error: 'Failed to delete template' 
        });
      }
    });
    
    // Generate response from template with sender name substitution
    app.post('/api/quick-reply-templates/generate', async (req, res) => {
      try {
        const user = getCurrentUser();
        const { category, senderName, senderEmail } = req.body;
        
        if (!category) {
          return res.status(400).json({ 
            success: false, 
            error: 'Category is required' 
          });
        }
        
        // Get templates
        const doc = await getUserDoc('quick_reply_templates_data', user);
        const templates = (doc && doc.templates) ? doc.templates : {};
        
        if (!templates[category]) {
          return res.status(404).json({ 
            success: false, 
            error: `No template found for category "${category}"` 
          });
        }
        
        // Extract display name from sender info
        let displayName = senderName || 'there';
        
        if (senderEmail && !senderName) {
          // Try to extract name from email header format: "John Doe <john@example.com>"
          const nameMatch = senderEmail.match(/^([^<]+)/);
          if (nameMatch) {
            displayName = nameMatch[1].trim();
          } else {
            // Fallback to email username
            displayName = senderEmail.split('@')[0] || 'there';
          }
        }
        
        // Process template - replace [SENDER NAME] placeholder
        const template = templates[category];
        const processedResponse = template.replace(/\[SENDER NAME\]/g, displayName);
        
        console.log(`Quick Reply Templates: Generated response for category "${category}" with sender "${displayName}"`);
        
        res.json({ 
          success: true, 
          response: processedResponse,
          template: template,
          senderName: displayName,
          category,
          justification: `Generated from Quick Reply template for "${category}" category`
        });
      } catch (error) {
        console.error('Quick Reply Templates: Error generating response:', error);
        res.status(500).json({ 
          success: false, 
          error: 'Failed to generate response from template' 
        });
      }
    });
    
    console.log('Quick Reply Templates: Backend initialized');
  }
};
