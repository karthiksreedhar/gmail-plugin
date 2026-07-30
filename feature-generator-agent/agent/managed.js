/**
 * Managed Agents integration for the Feature Generator.
 *
 * Replaces the local multi-call generation pipeline with an Anthropic-hosted
 * agent session: the agent runs in a sandboxed container, writes finished
 * feature files to /mnt/session/outputs/, and we download them when the turn
 * completes. Enabled only when FEATURE_AGENT_ID and FEATURE_AGENT_ENV_ID are
 * set (see scripts/setup-managed-agent.js); otherwise server.js falls back to
 * the legacy FeatureGeneratorAgent pipeline untouched.
 *
 * Serverless-friendly by design: a turn is started with one short call
 * (startTurn) and later resumed with short polling calls (pollTurn) -- the
 * agent keeps running on Anthropic's side between our invocations, so no
 * single serverless invocation has to outlive the generation.
 */

require('dotenv').config();
const { Anthropic } = require('@anthropic-ai/sdk');

const MANAGED_BETA = 'managed-agents-2026-04-01';

// Only these files may flow from the sandbox into a feature. Anything else
// the agent writes to outputs (scratch, logs) is ignored.
const ALLOWED_FILES = new Set(['manifest.json', 'backend.js', 'frontend.js', 'README.md']);
const MAX_FILE_BYTES = 1024 * 1024; // 1 MB per file is far beyond any sane feature file

let cachedClient = null;

function getClient() {
  if (!cachedClient) {
    cachedClient = new Anthropic(); // resolves ANTHROPIC_API_KEY from env
  }
  return cachedClient;
}

function getManagedConfig() {
  return {
    agentId: String(process.env.FEATURE_AGENT_ID || '').trim(),
    environmentId: String(process.env.FEATURE_AGENT_ENV_ID || '').trim()
  };
}

function isManagedAgentEnabled() {
  const { agentId, environmentId } = getManagedConfig();
  return Boolean(agentId && environmentId && String(process.env.ANTHROPIC_API_KEY || '').trim());
}

/**
 * Read-only reference mount of the main codebase, so the agent can inspect
 * the real DOM structure / featureContext instead of guessing or asking the
 * user. Reuses the PR-workflow token conventions; FEATURE_AGENT_REPO_TOKEN
 * overrides if a dedicated read-only token is preferred. Returns null when no
 * token is configured (sessions then run without the mount, as before).
 */
function buildRepoResource() {
  const token = String(process.env.FEATURE_AGENT_REPO_TOKEN || process.env.GH_FINE_GRAINED_TOKEN || '').trim();
  if (!token) return null;
  const owner = String(process.env.GITHUB_REPO_OWNER || 'karthiksreedhar').trim();
  const name = String(process.env.GITHUB_REPO_NAME || 'gmail-plugin').trim();
  const branch = String(process.env.GITHUB_BASE_BRANCH || 'main').trim();
  return {
    type: 'github_repository',
    url: `https://github.com/${owner}/${name}`,
    authorization_token: token,
    mount_path: '/workspace/gmail-plugin',
    checkout: { type: 'branch', name: branch }
  };
}

/**
 * Render the session's current files into a text block the agent can treat
 * as the authoritative current state (used when a feature is loaded into a
 * session whose remote agent hasn't seen those files yet).
 */
function renderCurrentFilesBlock(files, featureId) {
  const parts = [
    `The session already contains an existing feature${featureId ? ` (ID: \`${featureId}\`)` : ''}. ` +
    'Treat the files below as the CURRENT state of the feature. When asked to modify it, ' +
    'rewrite the complete updated file(s) to /mnt/session/outputs/ under the same names. ' +
    'Do not invent a new feature ID.'
  ];
  for (const [name, content] of Object.entries(files || {})) {
    if (typeof content !== 'string') continue;
    parts.push(`--- ${name} ---\n${content}\n--- end ${name} ---`);
  }
  return parts.join('\n\n');
}

/**
 * Ensure the local session has a live remote Managed Agents session.
 * Returns { anthropicSessionId, isNewRemote }.
 */
async function ensureRemoteSession(session) {
  const client = getClient();
  const { agentId, environmentId } = getManagedConfig();

  if (session.anthropicSessionId) {
    try {
      const remote = await client.beta.sessions.retrieve(session.anthropicSessionId);
      if (remote && remote.status !== 'terminated') {
        return { anthropicSessionId: session.anthropicSessionId, isNewRemote: false };
      }
      console.warn(`Remote session ${session.anthropicSessionId} is terminated; creating a fresh one`);
    } catch (error) {
      console.warn(`Remote session ${session.anthropicSessionId} unusable (${error.message}); creating a fresh one`);
    }
    session.anthropicSessionId = null;
  }

  const baseParams = {
    agent: agentId,
    environment_id: environmentId,
    title: `feature-generator ${session.id}`
  };

  let remote;
  const repoResource = buildRepoResource();
  if (repoResource) {
    // Session creation blocks until resources mount, so a bad/expired token
    // or missing Contents:Read permission surfaces here. Never let the
    // reference mount break generation -- fall back to a mount-less session.
    try {
      remote = await client.beta.sessions.create({ ...baseParams, resources: [repoResource] });
      // Note: a clone that fails later (bad repo/token) degrades gracefully --
      // the session runs without the mount rather than erroring.
      console.log(`📚 Attached repo resource ${repoResource.url} (${repoResource.checkout.name}) at ${repoResource.mount_path}`);
    } catch (error) {
      console.warn(`Repo mount failed (${error.message}); creating session without the reference codebase`);
    }
  }
  if (!remote) {
    remote = await client.beta.sessions.create(baseParams);
  }

  session.anthropicSessionId = remote.id;
  console.log(`🧠 Created Managed Agents session ${remote.id} for local session ${session.id}`);
  return { anthropicSessionId: remote.id, isNewRemote: true };
}

/** Count the events currently on the remote session (turn cursor baseline). */
async function countEvents(anthropicSessionId) {
  const client = getClient();
  let count = 0;
  for await (const _event of client.beta.sessions.events.list(anthropicSessionId)) {
    count += 1;
  }
  return count;
}

/**
 * Kick off a generation/refinement turn. Fast: creates the remote session if
 * needed, sends one user.message, and records a cursor so pollTurn can tell
 * which events belong to this turn. The heavy agentic work happens on
 * Anthropic's side after this returns.
 */
async function startTurn(session, message) {
  const client = getClient();
  const { anthropicSessionId, isNewRemote } = await ensureRemoteSession(session);

  const pieces = [];
  // If the remote agent hasn't seen the session's current files (fresh remote
  // session, or a feature was loaded/auto-loaded after the session started),
  // inject them so refinements operate on the real current state.
  const needsFileSync = (isNewRemote || session.managedNeedsFileSync) &&
    session.generatedFiles && Object.keys(session.generatedFiles).length > 0;
  if (needsFileSync) {
    pieces.push(renderCurrentFilesBlock(session.generatedFiles, session.featureId));
  }
  pieces.push(message);

  const cursor = await countEvents(anthropicSessionId);

  await client.beta.sessions.events.send(anthropicSessionId, {
    events: [{
      type: 'user.message',
      content: [{ type: 'text', text: pieces.join('\n\n') }]
    }]
  });

  session.managedNeedsFileSync = false;
  session.managedTurn = {
    cursor,
    message: String(message).slice(0, 2000),
    isRefinement: !!(session.generatedFiles && Object.keys(session.generatedFiles).length > 0),
    startedAt: Date.now(),
    status: 'running'
  };
  return session.managedTurn;
}

/**
 * Human-readable label for an agent.tool_use event, so the frontend can show
 * what Claude Code is doing right now ("Writing backend.js", "Searching the
 * codebase", ...). Field names on tool inputs are read defensively -- an
 * unrecognized tool still yields a generic but truthful label.
 */
function describeToolUse(event) {
  const name = String(event.name || '').toLowerCase();
  const input = (event.input && typeof event.input === 'object') ? event.input : {};
  const rawPath = String(input.file_path || input.path || input.filename || '');
  const fileName = rawPath ? rawPath.replace(/^.*\//, '') : '';

  switch (name) {
    case 'write':
      return fileName ? `Writing ${fileName}` : 'Writing a file';
    case 'edit':
      return fileName ? `Editing ${fileName}` : 'Editing a file';
    case 'read':
      return fileName ? `Reading ${fileName}` : 'Reading files';
    case 'bash': {
      const command = String(input.command || '').trim().split('\n')[0];
      return command ? `Running: ${command.slice(0, 60)}${command.length > 60 ? '…' : ''}` : 'Running a command';
    }
    case 'glob':
    case 'grep':
      return 'Searching the reference codebase';
    case 'ls':
      return 'Listing files';
    default:
      return name ? `Using tool: ${event.name}` : 'Working';
  }
}

/**
 * Summarize what has happened so far in an in-flight turn, for display in the
 * UI's loading bubble. Returns a small serializable object.
 */
function describeTurnProgress(turnEvents, turn) {
  const activities = [];
  let lastMessage = '';

  for (const event of turnEvents) {
    if (event.type === 'agent.tool_use') {
      activities.push(describeToolUse(event));
    } else if (event.type === 'agent.message') {
      const text = eventText(event).trim();
      if (text) lastMessage = text;
    }
  }

  // Collapse consecutive duplicates ("Searching..." x4 reads as noise).
  const recent = [];
  for (const label of activities) {
    if (recent[recent.length - 1] !== label) recent.push(label);
  }

  return {
    elapsedMs: Date.now() - (turn.startedAt || Date.now()),
    toolUseCount: activities.length,
    currentActivity: recent[recent.length - 1] || (turn.isRefinement ? 'Reviewing the existing feature files' : 'Planning the feature'),
    recentActivities: recent.slice(-5),
    lastMessage: lastMessage.slice(0, 300)
  };
}

/** Extract text from an agent.message event's content blocks. */
function eventText(event) {
  if (!Array.isArray(event.content)) return '';
  return event.content
    .filter(block => block && block.type === 'text' && typeof block.text === 'string')
    .map(block => block.text)
    .join('\n');
}

/**
 * Download feature files the session has produced. Files accumulate across
 * turns; when the same filename was captured more than once, the newest wins.
 * Returns { files, newestByName } where files maps filename -> content.
 */
async function downloadSessionFiles(anthropicSessionId) {
  const client = getClient();
  const newestByName = new Map(); // filename -> { id, created_at }

  for await (const f of client.beta.files.list({ scope_id: anthropicSessionId, betas: [MANAGED_BETA] })) {
    const name = String(f.filename || '').replace(/^.*\//, '');
    if (!ALLOWED_FILES.has(name)) continue;
    if (Number(f.size_bytes || 0) > MAX_FILE_BYTES) {
      console.warn(`Skipping oversized session output ${name} (${f.size_bytes} bytes)`);
      continue;
    }
    const createdAt = Date.parse(f.created_at || '') || 0;
    const existing = newestByName.get(name);
    if (!existing || createdAt >= existing.createdAt) {
      newestByName.set(name, { id: f.id, createdAt });
    }
  }

  const files = {};
  for (const [name, meta] of newestByName.entries()) {
    const resp = await client.beta.files.download(meta.id);
    files[name] = await resp.text();
  }
  return { files, newestByName };
}

const sleep = ms => new Promise(resolve => setTimeout(resolve, ms));

/**
 * Check whether the turn recorded in session.managedTurn has finished.
 *
 * Returns one of:
 *   { done: false, status, progress }                  — still running
 *   { done: true, error }                              — turn failed
 *   { done: true, responseText, files, updatedFiles }  — turn finished
 *     files: full newest file set from the session (may be empty when the
 *            agent only answered with text, e.g. a clarifying question)
 *     updatedFiles: names written during THIS turn
 */
async function pollTurn(session) {
  const client = getClient();
  const turn = session.managedTurn;
  if (!turn || !session.anthropicSessionId) {
    return { done: true, error: 'No generation is in progress for this session.' };
  }

  const anthropicSessionId = session.anthropicSessionId;
  const remote = await client.beta.sessions.retrieve(anthropicSessionId);

  const turnEvents = [];
  let index = 0;
  for await (const event of client.beta.sessions.events.list(anthropicSessionId)) {
    if (index >= turn.cursor) turnEvents.push(event);
    index += 1;
  }

  const terminated = remote.status === 'terminated' ||
    turnEvents.some(e => e.type === 'session.status_terminated');
  if (terminated) {
    const errorEvent = turnEvents.find(e => e.type === 'session.error');
    const detail = errorEvent?.error?.message || errorEvent?.message || 'the agent session terminated unexpectedly';
    return { done: true, error: `Generation failed: ${detail}. Start a new session and try again.` };
  }

  const idleEvent = turnEvents.find(e => e.type === 'session.status_idle');
  if (!idleEvent) {
    return { done: false, status: remote.status, progress: describeTurnProgress(turnEvents, turn) };
  }

  if (idleEvent.stop_reason && idleEvent.stop_reason.type === 'requires_action') {
    // Shouldn't happen (no custom tools, permissions always_allow) -- but if
    // it does, surface it instead of polling forever.
    return { done: true, error: 'The agent is waiting on an action this app does not support. Start a new session and try again.' };
  }

  const responseText = turnEvents
    .filter(e => e.type === 'agent.message')
    .map(eventText)
    .filter(Boolean)
    .join('\n\n')
    .trim();

  // The agent used file tools this turn iff it intended to produce/update
  // files; give the Files API a moment to index fresh outputs.
  let { files, newestByName } = await downloadSessionFiles(anthropicSessionId);
  const wroteThisTurn = () => Array.from(newestByName.values())
    .some(meta => meta.createdAt >= turn.startedAt - 5000);
  const usedWriteTools = turnEvents.some(e =>
    e.type === 'agent.tool_use' && ['write', 'edit', 'bash'].includes(e.name));
  if (usedWriteTools && !wroteThisTurn()) {
    await sleep(2500);
    ({ files, newestByName } = await downloadSessionFiles(anthropicSessionId));
  }

  const updatedFiles = Array.from(newestByName.entries())
    .filter(([, meta]) => meta.createdAt >= turn.startedAt - 5000)
    .map(([name]) => name);

  return { done: true, responseText, files, updatedFiles };
}

/** Best-effort remote cleanup when a local session is deleted. */
async function deleteRemoteSession(anthropicSessionId) {
  if (!anthropicSessionId) return;
  try {
    await getClient().beta.sessions.delete(anthropicSessionId);
    console.log(`🧹 Deleted remote session ${anthropicSessionId}`);
  } catch (error) {
    console.warn(`Could not delete remote session ${anthropicSessionId}:`, error.message);
  }
}

module.exports = {
  isManagedAgentEnabled,
  startTurn,
  pollTurn,
  deleteRemoteSession
};
