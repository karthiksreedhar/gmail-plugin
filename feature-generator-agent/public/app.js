/**
 * Feature Generator Agent - Frontend Application
 * Supports both "Chat" mode (email assistant) and "Generate Feature" mode
 */

// State
let sessionId = localStorage.getItem('featureGeneratorSessionId');
let currentFiles = {};
let currentFeatureId = null;
let currentFileName = 'manifest.json';
let updatedFiles = [];
let isGenerating = false;
let currentMode = localStorage.getItem('featureGeneratorMode') || 'generate'; // 'chat' or 'generate'

// DOM Elements
const chatMessages = document.getElementById('chatMessages');
const messageInput = document.getElementById('messageInput');
const sendBtn = document.getElementById('sendBtn');
const newSessionBtn = document.getElementById('newSessionBtn');
const previewSection = document.getElementById('previewSection');
const featureIdBadge = document.getElementById('featureIdBadge');
const downloadBtn = document.getElementById('downloadBtn');
const fileTabs = document.querySelectorAll('.file-tab');
const currentFileNameEl = document.getElementById('currentFileName');
const fileContent = document.getElementById('fileContent');
const copyFileBtn = document.getElementById('copyFileBtn');
const toastContainer = document.getElementById('toastContainer');
const chatModeBtn = document.getElementById('chatModeBtn');
const generateModeBtn = document.getElementById('generateModeBtn');
const headerTitle = document.getElementById('headerTitle');
const headerSubtitle = document.getElementById('headerSubtitle');
const userSelector = document.getElementById('userSelector');
const selectedUserDropdown = document.getElementById('selectedUser');

// Welcome messages for each mode
const WELCOME_MESSAGES = {
  generate: `Welcome! I can generate Gmail Plugin features for you.

**Describe your feature idea** and I'll create the necessary files:
- \`manifest.json\` - Feature metadata
- \`backend.js\` - Server-side routes and logic
- \`frontend.js\` - UI components and interactions
- \`README.md\` - Documentation

After testing, come back and tell me about any issues - I'll help fix them!`,

  chat: `Welcome to Email Assistant! 💬

I have access to your Gmail Plugin data and can help you:
- **Analyze your emails** by category, sender, or content
- **Find specific emails** or conversations
- **Get insights** about your email patterns
- **Answer questions** about your inbox

Just ask me anything about your emails!`
};

// Initialize
document.addEventListener('DOMContentLoaded', () => {
  initializeSession();
  setupEventListeners();
  initRHSElements();
  setupRHSEventListeners();
  setMode(currentMode);
});

// Initialize or restore session
async function initializeSession() {
  if (sessionId) {
    try {
      const response = await fetch(`/api/session/${sessionId}`);
      const data = await response.json();
      
      if (data.success && !data.isNew && data.hasGeneratedFiles) {
        // Restore existing session
        await loadSessionFiles();
        await loadChatHistory();
        showToast('Session restored', 'success');
      } else if (data.isNew) {
        sessionId = data.sessionId;
        localStorage.setItem('featureGeneratorSessionId', sessionId);
      }
    } catch (error) {
      console.error('Error checking session:', error);
      await createNewSession();
    }
  } else {
    await createNewSession();
  }
}

// Create new session
async function createNewSession() {
  try {
    const response = await fetch('/api/session/new', { method: 'POST' });
    const data = await response.json();
    
    if (data.success) {
      sessionId = data.sessionId;
      localStorage.setItem('featureGeneratorSessionId', sessionId);
    }
  } catch (error) {
    console.error('Error creating session:', error);
    showToast('Failed to create session', 'error');
  }
}

// Load session files
async function loadSessionFiles() {
  try {
    const response = await fetch(`/api/files/${sessionId}`);
    const data = await response.json();
    
    if (data.success) {
      currentFiles = data.files;
      currentFeatureId = data.featureId;
      showPreview();
    }
  } catch (error) {
    console.error('Error loading files:', error);
  }
}

// Load chat history
async function loadChatHistory() {
  try {
    const response = await fetch(`/api/history/${sessionId}`);
    const data = await response.json();
    
    if (data.success && data.chatHistory.length > 0) {
      // Clear default welcome message if we have history
      chatMessages.innerHTML = '';
      
      // Add welcome message back
      addMessage('assistant', `Welcome! I can generate Gmail Plugin features for you.

**Describe your feature idea** and I'll create the necessary files:
- \`manifest.json\` - Feature metadata
- \`backend.js\` - Server-side routes and logic
- \`frontend.js\` - UI components and interactions
- \`README.md\` - Documentation

After testing, come back and tell me about any issues - I'll help fix them!`);
      
      // Add history
      for (const entry of data.chatHistory) {
        addMessage(entry.role, entry.content, false);
      }
      
      scrollToBottom();
    }
  } catch (error) {
    console.error('Error loading history:', error);
  }
}

// Setup event listeners
function setupEventListeners() {
  // Send button
  sendBtn.addEventListener('click', handleSend);
  
  // Enter to send (Ctrl+Enter)
  messageInput.addEventListener('keydown', (e) => {
    if (e.ctrlKey && e.key === 'Enter') {
      e.preventDefault();
      handleSend();
    }
  });
  
  // New session button
  newSessionBtn.addEventListener('click', handleNewSession);
  
  // Mode toggle buttons
  chatModeBtn.addEventListener('click', () => setMode('chat'));
  generateModeBtn.addEventListener('click', () => setMode('generate'));
  
  // File tabs
  fileTabs.forEach(tab => {
    tab.addEventListener('click', () => {
      const fileName = tab.dataset.file;
      selectFile(fileName);
    });
  });
  
  // Copy button
  copyFileBtn.addEventListener('click', handleCopy);
  
  // Download button
  downloadBtn.addEventListener('click', handleDownload);
  
  // Auto-resize textarea
  messageInput.addEventListener('input', () => {
    messageInput.style.height = 'auto';
    messageInput.style.height = Math.min(messageInput.scrollHeight, 200) + 'px';
  });
}

// Set mode (chat or generate)
function setMode(mode) {
  currentMode = mode;
  localStorage.setItem('featureGeneratorMode', mode);
  
  // Update toggle button states
  chatModeBtn.classList.toggle('active', mode === 'chat');
  generateModeBtn.classList.toggle('active', mode === 'generate');
  
  // Update body class for styling
  document.body.classList.toggle('chat-mode', mode === 'chat');
  
  // Show/hide user selector based on mode
  if (userSelector) {
    userSelector.style.display = mode === 'chat' ? 'flex' : 'none';
  }
  
  // Update header
  if (mode === 'chat') {
    headerTitle.textContent = '💬 Email Assistant';
    headerSubtitle.textContent = 'Ask questions about your emails';
    messageInput.placeholder = 'Ask about your emails... (e.g., "How many emails do I have in each category?")';
    sendBtn.querySelector('.btn-text').textContent = 'Send';
    sendBtn.querySelector('.btn-loading').innerHTML = '<span class="spinner"></span> Thinking...';
    // Hide preview section in chat mode
    previewSection.style.display = 'none';
  } else {
    headerTitle.textContent = '🔧 Feature Generator Agent';
    headerSubtitle.textContent = 'AI-powered Gmail Plugin feature generator';
    messageInput.placeholder = "Describe your feature... (e.g., 'Create a feature that shows email statistics by category with a chart')";
    sendBtn.querySelector('.btn-text').textContent = 'Generate';
    sendBtn.querySelector('.btn-loading').innerHTML = '<span class="spinner"></span> Generating...';
    // Show preview if we have files
    if (currentFiles && Object.keys(currentFiles).length > 0) {
      previewSection.style.display = 'flex';
    }
  }
  
  // Update welcome message if chat is empty (only welcome message)
  if (chatMessages.children.length <= 1) {
    chatMessages.innerHTML = '';
    addMessage('assistant', WELCOME_MESSAGES[mode]);
  }
}

// Handle send message
async function handleSend() {
  const message = messageInput.value.trim();
  
  if (!message || isGenerating) return;
  
  // Clear input
  messageInput.value = '';
  messageInput.style.height = 'auto';
  
  // Add user message to chat
  addMessage('user', message);
  
  // Show loading state
  setGenerating(true);
  const loadingMsg = addLoadingMessage();
  
  try {
    // Use different endpoints based on mode
    const endpoint = currentMode === 'chat' ? '/api/email-chat' : '/api/chat';
    
    // Build request body - include selected user for chat mode
    const requestBody = { sessionId, message };
    if (currentMode === 'chat' && selectedUserDropdown) {
      requestBody.userEmail = selectedUserDropdown.value;
    }
    
    const response = await fetch(endpoint, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(requestBody)
    });
    
    const data = await response.json();
    
    // Remove loading message
    loadingMsg.remove();
    
    if (data.success) {
      // Check if this has category suggestions (chat mode)
      if (currentMode === 'chat' && data.categorySuggestions) {
        console.log('📂 Showing category suggestions:', data.categorySuggestions.categories.length, 'categories');
        showCategorySuggestionConfirmation(data.response, data.categorySuggestions, data.operationsLog);
      // Check if this requires confirmation (chat mode with modifications)
      } else if (currentMode === 'chat' && data.requiresConfirmation && data.modifications) {
        showModificationConfirmation(data.response, data.modifications, data.operationsLog);
      } else {
        // Add assistant response (with operations log for chat mode)
        const operationsLog = (currentMode === 'chat') ? data.operationsLog : null;
        addMessage('assistant', data.response, true, operationsLog);
        
        // Check for email list in response (chat mode) - use server-provided emailList first
        if (currentMode === 'chat' && data.emailList) {
          console.log('📧 Displaying email list from server:', data.emailList.count, 'emails');
          showEmailListInPreview(data.emailList);
        } else if (currentMode === 'chat') {
          // Fallback: try to parse from response text
          const emailList = parseEmailListFromResponse(data.response);
          if (emailList) {
            showEmailListInPreview(emailList);
          }
        }
        
        // Handle generate mode specific logic
        if (currentMode === 'generate' && data.files) {
          // Update state
          currentFiles = data.files;
          currentFeatureId = data.featureId;
          updatedFiles = data.updatedFiles || [];
          
          // Show/update preview
          showPreview();
          updateFileTabs();
          
          // Select first file or first updated file
          if (updatedFiles.length > 0) {
            selectFile(updatedFiles[0]);
          } else {
            selectFile('manifest.json');
          }
          
          showToast('Files generated successfully!', 'success');
        }
      }
    } else {
      addMessage('assistant', `**Error:** ${data.error}\n\nPlease try again or rephrase your request.`);
      showToast(data.error, 'error');
    }
  } catch (error) {
    loadingMsg.remove();
    console.error('Error:', error);
    addMessage('assistant', '**Error:** Failed to connect to the server. Please try again.');
    showToast('Connection failed', 'error');
  } finally {
    setGenerating(false);
  }
}

// Handle new session
async function handleNewSession() {
  if (isGenerating) return;
  
  // Only confirm if in generate mode with files
  if (currentMode === 'generate' && currentFiles && Object.keys(currentFiles).length > 0) {
    if (!confirm('Start a new session? Current files will be lost if not downloaded.')) {
      return;
    }
  }
  
  // Clear current session on server
  if (sessionId) {
    try {
      await fetch(`/api/session/${sessionId}`, { method: 'DELETE' });
    } catch (e) {
      console.error('Error clearing session:', e);
    }
  }
  
  // Reset state
  currentFiles = {};
  currentFeatureId = null;
  updatedFiles = [];
  
  // Create new session
  await createNewSession();
  
  // Reset UI with mode-appropriate welcome message
  chatMessages.innerHTML = '';
  addMessage('assistant', WELCOME_MESSAGES[currentMode]);
  
  previewSection.style.display = 'none';
  
  showToast('New session started', 'success');
}

// Handle copy
async function handleCopy() {
  const content = currentFiles[currentFileName];
  
  if (!content) {
    showToast('No content to copy', 'warning');
    return;
  }
  
  try {
    await navigator.clipboard.writeText(content);
    showToast('Copied to clipboard!', 'success');
  } catch (error) {
    console.error('Copy failed:', error);
    showToast('Failed to copy', 'error');
  }
}

// Handle download
function handleDownload() {
  if (!sessionId || !currentFeatureId) {
    showToast('No files to download', 'warning');
    return;
  }
  
  // Trigger download
  window.location.href = `/api/download/${sessionId}`;
  showToast('Download started!', 'success');
}

// Store the current operations log for display in preview panel
let currentOperationsLog = null;

// Add message to chat (with optional operations log)
function addMessage(role, content, scroll = true, operationsLog = null) {
  const messageDiv = document.createElement('div');
  messageDiv.className = `message ${role}-message`;
  
  const avatar = document.createElement('div');
  avatar.className = 'message-avatar';
  avatar.textContent = role === 'user' ? '👤' : '🤖';
  
  const contentDiv = document.createElement('div');
  contentDiv.className = 'message-content';
  contentDiv.innerHTML = formatMarkdown(content);
  
  // Add operations log button AFTER the message content (for assistant messages in chat mode)
  if (operationsLog && role === 'assistant') {
    const logButton = document.createElement('button');
    logButton.className = 'view-operations-btn';
    logButton.innerHTML = '🔍 View Operations Log';
    logButton.addEventListener('click', () => {
      showOperationsLogInPreview(operationsLog);
    });
    contentDiv.appendChild(logButton);
    
    // Store the log for reference
    currentOperationsLog = operationsLog;
  }
  
  messageDiv.appendChild(avatar);
  messageDiv.appendChild(contentDiv);
  
  chatMessages.appendChild(messageDiv);
  
  if (scroll) {
    scrollToBottom();
  }
  
  return messageDiv;
}

// Show operations log in the preview panel (left side)
function showOperationsLogInPreview(log) {
  currentOperationsLog = log;
  
  // Show the preview section
  previewSection.style.display = 'flex';
  
  // Update header
  const previewHeader = previewSection.querySelector('.preview-header h2');
  previewHeader.textContent = '🔍 Operations Log';
  
  // Hide download button, add close button
  downloadBtn.style.display = 'none';
  
  // Add close button if not already present
  let closeBtn = previewSection.querySelector('.close-operations-btn');
  if (!closeBtn) {
    closeBtn = document.createElement('button');
    closeBtn.className = 'close-operations-btn';
    closeBtn.innerHTML = '✕ Close';
    closeBtn.addEventListener('click', closeOperationsLog);
    previewSection.querySelector('.preview-actions').appendChild(closeBtn);
  }
  closeBtn.style.display = 'inline-flex';
  
  // Update badge to show summary
  const mongoCount = log.mongoQueries?.count || 0;
  const apiCount = log.apiCalls?.count || 0;
  const totalTime = log.totalDuration || 0;
  featureIdBadge.textContent = `${mongoCount} queries, ${apiCount} API call${apiCount !== 1 ? 's' : ''}, ${formatDuration(totalTime)}`;
  
  // Hide file tabs
  const fileTabsEl = previewSection.querySelector('.file-tabs');
  fileTabsEl.style.display = 'none';
  
  // Update file content header
  currentFileNameEl.textContent = 'Operations Summary';
  copyFileBtn.style.display = 'none';
  
  // Render the log content in the preview area
  const codeElement = fileContent.querySelector('code');
  codeElement.className = '';
  codeElement.innerHTML = '';
  
  // Create and append the operations log HTML
  const logContainer = document.createElement('div');
  logContainer.className = 'operations-log-preview';
  logContainer.innerHTML = renderOperationsLogHTML(log);
  
  // Clear and add to file content
  fileContent.innerHTML = '';
  fileContent.appendChild(logContainer);
  
  // Add click handlers after rendering
  setTimeout(() => addOperationsLogClickHandlers(logContainer, log), 0);
}

// Render operations log as HTML string for preview panel
function renderOperationsLogHTML(log) {
  const mongoCount = log.mongoQueries?.count || 0;
  const mongoTime = log.mongoQueries?.totalDuration || 0;
  const apiCount = log.apiCalls?.count || 0;
  const apiTime = log.apiCalls?.totalDuration || 0;
  const totalTime = log.totalDuration || 0;
  const hasErrors = (log.errors?.length || 0) > 0;
  
  let html = '';
  
  // MongoDB Queries Section
  if (mongoCount > 0) {
    html += `<div class="log-section"><div class="log-section-header"><span class="log-section-icon">📊</span><span class="log-section-title">MongoDB Queries</span><span class="log-section-stats">${mongoCount} queries, ${formatDuration(mongoTime)}</span></div><div class="log-section-items">`;
    
    for (let i = 0; i < log.mongoQueries.queries.length; i++) {
      const query = log.mongoQueries.queries[i];
      const statusIcon = query.success ? '✅' : '❌';
      const durationClass = query.duration > 100 ? 'slow' : query.duration > 50 ? 'medium' : 'fast';
      const hasPreview = query.resultPreview != null;
      html += `<div class="log-item clickable ${query.success ? '' : 'error'}" data-type="mongo" data-index="${i}"><span class="log-item-icon">${statusIcon}</span><span class="log-item-collection">${query.collection}</span><span class="log-item-user">(${truncateEmail(query.userEmail)})</span><span class="log-item-result">${query.resultCount} items</span><span class="log-item-duration ${durationClass}">${query.duration}ms</span>${hasPreview ? '<span class="log-item-expand">👁️</span>' : ''}</div><div class="log-item-details" id="mongo-detail-${i}" style="display: none;"></div>`;
    }
    
    html += `</div></div>`;
  }
  
  // API Calls Section
  if (apiCount > 0) {
    html += `<div class="log-section"><div class="log-section-header"><span class="log-section-icon">🤖</span><span class="log-section-title">Anthropic API Call</span><span class="log-section-stats">${formatDuration(apiTime)}</span></div><div class="log-section-items">`;
    
    for (let i = 0; i < log.apiCalls.calls.length; i++) {
      const call = log.apiCalls.calls[i];
      const statusIcon = call.success ? '✅' : '❌';
      const hasDetails = call.details && (call.details.systemPrompt || call.details.userMessage || call.details.response);
      html += `<div class="log-item clickable api-call-item ${call.success ? '' : 'error'}" data-type="api" data-index="${i}"><span class="log-item-icon">${statusIcon}</span><span class="log-item-label">Model:</span><span class="log-item-value">${call.model}</span>${hasDetails ? '<span class="log-item-expand">👁️ View Details</span>' : ''}</div><div class="log-item-details api-details" id="api-detail-${i}" style="display: none;"></div><div class="log-item"><span class="log-item-icon">📥</span><span class="log-item-label">Input:</span><span class="log-item-value">~${call.inputTokens?.toLocaleString() || 0}</span></div><div class="log-item"><span class="log-item-icon">📤</span><span class="log-item-label">Output:</span><span class="log-item-value">~${call.outputTokens?.toLocaleString() || 0}</span></div><div class="log-item"><span class="log-item-icon">⏱️</span><span class="log-item-label">Latency:</span><span class="log-item-value">${formatDuration(call.duration)}</span></div>`;
    }
    
    html += `</div></div>`;
  }
  
  // Data Summary Section
  if (log.dataSummary) {
    html += `<div class="log-section"><div class="log-section-header"><span class="log-section-icon">📈</span><span class="log-section-title">Data Summary</span></div><div class="log-section-items"><div class="log-item"><span class="log-item-icon">📧</span><span class="log-item-label">Emails:</span><span class="log-item-value">${log.dataSummary.totalEmails?.toLocaleString() || 0}</span></div><div class="log-item"><span class="log-item-icon">📏</span><span class="log-item-label">Context:</span><span class="log-item-value">${formatBytes(log.dataSummary.contextSize || 0)}</span></div><div class="log-item"><span class="log-item-icon">👥</span><span class="log-item-label">Users:</span><span class="log-item-value">${log.dataSummary.usersQueried?.join(', ') || 'None'}</span></div></div></div>`;
  }
  
  // Errors Section
  if (hasErrors) {
    html += `<div class="log-section error-section"><div class="log-section-header"><span class="log-section-icon">⚠️</span><span class="log-section-title">Errors</span><span class="log-section-stats">${log.errors.length}</span></div><div class="log-section-items">`;
    for (const error of log.errors) {
      html += `<div class="log-item error"><span class="log-item-icon">❌</span><span class="log-item-label">${error.operation}:</span><span class="log-item-value">${error.message}</span></div>`;
    }
    html += `</div></div>`;
  }
  
  // Total timing footer
  html += `<div class="log-footer"><span class="log-footer-label">Total:</span><span class="log-footer-value">${formatDuration(totalTime)}</span></div>`;
  
  return html;
}

// Close the operations log panel
function closeOperationsLog() {
  previewSection.style.display = 'none';
  currentOperationsLog = null;
  
  // Hide close button
  const closeBtn = previewSection.querySelector('.close-operations-btn');
  if (closeBtn) {
    closeBtn.style.display = 'none';
  }
  
  // Restore file tabs visibility and download button for when returning to generate mode
  const fileTabsEl = previewSection.querySelector('.file-tabs');
  fileTabsEl.style.display = 'flex';
  downloadBtn.style.display = 'inline-flex';
  copyFileBtn.style.display = 'inline-flex';
  
  // Reset preview header
  const previewHeader = previewSection.querySelector('.preview-header h2');
  previewHeader.textContent = '📁 Generated Files';
}

// Add click handlers for operations log items in preview
function addOperationsLogClickHandlers(container, log) {
  // MongoDB query click handlers
  const mongoItems = container.querySelectorAll('.log-item.clickable[data-type="mongo"]');
  mongoItems.forEach((item) => {
    item.addEventListener('click', (e) => {
      e.stopPropagation();
      const index = parseInt(item.dataset.index);
      const query = log.mongoQueries.queries[index];
      const detailDiv = container.querySelector(`#mongo-detail-${index}`);
      
      if (detailDiv.style.display === 'none') {
        detailDiv.innerHTML = renderMongoQueryDetails(query);
        detailDiv.style.display = 'block';
        item.classList.add('expanded');
      } else {
        detailDiv.style.display = 'none';
        item.classList.remove('expanded');
      }
    });
  });
  
  // API call click handlers
  const apiItems = container.querySelectorAll('.log-item.clickable[data-type="api"]');
  apiItems.forEach((item) => {
    item.addEventListener('click', (e) => {
      e.stopPropagation();
      const index = parseInt(item.dataset.index);
      const call = log.apiCalls.calls[index];
      const detailDiv = container.querySelector(`#api-detail-${index}`);
      
      if (detailDiv.style.display === 'none') {
        detailDiv.innerHTML = renderApiCallDetails(call);
        detailDiv.style.display = 'block';
        item.classList.add('expanded');
      } else {
        detailDiv.style.display = 'none';
        item.classList.remove('expanded');
      }
    });
  });
}

// Render operations log as expandable component
function renderOperationsLog(log) {
  const container = document.createElement('div');
  container.className = 'operations-log';
  
  // Calculate summary stats
  const mongoCount = log.mongoQueries?.count || 0;
  const mongoTime = log.mongoQueries?.totalDuration || 0;
  const apiCount = log.apiCalls?.count || 0;
  const apiTime = log.apiCalls?.totalDuration || 0;
  const totalTime = log.totalDuration || 0;
  const hasErrors = (log.errors?.length || 0) > 0;
  
  // Create collapsed header
  const header = document.createElement('div');
  header.className = 'operations-log-header';
  header.innerHTML = `
    <span class="operations-log-icon">🔍</span>
    <span class="operations-log-summary">
      View Operations Log 
      <span class="operations-log-stats">(${mongoCount} queries, ${apiCount} API call${apiCount !== 1 ? 's' : ''}, ${formatDuration(totalTime)})</span>
    </span>
    <span class="operations-log-toggle">▶</span>
    ${hasErrors ? '<span class="operations-log-error-badge">⚠</span>' : ''}
  `;
  
  // Create expandable content
  const content = document.createElement('div');
  content.className = 'operations-log-content';
  content.style.display = 'none';
  
  // Build the log tree
  let contentHTML = '';
  
  // MongoDB Queries Section
  if (mongoCount > 0) {
    contentHTML += `
      <div class="log-section">
        <div class="log-section-header">
          <span class="log-section-icon">📊</span>
          <span class="log-section-title">MongoDB Queries</span>
          <span class="log-section-stats">${mongoCount} queries, ${formatDuration(mongoTime)}</span>
        </div>
        <div class="log-section-items" id="mongo-queries-list">
    `;
    
    for (let i = 0; i < log.mongoQueries.queries.length; i++) {
      const query = log.mongoQueries.queries[i];
      const statusIcon = query.success ? '✅' : '❌';
      const durationClass = query.duration > 100 ? 'slow' : query.duration > 50 ? 'medium' : 'fast';
      const hasPreview = query.resultPreview != null;
      contentHTML += `
        <div class="log-item clickable ${query.success ? '' : 'error'}" data-type="mongo" data-index="${i}">
          <span class="log-item-icon">${statusIcon}</span>
          <span class="log-item-collection">${query.collection}</span>
          <span class="log-item-user">(${truncateEmail(query.userEmail)})</span>
          <span class="log-item-result">${query.resultCount} items</span>
          <span class="log-item-duration ${durationClass}">${query.duration}ms</span>
          ${hasPreview ? '<span class="log-item-expand">👁️</span>' : ''}
        </div>
        <div class="log-item-details" id="mongo-detail-${i}" style="display: none;"></div>
      `;
    }
    
    contentHTML += `
        </div>
      </div>
    `;
  }
  
  // API Calls Section
  if (apiCount > 0) {
    contentHTML += `
      <div class="log-section">
        <div class="log-section-header">
          <span class="log-section-icon">🤖</span>
          <span class="log-section-title">Anthropic API Call</span>
          <span class="log-section-stats">${formatDuration(apiTime)}</span>
        </div>
        <div class="log-section-items" id="api-calls-list">
    `;
    
    for (let i = 0; i < log.apiCalls.calls.length; i++) {
      const call = log.apiCalls.calls[i];
      const statusIcon = call.success ? '✅' : '❌';
      const hasDetails = call.details && (call.details.systemPrompt || call.details.userMessage || call.details.response);
      contentHTML += `
        <div class="log-item clickable api-call-item ${call.success ? '' : 'error'}" data-type="api" data-index="${i}">
          <span class="log-item-icon">${statusIcon}</span>
          <span class="log-item-label">Model:</span>
          <span class="log-item-value">${call.model}</span>
          ${hasDetails ? '<span class="log-item-expand">👁️ View Details</span>' : ''}
        </div>
        <div class="log-item-details api-details" id="api-detail-${i}" style="display: none;"></div>
        <div class="log-item">
          <span class="log-item-icon">📥</span>
          <span class="log-item-label">Input tokens:</span>
          <span class="log-item-value">~${call.inputTokens?.toLocaleString() || 0}</span>
        </div>
        <div class="log-item">
          <span class="log-item-icon">📤</span>
          <span class="log-item-label">Output tokens:</span>
          <span class="log-item-value">~${call.outputTokens?.toLocaleString() || 0}</span>
        </div>
        <div class="log-item">
          <span class="log-item-icon">⏱️</span>
          <span class="log-item-label">Latency:</span>
          <span class="log-item-value">${formatDuration(call.duration)}</span>
        </div>
      `;
    }
    
    contentHTML += `
        </div>
      </div>
    `;
  }
  
  // Data Summary Section
  if (log.dataSummary) {
    contentHTML += `
      <div class="log-section">
        <div class="log-section-header">
          <span class="log-section-icon">📈</span>
          <span class="log-section-title">Data Summary</span>
        </div>
        <div class="log-section-items">
          <div class="log-item">
            <span class="log-item-icon">📧</span>
            <span class="log-item-label">Total emails loaded:</span>
            <span class="log-item-value">${log.dataSummary.totalEmails?.toLocaleString() || 0}</span>
          </div>
          <div class="log-item">
            <span class="log-item-icon">📏</span>
            <span class="log-item-label">Context size:</span>
            <span class="log-item-value">${formatBytes(log.dataSummary.contextSize || 0)}</span>
          </div>
          <div class="log-item">
            <span class="log-item-icon">👥</span>
            <span class="log-item-label">Users queried:</span>
            <span class="log-item-value">${log.dataSummary.usersQueried?.join(', ') || 'None'}</span>
          </div>
        </div>
      </div>
    `;
  }
  
  // Errors Section (if any)
  if (hasErrors) {
    contentHTML += `
      <div class="log-section error-section">
        <div class="log-section-header">
          <span class="log-section-icon">⚠️</span>
          <span class="log-section-title">Errors</span>
          <span class="log-section-stats">${log.errors.length} error${log.errors.length !== 1 ? 's' : ''}</span>
        </div>
        <div class="log-section-items">
    `;
    
    for (const error of log.errors) {
      contentHTML += `
        <div class="log-item error">
          <span class="log-item-icon">❌</span>
          <span class="log-item-label">${error.operation}:</span>
          <span class="log-item-value">${error.message}</span>
        </div>
      `;
    }
    
    contentHTML += `
        </div>
      </div>
    `;
  }
  
  // Total timing
  contentHTML += `
    <div class="log-footer">
      <span class="log-footer-label">Total execution time:</span>
      <span class="log-footer-value">${formatDuration(totalTime)}</span>
    </div>
  `;
  
  content.innerHTML = contentHTML;
  
  // Toggle functionality
  header.addEventListener('click', () => {
    const isExpanded = content.style.display !== 'none';
    content.style.display = isExpanded ? 'none' : 'block';
    header.querySelector('.operations-log-toggle').textContent = isExpanded ? '▶' : '▼';
    header.classList.toggle('expanded', !isExpanded);
  });
  
  container.appendChild(header);
  container.appendChild(content);
  
  // Add click handlers for expandable items after content is added to DOM
  setTimeout(() => {
    // MongoDB query click handlers
    const mongoItems = content.querySelectorAll('.log-item.clickable[data-type="mongo"]');
    mongoItems.forEach((item, idx) => {
      item.addEventListener('click', (e) => {
        e.stopPropagation();
        const index = parseInt(item.dataset.index);
        const query = log.mongoQueries.queries[index];
        const detailDiv = content.querySelector(`#mongo-detail-${index}`);
        
        if (detailDiv.style.display === 'none') {
          detailDiv.innerHTML = renderMongoQueryDetails(query);
          detailDiv.style.display = 'block';
          item.classList.add('expanded');
        } else {
          detailDiv.style.display = 'none';
          item.classList.remove('expanded');
        }
      });
    });
    
    // API call click handlers
    const apiItems = content.querySelectorAll('.log-item.clickable[data-type="api"]');
    apiItems.forEach((item, idx) => {
      item.addEventListener('click', (e) => {
        e.stopPropagation();
        const index = parseInt(item.dataset.index);
        const call = log.apiCalls.calls[index];
        const detailDiv = content.querySelector(`#api-detail-${index}`);
        
        if (detailDiv.style.display === 'none') {
          detailDiv.innerHTML = renderApiCallDetails(call);
          detailDiv.style.display = 'block';
          item.classList.add('expanded');
        } else {
          detailDiv.style.display = 'none';
          item.classList.remove('expanded');
        }
      });
    });
  }, 0);
  
  return container;
}

// Render MongoDB query details
function renderMongoQueryDetails(query) {
  let html = '<div class="detail-content">';
  html += `<div class="detail-header">📊 MongoDB Query: ${query.collection}</div>`;
  html += `<div class="detail-row"><strong>User:</strong> ${query.userEmail}</div>`;
  html += `<div class="detail-row"><strong>Timestamp:</strong> ${query.timestamp}</div>`;
  html += `<div class="detail-row"><strong>Duration:</strong> ${query.duration}ms</div>`;
  html += `<div class="detail-row"><strong>Result Count:</strong> ${query.resultCount} items</div>`;
  
  if (query.resultPreview) {
    html += `<div class="detail-section">`;
    html += `<div class="detail-section-title">Result Preview:</div>`;
    html += `<pre class="detail-code">${escapeHtml(JSON.stringify(query.resultPreview, null, 2))}</pre>`;
    html += `</div>`;
  }
  
  if (query.error) {
    html += `<div class="detail-error">Error: ${escapeHtml(query.error)}</div>`;
  }
  
  html += '</div>';
  return html;
}

// Render API call details
function renderApiCallDetails(call) {
  let html = '<div class="detail-content api-detail-content">';
  html += `<div class="detail-header">🤖 Anthropic API Call</div>`;
  html += `<div class="detail-row"><strong>Model:</strong> ${call.model}</div>`;
  html += `<div class="detail-row"><strong>Timestamp:</strong> ${call.timestamp}</div>`;
  html += `<div class="detail-row"><strong>Duration:</strong> ${formatDuration(call.duration)}</div>`;
  html += `<div class="detail-row"><strong>Input Tokens:</strong> ~${call.inputTokens?.toLocaleString() || 0}</div>`;
  html += `<div class="detail-row"><strong>Output Tokens:</strong> ~${call.outputTokens?.toLocaleString() || 0}</div>`;
  
  if (call.details) {
    if (call.details.userMessage) {
      html += `<div class="detail-section">`;
      html += `<div class="detail-section-title">📥 User Message:</div>`;
      html += `<pre class="detail-code user-message">${escapeHtml(call.details.userMessage)}</pre>`;
      html += `</div>`;
    }
    
    if (call.details.systemPrompt) {
      html += `<div class="detail-section collapsible">`;
      html += `<div class="detail-section-title clickable-title" onclick="this.parentElement.classList.toggle('open')">📋 System Prompt (click to expand) <span class="toggle-icon">▶</span></div>`;
      html += `<pre class="detail-code system-prompt">${escapeHtml(call.details.systemPrompt)}</pre>`;
      html += `</div>`;
    }
    
    if (call.details.response) {
      html += `<div class="detail-section">`;
      html += `<div class="detail-section-title">📤 AI Response:</div>`;
      html += `<pre class="detail-code ai-response">${escapeHtml(call.details.response)}</pre>`;
      html += `</div>`;
    }
  }
  
  if (call.error) {
    html += `<div class="detail-error">Error: ${escapeHtml(call.error)}</div>`;
  }
  
  html += '</div>';
  return html;
}

// Helper: Escape HTML for safe display
function escapeHtml(text) {
  if (!text) return '';
  return text
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;');
}

// Helper: Format duration in ms to human readable
function formatDuration(ms) {
  if (ms < 1000) return `${ms}ms`;
  return `${(ms / 1000).toFixed(1)}s`;
}

// Helper: Format bytes to human readable
function formatBytes(bytes) {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

// Helper: Truncate email for display
function truncateEmail(email) {
  if (!email) return 'unknown';
  const parts = email.split('@');
  if (parts[0].length > 10) {
    return parts[0].substring(0, 10) + '...@' + parts[1];
  }
  return email;
}

// Add loading message
function addLoadingMessage() {
  const messageDiv = document.createElement('div');
  messageDiv.className = 'message assistant-message';
  
  const avatar = document.createElement('div');
  avatar.className = 'message-avatar';
  avatar.textContent = '🤖';
  
  const contentDiv = document.createElement('div');
  contentDiv.className = 'message-content loading-message';
  
  // Different loading text based on mode
  const loadingText = currentMode === 'chat' ? 'Thinking' : 'Generating files';
  contentDiv.innerHTML = `
    <span>${loadingText}</span>
    <div class="loading-dots">
      <span></span>
      <span></span>
      <span></span>
    </div>
  `;
  
  messageDiv.appendChild(avatar);
  messageDiv.appendChild(contentDiv);
  
  chatMessages.appendChild(messageDiv);
  scrollToBottom();
  
  return messageDiv;
}

// Format markdown content
function formatMarkdown(content) {
  if (!content) return '';
  
  // Escape HTML first
  let formatted = content
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;');
  
  // Bold
  formatted = formatted.replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>');
  
  // Inline code
  formatted = formatted.replace(/`([^`]+)`/g, '<code>$1</code>');
  
  // Line breaks
  formatted = formatted.replace(/\n/g, '<br>');
  
  // Lists (simple)
  formatted = formatted.replace(/^- (.+)$/gm, '<li>$1</li>');
  formatted = formatted.replace(/(<li>.*<\/li>)/s, '<ul>$1</ul>');
  
  return formatted;
}

// Show preview section
function showPreview() {
  if (!currentFiles || Object.keys(currentFiles).length === 0) {
    previewSection.style.display = 'none';
    return;
  }
  
  previewSection.style.display = 'flex';
  featureIdBadge.textContent = currentFeatureId || 'feature';
  
  // Update file content
  displayFile(currentFileName);
}

// Update file tabs
function updateFileTabs() {
  fileTabs.forEach(tab => {
    const fileName = tab.dataset.file;
    const hasFile = currentFiles && currentFiles[fileName];
    const isUpdated = updatedFiles.includes(fileName);
    
    tab.classList.toggle('disabled', !hasFile);
    tab.classList.toggle('updated', isUpdated);
    tab.disabled = !hasFile;
  });
}

// Select file
function selectFile(fileName) {
  if (!currentFiles || !currentFiles[fileName]) {
    // Try to select manifest.json as fallback
    if (currentFiles && currentFiles['manifest.json']) {
      fileName = 'manifest.json';
    } else {
      return;
    }
  }
  
  currentFileName = fileName;
  
  // Update tab styles
  fileTabs.forEach(tab => {
    tab.classList.toggle('active', tab.dataset.file === fileName);
  });
  
  // Display file
  displayFile(fileName);
}

// Display file content
function displayFile(fileName) {
  currentFileNameEl.textContent = fileName;
  
  const content = currentFiles[fileName] || '';
  const codeElement = fileContent.querySelector('code');
  
  // Set content
  codeElement.textContent = content;
  
  // Determine language for highlighting
  let language = 'plaintext';
  if (fileName.endsWith('.js')) language = 'javascript';
  else if (fileName.endsWith('.json')) language = 'json';
  else if (fileName.endsWith('.md')) language = 'markdown';
  
  codeElement.className = `language-${language}`;
  
  // Apply highlighting
  if (window.hljs) {
    hljs.highlightElement(codeElement);
  }
}

// Set generating state
function setGenerating(generating) {
  isGenerating = generating;
  sendBtn.disabled = generating;
  messageInput.disabled = generating;
  
  const btnText = sendBtn.querySelector('.btn-text');
  const btnLoading = sendBtn.querySelector('.btn-loading');
  
  btnText.style.display = generating ? 'none' : 'inline';
  btnLoading.style.display = generating ? 'inline-flex' : 'none';
}

// Scroll chat to bottom
function scrollToBottom() {
  chatMessages.scrollTop = chatMessages.scrollHeight;
}

// Show toast notification
function showToast(message, type = 'success') {
  const toast = document.createElement('div');
  toast.className = `toast ${type}`;
  
  const icon = document.createElement('span');
  icon.className = 'toast-icon';
  icon.textContent = type === 'success' ? '✓' : type === 'error' ? '✕' : '⚠';
  
  const msg = document.createElement('span');
  msg.className = 'toast-message';
  msg.textContent = message;
  
  toast.appendChild(icon);
  toast.appendChild(msg);
  
  toastContainer.appendChild(toast);
  
  // Remove after 3 seconds
  setTimeout(() => {
    toast.style.animation = 'slideIn 0.3s ease reverse';
    setTimeout(() => toast.remove(), 300);
  }, 3000);
}

// =====================================================
// MODIFICATION CONFIRMATION SYSTEM
// =====================================================

// Store pending modifications for confirmation
let pendingModifications = null;

// Show modification confirmation inline in chat with RHS preview
function showModificationConfirmation(aiResponse, modifications, operationsLog) {
  // Store pending modifications
  pendingModifications = modifications;
  
  // First add the AI response to chat
  addMessage('assistant', aiResponse, true, operationsLog);
  
  // Add inline confirmation message with buttons in chat
  addConfirmationMessage(modifications);
  
  // Automatically show modification preview on RHS
  showModificationDetails(modifications);
}

// Add confirmation message with Approve/Cancel buttons inline in chat
function addConfirmationMessage(modifications) {
  const messageDiv = document.createElement('div');
  messageDiv.className = 'message assistant-message confirmation-message';
  messageDiv.id = 'pending-confirmation';
  
  const avatar = document.createElement('div');
  avatar.className = 'message-avatar';
  avatar.textContent = '⚠️';
  
  const contentDiv = document.createElement('div');
  contentDiv.className = 'message-content confirmation-content';
  
  // Summary text
  const summaryText = document.createElement('div');
  summaryText.className = 'confirmation-text';
  summaryText.innerHTML = `
    <strong>Database Modification Required</strong><br>
    I want to make <strong>${modifications.length} change${modifications.length !== 1 ? 's' : ''}</strong> to your email data:
    <ul class="inline-changes-list">
      ${modifications.map(mod => `<li>${getChangeTypeIcon(mod.type)} ${mod.description}</li>`).join('')}
    </ul>
    <p class="confirmation-hint">Review the changes in the preview panel on the right →</p>
  `;
  contentDiv.appendChild(summaryText);
  
  // Action buttons container
  const buttonsDiv = document.createElement('div');
  buttonsDiv.className = 'confirmation-buttons';
  
  const cancelBtn = document.createElement('button');
  cancelBtn.className = 'btn-secondary cancel-btn';
  cancelBtn.innerHTML = '✕ Cancel';
  cancelBtn.addEventListener('click', () => {
    handleCancelModifications();
  });
  
  const approveBtn = document.createElement('button');
  approveBtn.className = 'btn-primary approve-btn';
  approveBtn.innerHTML = '✓ Approve Changes';
  approveBtn.addEventListener('click', () => {
    handleApproveModifications();
  });
  
  buttonsDiv.appendChild(cancelBtn);
  buttonsDiv.appendChild(approveBtn);
  contentDiv.appendChild(buttonsDiv);
  
  messageDiv.appendChild(avatar);
  messageDiv.appendChild(contentDiv);
  
  chatMessages.appendChild(messageDiv);
  scrollToBottom();
}

// Handle approve button click
async function handleApproveModifications() {
  if (!pendingModifications) return;
  
  const confirmationMsg = document.getElementById('pending-confirmation');
  const approveBtn = confirmationMsg?.querySelector('.approve-btn');
  const cancelBtn = confirmationMsg?.querySelector('.cancel-btn');
  
  // Show loading state
  if (approveBtn) {
    approveBtn.innerHTML = '<span class="spinner"></span> Executing...';
    approveBtn.disabled = true;
  }
  if (cancelBtn) {
    cancelBtn.disabled = true;
  }
  
  try {
    const response = await fetch('/api/email-chat-confirm', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ modifications: pendingModifications })
    });
    
    const data = await response.json();
    
    if (data.success) {
      const successCount = data.summary?.successCount || 0;
      const errorCount = data.summary?.errorCount || 0;
      
      // Update the confirmation message to show success
      if (confirmationMsg) {
        const contentDiv = confirmationMsg.querySelector('.confirmation-content');
        contentDiv.innerHTML = `
          <div class="confirmation-result success">
            ✅ <strong>Changes Applied Successfully!</strong><br>
            Executed ${successCount} modification${successCount !== 1 ? 's' : ''}${errorCount > 0 ? `, ${errorCount} failed` : ''}.
          </div>
        `;
        confirmationMsg.querySelector('.message-avatar').textContent = '✅';
      }
      
      showToast(`${successCount} changes applied successfully!`, 'success');
      console.log('Modification results:', data.results);
      
      // Close the RHS preview panel
      closeModificationDetails();
      
    } else {
      throw new Error(data.error || 'Failed to execute modifications');
    }
  } catch (error) {
    console.error('Error executing modifications:', error);
    
    // Update the confirmation message to show error
    if (confirmationMsg) {
      const contentDiv = confirmationMsg.querySelector('.confirmation-content');
      contentDiv.innerHTML = `
        <div class="confirmation-result error">
          ❌ <strong>Error executing changes:</strong> ${error.message}
        </div>
      `;
      confirmationMsg.querySelector('.message-avatar').textContent = '❌';
    }
    
    showToast('Failed to execute changes', 'error');
    closeModificationDetails();
  }
  
  // Clear pending modifications
  pendingModifications = null;
}

// Handle cancel button click
function handleCancelModifications() {
  const confirmationMsg = document.getElementById('pending-confirmation');
  
  // Update the confirmation message to show cancelled
  if (confirmationMsg) {
    const contentDiv = confirmationMsg.querySelector('.confirmation-content');
    contentDiv.innerHTML = `
      <div class="confirmation-result cancelled">
        🚫 <strong>Changes Cancelled</strong><br>
        No modifications were made to your data.
      </div>
    `;
    confirmationMsg.querySelector('.message-avatar').textContent = '🚫';
  }
  
  // Close the RHS preview panel
  closeModificationDetails();
  
  // Clear pending modifications
  pendingModifications = null;
  
  showToast('Changes cancelled', 'warning');
}

// Show modification details in the left sidebar
function showModificationDetails(modifications) {
  // Show the preview section for details
  previewSection.style.display = 'flex';
  
  // Update header
  const previewHeader = previewSection.querySelector('.preview-header h2');
  previewHeader.textContent = '🔍 Modification Details';
  
  // Hide download button, add close button
  downloadBtn.style.display = 'none';
  
  // Add close button if not already present
  let closeBtn = previewSection.querySelector('.close-details-btn');
  if (!closeBtn) {
    closeBtn = document.createElement('button');
    closeBtn.className = 'close-details-btn';
    closeBtn.innerHTML = '✕ Close Details';
    closeBtn.addEventListener('click', closeModificationDetails);
    previewSection.querySelector('.preview-actions').appendChild(closeBtn);
  }
  closeBtn.style.display = 'inline-flex';
  
  // Update badge to show modification count
  featureIdBadge.textContent = `${modifications.length} modification${modifications.length !== 1 ? 's' : ''}`;
  
  // Hide file tabs
  const fileTabsEl = previewSection.querySelector('.file-tabs');
  fileTabsEl.style.display = 'none';
  
  // Update file content header
  currentFileNameEl.textContent = 'Modification Details';
  copyFileBtn.style.display = 'none';
  
  // Render the modification details in the preview area
  const detailsContainer = document.createElement('div');
  detailsContainer.className = 'modification-details-preview';
  detailsContainer.innerHTML = renderModificationDetailsHTML(modifications);
  
  // Clear and add to file content
  fileContent.innerHTML = '';
  fileContent.appendChild(detailsContainer);
}

// Render modification details as HTML
function renderModificationDetailsHTML(modifications) {
  let html = '<div class="modification-details-content">';
  
  html += `<div class="details-header">
    <h3>📝 Changes to be made</h3>
    <p>These operations will be executed on your MongoDB database:</p>
  </div>`;
  
  for (let i = 0; i < modifications.length; i++) {
    const mod = modifications[i];
    const icon = getChangeTypeIcon(mod.type);
    
    html += `<div class="modification-item">
      <div class="modification-header">
        <span class="modification-icon">${icon}</span>
        <span class="modification-title">${mod.description}</span>
      </div>
      
      <div class="modification-details">
        <div class="detail-row">
          <span class="detail-label">Type:</span>
          <span class="detail-value">${mod.type}</span>
        </div>
        <div class="detail-row">
          <span class="detail-label">Collection:</span>
          <span class="detail-value">${mod.collection}</span>
        </div>
        <div class="detail-row">
          <span class="detail-label">User:</span>
          <span class="detail-value">${mod.userEmail}</span>
        </div>
      </div>
      
      <div class="modification-data">
        <div class="data-header">Data to be modified:</div>
        <pre class="data-preview">${JSON.stringify(mod.data, null, 2)}</pre>
      </div>
      
      <div class="impact-assessment">
        ${renderImpactAssessment(mod)}
      </div>
    </div>`;
  }
  
  html += '</div>';
  
  return html;
}

// Render impact assessment for a modification
function renderImpactAssessment(mod) {
  let impact = '';
  
  switch (mod.type) {
    case 'addCategory':
      impact = `<span class="impact-low">Low impact:</span> Adds new category "${mod.data.category}" to your categories list.`;
      break;
    case 'removeCategory':
      impact = `<span class="impact-medium">Medium impact:</span> Removes category "${mod.data.category}". Emails in this category may become uncategorized.`;
      break;
    case 'updateGuideline':
      impact = `<span class="impact-low">Low impact:</span> Updates classification guideline for "${mod.data.category}" category.`;
      break;
    case 'updateSummary':
      impact = `<span class="impact-low">Low impact:</span> Updates summary description for "${mod.data.category}" category.`;
      break;
    case 'addNote':
      impact = `<span class="impact-low">Low impact:</span> Adds a new note to your notes collection.`;
      break;
    case 'updateEmailCategory':
      impact = `<span class="impact-medium">Medium impact:</span> Changes email "${mod.data.emailId}" to category "${mod.data.newCategory}".`;
      break;
    default:
      impact = `<span class="impact-unknown">Unknown impact:</span> Please review the modification details carefully.`;
  }
  
  return `<div class="impact-info">${impact}</div>`;
}

// Get icon for change type
function getChangeTypeIcon(type) {
  const icons = {
    'addCategory': '➕',
    'removeCategory': '🗑️', 
    'updateGuideline': '📝',
    'updateSummary': '📄',
    'addNote': '📓',
    'updateEmailCategory': '🔄'
  };
  return icons[type] || '⚙️';
}

// Close modification details
function closeModificationDetails() {
  previewSection.style.display = 'none';
  
  // Hide close button
  const closeBtn = previewSection.querySelector('.close-details-btn');
  if (closeBtn) {
    closeBtn.style.display = 'none';
  }
  
  // Restore file tabs visibility and download button
  const fileTabsEl = previewSection.querySelector('.file-tabs');
  fileTabsEl.style.display = 'flex';
  downloadBtn.style.display = 'inline-flex';
  copyFileBtn.style.display = 'inline-flex';
  
  // Reset preview header
  const previewHeader = previewSection.querySelector('.preview-header h2');
  previewHeader.textContent = '📁 Generated Files';
}

// Execute confirmed modifications
async function executeConfirmedModifications(modifications, modal) {
  // Show loading state on approve button
  const approveBtn = modal.querySelector('.approve-btn');
  const originalText = approveBtn.innerHTML;
  approveBtn.innerHTML = '<span class="spinner"></span> Executing...';
  approveBtn.disabled = true;
  
  try {
    const response = await fetch('/api/email-chat-confirm', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ modifications })
    });
    
    const data = await response.json();
    
    if (data.success) {
      // Close modal
      closeConfirmationModal(modal);
      
      // Show success message
      const successCount = data.summary?.successCount || 0;
      const errorCount = data.summary?.errorCount || 0;
      
      let message = `✅ Executed ${successCount} modification${successCount !== 1 ? 's' : ''}`;
      if (errorCount > 0) {
        message += `, ${errorCount} failed`;
      }
      
      addMessage('assistant', message);
      showToast(`${successCount} changes applied successfully!`, 'success');
      
      // Log detailed results
      console.log('Modification results:', data.results);
      
    } else {
      throw new Error(data.error || 'Failed to execute modifications');
    }
  } catch (error) {
    console.error('Error executing modifications:', error);
    
    // Restore button state
    approveBtn.innerHTML = originalText;
    approveBtn.disabled = false;
    
    // Show error
    addMessage('assistant', `❌ **Error executing changes:** ${error.message}`);
    showToast('Failed to execute changes', 'error');
  }
}

// Close confirmation modal
function closeConfirmationModal(modal) {
  modal.classList.remove('show');
  setTimeout(() => {
    modal.remove();
  }, 300);
}

// =====================================================
// EMAIL LIST DISPLAY SYSTEM
// =====================================================

// Parse email list from AI response
function parseEmailListFromResponse(responseContent) {
  try {
    // Look for JSON blocks with emailList
    const jsonRegex = /```json\s*(\{[\s\S]*?\})\s*```/g;
    let match;
    
    while ((match = jsonRegex.exec(responseContent)) !== null) {
      try {
        const parsed = JSON.parse(match[1]);
        if (parsed.emailList && parsed.emailList.emails) {
          return parsed.emailList;
        }
      } catch (parseError) {
        console.error('Failed to parse email list JSON:', parseError);
      }
    }
  } catch (error) {
    console.error('Error parsing email list:', error);
  }
  return null;
}

// Store currently displayed email list
let currentEmailList = null;
let selectedEmailIndex = null;

// Show email list in the preview panel
function showEmailListInPreview(emailList) {
  currentEmailList = emailList;
  selectedEmailIndex = null;
  
  // Show the preview section
  previewSection.style.display = 'flex';
  
  // Update header
  const previewHeader = previewSection.querySelector('.preview-header h2');
  previewHeader.textContent = `📧 ${emailList.title || 'Email List'}`;
  
  // Hide download button, add close button
  downloadBtn.style.display = 'none';
  
  // Add close button if not already present
  let closeBtn = previewSection.querySelector('.close-email-list-btn');
  if (!closeBtn) {
    closeBtn = document.createElement('button');
    closeBtn.className = 'close-email-list-btn';
    closeBtn.innerHTML = '✕ Close';
    closeBtn.addEventListener('click', closeEmailList);
    previewSection.querySelector('.preview-actions').appendChild(closeBtn);
  }
  closeBtn.style.display = 'inline-flex';
  
  // Update badge to show email count
  featureIdBadge.textContent = `${emailList.count || emailList.emails?.length || 0} emails`;
  
  // Hide file tabs
  const fileTabsEl = previewSection.querySelector('.file-tabs');
  fileTabsEl.style.display = 'none';
  
  // Update file content header
  currentFileNameEl.textContent = 'Click an email to view thread';
  copyFileBtn.style.display = 'none';
  
  // Render the email list
  const listContainer = document.createElement('div');
  listContainer.className = 'email-list-preview';
  listContainer.innerHTML = renderEmailListHTML(emailList);
  
  // Clear and add to file content
  fileContent.innerHTML = '';
  fileContent.appendChild(listContainer);
  
  // Add click handlers
  setTimeout(() => addEmailListClickHandlers(listContainer), 0);
}

// Render email list as HTML
function renderEmailListHTML(emailList) {
  let html = '<div class="email-list-container">';
  
  // List header
  html += `<div class="email-list-header">
    <span class="email-list-count">${emailList.count || emailList.emails?.length || 0} emails</span>
    <span class="email-list-hint">Click to view full thread</span>
  </div>`;
  
  // Email items
  html += '<div class="email-items">';
  
  if (emailList.emails && emailList.emails.length > 0) {
    for (let i = 0; i < emailList.emails.length; i++) {
      const email = emailList.emails[i];
      const fromName = email.from?.split('<')[0]?.trim() || email.from || 'Unknown';
      const date = formatEmailDate(email.date);
      const messageCount = email.messageCount || email.messages?.length || 1;
      
      html += `<div class="email-item" data-index="${i}">
        <div class="email-item-main">
          <div class="email-item-from">${escapeHtml(fromName)}</div>
          <div class="email-item-subject">${escapeHtml(email.subject || 'No Subject')}</div>
          <div class="email-item-snippet">${escapeHtml(email.snippet || '').substring(0, 100)}...</div>
        </div>
        <div class="email-item-meta">
          <span class="email-item-date">${date}</span>
          <span class="email-item-category">${escapeHtml(email.category || '')}</span>
          ${messageCount > 1 ? `<span class="email-item-count">${messageCount} msgs</span>` : ''}
        </div>
      </div>`;
    }
  } else {
    html += '<div class="email-list-empty">No emails found</div>';
  }
  
  html += '</div>';
  
  // Thread detail panel (initially hidden)
  html += '<div class="email-thread-detail" id="email-thread-detail" style="display: none;"></div>';
  
  html += '</div>';
  return html;
}

// Format email date for display
function formatEmailDate(dateStr) {
  if (!dateStr) return '';
  try {
    const date = new Date(dateStr);
    const now = new Date();
    const diffDays = Math.floor((now - date) / (1000 * 60 * 60 * 24));
    
    if (diffDays === 0) {
      return date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
    } else if (diffDays === 1) {
      return 'Yesterday';
    } else if (diffDays < 7) {
      return date.toLocaleDateString([], { weekday: 'short' });
    } else {
      return date.toLocaleDateString([], { month: 'short', day: 'numeric' });
    }
  } catch (e) {
    return dateStr.substring(0, 10);
  }
}

// Add click handlers for email list items
function addEmailListClickHandlers(container) {
  const emailItems = container.querySelectorAll('.email-item');
  console.log('📧 Adding click handlers to', emailItems.length, 'email items');
  
  emailItems.forEach((item, idx) => {
    // Remove any existing click handlers first
    const newItem = item.cloneNode(true);
    item.parentNode.replaceChild(newItem, item);
    
    newItem.addEventListener('click', function(e) {
      e.preventDefault();
      e.stopPropagation();
      const index = parseInt(this.dataset.index);
      console.log('📧 Email clicked, index:', index);
      selectEmailThread(index, container);
    });
  });
}

// Select and display email thread
function selectEmailThread(index, container) {
  if (!currentEmailList || !currentEmailList.emails[index]) return;
  
  selectedEmailIndex = index;
  const email = currentEmailList.emails[index];
  
  // Update selected state
  container.querySelectorAll('.email-item').forEach((item, i) => {
    item.classList.toggle('selected', i === index);
  });
  
  // Show thread detail
  const detailPanel = container.querySelector('#email-thread-detail');
  detailPanel.style.display = 'block';
  detailPanel.innerHTML = renderEmailThreadHTML(email, container);
  
  // Update header
  currentFileNameEl.textContent = email.subject || 'Email Thread';
  
  // Add close button handler
  const closeBtn = detailPanel.querySelector('.thread-close-btn');
  if (closeBtn) {
    closeBtn.addEventListener('click', (e) => {
      e.stopPropagation();
      closeThreadDetail(container);
    });
  }
}

// Close thread detail panel
function closeThreadDetail(container) {
  const detailPanel = container.querySelector('#email-thread-detail');
  if (detailPanel) {
    detailPanel.style.display = 'none';
    detailPanel.innerHTML = '';
  }
  
  // Deselect all emails
  container.querySelectorAll('.email-item').forEach((item) => {
    item.classList.remove('selected');
  });
  
  selectedEmailIndex = null;
  currentFileNameEl.textContent = 'Click an email to view thread';
}

// Render full email thread
function renderEmailThreadHTML(email, container) {
  let html = '<div class="thread-container">';
  
  // Thread header with close button
  html += `<div class="thread-header">
    <div class="thread-header-top">
      <div class="thread-subject">${escapeHtml(email.subject || 'No Subject')}</div>
      <button class="thread-close-btn" title="Close thread">✕</button>
    </div>
    <div class="thread-meta">
      <span class="thread-from">From: ${escapeHtml(email.from || 'Unknown')}</span>
      <span class="thread-date">${email.date || ''}</span>
    </div>
    ${email.category ? `<span class="thread-category">${escapeHtml(email.category)}</span>` : ''}
  </div>`;
  
  // Messages
  html += '<div class="thread-messages">';
  
  if (email.messages && email.messages.length > 0) {
    for (let i = 0; i < email.messages.length; i++) {
      const msg = email.messages[i];
      const bodyContent = msg.body || msg.content || msg.snippet || 'No content';
      html += `<div class="thread-message">
        <div class="message-header">
          <span class="message-from">${escapeHtml(msg.from || email.from || 'Unknown')}</span>
          <span class="message-to">to ${escapeHtml(msg.to || 'Unknown')}</span>
          <span class="message-date">${msg.date || ''}</span>
        </div>
        <div class="message-body">${escapeHtml(bodyContent)}</div>
      </div>`;
    }
  } else {
    // Single email without thread - show all available content
    const bodyContent = email.body || email.snippet || email.content || 'No content available. The AI did not include the full email content in its response.';
    html += `<div class="thread-message">
      <div class="message-header">
        <span class="message-from">${escapeHtml(email.from || 'Unknown')}</span>
        <span class="message-date">${email.date || ''}</span>
      </div>
      <div class="message-body">${escapeHtml(bodyContent)}</div>
    </div>`;
  }
  
  html += '</div></div>';
  return html;
}

// Close email list panel
function closeEmailList() {
  previewSection.style.display = 'none';
  currentEmailList = null;
  selectedEmailIndex = null;
  
  // Hide close button
  const closeBtn = previewSection.querySelector('.close-email-list-btn');
  if (closeBtn) {
    closeBtn.style.display = 'none';
  }
  
  // Restore file tabs visibility and download button
  const fileTabsEl = previewSection.querySelector('.file-tabs');
  fileTabsEl.style.display = 'flex';
  downloadBtn.style.display = 'inline-flex';
  copyFileBtn.style.display = 'inline-flex';
  
  // Reset preview header
  const previewHeader = previewSection.querySelector('.preview-header h2');
  previewHeader.textContent = '📁 Generated Files';
}

// =====================================================
// CATEGORY SUGGESTION SYSTEM
// =====================================================

// Store pending category suggestions
let pendingCategorySuggestions = null;
let categoryEmailSelections = {}; // { categoryName: { emailId: boolean } }

// Show category suggestions in RHS with tabbed interface
function showCategorySuggestionsInPreview(suggestions, operationsLog) {
  pendingCategorySuggestions = suggestions;
  categoryEmailSelections = {};
  
  // Initialize all emails as selected by default
  for (const cat of suggestions.categories) {
    categoryEmailSelections[cat.name] = {};
    if (cat.suggestedEmails) {
      for (const email of cat.suggestedEmails) {
        categoryEmailSelections[cat.name][email.id] = true;
      }
    }
  }
  
  // Show the preview section
  previewSection.style.display = 'flex';
  
  // Update header
  const previewHeader = previewSection.querySelector('.preview-header h2');
  previewHeader.textContent = '📂 Category Suggestions';
  
  // Hide download button
  downloadBtn.style.display = 'none';
  
  // Add close button if not already present
  let closeBtn = previewSection.querySelector('.close-category-suggestions-btn');
  if (!closeBtn) {
    closeBtn = document.createElement('button');
    closeBtn.className = 'close-category-suggestions-btn';
    closeBtn.innerHTML = '✕ Close';
    closeBtn.addEventListener('click', closeCategorySuggestions);
    previewSection.querySelector('.preview-actions').appendChild(closeBtn);
  }
  closeBtn.style.display = 'inline-flex';
  
  // Update badge
  const totalEmails = suggestions.categories.reduce((sum, cat) => sum + (cat.suggestedEmails?.length || 0), 0);
  featureIdBadge.textContent = `${suggestions.categories.length} categories, ${totalEmails} emails`;
  
  // Hide file tabs
  const fileTabsEl = previewSection.querySelector('.file-tabs');
  fileTabsEl.style.display = 'none';
  
  // Update file content header
  currentFileNameEl.textContent = 'Select emails to move';
  copyFileBtn.style.display = 'none';
  
  // Render the category suggestions UI
  const suggestionsContainer = document.createElement('div');
  suggestionsContainer.className = 'category-suggestions-preview';
  suggestionsContainer.innerHTML = renderCategorySuggestionsHTML(suggestions);
  
  // Clear and add to file content
  fileContent.innerHTML = '';
  fileContent.appendChild(suggestionsContainer);
  
  // Add event handlers
  setTimeout(() => addCategorySuggestionsHandlers(suggestionsContainer), 0);
}

// Render category suggestions as tabbed HTML
function renderCategorySuggestionsHTML(suggestions) {
  const categories = suggestions.categories;
  
  let html = '<div class="category-suggestions-container">';
  
  // Category tabs
  html += '<div class="category-tabs">';
  for (let i = 0; i < categories.length; i++) {
    const cat = categories[i];
    const emailCount = cat.suggestedEmails?.length || 0;
    html += `<button class="category-tab ${i === 0 ? 'active' : ''}" data-category="${escapeHtml(cat.name)}" data-index="${i}">
      ${escapeHtml(cat.name)} <span class="tab-count">${emailCount}</span>
    </button>`;
  }
  html += '</div>';
  
  // Category content panels
  html += '<div class="category-panels">';
  for (let i = 0; i < categories.length; i++) {
    const cat = categories[i];
    html += `<div class="category-panel ${i === 0 ? 'active' : ''}" data-category="${escapeHtml(cat.name)}" data-index="${i}">
      <div class="category-info">
        <div class="category-description">${escapeHtml(cat.description || '')}</div>
        ${cat.guideline ? `<div class="category-guideline"><strong>Guideline:</strong> ${escapeHtml(cat.guideline)}</div>` : ''}
      </div>
      <div class="select-all-row">
        <label class="checkbox-label">
          <input type="checkbox" class="select-all-checkbox" data-category="${escapeHtml(cat.name)}" checked>
          <span>Select All</span>
        </label>
        <span class="selected-count" data-category="${escapeHtml(cat.name)}">${cat.suggestedEmails?.length || 0} selected</span>
      </div>
      <div class="suggested-emails">
        ${renderSuggestedEmailsHTML(cat)}
      </div>
    </div>`;
  }
  html += '</div>';
  
  // Thread detail panel
  html += '<div class="suggestion-thread-detail" id="suggestion-thread-detail" style="display: none;"></div>';
  
  html += '</div>';
  return html;
}

// Render suggested emails for a category
function renderSuggestedEmailsHTML(category) {
  if (!category.suggestedEmails || category.suggestedEmails.length === 0) {
    return '<div class="no-emails">No emails suggested for this category</div>';
  }
  
  let html = '';
  for (const email of category.suggestedEmails) {
    const fromName = email.from?.split('<')[0]?.trim() || email.from || 'Unknown';
    const date = formatEmailDate(email.date);
    
    html += `<div class="suggested-email-item" data-email-id="${email.id}" data-category="${escapeHtml(category.name)}">
      <div class="email-checkbox">
        <input type="checkbox" class="email-select-checkbox" data-email-id="${email.id}" data-category="${escapeHtml(category.name)}" checked>
      </div>
      <div class="email-main" data-email-id="${email.id}">
        <div class="email-from">${escapeHtml(fromName)}</div>
        <div class="email-subject">${escapeHtml(email.subject || 'No Subject')}</div>
        <div class="email-snippet">${escapeHtml(email.snippet || '').substring(0, 80)}...</div>
        ${email.reason ? `<div class="email-reason">💡 ${escapeHtml(email.reason)}</div>` : ''}
      </div>
      <div class="email-date">${date}</div>
    </div>`;
  }
  return html;
}

// Add event handlers for category suggestions
function addCategorySuggestionsHandlers(container) {
  // Tab switching
  const tabs = container.querySelectorAll('.category-tab');
  const panels = container.querySelectorAll('.category-panel');
  
  tabs.forEach(tab => {
    tab.addEventListener('click', () => {
      const index = tab.dataset.index;
      tabs.forEach(t => t.classList.remove('active'));
      panels.forEach(p => p.classList.remove('active'));
      tab.classList.add('active');
      container.querySelector(`.category-panel[data-index="${index}"]`).classList.add('active');
    });
  });
  
  // Individual checkbox handlers
  const emailCheckboxes = container.querySelectorAll('.email-select-checkbox');
  emailCheckboxes.forEach(checkbox => {
    checkbox.addEventListener('change', () => {
      const emailId = checkbox.dataset.emailId;
      const categoryName = checkbox.dataset.category;
      categoryEmailSelections[categoryName][emailId] = checkbox.checked;
      updateSelectedCount(container, categoryName);
    });
  });
  
  // Select all handlers
  const selectAllCheckboxes = container.querySelectorAll('.select-all-checkbox');
  selectAllCheckboxes.forEach(selectAll => {
    selectAll.addEventListener('change', () => {
      const categoryName = selectAll.dataset.category;
      const panel = container.querySelector(`.category-panel[data-category="${categoryName}"]`);
      const checkboxes = panel.querySelectorAll('.email-select-checkbox');
      checkboxes.forEach(cb => {
        cb.checked = selectAll.checked;
        categoryEmailSelections[categoryName][cb.dataset.emailId] = selectAll.checked;
      });
      updateSelectedCount(container, categoryName);
    });
  });
  
  // Email click to view thread
  const emailMains = container.querySelectorAll('.email-main');
  emailMains.forEach(emailMain => {
    emailMain.addEventListener('click', (e) => {
      e.stopPropagation();
      const emailId = emailMain.dataset.emailId;
      showSuggestedEmailThread(container, emailId);
    });
  });
}

// Update selected count display
function updateSelectedCount(container, categoryName) {
  const selections = categoryEmailSelections[categoryName];
  const selectedCount = Object.values(selections).filter(v => v).length;
  const countEl = container.querySelector(`.selected-count[data-category="${categoryName}"]`);
  if (countEl) {
    countEl.textContent = `${selectedCount} selected`;
  }
}

// Show suggested email thread detail
function showSuggestedEmailThread(container, emailId) {
  // Find the email in suggestions
  let email = null;
  for (const cat of pendingCategorySuggestions.categories) {
    if (cat.suggestedEmails) {
      email = cat.suggestedEmails.find(e => e.id === emailId);
      if (email) break;
    }
  }
  
  if (!email) return;
  
  const detailPanel = container.querySelector('#suggestion-thread-detail');
  detailPanel.style.display = 'block';
  detailPanel.innerHTML = `
    <div class="thread-container">
      <div class="thread-header">
        <div class="thread-header-top">
          <div class="thread-subject">${escapeHtml(email.subject || 'No Subject')}</div>
          <button class="thread-close-btn" title="Close thread">✕</button>
        </div>
        <div class="thread-meta">
          <span class="thread-from">From: ${escapeHtml(email.from || 'Unknown')}</span>
          <span class="thread-date">${email.date || ''}</span>
        </div>
      </div>
      <div class="thread-messages">
        <div class="thread-message">
          <div class="message-body">${escapeHtml(email.snippet || email.body || 'No content available')}</div>
        </div>
        ${email.reason ? `<div class="suggestion-reason"><strong>Why this email fits:</strong> ${escapeHtml(email.reason)}</div>` : ''}
      </div>
    </div>
  `;
  
  // Add close handler
  detailPanel.querySelector('.thread-close-btn').addEventListener('click', () => {
    detailPanel.style.display = 'none';
  });
}

// Close category suggestions panel
function closeCategorySuggestions() {
  previewSection.style.display = 'none';
  pendingCategorySuggestions = null;
  categoryEmailSelections = {};
  
  // Hide close button
  const closeBtn = previewSection.querySelector('.close-category-suggestions-btn');
  if (closeBtn) {
    closeBtn.style.display = 'none';
  }
  
  // Restore file tabs visibility and download button
  const fileTabsEl = previewSection.querySelector('.file-tabs');
  fileTabsEl.style.display = 'flex';
  downloadBtn.style.display = 'inline-flex';
  copyFileBtn.style.display = 'inline-flex';
  
  // Reset preview header
  const previewHeader = previewSection.querySelector('.preview-header h2');
  previewHeader.textContent = '📁 Generated Files';
}

// Show category suggestion confirmation in chat
function showCategorySuggestionConfirmation(aiResponse, suggestions, operationsLog) {
  pendingCategorySuggestions = suggestions;
  
  // Add AI response first
  addMessage('assistant', aiResponse, true, operationsLog);
  
  // Show category suggestions in RHS
  showCategorySuggestionsInPreview(suggestions, operationsLog);
  
  // Add confirmation message in chat
  addCategorySuggestionConfirmationMessage(suggestions);
}

// Add category suggestion confirmation message
function addCategorySuggestionConfirmationMessage(suggestions) {
  const messageDiv = document.createElement('div');
  messageDiv.className = 'message assistant-message confirmation-message category-suggestion-confirmation';
  messageDiv.id = 'pending-category-confirmation';
  
  const avatar = document.createElement('div');
  avatar.className = 'message-avatar';
  avatar.textContent = '📂';
  
  const contentDiv = document.createElement('div');
  contentDiv.className = 'message-content confirmation-content';
  
  const totalEmails = suggestions.categories.reduce((sum, cat) => sum + (cat.suggestedEmails?.length || 0), 0);
  
  contentDiv.innerHTML = `
    <div class="confirmation-text">
      <strong>Create New Categories</strong><br>
      I want to create <strong>${suggestions.categories.length} new categories</strong> and move <strong>${totalEmails} emails</strong>:
      <ul class="inline-changes-list">
        ${suggestions.categories.map(cat => `<li>📂 ${escapeHtml(cat.name)} (${cat.suggestedEmails?.length || 0} emails)</li>`).join('')}
      </ul>
      <p class="confirmation-hint">Select/deselect emails in the preview panel, then approve →</p>
    </div>
    <div class="confirmation-buttons">
      <button class="btn-secondary cancel-btn">✕ Cancel</button>
      <button class="btn-primary approve-btn">✓ Create & Move</button>
    </div>
  `;
  
  // Add button handlers
  contentDiv.querySelector('.cancel-btn').addEventListener('click', handleCancelCategorySuggestions);
  contentDiv.querySelector('.approve-btn').addEventListener('click', handleApproveCategorySuggestions);
  
  messageDiv.appendChild(avatar);
  messageDiv.appendChild(contentDiv);
  chatMessages.appendChild(messageDiv);
  scrollToBottom();
}

// Handle approve category suggestions
async function handleApproveCategorySuggestions() {
  if (!pendingCategorySuggestions) return;
  
  const confirmationMsg = document.getElementById('pending-category-confirmation');
  const approveBtn = confirmationMsg?.querySelector('.approve-btn');
  const cancelBtn = confirmationMsg?.querySelector('.cancel-btn');
  
  // Build the final suggestions with selected emails only
  const finalSuggestions = {
    ...pendingCategorySuggestions,
    categories: pendingCategorySuggestions.categories.map(cat => ({
      ...cat,
      selectedEmails: Object.entries(categoryEmailSelections[cat.name] || {})
        .filter(([id, selected]) => selected)
        .map(([id]) => id)
    }))
  };
  
  // Show loading state
  if (approveBtn) {
    approveBtn.innerHTML = '<span class="spinner"></span> Creating...';
    approveBtn.disabled = true;
  }
  if (cancelBtn) cancelBtn.disabled = true;
  
  try {
    const response = await fetch('/api/email-chat-category-suggestions', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        categorySuggestions: finalSuggestions,
        userEmail: selectedUserDropdown?.value
      })
    });
    
    const data = await response.json();
    
    if (data.success) {
      // Update confirmation to show success
      if (confirmationMsg) {
        const contentDiv = confirmationMsg.querySelector('.confirmation-content');
        contentDiv.innerHTML = `
          <div class="confirmation-result success">
            ✅ <strong>Categories Created!</strong><br>
            Created ${data.summary.categoriesCreated} categories, moved ${data.summary.emailsMoved} emails.
          </div>
        `;
        confirmationMsg.querySelector('.message-avatar').textContent = '✅';
      }
      
      showToast(`Created ${data.summary.categoriesCreated} categories!`, 'success');
      closeCategorySuggestions();
    } else {
      throw new Error(data.error || 'Failed to create categories');
    }
  } catch (error) {
    console.error('Error creating categories:', error);
    
    if (confirmationMsg) {
      const contentDiv = confirmationMsg.querySelector('.confirmation-content');
      contentDiv.innerHTML = `
        <div class="confirmation-result error">
          ❌ <strong>Error:</strong> ${error.message}
        </div>
      `;
      confirmationMsg.querySelector('.message-avatar').textContent = '❌';
    }
    
    showToast('Failed to create categories', 'error');
    closeCategorySuggestions();
  }
  
  pendingCategorySuggestions = null;
  categoryEmailSelections = {};
}

// Handle cancel category suggestions
function handleCancelCategorySuggestions() {
  const confirmationMsg = document.getElementById('pending-category-confirmation');
  
  if (confirmationMsg) {
    const contentDiv = confirmationMsg.querySelector('.confirmation-content');
    contentDiv.innerHTML = `
      <div class="confirmation-result cancelled">
        🚫 <strong>Cancelled</strong><br>
        No categories were created.
      </div>
    `;
    confirmationMsg.querySelector('.message-avatar').textContent = '🚫';
  }
  
  closeCategorySuggestions();
  pendingCategorySuggestions = null;
  categoryEmailSelections = {};
  
  showToast('Category creation cancelled', 'warning');
}

// =====================================================
// RHS CATEGORY SUGGESTION PANEL SYSTEM
// =====================================================

// State for RHS panel
let rhsCategorySuggestions = null;
let rhsEmailSelections = {}; // { categoryName: { emailId: boolean } }

// DOM Elements for RHS panel (will be initialized after DOM loads)
let rhsPanel, rhsCloseBtn, rhsCategoryTabs, rhsCategoryPanels;
let rhsThreadViewer, rhsThreadCloseBtn, rhsCancelBtn, rhsApproveBtn;
let rhsPanelInfo, selectedEmailCount;

// Initialize RHS panel elements after DOM loads
function initRHSElements() {
  rhsPanel = document.getElementById('rhsCategorySuggestionPanel');
  rhsCloseBtn = document.getElementById('rhsCloseBtn');
  rhsCategoryTabs = document.getElementById('rhsCategoryTabs');
  rhsCategoryPanels = document.getElementById('rhsCategoryPanels');
  rhsThreadViewer = document.getElementById('rhsThreadViewer');
  rhsThreadCloseBtn = document.getElementById('rhsThreadCloseBtn');
  rhsCancelBtn = document.getElementById('rhsCancelBtn');
  rhsApproveBtn = document.getElementById('rhsApproveBtn');
  rhsPanelInfo = document.getElementById('rhsPanelInfo');
  selectedEmailCount = document.getElementById('selectedEmailCount');
}

// Setup RHS panel event listeners
function setupRHSEventListeners() {
  // Close panel
  rhsCloseBtn.addEventListener('click', closeRHSPanel);
  rhsThreadCloseBtn.addEventListener('click', closeRHSThreadViewer);
  
  // Action buttons
  rhsCancelBtn.addEventListener('click', handleRHSCancel);
  rhsApproveBtn.addEventListener('click', handleRHSApprove);
}

// Add button to trigger category suggestions
function addCategorySuggestionTrigger() {
  const chatSection = document.querySelector('.chat-section');
  
  // Check if we're in chat mode and have a user selected
  if (currentMode !== 'chat') return;
  
  // Add "Suggest Categories" button below user selector
  let triggerBtn = document.getElementById('categorySuggestionTriggerBtn');
  if (!triggerBtn) {
    triggerBtn = document.createElement('button');
    triggerBtn.id = 'categorySuggestionTriggerBtn';
    triggerBtn.className = 'btn btn-secondary category-suggestion-trigger';
    triggerBtn.innerHTML = '<span>📂</span> Suggest Categories for "Other" Emails';
    triggerBtn.addEventListener('click', triggerCategorySuggestions);
    
    // Insert after user selector
    const userSelector = document.getElementById('userSelector');
    userSelector.parentNode.insertBefore(triggerBtn, userSelector.nextSibling);
  }
  
  // Show/hide based on mode
  triggerBtn.style.display = currentMode === 'chat' ? 'block' : 'none';
}

// Define available users (should match server)
const AVAILABLE_USERS = ['ks4190@columbia.edu', 'lc3251@columbia.edu'];

// Trigger category suggestions
async function triggerCategorySuggestions() {
  if (isGenerating) return;
  
  const selectedUser = selectedUserDropdown ? selectedUserDropdown.value : AVAILABLE_USERS[0];
  
  setGenerating(true);
  showToast('Analyzing "Other" emails...', 'info');
  
  try {
    const response = await fetch('/api/category-suggestions', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        userEmail: selectedUser
      })
    });
    
    const data = await response.json();
    
    if (data.success) {
      if (data.suggestions && data.suggestions.categories.length > 0) {
        console.log('📂 Category suggestions received:', data.suggestions);
        showRHSCategorySuggestionPanel(data.suggestions);
        showToast(`Found ${data.suggestions.categories.length} category suggestions`, 'success');
      } else {
        showToast('No "Other" emails found to categorize', 'info');
      }
    } else {
      showToast(data.error || 'Failed to generate suggestions', 'error');
    }
  } catch (error) {
    console.error('Error getting category suggestions:', error);
    showToast('Failed to get category suggestions', 'error');
  } finally {
    setGenerating(false);
  }
}

// Show RHS category suggestion panel
function showRHSCategorySuggestionPanel(suggestions) {
  rhsCategorySuggestions = suggestions;
  rhsEmailSelections = {};
  
  // Initialize all emails as selected by default
  for (const cat of suggestions.categories) {
    rhsEmailSelections[cat.name] = {};
    if (cat.suggestedEmails) {
      for (const email of cat.suggestedEmails) {
        rhsEmailSelections[cat.name][email.id] = true;
      }
    }
  }
  
  // Update panel info
  const totalEmails = suggestions.categories.reduce((sum, cat) => sum + (cat.suggestedEmails?.length || 0), 0);
  rhsPanelInfo.textContent = `${suggestions.categories.length} categories, ${totalEmails} emails from "Other"`;
  
  // Generate tabs
  generateRHSTabs(suggestions.categories);
  
  // Generate panels
  generateRHSPanels(suggestions.categories);
  
  // Update selected count
  updateRHSSelectedCount();
  
  // Show panel with slide-in animation
  rhsPanel.style.display = 'block';
  setTimeout(() => rhsPanel.classList.add('show'), 10);
  
  // Activate first tab
  if (suggestions.categories.length > 0) {
    activateRHSTab(0);
  }
}

// Generate category tabs for RHS panel
function generateRHSTabs(categories) {
  rhsCategoryTabs.innerHTML = '';
  
  categories.forEach((cat, index) => {
    const tab = document.createElement('button');
    tab.className = `rhs-category-tab ${index === 0 ? 'active' : ''}`;
    tab.dataset.index = index;
    tab.dataset.category = cat.name;
    tab.innerHTML = `
      <span class="tab-name">${escapeHtml(cat.name)}</span>
      <span class="tab-count">${cat.suggestedEmails?.length || 0}</span>
    `;
    
    tab.addEventListener('click', () => activateRHSTab(index));
    rhsCategoryTabs.appendChild(tab);
  });
}

// Generate category panels for RHS panel
function generateRHSPanels(categories) {
  rhsCategoryPanels.innerHTML = '';
  
  categories.forEach((cat, index) => {
    const panel = document.createElement('div');
    panel.className = `rhs-category-panel ${index === 0 ? 'active' : ''}`;
    panel.dataset.index = index;
    panel.dataset.category = cat.name;
    
    panel.innerHTML = `
      <div class="rhs-category-info">
        <div class="rhs-category-description">${escapeHtml(cat.description || '')}</div>
        ${cat.guideline ? `<div class="rhs-category-guideline"><strong>Classification:</strong> ${escapeHtml(cat.guideline)}</div>` : ''}
      </div>
      
      <div class="rhs-select-all-row">
        <label class="rhs-checkbox-label">
          <input type="checkbox" class="rhs-select-all-checkbox" data-category="${escapeHtml(cat.name)}" checked>
          <span>Select All</span>
        </label>
        <span class="rhs-selected-count" data-category="${escapeHtml(cat.name)}">${cat.suggestedEmails?.length || 0} selected</span>
      </div>
      
      <div class="rhs-email-list">
        ${generateRHSEmailList(cat)}
      </div>
    `;
    
    rhsCategoryPanels.appendChild(panel);
  });
  
  // Add event listeners after panels are added
  setTimeout(() => setupRHSPanelEventListeners(), 0);
}

// Generate email list for RHS category panel
function generateRHSEmailList(category) {
  if (!category.suggestedEmails || category.suggestedEmails.length === 0) {
    return '<div class="rhs-no-emails">No emails suggested for this category</div>';
  }
  
  let html = '';
  for (const email of category.suggestedEmails) {
    const fromName = email.from?.split('<')[0]?.trim() || email.from || 'Unknown';
    const date = formatEmailDate(email.date);
    
    html += `
      <div class="rhs-email-item" data-email-id="${email.id}" data-category="${escapeHtml(category.name)}">
        <div class="rhs-email-checkbox">
          <input type="checkbox" 
                 class="rhs-email-select-checkbox" 
                 data-email-id="${email.id}" 
                 data-category="${escapeHtml(category.name)}" 
                 checked>
        </div>
        <div class="rhs-email-main" data-email-id="${email.id}">
          <div class="rhs-email-from">${escapeHtml(fromName)}</div>
          <div class="rhs-email-subject">${escapeHtml(email.subject || 'No Subject')}</div>
          <div class="rhs-email-snippet">${escapeHtml(email.snippet || '').substring(0, 80)}...</div>
          ${email.reason ? `<div class="rhs-email-reason">💡 ${escapeHtml(email.reason)}</div>` : ''}
        </div>
        <div class="rhs-email-date">${date}</div>
        <div class="rhs-email-expand" title="View full thread">👁️</div>
      </div>
    `;
  }
  return html;
}

// Setup event listeners for RHS panel elements
function setupRHSPanelEventListeners() {
  // Individual checkbox handlers
  const emailCheckboxes = rhsCategoryPanels.querySelectorAll('.rhs-email-select-checkbox');
  emailCheckboxes.forEach(checkbox => {
    checkbox.addEventListener('change', () => {
      const emailId = checkbox.dataset.emailId;
      const categoryName = checkbox.dataset.category;
      rhsEmailSelections[categoryName][emailId] = checkbox.checked;
      updateRHSCategorySelectedCount(categoryName);
      updateRHSSelectedCount();
    });
  });
  
  // Select all handlers
  const selectAllCheckboxes = rhsCategoryPanels.querySelectorAll('.rhs-select-all-checkbox');
  selectAllCheckboxes.forEach(selectAll => {
    selectAll.addEventListener('change', () => {
      const categoryName = selectAll.dataset.category;
      const panel = rhsCategoryPanels.querySelector(`.rhs-category-panel[data-category="${categoryName}"]`);
      const checkboxes = panel.querySelectorAll('.rhs-email-select-checkbox');
      
      checkboxes.forEach(cb => {
        cb.checked = selectAll.checked;
        rhsEmailSelections[categoryName][cb.dataset.emailId] = selectAll.checked;
      });
      
      updateRHSCategorySelectedCount(categoryName);
      updateRHSSelectedCount();
    });
  });
  
  // Email click to view thread
  const emailMains = rhsCategoryPanels.querySelectorAll('.rhs-email-main');
  emailMains.forEach(emailMain => {
    emailMain.addEventListener('click', (e) => {
      e.stopPropagation();
      const emailId = emailMain.dataset.emailId;
      showRHSEmailThread(emailId);
    });
  });
  
  // Email expand button
  const expandButtons = rhsCategoryPanels.querySelectorAll('.rhs-email-expand');
  expandButtons.forEach(expandBtn => {
    expandBtn.addEventListener('click', (e) => {
      e.stopPropagation();
      const emailItem = expandBtn.closest('.rhs-email-item');
      const emailId = emailItem.dataset.emailId;
      showRHSEmailThread(emailId);
    });
  });
}

// Activate RHS tab
function activateRHSTab(index) {
  // Update tab states
  const tabs = rhsCategoryTabs.querySelectorAll('.rhs-category-tab');
  const panels = rhsCategoryPanels.querySelectorAll('.rhs-category-panel');
  
  tabs.forEach((tab, i) => {
    tab.classList.toggle('active', i === index);
  });
  
  panels.forEach((panel, i) => {
    panel.classList.toggle('active', i === index);
  });
  
  // Hide thread viewer when switching tabs
  rhsThreadViewer.style.display = 'none';
}

// Update selected count for specific category
function updateRHSCategorySelectedCount(categoryName) {
  const selections = rhsEmailSelections[categoryName];
  const selectedCount = Object.values(selections).filter(v => v).length;
  const countEl = rhsCategoryPanels.querySelector(`.rhs-selected-count[data-category="${categoryName}"]`);
  if (countEl) {
    countEl.textContent = `${selectedCount} selected`;
  }
  
  // Update select all checkbox state
  const selectAllCheckbox = rhsCategoryPanels.querySelector(`.rhs-select-all-checkbox[data-category="${categoryName}"]`);
  if (selectAllCheckbox) {
    const totalEmails = Object.keys(selections).length;
    selectAllCheckbox.checked = selectedCount === totalEmails;
    selectAllCheckbox.indeterminate = selectedCount > 0 && selectedCount < totalEmails;
  }
}

// Update total selected count across all categories
function updateRHSSelectedCount() {
  let totalSelected = 0;
  for (const categorySelections of Object.values(rhsEmailSelections)) {
    totalSelected += Object.values(categorySelections).filter(v => v).length;
  }
  selectedEmailCount.textContent = totalSelected;
  
  // Update approve button state
  rhsApproveBtn.disabled = totalSelected === 0;
}

// Show email thread in RHS panel
function showRHSEmailThread(emailId) {
  // Find the email in suggestions
  let email = null;
  for (const cat of rhsCategorySuggestions.categories) {
    if (cat.suggestedEmails) {
      email = cat.suggestedEmails.find(e => e.id === emailId);
      if (email) break;
    }
  }
  
  if (!email) return;
  
  // Update thread viewer
  document.getElementById('rhsThreadSubject').textContent = email.subject || 'No Subject';
  document.getElementById('rhsThreadContent').innerHTML = `
    <div class="rhs-thread-detail">
      <div class="rhs-thread-meta">
        <div class="rhs-thread-from"><strong>From:</strong> ${escapeHtml(email.from || 'Unknown')}</div>
        <div class="rhs-thread-date"><strong>Date:</strong> ${email.date || 'Unknown'}</div>
        <div class="rhs-thread-current-category"><strong>Current Category:</strong> Other</div>
      </div>
      <div class="rhs-thread-content-body">
        <div class="rhs-thread-snippet">${escapeHtml(email.snippet || 'No content preview available')}</div>
        ${email.reason ? `<div class="rhs-thread-reason"><strong>Why it fits:</strong> ${escapeHtml(email.reason)}</div>` : ''}
      </div>
    </div>
  `;
  
  // Show thread viewer
  rhsThreadViewer.style.display = 'block';
}

// Close RHS thread viewer
function closeRHSThreadViewer() {
  rhsThreadViewer.style.display = 'none';
}

// Handle RHS cancel
function handleRHSCancel() {
  closeRHSPanel();
  showToast('Category suggestions cancelled', 'warning');
}

// Handle RHS approve
async function handleRHSApprove() {
  if (!rhsCategorySuggestions) return;
  
  // Build final suggestions with selected emails only
  const finalSuggestions = {
    action: 'createCategories',
    categories: rhsCategorySuggestions.categories.map(cat => ({
      ...cat,
      selectedEmails: Object.entries(rhsEmailSelections[cat.name] || {})
        .filter(([id, selected]) => selected)
        .map(([id]) => id)
    })).filter(cat => cat.selectedEmails.length > 0) // Only include categories with selected emails
  };
  
  if (finalSuggestions.categories.length === 0) {
    showToast('Please select at least one email', 'warning');
    return;
  }
  
  // Show loading state
  rhsApproveBtn.innerHTML = '<span class="spinner"></span> Creating...';
  rhsApproveBtn.disabled = true;
  rhsCancelBtn.disabled = true;
  
  try {
    const response = await fetch('/api/email-chat-category-suggestions', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        categorySuggestions: finalSuggestions,
        userEmail: selectedUserDropdown?.value
      })
    });
    
    const data = await response.json();
    
    if (data.success) {
      closeRHSPanel();
      showToast(`Created ${data.summary.categoriesCreated} categories, moved ${data.summary.emailsMoved} emails!`, 'success');
      
      // Add success message to chat
      addMessage('assistant', `✅ **Categories created successfully!**\n\nCreated ${data.summary.categoriesCreated} new categories and moved ${data.summary.emailsMoved} emails from "Other".`);
    } else {
      throw new Error(data.error || 'Failed to create categories');
    }
  } catch (error) {
    console.error('Error creating categories:', error);
    showToast('Failed to create categories: ' + error.message, 'error');
    
    // Restore button states
    rhsApproveBtn.innerHTML = '<span>✓</span> Create & Move (<span id="selectedEmailCount">0</span>)';
    rhsApproveBtn.disabled = false;
    rhsCancelBtn.disabled = false;
  }
}

// Close RHS panel
function closeRHSPanel() {
  rhsPanel.classList.remove('show');
  setTimeout(() => {
    rhsPanel.style.display = 'none';
    rhsCategorySuggestions = null;
    rhsEmailSelections = {};
  }, 300);
}

// Update the existing setMode function to show/hide category suggestion trigger
const originalSetMode = setMode;
setMode = function(mode) {
  originalSetMode(mode);
  
  // Add category suggestion trigger button in chat mode
  if (mode === 'chat') {
    setTimeout(() => addCategorySuggestionTrigger(), 100);
  } else {
    const triggerBtn = document.getElementById('categorySuggestionTriggerBtn');
    if (triggerBtn) {
      triggerBtn.style.display = 'none';
    }
  }
};

// Export for debugging
window.featureGenerator = {
  getSession: () => sessionId,
  getFiles: () => currentFiles,
  getFeatureId: () => currentFeatureId,
  getRHSSuggestions: () => rhsCategorySuggestions,
  getRHSSelections: () => rhsEmailSelections
};
