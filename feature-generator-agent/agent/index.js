/**
 * Feature Generator Agent
 * Gemini-based agent for generating Gmail Plugin features
 */

const { systemPrompt, refinementPrompt } = require('./prompts/system');
const { invokeGemini, getGeminiModel } = require('../gemini');

class FeatureGeneratorAgent {
  constructor() {
    this.modelName = getGeminiModel();
  }

  async invoke(messages, temperature = 0.2, maxOutputTokens = 8192) {
    return invokeGemini({
      messages,
      model: this.modelName,
      temperature,
      maxOutputTokens
    });
  }

  /**
   * Generate a new feature from a description
   * @param {string} featureRequest - The feature description from the user
   * @returns {Object} - Generated files and metadata
   */
  async generateFeature(featureRequest) {
    console.log('\n🚀 Starting feature generation...');
    
    // Step 1: Analyze the request and determine feature ID
    const analysis = await this.analyzeRequest(featureRequest);
    console.log(`📋 Feature ID: ${analysis.featureId}`);
    console.log(`📋 Needs Backend: ${analysis.needsBackend}`);
    console.log(`📋 Needs Frontend: ${analysis.needsFrontend}`);

    const files = {};
    let response = `I'll create a feature called **${analysis.featureName}** (ID: \`${analysis.featureId}\`).\n\n`;

    // Step 2: Generate manifest.json
    console.log('📄 Generating manifest.json...');
    response += '✅ Generating manifest.json...\n';
    files['manifest.json'] = await this.generateManifest(analysis, featureRequest);

    // Step 3: Generate backend.js if needed
    if (analysis.needsBackend) {
      console.log('📄 Generating backend.js...');
      response += '✅ Generating backend.js...\n';
      files['backend.js'] = await this.generateBackend(analysis, featureRequest);
    }

    // Step 4: Generate frontend.js if needed
    if (analysis.needsFrontend) {
      console.log('📄 Generating frontend.js...');
      response += '✅ Generating frontend.js...\n';
      files['frontend.js'] = await this.generateFrontend(analysis, featureRequest);
    }

    // Step 5: Generate README.md
    console.log('📄 Generating README.md...');
    response += '✅ Generating README.md...\n\n';
    files['README.md'] = await this.generateReadme(analysis, featureRequest, files);

    response += `**All files generated successfully!**\n\nYou can preview the files below and download them as a ZIP. `;
    response += `Extract the ZIP to \`data/features/\` in your Gmail Plugin directory and restart the server.\n\n`;
    response += `If you encounter any issues after testing, describe them here and I'll help fix the code.`;

    console.log('✅ Feature generation complete!');

    return {
      featureId: analysis.featureId,
      featureName: analysis.featureName,
      files,
      response
    };
  }

  /**
   * Refine existing feature files based on user feedback
   * @param {string} feedback - User's feedback/issue description
   * @param {Object} currentFiles - Currently generated files
   * @param {string} featureId - Current feature ID
   * @param {Array} chatHistory - Chat history for context
   * @returns {Object} - Updated files and response
   */
  async refineFeature(feedback, currentFiles, featureId, chatHistory) {
    console.log('\n🔧 Starting feature refinement...');

    const messages = [
      { role: 'system', content: refinementPrompt },
      { role: 'user', content: `
Current Feature ID: ${featureId}

Current Files:
${Object.entries(currentFiles).map(([name, content]) => `
--- ${name} ---
${content}
`).join('\n')}

User Feedback/Issue:
${feedback}

Based on the feedback, analyze what needs to be fixed and provide the corrected file(s).
Respond in this JSON format:
{
  "analysis": "Brief analysis of the issue",
  "filesToUpdate": ["list of files that need updating"],
  "explanation": "What you're fixing and why",
  "files": {
    "filename.js": "full corrected file content",
    ...only include files that need changes
  }
}
`}
    ];

    const result = await this.invoke(messages);
    
    // Parse the response
    let parsed;
    try {
      const content = result.content;
      const jsonMatch = content.match(/\{[\s\S]*\}/);
      if (jsonMatch) {
        parsed = JSON.parse(jsonMatch[0]);
      } else {
        throw new Error('No JSON found in response');
      }
    } catch (error) {
      console.error('Failed to parse refinement response:', error);
      return {
        featureId,
        files: currentFiles,
        response: `I encountered an issue parsing my response. Here's what I tried to do:\n\n${result.content}`,
        updatedFiles: []
      };
    }

    // Merge updated files with current files
    const updatedFiles = { ...currentFiles };
    const changedFiles = [];
    
    for (const [filename, content] of Object.entries(parsed.files || {})) {
      if (content && content.trim()) {
        updatedFiles[filename] = content;
        changedFiles.push(filename);
      }
    }

    let response = `**Analysis:** ${parsed.analysis}\n\n`;
    response += `**Changes Made:**\n${parsed.explanation}\n\n`;
    
    if (changedFiles.length > 0) {
      response += `**Updated Files:** ${changedFiles.map(f => `\`${f}\``).join(', ')}\n\n`;
      response += `The updated files are ready for download. Test them and let me know if you need further adjustments.`;
    } else {
      response += `No file changes were needed based on your feedback.`;
    }

    console.log(`✅ Refinement complete. Updated: ${changedFiles.join(', ') || 'none'}`);

    return {
      featureId,
      files: updatedFiles,
      response,
      updatedFiles: changedFiles
    };
  }

  /**
   * Analyze the feature request to determine structure
   */
  async analyzeRequest(featureRequest) {
    const messages = [
      { role: 'system', content: `You are an expert at analyzing feature requests for a Gmail Plugin system.
Analyze the request and output ONLY a JSON object with these fields:
{
  "featureId": "lowercase-with-hyphens ID for the feature",
  "featureName": "Human readable feature name",
  "description": "Brief description",
  "needsBackend": true/false (does it need API routes, data storage, or server-side processing?),
  "needsFrontend": true/false (does it need UI components, buttons, or user interaction?),
  "permissions": ["list of permissions needed: emails:read, emails:write, api:custom"]
}
Output ONLY the JSON, no other text.` },
      { role: 'user', content: featureRequest }
    ];

    const result = await this.invoke(messages, 0.2, 2048);
    
    try {
      const content = result.content;
      const jsonMatch = content.match(/\{[\s\S]*\}/);
      if (jsonMatch) {
        return JSON.parse(jsonMatch[0]);
      }
    } catch (error) {
      console.error('Failed to parse analysis:', error);
    }

    // Fallback defaults
    const featureId = featureRequest
      .toLowerCase()
      .replace(/[^a-z0-9\s]/g, '')
      .split(/\s+/)
      .slice(0, 3)
      .join('-');

    return {
      featureId,
      featureName: featureRequest.split('.')[0].substring(0, 50),
      description: featureRequest.substring(0, 100),
      needsBackend: true,
      needsFrontend: true,
      permissions: ['emails:read', 'api:custom']
    };
  }

  /**
   * Generate manifest.json
   */
  async generateManifest(analysis, featureRequest) {
    const manifest = {
      id: analysis.featureId,
      name: analysis.featureName,
      version: '1.0.0',
      description: analysis.description,
      author: 'Feature Generator Agent',
      ...(analysis.needsBackend && { backend: 'backend.js' }),
      ...(analysis.needsFrontend && { frontend: 'frontend.js' }),
      permissions: analysis.permissions || ['emails:read', 'api:custom']
    };

    return JSON.stringify(manifest, null, 2);
  }

  /**
   * Generate backend.js
   */
  async generateBackend(analysis, featureRequest) {
    const messages = [
      { role: 'system', content: systemPrompt },
      { role: 'user', content: `Generate ONLY the backend.js file for this feature:

Feature ID: ${analysis.featureId}
Feature Name: ${analysis.featureName}
Description: ${analysis.description}

Full Feature Request:
${featureRequest}

Requirements:
1. Export a module with an initialize(context) function
2. All routes must start with /api/${analysis.featureId}/
3. Use proper error handling with try/catch
4. Use the featureContext methods appropriately (getUserDoc, setUserDoc, openai, etc.)
5. Include proper console logging with the feature name prefix
6. Return consistent JSON response format: { success: boolean, data?: any, error?: string }

Output ONLY the JavaScript code, no markdown code blocks, no explanation.` }
    ];

    const result = await this.invoke(messages);
    return this.cleanCodeResponse(result.content);
  }

  /**
   * Generate frontend.js
   */
  async generateFrontend(analysis, featureRequest) {
    const messages = [
      { role: 'system', content: systemPrompt },
      { role: 'user', content: `Generate ONLY the frontend.js file for this feature:

Feature ID: ${analysis.featureId}
Feature Name: ${analysis.featureName}
Description: ${analysis.description}

Full Feature Request:
${featureRequest}

Requirements:
1. Wrap all code in an IIFE: (function() { ... })();
2. Check for window.EmailAssistant availability first
3. Use const API = window.EmailAssistant for cleaner code
4. Add UI via API.addHeaderButton, API.showModal, API.addEmailAction as appropriate
5. Make API calls using API.apiCall('/api/${analysis.featureId}/endpoint', { method: 'POST', body: {} })
6. Show loading states using API.showModal with loading content
7. Show success/error messages using API.showSuccess() and API.showError()
8. Include proper console logging with feature name prefix
9. Listen to events as needed: API.on('emailsLoaded', callback)

Output ONLY the JavaScript code, no markdown code blocks, no explanation.` }
    ];

    const result = await this.invoke(messages);
    return this.cleanCodeResponse(result.content);
  }

  /**
   * Generate README.md
   */
  async generateReadme(analysis, featureRequest, files) {
    const hasBackend = !!files['backend.js'];
    const hasFrontend = !!files['frontend.js'];

    const messages = [
      { role: 'system', content: `You are a technical documentation writer. Generate a comprehensive README.md for a Gmail Plugin feature.
Use proper markdown formatting with headers, code blocks, and lists.` },
      { role: 'user', content: `Generate a README.md for this feature:

Feature ID: ${analysis.featureId}
Feature Name: ${analysis.featureName}
Description: ${analysis.description}
Has Backend: ${hasBackend}
Has Frontend: ${hasFrontend}

Full Feature Request:
${featureRequest}

${hasBackend ? `Backend Code:\n${files['backend.js']}\n` : ''}
${hasFrontend ? `Frontend Code:\n${files['frontend.js']}\n` : ''}

Include these sections:
1. # ${analysis.featureName} (title)
2. ## Overview - What the feature does
3. ## Features - Bullet list of capabilities
4. ## Installation - How to install (copy to data/features/, restart server)
5. ## Usage - How to use the feature
${hasBackend ? '6. ## API Endpoints - Document all endpoints with request/response examples' : ''}
${hasFrontend ? `${hasBackend ? '7' : '6'}. ## UI Components - Describe the UI elements added` : ''}
7. ## Troubleshooting - Common issues and solutions

Output ONLY the markdown content, no code blocks wrapping it.` }
    ];

    const result = await this.invoke(messages, 0.2, 4096);
    return result.content.trim();
  }

  /**
   * Clean code response by removing markdown formatting
   */
  cleanCodeResponse(content) {
    // Remove markdown code blocks
    let cleaned = content
      .replace(/^```(?:javascript|js)?\n?/gm, '')
      .replace(/```$/gm, '')
      .trim();

    // If it still has backticks at start/end, remove them
    if (cleaned.startsWith('```')) {
      cleaned = cleaned.substring(3);
    }
    if (cleaned.endsWith('```')) {
      cleaned = cleaned.substring(0, cleaned.length - 3);
    }

    return cleaned.trim();
  }
}

module.exports = { FeatureGeneratorAgent };
