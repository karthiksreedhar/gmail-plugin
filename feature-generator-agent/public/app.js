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
      // Add assistant response (with operations log for chat mode)
      const operationsLog = (currentMode === 'chat') ? data.operationsLog : null;
      addMessage('assistant', data.response, true, operationsLog);
      
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

// Export for debugging
window.featureGenerator = {
  getSession: () => sessionId,
  getFiles: () => currentFiles,
  getFeatureId: () => currentFeatureId
};
