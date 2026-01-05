/**
 * Feature Generator Agent - Frontend Application
 */

// State
let sessionId = localStorage.getItem('featureGeneratorSessionId');
let currentFiles = {};
let currentFeatureId = null;
let currentFileName = 'manifest.json';
let updatedFiles = [];
let isGenerating = false;

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

// Initialize
document.addEventListener('DOMContentLoaded', () => {
  initializeSession();
  setupEventListeners();
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
    const response = await fetch('/api/chat', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ sessionId, message })
    });
    
    const data = await response.json();
    
    // Remove loading message
    loadingMsg.remove();
    
    if (data.success) {
      // Update state
      currentFiles = data.files;
      currentFeatureId = data.featureId;
      updatedFiles = data.updatedFiles || [];
      
      // Add assistant response
      addMessage('assistant', data.response);
      
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
  
  if (currentFiles && Object.keys(currentFiles).length > 0) {
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
  
  // Reset UI
  chatMessages.innerHTML = '';
  addMessage('assistant', `Welcome! I can generate Gmail Plugin features for you.

**Describe your feature idea** and I'll create the necessary files:
- \`manifest.json\` - Feature metadata
- \`backend.js\` - Server-side routes and logic
- \`frontend.js\` - UI components and interactions
- \`README.md\` - Documentation

After testing, come back and tell me about any issues - I'll help fix them!`);
  
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

// Add message to chat
function addMessage(role, content, scroll = true) {
  const messageDiv = document.createElement('div');
  messageDiv.className = `message ${role}-message`;
  
  const avatar = document.createElement('div');
  avatar.className = 'message-avatar';
  avatar.textContent = role === 'user' ? '👤' : '🤖';
  
  const contentDiv = document.createElement('div');
  contentDiv.className = 'message-content';
  contentDiv.innerHTML = formatMarkdown(content);
  
  messageDiv.appendChild(avatar);
  messageDiv.appendChild(contentDiv);
  
  chatMessages.appendChild(messageDiv);
  
  if (scroll) {
    scrollToBottom();
  }
  
  return messageDiv;
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
  contentDiv.innerHTML = `
    <span>Generating files</span>
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
