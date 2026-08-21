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
let currentDraftSaved = false;
let currentPrRequested = false;
// Gates the pipeline buttons on a chat-confirmed workflow completion:
//   'idle'          -> Create PR clickable (nothing running)
//   'pr_running'    -> both locked until the watcher posts ✅/❌ in the chat
//   'pr_confirmed'  -> Approve clickable; Create PR stays locked (PR is open)
//   'merge_running' -> both locked until the watcher posts ✅/❌ in the chat
//   'merge_done'    -> both locked (feature merged/deployed)
let workflowGate = 'idle';

function setWorkflowGate(next) {
  workflowGate = next;
  updateCreatePrButton();
}
let availableExistingFeatures = [];
let existingFeaturesLoaded = false;
const URL_PARAMS = new URLSearchParams(window.location.search);
const URL_USER_EMAIL = String(URL_PARAMS.get('userEmail') || '').trim().toLowerCase();
// Signed identity from the Gmail app; sent with every chat call so the server
// can verify WHO is acting. Without a valid signature the server refuses.
const URL_IDENTITY_EXP = String(URL_PARAMS.get('identityExp') || '').trim();
const URL_IDENTITY_SIG = String(URL_PARAMS.get('identitySig') || '').trim();

// DOM Elements
const chatMessages = document.getElementById('chatMessages');
const messageInput = document.getElementById('messageInput');
const sendBtn = document.getElementById('sendBtn');
const newSessionBtn = document.getElementById('newSessionBtn');
const previewSection = document.getElementById('previewSection');
const featureIdBadge = document.getElementById('featureIdBadge');
const downloadBtn = document.getElementById('downloadBtn');
const createPrBtn = document.getElementById('createPrBtn');
const approveDeployBtn = document.getElementById('approveDeployBtn');
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
const existingFeatureSelector = document.getElementById('existingFeatureSelector');
const existingFeatureDropdown = document.getElementById('existingFeatureDropdown');
const loadExistingFeatureBtn = document.getElementById('loadExistingFeatureBtn');

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

function getActorUserEmail() {
  // Identity comes ONLY from the signed handoff in the URL. The dropdown that
  // used to let anyone act as any user is gone.
  return URL_USER_EMAIL;
}

function attachIdentity(requestBody) {
  if (URL_USER_EMAIL) requestBody.userEmail = URL_USER_EMAIL;
  if (URL_IDENTITY_EXP) requestBody.identityExp = URL_IDENTITY_EXP;
  if (URL_IDENTITY_SIG) requestBody.identitySig = URL_IDENTITY_SIG;
  return requestBody;
}

// Initialize
document.addEventListener('DOMContentLoaded', () => {
  // Opened without a signed identity (stale tab, bookmark): warn up front
  // instead of letting the first generation attempt fail confusingly. A
  // previously verified session may still work, so this is a hint, not a wall.
  if (!URL_IDENTITY_SIG && chatMessages) {
    const note = document.createElement('div');
    note.style.cssText = 'background:#fef7e0; color:#8a6d1f; padding:8px 14px; font-size:13px; border-bottom:1px solid #f0e6c8;';
    note.textContent = 'Heads up: this page was opened without a verified identity. If feature building fails, go to the Gmail app tab, refresh it, and use the "Open Feature Generator" button.';
    document.body.insertBefore(note, document.body.firstChild);
  }
  initializeSession();
  setupEventListeners();
  initRHSElements();
  setupRHSEventListeners();
  // Opened from the Gmail page (?userEmail=...): land on the chat window
  // regardless of the mode remembered from a previous visit.
  setMode(URL_USER_EMAIL ? 'chat' : currentMode);
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
      currentPrRequested = false;
  workflowGate = 'idle';
      await refreshExistingFeaturesList(true);
      updateCreatePrButton();
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

      currentDraftSaved = data.chatHistory.some(entry => entry && entry.draftSave && entry.draftSave.success);
      updateCreatePrButton();
      
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
  // Cmd/Ctrl+J flips modes from anywhere, including mid-typing.
  document.addEventListener('keydown', (e) => {
    if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'j') {
      e.preventDefault();
      setMode(currentMode === 'chat' ? 'generate' : 'chat');
      messageInput?.focus();
    }
  });
  
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

  if (createPrBtn) {
    createPrBtn.addEventListener('click', handleCreatePr);
  }
  if (approveDeployBtn) {
    approveDeployBtn.addEventListener('click', handleApproveDeploy);
  }

  // A hand-picked dropdown value is a deliberate identity choice; only then
  // may data-reading flows proceed (see requireSelectedUser).
  if (selectedUserDropdown) {
    selectedUserDropdown.addEventListener('change', () => {
      const value = String(selectedUserDropdown.value || '').trim().toLowerCase();
      userSelectionDeliberate = !!value;
      if (value) localStorage.setItem(USER_SELECTION_STORAGE_KEY, value);
      else localStorage.removeItem(USER_SELECTION_STORAGE_KEY);
    });
  }

  // RHS response-template panel controls
  const rhsTemplateCloseBtn = document.getElementById('rhsTemplateCloseBtn');
  const rhsTemplateCancelBtn = document.getElementById('rhsTemplateCancelBtn');
  const rhsTemplateSaveBtn = document.getElementById('rhsTemplateSaveBtn');
  if (rhsTemplateCloseBtn) rhsTemplateCloseBtn.addEventListener('click', closeResponseTemplatePanel);
  if (rhsTemplateCancelBtn) rhsTemplateCancelBtn.addEventListener('click', closeResponseTemplatePanel);
  if (rhsTemplateSaveBtn) rhsTemplateSaveBtn.addEventListener('click', saveSelectedResponseTemplates);

  const sessionHistoryBtn = document.getElementById('sessionHistoryBtn');
  if (sessionHistoryBtn) {
    sessionHistoryBtn.addEventListener('click', toggleSessionHistoryDrawer);
  }
  if (loadExistingFeatureBtn) {
    loadExistingFeatureBtn.disabled = true;
    loadExistingFeatureBtn.addEventListener('click', handleLoadExistingFeature);
  }

  if (existingFeatureDropdown) {
    existingFeatureDropdown.addEventListener('change', () => {
      if (!loadExistingFeatureBtn) return;
      loadExistingFeatureBtn.disabled = !existingFeatureDropdown.value;
    });
  }
  
  // Auto-resize textarea
  messageInput.addEventListener('input', () => {
    messageInput.style.height = 'auto';
    messageInput.style.height = Math.min(messageInput.scrollHeight, 200) + 'px';
  });
}

// Set mode (chat or generate)
function setMode(mode) {
  // One session, one conversation: both modes write into the same thread
  // (matching the server, where email-chat and generation turns share the
  // session's chatHistory). Switching only changes which engine answers.
  currentMode = mode;
  localStorage.setItem('featureGeneratorMode', mode);
  
  // Update toggle button states
  chatModeBtn.classList.toggle('active', mode === 'chat');
  generateModeBtn.classList.toggle('active', mode === 'generate');
  
  // Update body class for styling
  document.body.classList.toggle('chat-mode', mode === 'chat');
  
  // Show/hide user selector based on mode
  if (userSelector) {
    // Users act only as themselves now; the account picker is retired.
    userSelector.style.display = 'none';
  }
  if (existingFeatureSelector) {
    existingFeatureSelector.style.display = mode === 'generate' ? 'flex' : 'none';
  }
  
  // Update header
  if (mode === 'chat') {
    refreshAvailableUsers().catch(error => {
      console.error('Failed to refresh users in chat mode:', error);
    });
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
    refreshExistingFeaturesList().catch(error => {
      console.error('Failed to refresh feature list:', error);
    });
  }

  updateCreatePrButton();

  // Greet only a brand-new, empty conversation.
  if (chatMessages.children.length === 0) addMessage('assistant', WELCOME_MESSAGES[mode]);
}

function renderExistingFeaturesDropdown() {
  if (!existingFeatureDropdown) return;

  const selectedFeatureId = existingFeatureDropdown.value;
  existingFeatureDropdown.innerHTML = '<option value="">Select a feature...</option>';

  for (const feature of availableExistingFeatures) {
    const option = document.createElement('option');
    option.value = feature.featureId;
    const statusLabel = feature.status === 'deployed' ? 'deployed' : (feature.status || 'draft');
    option.textContent = `${feature.name || feature.featureId} (${feature.featureId}) [${statusLabel}]`;
    existingFeatureDropdown.appendChild(option);
  }

  if (selectedFeatureId && availableExistingFeatures.some(f => f.featureId === selectedFeatureId)) {
    existingFeatureDropdown.value = selectedFeatureId;
  } else {
    existingFeatureDropdown.value = '';
  }

  if (loadExistingFeatureBtn) {
    loadExistingFeatureBtn.disabled = !existingFeatureDropdown.value;
  }
}

function isFeatureInPrOrDeployStage(feature) {
  if (!feature) return false;
  const status = String(feature.status || '').trim();
  const deploymentStatus = String(feature.deploymentStatus || '').trim();
  return status === 'pr_open' ||
    status === 'pr_requested' ||
    status === 'approval_requested' ||
    status === 'merge_in_progress' ||
    status === 'pr_merged' ||
    deploymentStatus === 'deploying';
}

// Initial workflow gate for a feature loaded from the registry, so the
// buttons reflect reality even before any workflow runs in this session.
function gateFromFeatureStatus(feature) {
  if (!feature) return 'idle';
  const status = String(feature.status || '').trim();
  const deploymentStatus = String(feature.deploymentStatus || '').trim();
  if (status === 'pr_merged' || status === 'deployed' || deploymentStatus === 'deployed') return 'merge_done';
  if (status === 'merge_in_progress' || status === 'approval_requested' || deploymentStatus === 'deploying') return 'merge_running';
  if (status === 'pr_open') return 'pr_confirmed';
  if (status === 'pr_requested') return 'pr_running';
  return 'idle';
}

async function refreshExistingFeaturesList(force = false) {
  if (currentMode !== 'generate' || !existingFeatureDropdown) return;
  if (existingFeaturesLoaded && !force) return;

  try {
    const response = await fetch('/api/features/list');
    const data = await response.json().catch(() => ({}));

    if (!response.ok || !data.success) {
      throw new Error(data.error || 'Failed to load features list');
    }

    availableExistingFeatures = Array.isArray(data.features) ? data.features : [];
    if (currentFeatureId) {
      const current = availableExistingFeatures.find(f => f.featureId === currentFeatureId);
      currentPrRequested = isFeatureInPrOrDeployStage(current);
      workflowGate = gateFromFeatureStatus(current);
      updateCreatePrButton();
      // A workflow already mid-flight (e.g. page reloaded during a run):
      // resume watching so the unlocking chat confirmation still arrives.
      if (workflowGate === 'pr_running') watchWorkflowCompletion(currentFeatureId, 'pr');
      if (workflowGate === 'merge_running') watchWorkflowCompletion(currentFeatureId, 'merge');
    }
    existingFeaturesLoaded = true;
    renderExistingFeaturesDropdown();
  } catch (error) {
    console.error('Error loading existing features:', error);
    showToast(`Failed to load existing features: ${error.message}`, 'warning');
  }
}

function isSessionNotFound(response, data) {
  if (response && response.status === 404) return true;
  const msg = String(data?.error || '').toLowerCase();
  return msg.includes('session not found');
}

async function loadFeatureIntoSession(featureId) {
  const actorUserEmail = getActorUserEmail() || undefined;
  let lastError = null;

  for (let attempt = 0; attempt < 2; attempt++) {
    if (!sessionId) {
      await createNewSession();
    }
    if (!sessionId) {
      throw new Error('Failed to initialize session');
    }

    const response = await fetch(`/api/session/${encodeURIComponent(sessionId)}/load-feature`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(attachIdentity({ featureId }))
    });

    const data = await response.json().catch(() => ({}));
    if (response.ok && data.success) return data;

    const errMsg = data?.error || `Failed to load feature ${featureId}`;
    lastError = new Error(errMsg);

    // Recover from stale/expired session IDs by creating a fresh session and retrying once.
    if (attempt === 0 && isSessionNotFound(response, data)) {
      sessionId = null;
      localStorage.removeItem('featureGeneratorSessionId');
      await createNewSession();
      continue;
    }
    break;
  }

  throw lastError || new Error(`Failed to load feature ${featureId}`);
}

async function handleLoadExistingFeature() {
  const featureId = String(existingFeatureDropdown?.value || '').trim();
  if (!featureId) {
    showToast('Select a feature first', 'warning');
    return;
  }

  if (!sessionId) {
    await createNewSession();
    if (!sessionId) {
      showToast('Failed to initialize session', 'error');
      return;
    }
  }

  const originalButtonHtml = loadExistingFeatureBtn ? loadExistingFeatureBtn.innerHTML : '';
  if (loadExistingFeatureBtn) {
    loadExistingFeatureBtn.disabled = true;
    loadExistingFeatureBtn.innerHTML = '<span class="spinner"></span> Loading...';
  }

  try {
    const data = await loadFeatureIntoSession(featureId);

    currentFeatureId = data.featureId;
    currentFiles = data.files || {};
    updatedFiles = [];
    currentDraftSaved = false;
    currentPrRequested = false;
  workflowGate = 'idle';
    updateCreatePrButton();
    showPreview();
    updateFileTabs();
    selectFile('manifest.json');

    addMessage(
      'assistant',
      `Loaded feature \`${data.featureId}\` into this session.\n\nDescribe the edits you want, and I’ll refine the existing files.`
    );
    showToast(`Loaded ${data.featureId}`, 'success');
  } catch (error) {
    console.error('Error loading existing feature:', error);
    showToast(error.message || 'Failed to load feature', 'error');
    addMessage('assistant', `Failed to load \`${featureId}\`.\n\nError: ${error.message}`);
  } finally {
    if (loadExistingFeatureBtn) {
      loadExistingFeatureBtn.disabled = !String(existingFeatureDropdown?.value || '').trim();
      loadExistingFeatureBtn.innerHTML = originalButtonHtml;
    }
  }
}

async function autoLoadSelectedFeatureForGenerate() {
  if (currentMode !== 'generate' || !existingFeatureDropdown) return true;

  const selectedFeatureId = String(existingFeatureDropdown.value || '').trim();
  if (!selectedFeatureId) return true;

  const hasCurrentFiles = !!(currentFiles && Object.keys(currentFiles).length > 0);
  if (hasCurrentFiles && currentFeatureId === selectedFeatureId) return true;

  const data = await loadFeatureIntoSession(selectedFeatureId);

  currentFeatureId = data.featureId;
  currentFiles = data.files || {};
  updatedFiles = [];
  currentDraftSaved = false;
  currentPrRequested = false;
  workflowGate = 'idle';
  updateCreatePrButton();
  showPreview();
  updateFileTabs();
  selectFile('manifest.json');

  addMessage(
    'assistant',
    `Using selected feature \`${data.featureId}\` for in-place edits.\n\nYour next prompt will modify these existing files instead of creating a new feature directory.`
  );
  return true;
}

// Handle send message
// Conservative cross-mode intent detector. Only flags messages that VERY
// clearly belong to the other mode; everything else sends where the user is.
function detectLikelyMisroute(message) {
  const m = String(message || '').toLowerCase();
  if (currentMode === 'chat') {
    // Feature-building language typed into email chat.
    if (/\b(build|create|make|add|generate)\b[^.?!]{0,60}\b(feature|button|column|filter|tracker|dashboard|panel|view|widget|layout)\b/.test(m)) return 'generate';
    if (/\b(deploy|refine|modify)\b[^.?!]{0,40}\bfeature\b/.test(m)) return 'generate';
  } else {
    // Email questions typed into the feature builder.
    if (/^(how many|which|who|when|what)\b[^.?!]{0,80}\b(email|emails|inbox|sender|thread|message)/.test(m)) return 'chat';
    if (/\b(summarize|search|find|show me)\b[^.?!]{0,60}\b(email|emails|inbox|messages?)\b/.test(m)) return 'chat';
  }
  return null;
}

async function handleSend() {
  const message = messageInput.value.trim();
  
  if (!message || isGenerating) return;

  try {
    await autoLoadSelectedFeatureForGenerate();
  } catch (error) {
    console.error('Failed to auto-load selected feature:', error);
    showToast(error.message || 'Failed to load selected feature', 'error');
    addMessage('assistant', `Could not load the selected feature for editing.\n\nError: ${error.message}`);
    return;
  }
  
  // High-confidence wrong-mode check BEFORE anything runs: a feature request
  // typed into Chat (or an email question typed into Build) costs one click
  // to redirect instead of a wasted run in the wrong pipeline. Deliberately
  // conservative -- anything ambiguous just sends in the current mode.
  const misroute = detectLikelyMisroute(message);
  if (misroute && !handleSend._overrideOnce) {
    messageInput.value = '';
    messageInput.style.height = 'auto';
    addMessage('user', message);
    const targetLabel = misroute === 'generate' ? 'Build' : 'Chat';
    addMessage('assistant', misroute === 'generate'
      ? 'That looks like a **feature request**. Want me to send it to **Build**?'
      : 'That looks like a **question about your emails**. Want me to send it to **Chat**?');
    addChatPipelineButtons([
      { label: `↪ Send in ${targetLabel}`, kind: 'primary', run: async () => {
          setMode(misroute);
          addMessage('user', message);
          if (misroute === 'generate') { await runGeneratePreflight(message); }
          else { await runChatRequest(message); }
        } },
      { label: 'Send here anyway', kind: 'neutral', run: async () => {
          handleSend._overrideOnce = true;
          try {
            if (currentMode === 'generate') { await runGeneratePreflight(message); }
            else { await runChatRequest(message); }
          } finally { handleSend._overrideOnce = false; }
        } }
    ]);
    return;
  }
  handleSend._overrideOnce = false;

  // Clear input
  messageInput.value = '';
  messageInput.style.height = 'auto';

  // Add user message to chat
  addMessage('user', message);

  // Generate mode: run a read-only preflight first. It reports which features
  // are currently shown/enabled in the app and which feature this request
  // targets; the agent only runs after the user confirms.
  if (currentMode === 'generate') {
    await runGeneratePreflight(message);
    return;
  }

  await runChatRequest(message);
}

// Preflight for generate mode: ask the server what this request will touch,
// then wait for explicit confirmation before running the feature agent.
async function runGeneratePreflight(message) {
  setGenerating(true);
  const loadingMsg = addLoadingMessage();

  try {
    const requestBody = { sessionId, message };
    attachIdentity(requestBody);

    const response = await fetch('/api/chat/preflight', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(requestBody)
    });
    const data = await response.json();
    loadingMsg.remove();
    setGenerating(false);

    if (!data.success) {
      throw new Error(data.error || 'Preflight failed');
    }

    addMessage('assistant', data.response);
    addPreflightConfirmation(message, data.target);
  } catch (error) {
    // Preflight is best-effort: never block feature generation on it.
    console.warn('Preflight failed, running the agent directly:', error);
    loadingMsg.remove();
    setGenerating(false);
    await runChatRequest(message);
  }
}

// Inline Proceed/Cancel bubble shown after the preflight summary.
function addPreflightConfirmation(message, target) {
  const existing = document.getElementById('preflight-confirmation');
  if (existing) existing.remove();

  const messageDiv = document.createElement('div');
  messageDiv.className = 'message assistant-message confirmation-message';
  messageDiv.id = 'preflight-confirmation';

  const avatar = document.createElement('div');
  avatar.className = 'message-avatar';
  avatar.textContent = '⚠️';

  const contentDiv = document.createElement('div');
  contentDiv.className = 'message-content confirmation-content';

  const summaryText = document.createElement('div');
  summaryText.className = 'confirmation-text';
  const targetLabel = target && target.action === 'modify'
    ? `modify <strong>${target.featureId}</strong>${target.name ? ` (${target.name})` : ''}`
    : 'create a <strong>new feature</strong>';
  summaryText.innerHTML = `
    <strong>Confirm before the agent runs</strong><br>
    This request will ${targetLabel}. Proceed?
  `;
  contentDiv.appendChild(summaryText);

  const buttonsDiv = document.createElement('div');
  buttonsDiv.className = 'confirmation-buttons';

  const cancelBtn = document.createElement('button');
  cancelBtn.className = 'btn-secondary cancel-btn';
  cancelBtn.innerHTML = '✕ Cancel';
  cancelBtn.addEventListener('click', () => {
    messageDiv.remove();
    addMessage('assistant', 'Cancelled — nothing was generated. Rephrase your request whenever you are ready.');
  });

  const approveBtn = document.createElement('button');
  approveBtn.className = 'btn-primary approve-btn';
  approveBtn.innerHTML = '✓ Proceed';
  approveBtn.addEventListener('click', async () => {
    messageDiv.remove();
    await runChatRequest(message);
  });

  buttonsDiv.appendChild(cancelBtn);
  buttonsDiv.appendChild(approveBtn);
  contentDiv.appendChild(buttonsDiv);

  messageDiv.appendChild(avatar);
  messageDiv.appendChild(contentDiv);
  chatMessages.appendChild(messageDiv);
  scrollToBottom();
}

// Send the message to the chat/agent endpoints (previously inline in handleSend).
async function runChatRequest(message) {
  // Show loading state
  setGenerating(true);
  const loadingMsg = addLoadingMessage();

  try {
    // Use different endpoints based on mode
    const endpoint = currentMode === 'chat' ? '/api/email-chat' : '/api/chat';
    
    // Build request body. Identity (userEmail + signed handoff) rides on
    // EVERY send: /api/chat verifies the signature, and email-chat mode needs
    // the user's own address now that the account picker is gone.
    const requestBody = attachIdentity({ sessionId, message });
    if (currentMode === 'chat' && !requestBody.userEmail) {
      try { loadingMsg?.remove?.(); } catch (_) {}
      addMessage('assistant', 'I could not tell whose emails to look at. Open this page from the Gmail app (the "Open Feature Generator" button) and try again.');
      setGenerating(false);
      return;
    }
    
    const response = await fetch(endpoint, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(requestBody)
    });
    
    let data = await response.json();

    // Managed-agent generations return { pending: true } immediately and
    // finish asynchronously on the server. Keep polling until the final
    // result arrives (it has the same shape as the synchronous response).
    if (data.success && data.pending) {
      data = await pollForChatResult(loadingMsg);
    }

    // The server asked whether this is a brand-new feature (vs a change to
    // the one loaded in this session). Render the question with one-click
    // answers; either button just sends a normal chat message.
    if (data.success && data.confirmNewFeature) {
      loadingMsg.remove();
      addMessage('assistant', data.response);
      addNewFeatureConfirmButtons();
      setGenerating(false);
      return;
    }

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
          currentPrRequested = false;
  workflowGate = 'idle';
          
          // Show/update preview
          showPreview();
          updateFileTabs();
          
          // Select first file or first updated file
          if (updatedFiles.length > 0) {
            selectFile(updatedFiles[0]);
          } else {
            selectFile('manifest.json');
          }
          
          if (data.draftSave && data.draftSave.success) {
            const draftMsg = data.draftSave.message || 'Saved as a draft feature';
            currentDraftSaved = true;
            updateCreatePrButton();
            addMessage('assistant', `Saved feature \`${data.featureId}\` as a draft in the main system.\n\n${draftMsg}\n\nNext step: create a GitHub pull request from this saved draft so it can be reviewed and deployed.`);
            addChatPipelineButtons(
              [
                { label: '🔀 Create pull request', run: handleCreatePr },
                { label: '✕ Cancel', kind: 'dismiss', run: () => {} }
              ],
              { title: 'Draft saved — ready for review', text: 'Open a GitHub pull request from this draft so it can be approved and deployed.' }
            );
            showToast('Feature draft saved', 'success');
          } else if (data.draftSave && !data.draftSave.success) {
            const err = data.draftSave.error || 'Draft save failed';
            currentDraftSaved = false;
            updateCreatePrButton();
            addMessage('assistant', `Feature files were generated, but saving the draft to the main system failed.\n\nError: ${err}\n\nYou can still download the ZIP while we wire up the PR workflow.`);
            showToast(`Generated, but draft save failed: ${err}`, 'warning');
          } else {
            currentDraftSaved = false;
            updateCreatePrButton();
            showToast('Files generated successfully!', 'success');
          }
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

// Poll the server for the result of an in-flight managed-agent generation.
// Resolves with a payload shaped like the synchronous /api/chat response.
// Polls sequentially (each request completes before the next is scheduled)
// so the server never finalizes the same turn twice concurrently.
// While pending, streams the agent's live activity into the loading bubble.
async function pollForChatResult(loadingMsg) {
  const POLL_INTERVAL_MS = 3000;
  const TIMEOUT_MS = 20 * 60 * 1000;
  const startedAt = Date.now();
  let consecutiveFailures = 0;

  while (Date.now() - startedAt < TIMEOUT_MS) {
    await new Promise(resolve => setTimeout(resolve, POLL_INTERVAL_MS));
    try {
      const response = await fetch(`/api/chat/poll/${encodeURIComponent(sessionId)}`);
      const data = await response.json();
      consecutiveFailures = 0;
      if (data && data.pending) {
        if (loadingMsg && typeof loadingMsg.setProgress === 'function') {
          loadingMsg.setProgress(data.progress);
        }
        continue;
      }
      return data;
    } catch (error) {
      console.warn('Poll failed (will retry):', error);
      consecutiveFailures += 1;
      if (consecutiveFailures >= 10) {
        return { success: false, error: 'Lost connection to the server while waiting for the agent to finish.' };
      }
    }
  }
  return { success: false, error: 'Timed out waiting for the agent to finish. The generation may still complete server-side — reload the page in a minute to check.' };
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
  
  // The old session stays in Mongo so the History drawer can resume it;
  // deleting it here is what used to make history impossible.
  if (false && sessionId) {
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
  currentDraftSaved = false;
  currentPrRequested = false;
  workflowGate = 'idle';
  updateCreatePrButton();
  
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

function updateCreatePrButton() {
  // Pipeline actions live in the chat now; no header buttons remain.
  return;
  if (!createPrBtn) return;
  const shouldShow = currentMode === 'generate' && !!currentFeatureId && currentDraftSaved;
  createPrBtn.style.display = shouldShow ? 'inline-flex' : 'none';

  // Clickability is gated on the chat confirmation of the previous GitHub
  // Action: while a workflow runs (or once the PR exists / is merged) the
  // button stays visible but locked, with the tooltip explaining why.
  const prLocked = workflowGate !== 'idle';
  createPrBtn.disabled = prLocked;
  createPrBtn.title =
    workflowGate === 'pr_running' ? 'Waiting for the PR workflow to finish — I will confirm in the chat' :
    workflowGate === 'merge_running' ? 'Waiting for the merge workflow to finish — I will confirm in the chat' :
    workflowGate === 'pr_confirmed' ? 'A PR is already open for this feature — approve it instead' :
    workflowGate === 'merge_done' ? 'This feature is already merged' :
    'Create a GitHub PR from the saved draft';

  if (approveDeployBtn) {
    const shouldShowApprove = shouldShow && currentPrRequested;
    approveDeployBtn.style.display = shouldShowApprove ? 'inline-flex' : 'none';
    const approveLocked = workflowGate !== 'pr_confirmed';
    approveDeployBtn.disabled = approveLocked;
    approveDeployBtn.title =
      workflowGate === 'pr_confirmed' ? 'Merge the open PR and deploy' :
      workflowGate === 'merge_running' ? 'Waiting for the merge workflow to finish — I will confirm in the chat' :
      workflowGate === 'merge_done' ? 'Already merged' :
      'Available after the chat confirms the PR workflow completed';
  }
}

// Waiting bubble shown in the chat while a GitHub workflow runs. Keyed per
// feature+stage so the workflow watcher can remove it when it posts the
// completion message (or the timeout notice).
const pipelineWaitBubbles = new Map();
function showPipelineWait(featureId, stage, label) {
  removePipelineWait(featureId, stage);
  const div = document.createElement('div');
  div.className = 'message assistant-message';
  div.innerHTML = `
    <div class="message-avatar">🤖</div>
    <div class="message-content loading-message">
      <div class="loading-header">
        <span>${label}</span>
        <div class="loading-dots"><span></span><span></span><span></span></div>
        <span class="pipeline-elapsed" style="color:#5f6368; font-size:12px;"></span>
      </div>
    </div>`;
  chatMessages.appendChild(div);
  scrollToBottom();
  const startedAt = Date.now();
  const timer = setInterval(() => {
    const el = div.querySelector('.pipeline-elapsed');
    if (!el) return;
    const secs = Math.floor((Date.now() - startedAt) / 1000);
    el.textContent = secs >= 60 ? `${Math.floor(secs / 60)}m ${secs % 60}s` : `${secs}s`;
  }, 1000);
  pipelineWaitBubbles.set(`${featureId}:${stage}`, { div, timer });
}
function removePipelineWait(featureId, stage) {
  const entry = pipelineWaitBubbles.get(`${featureId}:${stage}`);
  if (!entry) return;
  clearInterval(entry.timer);
  entry.div.remove();
  pipelineWaitBubbles.delete(`${featureId}:${stage}`);
}

async function handleCreatePr() {
  if (!currentFeatureId) return;
  try {
    const response = await fetch(`/api/features/${encodeURIComponent(currentFeatureId)}/create-pr`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' }
    });
    const data = await response.json().catch(() => ({}));
    if (!response.ok || !data.success) {
      throw new Error(data.error || 'Failed to create PR');
    }

    addMessage(
      'assistant',
      `⏳ PR creation started for \`${currentFeatureId}\`.\n\nGitHub Actions is creating a branch from \`${data.baseBranch || 'main'}\`, committing the generated files, and opening a pull request. This usually takes about a minute.\n\n**I'll post a message here the moment the workflow finishes** — no need to watch the repository. (Progress, if you're curious: ${data.workflowUrl || 'https://github.com/karthiksreedhar/gmail-plugin/actions'})`
    );
    setWorkflowGate('pr_running');
    showPipelineWait(currentFeatureId, 'pr', 'Creating the pull request on GitHub');
    watchWorkflowCompletion(currentFeatureId, 'pr');
    showToast('PR creation requested', 'success');
  } catch (error) {
    addMessage('assistant', `⚠️ The PR request hit an error (${error.message}), but the workflow may still be running on GitHub — checking the real status now, I'll confirm here either way.`);
    setWorkflowGate('pr_running');
    showPipelineWait(currentFeatureId, 'pr', 'Verifying PR status on GitHub');
    watchWorkflowCompletion(currentFeatureId, 'pr');
  }
}

async function handleApproveDeploy() {
  if (!currentFeatureId) return;
  try {
    const response = await fetch(`/api/features/${encodeURIComponent(currentFeatureId)}/approve-and-deploy`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' }
    });
    const data = await response.json().catch(() => ({}));
    if (!response.ok || !data.success) {
      throw new Error(data.error || 'Failed to approve and deploy');
    }
    setWorkflowGate('merge_running');
    showPipelineWait(currentFeatureId, 'merge', 'Merging the pull request and deploying');
    watchWorkflowCompletion(currentFeatureId, 'merge');
    showToast('Approve + deploy requested', 'success');
  } catch (error) {
    // The dispatch REQUEST failing does not mean the workflow failed: GitHub
    // may already be running it (this exact false alarm happened -- "failed"
    // in chat, merged on GitHub). Say so honestly and watch anyway; the
    // watcher will report the real outcome either way.
    addMessage('assistant', `⚠️ The approve request hit an error (${error.message}), but the workflow may still be running on GitHub — checking the real status now, I'll confirm here either way.`);
    setWorkflowGate('merge_running');
    showPipelineWait(currentFeatureId, 'merge', 'Verifying merge status on GitHub');
    watchWorkflowCompletion(currentFeatureId, 'merge');
  }
}

// --- GitHub Actions completion watcher ---------------------------------
// The PR and approval workflows report their status back to the main system
// as they run; polling the proxied pipeline-status endpoint lets us post a
// chat message the moment a workflow actually completes, so the user knows
// when to move to the next step without watching the repository.
const activePipelineWatchers = new Set();

function watchWorkflowCompletion(featureId, stage) {
  const key = `${featureId}:${stage}`;
  if (!featureId || activePipelineWatchers.has(key)) return;
  activePipelineWatchers.add(key);

  const POLL_INTERVAL_MS = 8000;
  const TIMEOUT_MS = 15 * 60 * 1000;
  const startedAt = Date.now();
  const stageLabel = stage === 'pr' ? 'PR creation' : 'merge + deploy';
  const actionsUrl = 'https://github.com/karthiksreedhar/gmail-plugin/actions';

  // nextGate: the workflow gate to move to WHEN the chat confirmation posts —
  // this is the only place the buttons unlock, so a click is impossible
  // before the completion message exists in the chat.
  const finish = (message, toast, toastType, nextGate) => {
    activePipelineWatchers.delete(key);
    removePipelineWait(featureId, stage);
    if (nextGate) setWorkflowGate(nextGate);
    addMessage('assistant', message);
    if (toast) showToast(toast, toastType);
  };

  const tick = async () => {
    if (!activePipelineWatchers.has(key)) return;
    if (Date.now() - startedAt > TIMEOUT_MS) {
      finish(
        `⏱️ I stopped watching the ${stageLabel} workflow for \`${featureId}\` after 15 minutes without a result. Check it directly here: ${actionsUrl}\n\nThe pipeline buttons are unlocked again so you can retry once you know the outcome.`,
        null,
        null,
        stage === 'pr' ? 'idle' : 'pr_confirmed'
      );
      return;
    }

    try {
      const response = await fetch(`/api/features/${encodeURIComponent(featureId)}/pipeline-status`);
      const data = await response.json().catch(() => ({}));
      const feature = (data && data.success && data.feature) ? data.feature : null;

      if (feature) {
        const status = String(feature.status || '').trim();
        const failureDetail = feature.lastError ? `\n\nDetails: ${feature.lastError}` : '';

        if (stage === 'pr') {
          if (status === 'pr_open' || status === 'merge_in_progress' || status === 'pr_merged') {
            const prLink = feature.prUrl
              ? `\n\nPull request: ${feature.prUrl}`
              : '';
            currentPrRequested = true;
            finish(
              `✅ The **${stageLabel}** GitHub Action is complete for \`${featureId}\` — the pull request is open.${prLink}\n\nApprove below whenever you're ready.`,
              'PR is open — ready to approve',
              'success',
              'pr_confirmed'
            );
            addChatPipelineButtons(
              [
                { label: '🚀 Approve merge + deploy', run: handleApproveDeploy },
                { label: '✕ Cancel', kind: 'dismiss', run: () => {} }
              ],
              { title: 'Pull request is open', text: 'Approving merges it into main and deploys the feature to production.' }
            );
            return;
          }
          if (status === 'error') {
            finish(
              `❌ The **${stageLabel}** GitHub Action failed for \`${featureId}\`.${failureDetail}\n\nSee the run logs: ${actionsUrl}\n\n**Create PR** is unlocked again so you can retry.`,
              'PR workflow failed',
              'error',
              'idle'
            );
            return;
          }
        } else {
          // Merged is the finish line. Deployment-status tracking proved
          // unreliable (it batch-updates well after the deploy is live), so
          // the chat just says the deploy takes a minute rather than keeping
          // a bubble up that outlives the actual deployment.
          if (status === 'pr_merged' || status === 'deployed') {
            finish(
              `✅ The PR for \`${featureId}\` was **merged into main**. Production deployment is underway — give it a minute or two, then refresh the Gmail app tab to see the feature live.`,
              'Merged — deploying now',
              'success',
              'merge_done'
            );
            return;
          }
          if (status === 'deploy_failed' || status === 'error') {
            finish(
              `❌ The **${stageLabel}** GitHub Action failed for \`${featureId}\`.${failureDetail}\n\nSee the run logs: ${actionsUrl}\n\n**Approve Merge + Deploy** is unlocked again so you can retry.`,
              'Merge workflow failed',
              'error',
              'pr_confirmed'
            );
            return;
          }
        }
      }
    } catch (error) {
      // Transient network/server hiccup: keep polling.
      console.warn('Pipeline status poll failed (will retry):', error);
    }

    setTimeout(tick, POLL_INTERVAL_MS);
  };

  setTimeout(tick, POLL_INTERVAL_MS);
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

// Inline pipeline action buttons in the chat, shown at the moment a step is
// actually ready (draft saved -> Create PR; PR open -> Approve + Deploy).
// They reuse the same handlers and gate state as the header buttons, so
// clicking either place is equivalent and gates stay authoritative.
function addChatPipelineButtons(actions, opts = {}) {
  // Rendered as a full confirmation card -- same visual weight as the
  // Proceed/Cancel check before the agent runs -- so pipeline steps read as
  // real decisions, not incidental links.
  const messageDiv = document.createElement('div');
  messageDiv.className = 'message assistant-message confirmation-message';

  const avatar = document.createElement('div');
  avatar.className = 'message-avatar';
  avatar.textContent = '🤖';

  const contentDiv = document.createElement('div');
  contentDiv.className = 'message-content confirmation-content';

  if (opts.title || opts.text) {
    const summaryText = document.createElement('div');
    summaryText.className = 'confirmation-text';
    summaryText.innerHTML = `${opts.title ? `<strong>${opts.title}</strong>` : ''}${opts.text ? `<br>${opts.text}` : ''}`;
    contentDiv.appendChild(summaryText);
  }

  const buttonsDiv = document.createElement('div');
  buttonsDiv.className = 'confirmation-buttons';
  const primary = actions[0];
  actions.forEach(({ label, run, kind }, idx) => {
    const btn = document.createElement('button');
    btn.className = kind === 'neutral'
      ? 'btn-neutral'
      : (kind === 'dismiss' || idx > 0 ? 'btn-secondary cancel-btn' : 'btn-primary approve-btn');
    btn.innerHTML = label;
    btn.addEventListener('click', async () => {
      if (kind === 'dismiss') {
        // Declining must not strand the step (there are no header buttons
        // any more): the big card collapses to a small chip that still
        // performs the primary action whenever the user is ready.
        messageDiv.remove();
        const chipWrap = document.createElement('div');
        chipWrap.style.cssText = 'margin:2px 0 10px 44px;';
        const chip = document.createElement('button');
        chip.innerHTML = primary.label;
        chip.className = 'chat-chip';
        chip.addEventListener('click', async () => {
          chip.disabled = true; chip.style.opacity = '0.5';
          try { await primary.run(); } finally { chipWrap.remove(); }
        });
        chipWrap.appendChild(chip);
        chatMessages.appendChild(chipWrap);
        scrollToBottom();
        return;
      }
      // One shot: the workflow watcher posts the next step's card when this
      // step actually completes.
      buttonsDiv.querySelectorAll('button').forEach(b => { b.disabled = true; b.style.opacity = '0.5'; });
      try { await run(); } finally { messageDiv.remove(); }
    });
    buttonsDiv.appendChild(btn);
  });
  contentDiv.appendChild(buttonsDiv);

  messageDiv.appendChild(avatar);
  messageDiv.appendChild(contentDiv);
  chatMessages.appendChild(messageDiv);
  scrollToBottom();
  return messageDiv;
}

// --- Session history drawer ---
// Slide-in panel listing this user's past sessions (titled by their first
// message). Clicking one resumes it: the session id goes into localStorage
// and the page reloads -- initializeSession already restores history, files,
// and pipeline state from the server.
function toggleSessionHistoryDrawer() {
  const existing = document.getElementById('sessionHistoryDrawer');
  if (existing) { existing.remove(); return; }

  const drawer = document.createElement('div');
  drawer.id = 'sessionHistoryDrawer';
  drawer.style.cssText = 'position:fixed; top:0; right:0; bottom:0; width:320px; z-index:1000;' +
    'background:var(--bg-card); border-left:1px solid var(--border-color);' +
    'box-shadow:-8px 0 24px rgba(0,0,0,.35); display:flex; flex-direction:column;';
  drawer.innerHTML = `
    <div style="display:flex; align-items:center; justify-content:space-between; padding:14px 16px; border-bottom:1px solid var(--border-color);">
      <strong style="color:var(--text-primary); font-size:14px;">Past sessions</strong>
      <button id="closeHistoryDrawer" class="chat-chip">✕</button>
    </div>
    <div id="sessionHistoryList" style="flex:1; overflow-y:auto; padding:8px;">
      <div style="color:var(--text-secondary); font-size:13px; padding:14px;">Loading…</div>
    </div>`;
  document.body.appendChild(drawer);
  drawer.querySelector('#closeHistoryDrawer').addEventListener('click', () => drawer.remove());

  const params = new URLSearchParams({
    userEmail: URL_USER_EMAIL, identityExp: URL_IDENTITY_EXP, identitySig: URL_IDENTITY_SIG
  });
  fetch('/api/sessions/list?' + params.toString())
    .then(r => r.json())
    .then(data => {
      const list = drawer.querySelector('#sessionHistoryList');
      if (!data.success) {
        list.innerHTML = `<div style="color:var(--text-secondary); font-size:13px; padding:14px;">${data.error || 'Could not load sessions.'}</div>`;
        return;
      }
      if (!data.sessions.length) {
        list.innerHTML = '<div style="color:var(--text-secondary); font-size:13px; padding:14px;">No past sessions yet.</div>';
        return;
      }
      list.innerHTML = '';
      data.sessions.forEach(sess => {
        const isCurrent = sess.sessionId === sessionId;
        const item = document.createElement('div');
        item.style.cssText = 'padding:10px 12px; border-radius:8px; cursor:pointer; margin-bottom:2px;' +
          (isCurrent ? 'background:var(--bg-tertiary);' : '');
        item.addEventListener('mouseenter', () => { if (!isCurrent) item.style.background = 'var(--bg-secondary)'; });
        item.addEventListener('mouseleave', () => { if (!isCurrent) item.style.background = ''; });
        const when = sess.lastAccess ? new Date(sess.lastAccess).toLocaleString(undefined, { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' }) : '';
        item.innerHTML = `
          <div style="color:var(--text-primary); font-size:13px; overflow:hidden; text-overflow:ellipsis; white-space:nowrap;">${sess.title.replace(/</g,'&lt;')}</div>
          <div style="color:var(--text-secondary); font-size:11px; margin-top:2px;">${when}${sess.featureId ? ' · ' + sess.featureId : ''}${isCurrent ? ' · current' : ''}</div>`;
        item.addEventListener('click', () => {
          if (isCurrent) { drawer.remove(); return; }
          localStorage.setItem('featureGeneratorSessionId', sess.sessionId);
          window.location.reload();
        });
        list.appendChild(item);
      });
    })
    .catch(() => {
      drawer.querySelector('#sessionHistoryList').innerHTML =
        '<div style="color:var(--text-secondary); font-size:13px; padding:14px;">Could not load sessions.</div>';
    });
}

// Quick-reply buttons under a new-feature confirmation question. Clicking
// one sends it as an ordinary chat message, so the server-side flow stays a
// plain text conversation.
function addNewFeatureConfirmButtons() {
  const wrap = document.createElement('div');
  wrap.className = 'confirm-new-feature-buttons';
  wrap.style.cssText = 'display:flex; gap:8px; margin:4px 0 12px 44px;';
  const mk = (label, text) => {
    const btn = document.createElement('button');
    btn.textContent = label;
    btn.className = 'chat-chip';
    btn.addEventListener('click', () => {
      wrap.remove();
      messageInput.value = text;
      handleSend();
    });
    return btn;
  };
  wrap.appendChild(mk('✨ Yes, build it as a new feature', 'Yes, build it as a new feature'));
  wrap.appendChild(mk('✏️ No — modify the current feature', 'No, apply this as a change to the current feature'));
  chatMessages.appendChild(wrap);
  scrollToBottom();
}

// Add loading message. The returned element exposes setProgress(progress) so
// the poll loop can stream live Claude Code activity into the bubble, and its
// remove() also stops the elapsed-time ticker.
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
    <div class="loading-header">
      <span>${loadingText}</span>
      <div class="loading-dots">
        <span></span>
        <span></span>
        <span></span>
      </div>
      <span class="loading-elapsed"></span>
    </div>
    <div class="loading-activity" style="display: none;"></div>
    <div class="loading-note" style="display: none;"></div>
  `;

  messageDiv.appendChild(avatar);
  messageDiv.appendChild(contentDiv);

  chatMessages.appendChild(messageDiv);
  scrollToBottom();

  const elapsedEl = contentDiv.querySelector('.loading-elapsed');
  const activityEl = contentDiv.querySelector('.loading-activity');
  const noteEl = contentDiv.querySelector('.loading-note');
  const startedAt = Date.now();

  const elapsedTimer = setInterval(() => {
    const secs = Math.floor((Date.now() - startedAt) / 1000);
    if (secs < 5) return;
    const mins = Math.floor(secs / 60);
    elapsedEl.textContent = mins > 0 ? `${mins}m ${secs % 60}s` : `${secs}s`;
  }, 1000);

  if (currentMode === 'generate') {
    activityEl.style.display = '';
    activityEl.textContent = '⚙️ Starting a Claude Code session in a sandbox…';
  }

  // Claude-Code-style running log: completed steps stay visible with a check,
  // the current step animates at the bottom. Steps arrive via
  // progress.recentActivities (deduped server-side); we accumulate the full
  // list here so nothing scrolls away between polls.
  const seenSteps = [];
  messageDiv.setProgress = (progress) => {
    if (!progress) return;
    for (const step of (Array.isArray(progress.recentActivities) ? progress.recentActivities : [])) {
      if (!seenSteps.includes(step)) seenSteps.push(step);
    }
    if (progress.currentActivity && !seenSteps.includes(progress.currentActivity)) {
      seenSteps.push(progress.currentActivity);
    }
    if (seenSteps.length) {
      activityEl.style.display = '';
      activityEl.innerHTML = seenSteps.map((step, i) => {
        const isCurrent = i === seenSteps.length - 1;
        const icon = isCurrent ? '⚙️' : '<span style="color:#188038;">✓</span>';
        const style = isCurrent ? '' : 'color:#5f6368;';
        return `<div style="${style} padding:1px 0;">${icon} ${step}</div>`;
      }).join('');
    }
    if (progress.lastMessage) {
      noteEl.style.display = '';
      noteEl.textContent = progress.lastMessage;
    }
    scrollToBottom();
  };

  const originalRemove = messageDiv.remove.bind(messageDiv);
  messageDiv.remove = () => {
    clearInterval(elapsedTimer);
    originalRemove();
  };

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
let categorySelections = {}; // { categoryName: boolean }

// Show category suggestions in RHS with tabbed interface
function showCategorySuggestionsInPreview(suggestions, operationsLog) {
  pendingCategorySuggestions = suggestions;
  categoryEmailSelections = {};
  categorySelections = {};
  
  // Initialize all emails as selected by default
  for (const cat of suggestions.categories) {
    categorySelections[cat.name] = true;
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
      <input type="checkbox" class="category-enable-checkbox" data-category="${escapeHtml(cat.name)}" ${categorySelections[cat.name] ? 'checked' : ''}>
      ${escapeHtml(cat.name)}${cat.kind === 'existing' ? ' <span class="tab-kind-badge existing">existing</span>' : ''} <span class="tab-count">${emailCount}</span>
    </button>`;
  }
  html += '</div>';
  
  // Category content panels
  html += '<div class="category-panels">';
  for (let i = 0; i < categories.length; i++) {
    const cat = categories[i];
    html += `<div class="category-panel ${i === 0 ? 'active' : ''}" data-category="${escapeHtml(cat.name)}" data-index="${i}">
      <div class="category-info">
        ${cat.kind === 'existing' ? '<div class="rhs-category-existing-note">➕ Adds emails to this <strong>existing category</strong> — nothing new is created.</div>' : ''}
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
    tab.addEventListener('click', (e) => {
      if (e.target && e.target.classList.contains('category-enable-checkbox')) return;
      const index = tab.dataset.index;
      tabs.forEach(t => t.classList.remove('active'));
      panels.forEach(p => p.classList.remove('active'));
      tab.classList.add('active');
      container.querySelector(`.category-panel[data-index="${index}"]`).classList.add('active');
    });
  });

  const categoryCheckboxes = container.querySelectorAll('.category-enable-checkbox');
  categoryCheckboxes.forEach(checkbox => {
    checkbox.addEventListener('click', (e) => e.stopPropagation());
    checkbox.addEventListener('change', () => {
      const categoryName = checkbox.dataset.category;
      const enabled = checkbox.checked;
      categorySelections[categoryName] = enabled;
      syncCategorySelectionUI(categoryName, enabled);
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
  categorySelections = {};
  
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
        ${suggestions.categories.map(cat => `
          <li>
            <label class="category-confirm-option">
              <input type="checkbox" class="category-confirm-checkbox" data-category="${escapeHtml(cat.name)}" ${categorySelections[cat.name] !== false ? 'checked' : ''}>
              <span>📂 ${escapeHtml(cat.name)} (${cat.suggestedEmails?.length || 0} emails)</span>
            </label>
          </li>
        `).join('')}
      </ul>
      <p class="confirmation-hint">Select categories here, and emails in the preview panel, then approve →</p>
    </div>
    <div class="confirmation-buttons">
      <button class="btn-secondary cancel-btn">✕ Cancel</button>
      <button class="btn-primary approve-btn">✓ Create & Move</button>
    </div>
  `;
  
  // Add button handlers
  contentDiv.querySelectorAll('.category-confirm-checkbox').forEach(checkbox => {
    checkbox.addEventListener('change', () => {
      const categoryName = checkbox.dataset.category;
      const enabled = checkbox.checked;
      categorySelections[categoryName] = enabled;
      syncCategorySelectionUI(categoryName, enabled);
    });
  });
  contentDiv.querySelector('.cancel-btn').addEventListener('click', handleCancelCategorySuggestions);
  contentDiv.querySelector('.approve-btn').addEventListener('click', handleApproveCategorySuggestions);
  
  messageDiv.appendChild(avatar);
  messageDiv.appendChild(contentDiv);
  chatMessages.appendChild(messageDiv);
  scrollToBottom();
}

function syncCategorySelectionUI(categoryName, enabled) {
  if (categorySelections && Object.prototype.hasOwnProperty.call(categorySelections, categoryName)) {
    categorySelections[categoryName] = enabled;
  }
  if (rhsCategorySelections && Object.prototype.hasOwnProperty.call(rhsCategorySelections, categoryName)) {
    rhsCategorySelections[categoryName] = enabled;
  }

  document.querySelectorAll(`.category-enable-checkbox[data-category="${categoryName}"]`).forEach(cb => {
    cb.checked = enabled;
  });
  document.querySelectorAll(`.rhs-category-enable-checkbox[data-category="${categoryName}"]`).forEach(cb => {
    cb.checked = enabled;
  });
  document.querySelectorAll(`.category-confirm-checkbox[data-category="${categoryName}"]`).forEach(cb => {
    cb.checked = enabled;
  });

  const previewPanel = document.querySelector(`.category-panel[data-category="${categoryName}"]`);
  if (previewPanel) previewPanel.classList.toggle('category-disabled', !enabled);

  const rhsPanelEl = document.querySelector(`.rhs-category-tab-panel[data-category="${categoryName}"]`);
  if (rhsPanelEl) rhsPanelEl.classList.toggle('rhs-category-disabled', !enabled);
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
    categories: pendingCategorySuggestions.categories
      .filter(cat => categorySelections[cat.name] !== false)
      .map(cat => ({
        ...cat,
        selectedEmails: Object.entries(categoryEmailSelections[cat.name] || {})
          .filter(([id, selected]) => selected)
          .map(([id]) => id)
      }))
      .filter(cat => cat.selectedEmails.length > 0)
  };

  if (finalSuggestions.categories.length === 0) {
    showToast('Please keep at least one category with selected emails', 'warning');
    return;
  }
  
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
        const summaryText = describeCategoryApplyResults(data.summary);
        contentDiv.innerHTML = `
          <div class="confirmation-result success">
            ✅ <strong>Suggestions applied!</strong><br>
            ${escapeHtml(summaryText.charAt(0).toUpperCase() + summaryText.slice(1))}.
          </div>
        `;
        confirmationMsg.querySelector('.message-avatar').textContent = '✅';
      }

      showToast(`Done: ${describeCategoryApplyResults(data.summary)}`, 'success');
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
  categorySelections = {};
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
  categorySelections = {};
  
  showToast('Category creation cancelled', 'warning');
}

// =====================================================
// RHS CATEGORY SUGGESTION PANEL SYSTEM
// =====================================================

// State for RHS panel
let rhsCategorySuggestions = null;
let rhsEmailSelections = {}; // { categoryName: { emailId: boolean } }
let rhsCategorySelections = {}; // { categoryName: boolean }

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
  
  // Chat-mode quick actions: one compact chip row instead of two stacked
  // full-width buttons. Small, quiet, out of the way of the conversation.
  let chipRow = document.getElementById('chatQuickActions');
  if (!chipRow) {
    chipRow = document.createElement('div');
    chipRow.id = 'chatQuickActions';
    // Styled like the feature-selector bar (theme vars, not hardcoded white).
    chipRow.className = 'chat-quick-actions';
    const mkChip = (id, label, onClick) => {
      const chip = document.createElement('button');
      chip.id = id;
      chip.innerHTML = label;
      chip.className = 'chat-chip';
      chip.addEventListener('click', onClick);
      return chip;
    };
    chipRow.appendChild(mkChip('categorySuggestionTriggerBtn', '📂 Suggest categories', triggerCategorySuggestions));
    chipRow.appendChild(mkChip('responseTemplateTriggerBtn', '📝 Response templates', triggerResponseTemplateSuggestions));
    // Chips take the same slot the feature dropdown uses in Build mode:
    // the contextual bar directly above the composer.
    const inputArea = document.querySelector('.input-area');
    inputArea.parentNode.insertBefore(chipRow, inputArea);
  }
  chipRow.style.display = currentMode === 'chat' ? 'flex' : 'none';
}

async function triggerResponseTemplateSuggestions() {
  if (isGenerating) return;
  const selectedUser = requireSelectedUser('mining response templates');
  if (!selectedUser) return;

  setGenerating(true);
  showToast(`Analyzing ${selectedUser}'s sent replies for reusable templates...`, 'info');

  try {
    const response = await fetch('/api/response-template-suggestions', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ userEmail: selectedUser })
    });
    const data = await response.json();

    if (data.success) {
      if (Array.isArray(data.templates) && data.templates.length > 0) {
        showResponseTemplatePanel(data.templates);
        addMessage('assistant', `I analyzed ${data.debug?.repliesConsidered ?? 'your'} sent replies and found ${data.templates.length} response template${data.templates.length === 1 ? '' : 's'} you use repeatedly. Review and edit them in the panel, then save the ones you want to keep.`);
        showToast(`Found ${data.templates.length} response template${data.templates.length === 1 ? '' : 's'}`, 'success');
      } else {
        const considered = data.debug?.repliesConsidered ?? 0;
        showToast(`No repeated response patterns found (${considered} sent repl${considered === 1 ? 'y' : 'ies'} analyzed)`, 'info');
      }
    } else {
      showToast(data.error || 'Failed to surface response templates', 'error');
    }
  } catch (error) {
    console.error('Error surfacing response templates:', error);
    showToast('Failed to surface response templates', 'error');
  } finally {
    setGenerating(false);
  }
}

// Template review lives in the RHS panel (same workspace takeover as the
// category suggestions), keeping the white editable cards: checkbox +
// editable name/body per template, with the source replies each template was
// derived from. Save posts the checked (possibly edited) templates.
let responseTemplateReviewData = null;

function showResponseTemplatePanel(templates) {
  const panel = document.getElementById('rhsTemplatePanel');
  const list = document.getElementById('rhsTemplateList');
  if (!panel || !list) return;
  responseTemplateReviewData = templates;

  // Only one RHS takeover at a time: category suggestions yield the space.
  if (rhsPanel && rhsPanel.style.display !== 'none') closeRHSPanel();

  const info = document.getElementById('rhsTemplateInfo');
  const minedUser = String(selectedUserDropdown?.value || '').trim().toLowerCase();
  if (info) info.textContent = `${templates.length} reply pattern${templates.length === 1 ? '' : 's'} from ${minedUser || 'this user'}'s sent mail — edit, untick, then save.`;

  list.innerHTML = templates.map((tpl, i) => `
    <div style="background:#fff;color:#111827;border:1px solid #d0d5dd;border-radius:8px;padding:14px;margin-bottom:12px;">
      <label style="display:flex;align-items:center;gap:8px;margin-bottom:8px;">
        <input type="checkbox" class="tpl-include" data-idx="${i}" checked>
        <input type="text" class="tpl-name" data-idx="${i}" value="${escapeHtml(tpl.name || '')}" style="flex:1;font-weight:600;font-size:14px;padding:6px 8px;border:1px solid #d0d5dd;border-radius:6px;background:#fff;color:#111827;">
      </label>
      <div style="font-size:13px;color:#667085;margin-bottom:8px;"><strong>When to use:</strong> ${escapeHtml(tpl.whenToUse || '')}</div>
      <textarea class="tpl-body" data-idx="${i}" rows="7" style="width:100%;font-size:13px;font-family:inherit;padding:8px;border:1px solid #d0d5dd;border-radius:6px;box-sizing:border-box;background:#fff;color:#111827;">${escapeHtml(tpl.body || '')}</textarea>
      <details style="margin-top:6px;font-size:12px;color:#667085;">
        <summary style="cursor:pointer;">Based on ${(tpl.sourceEmailIds || []).length} of your replies</summary>
        ${(tpl.sourceExamples || []).map(src => `<div style="margin:4px 0 4px 12px;">&bull; <strong>${escapeHtml(src.subject || '(no subject)')}</strong> &mdash; ${escapeHtml(src.snippet || '')}</div>`).join('')}
      </details>
    </div>`).join('');

  panel.style.display = 'flex';
  document.querySelector('.main-content')?.classList.add('suggestions-expanded');
}

function closeResponseTemplatePanel() {
  const panel = document.getElementById('rhsTemplatePanel');
  if (panel) panel.style.display = 'none';
  responseTemplateReviewData = null;
  // Restore the normal layout unless the category panel still owns the space.
  if (!rhsPanel || rhsPanel.style.display === 'none') {
    document.querySelector('.main-content')?.classList.remove('suggestions-expanded');
  }
}

async function saveSelectedResponseTemplates() {
  const list = document.getElementById('rhsTemplateList');
  if (!list) return;
  const targetUser = requireSelectedUser('saving templates');
  if (!targetUser) return;

  const selected = [];
  list.querySelectorAll('.tpl-include').forEach(checkbox => {
    if (!checkbox.checked) return;
    const idx = Number(checkbox.dataset.idx);
    const source = responseTemplateReviewData?.[idx];
    if (!source) return;
    selected.push({
      ...source,
      name: list.querySelector(`.tpl-name[data-idx="${idx}"]`)?.value?.trim() || source.name,
      body: list.querySelector(`.tpl-body[data-idx="${idx}"]`)?.value ?? source.body
    });
  });

  if (!selected.length) {
    showToast('Tick at least one template to save', 'warning');
    return;
  }

  const saveBtn = document.getElementById('rhsTemplateSaveBtn');
  const originalHtml = saveBtn ? saveBtn.innerHTML : '';
  if (saveBtn) { saveBtn.disabled = true; saveBtn.innerHTML = '<span class="spinner"></span> Saving...'; }
  try {
    const response = await fetch('/api/response-templates/apply', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        userEmail: targetUser,
        templates: selected
      })
    });
    const data = await response.json();
    if (!data.success) throw new Error(data.error || 'Save failed');

    closeResponseTemplatePanel();
    const s = data.summary || {};
    showToast(`Saved: ${s.created || 0} new, ${s.updated || 0} updated (${s.total || 0} total)`, 'success');
    addMessage('assistant', `✅ **Response templates saved!** ${s.created || 0} new and ${s.updated || 0} updated — ${s.total || 0} total on file.`);
  } catch (error) {
    console.error('Error saving response templates:', error);
    showToast('Failed to save templates: ' + error.message, 'error');
  } finally {
    if (saveBtn) { saveBtn.disabled = false; saveBtn.innerHTML = originalHtml || '<span>✓</span> Save Selected'; }
  }
}

let availableUsers = [];
// Apply the ?userEmail= preselection only once, so later refreshes never
// clobber a user the operator picked manually in the dropdown.
let urlUserEmailApplied = false;
// True only when the target user came from an explicit source: the
// ?userEmail= handoff from the authenticated Gmail page, or the person
// changing the dropdown themselves. Without it, NO user is preselected --
// a silent default once served one user's mined sent mail to another.
let userSelectionDeliberate = false;
// Last deliberate choice, per browser: lets a plain refresh (no ?userEmail=
// handoff) restore this person's own previous selection instead of forcing a
// re-pick -- while still never guessing for a brand-new browser.
const USER_SELECTION_STORAGE_KEY = 'featureGeneratorSelectedUser';

// Returns the deliberately selected user email, or null (with a toast).
// Every data-reading flow must go through this instead of trusting
// whatever happens to be in the dropdown.
function requireSelectedUser(actionLabel = 'this action') {
  const value = String(selectedUserDropdown?.value || '').trim().toLowerCase();
  if (value && userSelectionDeliberate) return value;
  showToast(`Select which user's data to use (top of the page) before ${actionLabel}`, 'warning');
  return null;
}

async function refreshAvailableUsers() {
  if (!selectedUserDropdown) return;

  try {
    const resp = await fetch('/api/users');
    const data = await resp.json().catch(() => ({}));
    const users = Array.isArray(data?.users) ? data.users : [];
    availableUsers = users
      .map(u => String(u || '').trim().toLowerCase())
      .filter(Boolean);
  } catch (error) {
    console.error('Failed to load available users:', error);
  }

  if (!availableUsers.length) {
    availableUsers = Array.from(selectedUserDropdown.options).map(opt => String(opt.value || '').trim().toLowerCase()).filter(Boolean);
  }

  // Read the current selection only now, after the fetch: this function runs
  // concurrently on page init (DOMContentLoaded + chat-mode init), and a
  // snapshot taken before the await lets the slower call "restore" the static
  // HTML default over the ?userEmail= preselection the faster call applied.
  const previous = String(selectedUserDropdown.value || '').trim().toLowerCase();

  selectedUserDropdown.innerHTML = '';
  const placeholder = document.createElement('option');
  placeholder.value = '';
  placeholder.textContent = 'Select a user…';
  selectedUserDropdown.appendChild(placeholder);
  for (const email of availableUsers) {
    const option = document.createElement('option');
    option.value = email;
    option.textContent = email;
    selectedUserDropdown.appendChild(option);
  }

  const storedUser = String(localStorage.getItem(USER_SELECTION_STORAGE_KEY) || '').trim().toLowerCase();
  if (!urlUserEmailApplied && URL_USER_EMAIL && availableUsers.includes(URL_USER_EMAIL)) {
    // Opened from the Gmail page: preselect the user who was logged in
    // there -- it reflects an authenticated session, not a guess.
    selectedUserDropdown.value = URL_USER_EMAIL;
    urlUserEmailApplied = true;
    userSelectionDeliberate = true;
    localStorage.setItem(USER_SELECTION_STORAGE_KEY, URL_USER_EMAIL);
  } else if (userSelectionDeliberate && previous && availableUsers.includes(previous)) {
    selectedUserDropdown.value = previous;
  } else if (storedUser && availableUsers.includes(storedUser)) {
    // This browser previously made a deliberate choice (handoff or manual
    // pick) -- restore it so a plain refresh of the page doesn't demand
    // re-selection. Per-browser, so it restores THIS person's own choice.
    selectedUserDropdown.value = storedUser;
    userSelectionDeliberate = true;
  } else {
    // No trustworthy identity: force an explicit choice. Never fall back to
    // the first user in the list.
    selectedUserDropdown.value = '';
  }
}

// Format the just-fetched suggestions payload as a chat message, so the chat
// transcript shows what was proposed alongside the interactive RHS panel.
function formatCategorySuggestionsForChat(suggestions) {
  const categories = Array.isArray(suggestions?.categories) ? suggestions.categories : [];
  const lines = categories.map(cat => {
    const count = Array.isArray(cat.suggestedEmails) ? cat.suggestedEmails.length : 0;
    const desc = cat.description ? ` — ${cat.description}` : '';
    const kindNote = cat.kind === 'existing' ? ' _(add to existing category)_' : '';
    return `- **${cat.name}**${kindNote} (${count} email${count === 1 ? '' : 's'})${desc}`;
  });
  const newCount = categories.filter(cat => cat.kind !== 'existing').length;
  const existingCount = categories.length - newCount;
  const headParts = [];
  if (newCount) headParts.push(`${newCount} new categor${newCount === 1 ? 'y' : 'ies'}`);
  if (existingCount) headParts.push(`${existingCount} addition${existingCount === 1 ? '' : 's'} to existing categories`);
  return `📂 **Suggestions for "Other" emails: ${headParts.join(' and ')}**\n\n${lines.join('\n')}\n\nReview and approve in the panel on the right →`;
}

// One-line human summary of an apply response's summary block, shared by the
// RHS panel and the chat-confirmation approve paths.
function describeCategoryApplyResults(summary) {
  const s = summary || {};
  const parts = [];
  if (s.categoriesCreated) parts.push(`created ${s.categoriesCreated} new categor${s.categoriesCreated === 1 ? 'y' : 'ies'}`);
  if (s.categoriesUpdated) parts.push(`added ${s.emailsAddedToExisting || 0} email${(s.emailsAddedToExisting || 0) === 1 ? '' : 's'} to ${s.categoriesUpdated} existing categor${s.categoriesUpdated === 1 ? 'y' : 'ies'}`);
  parts.push(`moved ${s.emailsMoved || 0} email${(s.emailsMoved || 0) === 1 ? '' : 's'} in total`);
  return parts.join(', ');
}

// Trigger category suggestions: ask which pipeline variant to run first
function triggerCategorySuggestions() {
  if (isGenerating) return;
  showCategoryVariantChooser();
}

function showCategoryVariantChooser() {
  const existing = document.getElementById('categoryVariantChooser');
  if (existing) existing.remove();

  const overlay = document.createElement('div');
  overlay.id = 'categoryVariantChooser';
  overlay.style.cssText = 'position:fixed;inset:0;background:rgba(0,0,0,.45);z-index:10000;display:flex;align-items:center;justify-content:center;';
  overlay.innerHTML = `
    <div style="background:#fff;border-radius:12px;padding:24px;max-width:440px;width:90%;box-shadow:0 10px 40px rgba(0,0,0,.2);">
      <h3 style="margin:0 0 8px;">Suggest Categories for "Other"</h3>
      <p style="margin:0 0 16px;color:#555;font-size:14px;">Choose how categories should be discovered:</p>
      <button type="button" id="categoryVariantV1" style="display:block;width:100%;text-align:left;margin-bottom:10px;padding:12px 14px;border:1px solid #d0d5dd;border-radius:8px;background:#fff;cursor:pointer;">
        <strong>V1</strong> &mdash; single analysis pass<br>
        <span style="color:#667085;font-size:13px;">Faster: one model call proposes categories directly.</span>
      </button>
      <button type="button" id="categoryVariantV2" style="display:block;width:100%;text-align:left;margin-bottom:14px;padding:12px 14px;border:1px solid #d0d5dd;border-radius:8px;background:#fff;cursor:pointer;">
        <strong>V2</strong> &mdash; tag then consolidate<br>
        <span style="color:#667085;font-size:13px;">Slower: tags each email with its project/task first, for more specific categories.</span>
      </button>
      <button type="button" id="categoryVariantCancel" style="border:none;background:none;color:#667085;cursor:pointer;font-size:14px;padding:0;">Cancel</button>
    </div>`;
  document.body.appendChild(overlay);

  overlay.addEventListener('click', (e) => { if (e.target === overlay) overlay.remove(); });
  document.getElementById('categoryVariantCancel').onclick = () => overlay.remove();
  document.getElementById('categoryVariantV1').onclick = () => { overlay.remove(); runCategorySuggestions('v1'); };
  document.getElementById('categoryVariantV2').onclick = () => { overlay.remove(); runCategorySuggestions('v2'); };
}

async function runCategorySuggestions(variant) {
  if (isGenerating) return;

  const selectedUser = requireSelectedUser('suggesting categories');
  if (!selectedUser) return;

  setGenerating(true);
  showToast(`Analyzing ${selectedUser}'s "Other" emails...`, 'info');

  try {
    const response = await fetch('/api/category-suggestions', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        userEmail: selectedUser,
        variant
      })
    });
    
    const data = await response.json();
    
    if (data.success) {
      if (data.suggestions && data.suggestions.categories.length > 0) {
        console.log('📂 Category suggestions received:', data.suggestions);
        showRHSCategorySuggestionPanel(data.suggestions);
        addMessage('assistant', formatCategorySuggestionsForChat(data.suggestions));
        showToast(`Found ${data.suggestions.categories.length} category suggestions`, 'success');
      } else {
        console.log('📂 No suggestions -- diagnostic info:', data.debug);
        const d = data.debug;
        if (d && typeof d.otherEmailsFound === 'number') {
          // Other emails WERE found, but the AI proposed zero new categories
          // for them (e.g. everything already fits an existing category).
          showToast(`Found ${d.otherEmailsFound} "Other" emails, but no new categories were suggested for them`, 'info');
        } else {
          const detail = d
            ? ` (requested "${d.requestedUserEmail}", resolved to "${d.resolvedTargetUser}", loaded ${d.totalResponseEmailsLoaded} total emails)`
            : '';
          showToast(`No "Other" emails found to categorize${detail}`, 'info');
        }
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
  rhsCategorySelections = {};
  
  // Initialize all emails as selected by default
  for (const cat of suggestions.categories) {
    rhsCategorySelections[cat.name] = true;
    rhsEmailSelections[cat.name] = {};
    if (cat.suggestedEmails) {
      for (const email of cat.suggestedEmails) {
        rhsEmailSelections[cat.name][email.id] = true;
      }
    }
  }
  
  // Update panel info
  const totalEmails = suggestions.categories.reduce((sum, cat) => sum + (cat.suggestedEmails?.length || 0), 0);
  const newCount = suggestions.categories.filter(cat => cat.kind !== 'existing').length;
  const existingCount = suggestions.categories.length - newCount;
  const parts = [];
  if (newCount) parts.push(`${newCount} new categor${newCount === 1 ? 'y' : 'ies'}`);
  if (existingCount) parts.push(`${existingCount} existing categor${existingCount === 1 ? 'y' : 'ies'} to add to`);
  rhsPanelInfo.textContent = `${parts.join(', ')} — ${totalEmails} emails from "Other"`;
  
  // Generate tabs
  generateRHSTabs(suggestions.categories);
  
  // Generate panels
  generateRHSPanels(suggestions.categories);
  
  // Update selected count
  updateRHSSelectedCount();
  
  // Show the panel expanded across the whole workspace (chat column hides
  // via .suggestions-expanded and comes back when the panel closes)
  // Only one RHS takeover at a time: the template panel yields the space.
  closeResponseTemplatePanel();
  rhsPanel.style.display = 'flex';
  document.querySelector('.main-content')?.classList.add('suggestions-expanded');

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
      <input type="checkbox" class="rhs-category-enable-checkbox" data-category="${escapeHtml(cat.name)}" ${rhsCategorySelections[cat.name] ? 'checked' : ''}>
      <span class="tab-name">${escapeHtml(cat.name)}</span>
      ${cat.kind === 'existing' ? '<span class="tab-kind-badge existing" title="Adds emails to a category you already have">existing</span>' : '<span class="tab-kind-badge new" title="Creates a new category">new</span>'}
      <span class="tab-count">${cat.suggestedEmails?.length || 0}</span>
    `;
    
    tab.addEventListener('click', (e) => {
      if (e.target && e.target.classList.contains('rhs-category-enable-checkbox')) return;
      activateRHSTab(index);
    });
    // The tab checkbox is the sole include/exclude control for the category:
    // update the selection state and grey out the panel's email list.
    tab.querySelector('.rhs-category-enable-checkbox').addEventListener('change', (e) => {
      const enabled = e.target.checked;
      rhsCategorySelections[cat.name] = enabled;
      syncCategorySelectionUI(cat.name, enabled);
      updateRHSSelectedCount();
    });
    rhsCategoryTabs.appendChild(tab);
  });
}

// Generate category panels for RHS panel
function generateRHSPanels(categories) {
  rhsCategoryPanels.innerHTML = '';
  
  categories.forEach((cat, index) => {
    const panel = document.createElement('div');
    panel.className = `rhs-category-tab-panel ${index === 0 ? 'active' : ''}`;
    panel.dataset.index = index;
    panel.dataset.category = cat.name;
    
    panel.innerHTML = `
      <div class="rhs-category-info">
        ${cat.kind === 'existing' ? '<div class="rhs-category-existing-note">➕ These emails would be <strong>added to your existing category</strong> — no new category will be created, and its guideline/summary stay unchanged.</div>' : ''}
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
      const panel = rhsCategoryPanels.querySelector(`.rhs-category-tab-panel[data-category="${categoryName}"]`);
      const checkboxes = panel.querySelectorAll('.rhs-email-select-checkbox');
      
      checkboxes.forEach(cb => {
        cb.checked = selectAll.checked;
        rhsEmailSelections[categoryName][cb.dataset.emailId] = selectAll.checked;
      });
      
      updateRHSCategorySelectedCount(categoryName);
      updateRHSSelectedCount();
    });
  });

  const categoryCheckboxes = rhsCategoryPanels.querySelectorAll('.rhs-category-enable-checkbox');
  categoryCheckboxes.forEach(checkbox => {
    checkbox.addEventListener('change', () => {
      const categoryName = checkbox.dataset.category;
      const enabled = checkbox.checked;
      rhsCategorySelections[categoryName] = enabled;
      syncCategorySelectionUI(categoryName, enabled);
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
  const panels = rhsCategoryPanels.querySelectorAll('.rhs-category-tab-panel');
  
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
  for (const [categoryName, emailSelections] of Object.entries(rhsEmailSelections)) {
    if (rhsCategorySelections[categoryName] === false) continue;
    totalSelected += Object.values(emailSelections).filter(v => v).length;
  }
  selectedEmailCount.textContent = totalSelected;
  
  // Update approve button state
  rhsApproveBtn.disabled = totalSelected === 0;
}

// Show email thread in RHS panel
// Fallback snippet-only render (used when the real thread fetch fails or
// while it's loading) -- this is today's original behavior.
function renderRHSThreadSnippetFallback(email) {
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
}

const RHS_THREAD_AVATAR_COLORS = ['#6366f1', '#10b981', '#f59e0b', '#ef4444', '#a855f7', '#06b6d4'];
function rhsThreadAvatarColorFor(name) {
  const str = String(name || '').trim();
  let hash = 0;
  for (let i = 0; i < str.length; i++) hash = (hash * 31 + str.charCodeAt(i)) >>> 0;
  return RHS_THREAD_AVATAR_COLORS[hash % RHS_THREAD_AVATAR_COLORS.length];
}
function rhsThreadSnippetFor(body) {
  const plain = String(body || '').replace(/<[^>]*>/g, ' ').replace(/\s+/g, ' ').trim();
  return plain.length > 140 ? plain.slice(0, 140) + '…' : plain;
}
function toggleRHSThreadMsg(el) {
  const wrapper = el.closest('.rhs-thread-msg-wrapper');
  if (!wrapper) return;
  const expanded = wrapper.classList.contains('expanded');
  wrapper.classList.toggle('expanded', !expanded);
  wrapper.classList.toggle('collapsed', expanded);
}

// Real multi-message thread render, Gmail-style: chronological order, only the
// newest message expanded by default, earlier ones collapsed to a one-line
// row that expands on click.
function renderRHSThreadMessages(subject, messages, source) {
  document.getElementById('rhsThreadSubject').textContent = subject || 'No Subject';

  const sorted = (Array.isArray(messages) ? messages.slice() : []).sort((a, b) => new Date(a.date) - new Date(b.date));
  const lastIdx = sorted.length - 1;
  const previewNotice = (source === 'synthesized')
    ? '<div class="rhs-thread-preview-notice">Preview only -- full thread not on file for this email.</div>'
    : '';

  const cards = sorted.map((m, idx) => {
    const senderName = (m.from || 'Unknown Sender').split('<')[0].trim() || 'Unknown Sender';
    const initial = senderName.charAt(0).toUpperCase() || '?';
    const avatarColor = rhsThreadAvatarColorFor(senderName);
    const fromSafe = escapeHtml(senderName);
    const snippetSafe = escapeHtml(rhsThreadSnippetFor(m.body));
    const bodyHtml = m.body != null ? String(m.body) : '';
    const isExpanded = idx === lastIdx;
    const badge = m.isResponse ? '<span class="rhs-thread-msg-badge">Your Response</span>' : '';

    return `
      <div class="rhs-thread-msg-wrapper ${isExpanded ? 'expanded' : 'collapsed'}">
        <div class="rhs-thread-msg-collapsed-row" onclick="toggleRHSThreadMsg(this)">
          <div class="rhs-thread-msg-avatar" style="background:${avatarColor};">${initial}</div>
          <div class="rhs-thread-msg-collapsed-from">${fromSafe}</div>
          <div class="rhs-thread-msg-collapsed-snippet">${snippetSafe}</div>
          <div class="rhs-thread-msg-collapsed-date">${new Date(m.date).toLocaleDateString()}</div>
        </div>
        <div class="rhs-thread-msg-card">
          <div class="rhs-thread-msg-header" onclick="toggleRHSThreadMsg(this)">
            <div class="rhs-thread-msg-from">${fromSafe} ${badge}</div>
            <div class="rhs-thread-msg-date">${new Date(m.date).toLocaleString()}</div>
          </div>
          <div class="rhs-thread-msg-body">${bodyHtml}</div>
        </div>
      </div>
    `;
  }).join('');

  document.getElementById('rhsThreadContent').innerHTML = `
    ${previewNotice}
    ${cards || '<div class="rhs-no-emails">No messages found.</div>'}
  `;
}

async function showRHSEmailThread(emailId) {
  // Find the suggested email as a fallback source (snippet/reason) in case the fetch fails.
  let email = null;
  for (const cat of rhsCategorySuggestions.categories) {
    if (cat.suggestedEmails) {
      email = cat.suggestedEmails.find(e => e.id === emailId);
      if (email) break;
    }
  }
  if (!email) return;

  // Loading state
  document.getElementById('rhsThreadSubject').textContent = email.subject || 'No Subject';
  document.getElementById('rhsThreadContent').innerHTML = '<div class="rhs-thread-loading">Loading thread...</div>';
  rhsThreadViewer.style.display = 'block';

  try {
    const userEmail = selectedUserDropdown ? selectedUserDropdown.value : '';
    const resp = await fetch(`/api/email-thread-preview/${encodeURIComponent(emailId)}?userEmail=${encodeURIComponent(userEmail)}`);
    const data = await resp.json().catch(() => ({}));

    if (resp.ok && data && data.success && Array.isArray(data.messages) && data.messages.length) {
      renderRHSThreadMessages(data.subject || email.subject, data.messages, data.source);
    } else {
      renderRHSThreadSnippetFallback(email);
    }
  } catch (error) {
    console.error('Failed to load thread preview:', error);
    renderRHSThreadSnippetFallback(email);
  }
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
  const approveTargetUser = requireSelectedUser('applying category changes');
  if (!approveTargetUser) return;
  
  // Build final suggestions with selected emails only
  const finalSuggestions = {
    action: 'createCategories',
    categories: rhsCategorySuggestions.categories
      .filter(cat => rhsCategorySelections[cat.name] !== false)
      .map(cat => ({
        ...cat,
        selectedEmails: Object.entries(rhsEmailSelections[cat.name] || {})
          .filter(([id, selected]) => selected)
          .map(([id]) => id)
      }))
      .filter(cat => cat.selectedEmails.length > 0)
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
      const summaryText = describeCategoryApplyResults(data.summary);
      showToast(`Done: ${summaryText}`, 'success');

      // Add success message to chat
      addMessage('assistant', `✅ **Category suggestions applied!**\n\n${summaryText.charAt(0).toUpperCase()}${summaryText.slice(1)}.`);
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

// Close RHS panel (restores the normal chat layout)
function closeRHSPanel() {
  rhsPanel.style.display = 'none';
  document.querySelector('.main-content')?.classList.remove('suggestions-expanded');
  rhsCategorySuggestions = null;
  rhsEmailSelections = {};
  rhsCategorySelections = {};
}

// Update the existing setMode function to show/hide category suggestion trigger
const originalSetMode = setMode;
setMode = function(mode) {
  originalSetMode(mode);

  // Leaving chat while an expanded RHS panel is open would strand a blank
  // workspace -- close them so the normal layout is restored first.
  if (mode !== 'chat' && rhsPanel && rhsPanel.style.display !== 'none') {
    closeRHSPanel();
  }
  if (mode !== 'chat') {
    const templatePanel = document.getElementById('rhsTemplatePanel');
    if (templatePanel && templatePanel.style.display !== 'none') {
      closeResponseTemplatePanel();
    }
  }

  // Quick-action chips live in one row; the row itself is what toggles.
  if (mode === 'chat') {
    setTimeout(() => addCategorySuggestionTrigger(), 100);
  } else {
    const chipRow = document.getElementById('chatQuickActions');
    if (chipRow) chipRow.style.display = 'none';
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
