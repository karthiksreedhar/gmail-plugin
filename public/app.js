/**
         * EMAIL ASSISTANT FEATURE API
         * Provides utilities for custom features to integrate with the UI
         */
        window.EmailAssistant = {
            // Core data access
            getEmails: () => allEmails || [],
            getCurrentFilter: () => currentFilter,
            getCurrentUser: () => getActualCurrentUserEmail(),
            
            // UI manipulation
            addHeaderButton(label, handler, options = {}) {
                const container = document.getElementById('feature-header-actions');
                if (!container) return null;
                
                const btn = document.createElement('button');
                btn.className = options.className || 'generate-btn';
                btn.textContent = label;
                btn.onclick = handler;
                if (options.style) Object.assign(btn.style, options.style);
                
                container.appendChild(btn);
                return btn;
            },
            
            addEmailAction(name, handler) {
                // Store action for use when rendering email items
                if (!window._featureEmailActions) window._featureEmailActions = [];
                window._featureEmailActions.push({ name, handler });
            },
            
            showModal(content, title = 'Feature Modal') {
                const container = document.getElementById('feature-modals');
                if (!container) return;
                
                const modal = document.createElement('div');
                modal.className = 'modal';
                modal.style.display = 'block';
                modal.innerHTML = `
                    <div class="modal-content">
                        <div class="modal-header">
                            <h2 class="modal-title">${title}</h2>
                            <button class="close" onclick="this.closest('.modal').remove()">&times;</button>
                        </div>
                        <div style="padding: 20px;">
                            ${content}
                        </div>
                    </div>
                `;
                container.appendChild(modal);
                
                // Close on background click
                modal.addEventListener('click', (e) => {
                    if (e.target === modal) modal.remove();
                });
                
                return modal;
            },
            
            // API helpers
            async apiCall(endpoint, options = {}) {
                const response = await fetch(endpoint, {
                    method: options.method || 'GET',
                    headers: {
                        'Content-Type': 'application/json',
                        ...(options.headers || {})
                    },
                    body: options.body ? JSON.stringify(options.body) : undefined
                });
                return response.json();
            },
            
            // Event system
            on(event, handler) {
                if (!window._featureEventHandlers) window._featureEventHandlers = {};
                if (!window._featureEventHandlers[event]) window._featureEventHandlers[event] = [];
                window._featureEventHandlers[event].push(handler);
            },
            
            trigger(event, data) {
                if (!window._featureEventHandlers || !window._featureEventHandlers[event]) return;
                window._featureEventHandlers[event].forEach(handler => {
                    try { handler(data); } catch (e) { console.error('Feature event handler error:', e); }
                });
            },
            
            // Utility functions
            showSuccess: (msg) => showSuccessPopup(msg, 'Success'),
            showError: (msg) => showErrorPopup(msg, 'Error'),
            showConfirm: (msg, onConfirm) => showConfirmPopup(msg, onConfirm),
            
            // Re-export useful existing functions
            loadEmails,
            displayEmails,
            filterByCategory,
            openEmailThread
        };

        function getActualCurrentUserEmail() {
            const el = document.getElementById('currentUser');
            return String(el?.dataset?.actualEmail || el?.textContent || '').trim();
        }

        function getDisplayEmailForHeader(email) {
            const normalized = String(email || '').trim().toLowerCase();
            if (normalized === 'ks4190@columbia.edu') return 'video@gmail.com';
            return String(email || '').trim();
        }

        function setCurrentUserHeader(email) {
            const el = document.getElementById('currentUser');
            if (!el) return;
            const actual = String(email || '').trim();
            el.dataset.actualEmail = actual;
            el.textContent = getDisplayEmailForHeader(actual);
        }
        
        /**
         * FEATURE LOADER
         * Dynamically loads frontend scripts for installed features
         */
        const loadedFeatureScriptIds = new Set();

        async function loadFeatures() {
            try {
                const response = await fetch('/api/features');
                const data = await response.json();
                
                if (!data.success || !data.features || data.features.length === 0) {
                    console.log('No features to load');
                    return;
                }
                
                console.log(`Loading ${data.features.length} feature(s)`);
                
                for (const feature of data.features) {
                    try {
                        if (loadedFeatureScriptIds.has(feature.id)) {
                            continue;
                        }
                        // Check if feature has frontend component
                        const scriptPath = `/data/features/${feature.id}/frontend.js`;
                        const script = document.createElement('script');
                        script.src = scriptPath;
                        script.onerror = () => {
                            console.log(`No frontend script for feature: ${feature.name}`);
                        };
                        script.onload = () => {
                            loadedFeatureScriptIds.add(feature.id);
                            console.log(`✓ Loaded frontend for feature: ${feature.name}`);
                            // Trigger feature loaded event
                            window.EmailAssistant.trigger('featureLoaded', feature);
                        };
                        document.head.appendChild(script);
                    } catch (error) {
                        console.error(`Failed to load feature ${feature.name}:`, error);
                    }
                }
            } catch (error) {
                console.error('Failed to load features:', error);
            }
        }

        let resolvedFeatureGeneratorUrl = null;

        async function getFeatureGeneratorUrl() {
            if (resolvedFeatureGeneratorUrl) return resolvedFeatureGeneratorUrl;
            try {
                const resp = await fetch('/api/config/feature-generator-url');
                const data = await resp.json();
                if (resp.ok && data && data.success && data.url) {
                    resolvedFeatureGeneratorUrl = String(data.url).trim();
                    return resolvedFeatureGeneratorUrl;
                }
            } catch (_) {}

            const configuredUrl = localStorage.getItem('featureGeneratorUrl');
            if (configuredUrl) {
                resolvedFeatureGeneratorUrl = configuredUrl;
                return resolvedFeatureGeneratorUrl;
            }

            resolvedFeatureGeneratorUrl = 'http://localhost:5000';
            return resolvedFeatureGeneratorUrl;
        }

        async function openFeatureGenerator() {
            try {
                const targetUrl = await getFeatureGeneratorUrl();
                const currentUserEmail = getActualCurrentUserEmail().toLowerCase();
                const url = new URL(targetUrl);
                if (currentUserEmail && currentUserEmail.includes('@')) {
                    url.searchParams.set('userEmail', currentUserEmail);
                }
                window.open(url.toString(), '_blank', 'noopener');
            } catch (error) {
                console.error('Failed to open feature generator:', error);
            }
        }

        function featureStatusLabel(feature) {
            if (feature.deploymentStatus && feature.deploymentStatus !== 'deployed') {
                return feature.deploymentStatus;
            }
            return feature.status || 'unknown';
        }

        function featureStatusColor(feature) {
            const status = featureStatusLabel(feature);
            if (status === 'deployed') return '#137333';
            if (status === 'pr_open' || status === 'pr_requested' || status === 'approval_requested') return '#1a73e8';
            if (status === 'deploying' || status === 'pr_merged' || status === 'merge_in_progress') return '#b06000';
            if (status === 'missing_code') return '#b3261e';
            if (status === 'deploy_failed' || status === 'error') return '#b3261e';
            return '#5f6368';
        }

        function formatFeatureSectionTitle(key) {
            if (key === 'available') return 'Available';
            if (key === 'awaiting') return 'Awaiting Review';
            if (key === 'deploying') return 'Deploying';
            if (key === 'hidden') return 'Hidden';
            return 'Other';
        }

        function classifyFeatureSection(feature) {
            if (feature.status !== 'deployed' || feature.deploymentStatus !== 'deployed') {
                if (feature.status === 'pr_open' || feature.status === 'pr_requested' || feature.status === 'approval_requested' || feature.status === 'draft') {
                    return 'awaiting';
                }
                if (feature.status === 'merge_in_progress' || feature.status === 'pr_merged' || feature.deploymentStatus === 'deploying' || feature.status === 'deploying') {
                    return 'deploying';
                }
                return 'other';
            }
            return feature.preferences && feature.preferences.visible === false ? 'hidden' : 'available';
        }

        async function fetchFeatureRegistry() {
            const response = await fetch('/api/feature-registry');
            const data = await response.json();
            if (!response.ok || !data.success) {
                throw new Error(data.error || 'Failed to load feature registry');
            }
            return data.features || [];
        }

        const FEATURE_DEMO_AUTHOR = 'ks4190@columbia.edu';
        let featureRegistryOwnerFilter = 'demos'; // 'demos' | 'user_created'

        function applyFeatureOwnerFilter(features) {
            const list = Array.isArray(features) ? features : [];
            if (featureRegistryOwnerFilter === 'demos') {
                return list.filter(feature => String(feature?.createdBy || '').trim().toLowerCase() === FEATURE_DEMO_AUTHOR);
            }
            return list.filter(feature => String(feature?.createdBy || '').trim().toLowerCase() !== FEATURE_DEMO_AUTHOR);
        }

        function renderFeatureRegistry(root, features) {
            const filteredFeatures = applyFeatureOwnerFilter(features);
            const sections = { available: [], awaiting: [], deploying: [], hidden: [], other: [] };
            filteredFeatures.forEach(feature => {
                sections[classifyFeatureSection(feature)].push(feature);
            });

            const controlsHtml = `
                <div style="display:flex; align-items:center; justify-content:space-between; gap:12px; margin-bottom:16px; padding:12px; border:1px solid #e0e0e0; border-radius:10px; background:#fff;">
                    <div style="font-size:13px; color:#5f6368;">Filter by feature owner</div>
                    <div style="display:flex; gap:8px;">
                        <button type="button" data-feature-owner-filter="demos" style="border:1px solid ${featureRegistryOwnerFilter === 'demos' ? '#1a73e8' : '#dadce0'}; background:${featureRegistryOwnerFilter === 'demos' ? '#e8f0fe' : '#fff'}; color:${featureRegistryOwnerFilter === 'demos' ? '#1a73e8' : '#202124'}; border-radius:16px; padding:6px 12px; font-size:13px; cursor:pointer; font-weight:600;">Demos</button>
                        <button type="button" data-feature-owner-filter="user_created" style="border:1px solid ${featureRegistryOwnerFilter === 'user_created' ? '#1a73e8' : '#dadce0'}; background:${featureRegistryOwnerFilter === 'user_created' ? '#e8f0fe' : '#fff'}; color:${featureRegistryOwnerFilter === 'user_created' ? '#1a73e8' : '#202124'}; border-radius:16px; padding:6px 12px; font-size:13px; cursor:pointer; font-weight:600;">User Created</button>
                    </div>
                </div>
            `;

            const listHtml = Object.entries(sections)
                .filter(([, items]) => items.length > 0)
                .map(([section, items]) => `
                    <div style="margin-bottom:20px;">
                        <h3 style="margin:0 0 12px; font-size:16px; color:#202124;">${formatFeatureSectionTitle(section)}</h3>
                        <div style="display:flex; flex-direction:column; gap:12px;">
                            ${items.map(feature => {
                                const showToggleDisabled = feature.status !== 'deployed' || feature.deploymentStatus !== 'deployed';
                                const statusColor = featureStatusColor(feature);
                                return `
                                    <div style="border:1px solid #e0e0e0; border-radius:10px; padding:14px; background:#fff;">
                                        <div style="display:flex; justify-content:space-between; gap:12px; align-items:flex-start;">
                                            <div style="flex:1; min-width:0;">
                                                <div style="display:flex; align-items:center; gap:8px; flex-wrap:wrap;">
                                                    <strong style="font-size:15px; color:#202124;">${escapeHtml(feature.name || feature.featureId)}</strong>
                                                    <span style="font-size:12px; font-weight:600; color:${statusColor}; background:${statusColor}18; padding:4px 8px; border-radius:999px; text-transform:capitalize;">${escapeHtml(featureStatusLabel(feature))}</span>
                                                </div>
                                                <div style="margin-top:6px; font-size:13px; color:#5f6368;">${escapeHtml(feature.description || 'No description yet.')}</div>
                                                <div style="margin-top:8px; font-size:12px; color:#5f6368;">
                                                    <span>Feature ID: ${escapeHtml(feature.featureId)}</span>
                                                    ${feature.createdBy ? `<span style="margin-left:12px;">Created by ${escapeHtml(feature.createdBy)}</span>` : ''}
                                                </div>
                                                ${feature.codeMissingFromDeployment ? `
                                                    <div style="margin-top:8px; font-size:12px; color:#b3261e; font-weight:600;">
                                                        This feature is marked deployed in the registry, but its code is missing from the current deployment branch.
                                                    </div>
                                                ` : ''}
                                                <div style="margin-top:8px; display:flex; gap:12px; flex-wrap:wrap; font-size:12px;">
                                                    ${feature.prUrl ? `<a href="${feature.prUrl}" target="_blank" rel="noopener" style="color:#1a73e8; text-decoration:none;">View PR</a>` : ''}
                                                    ${feature.vercelDeploymentUrl ? `<a href="${feature.vercelDeploymentUrl}" target="_blank" rel="noopener" style="color:#1a73e8; text-decoration:none;">View Deploy</a>` : ''}
                                                </div>
                                            </div>
                                            <div style="display:flex; flex-direction:column; gap:10px; min-width:170px;">
                                                <label style="display:flex; align-items:center; justify-content:space-between; gap:12px; font-size:13px; color:#202124;">
                                                    <span>Show in my app</span>
                                                    <input type="checkbox" data-feature-id="${escapeHtml(feature.featureId)}" data-pref-field="visible" ${feature.preferences && feature.preferences.visible !== false ? 'checked' : ''} ${showToggleDisabled ? 'disabled' : ''}>
                                                </label>
                                                <label style="display:flex; align-items:center; justify-content:space-between; gap:12px; font-size:13px; color:#202124;">
                                                    <span>Enabled</span>
                                                    <input type="checkbox" data-feature-id="${escapeHtml(feature.featureId)}" data-pref-field="enabled" ${feature.preferences && feature.preferences.enabled !== false ? 'checked' : ''} ${showToggleDisabled ? 'disabled' : ''}>
                                                </label>
                                                <label style="display:flex; align-items:center; justify-content:space-between; gap:12px; font-size:13px; color:#202124;">
                                                    <span>Pinned</span>
                                                    <input type="checkbox" data-feature-id="${escapeHtml(feature.featureId)}" data-pref-field="pinned" ${feature.preferences && feature.preferences.pinned ? 'checked' : ''}>
                                                </label>
                                            </div>
                                        </div>
                                    </div>
                                `;
                            }).join('')}
                        </div>
                    </div>
                `).join('');

            root.innerHTML = controlsHtml + (listHtml || '<div style="color:#5f6368;">No features found for this owner filter yet.</div>');
        }

        async function refreshFeatureRegistryModal(root) {
            root.innerHTML = '<div style="color:#5f6368;">Loading features...</div>';
            const features = await fetchFeatureRegistry();
            renderFeatureRegistry(root, features);
        }

        async function updateFeaturePreference(featureId, field, value) {
            const response = await fetch(`/api/feature-registry/${encodeURIComponent(featureId)}/preferences`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ [field]: value })
            });
            const data = await response.json().catch(() => ({}));
            if (!response.ok || !data.success) {
                throw new Error(data.error || 'Failed to update feature preference');
            }
            return data;
        }

        function closeFeatureManagerOverlay() {
            const existing = document.getElementById('featureManagerOverlay');
            if (existing) existing.remove();
            document.body.style.overflow = '';
        }

        async function openFeatureManager() {
            closeFeatureManagerOverlay();

            const overlay = document.createElement('div');
            overlay.id = 'featureManagerOverlay';
            overlay.style.position = 'fixed';
            overlay.style.inset = '0';
            overlay.style.width = '100vw';
            overlay.style.height = '100vh';
            overlay.style.background = '#fff';
            overlay.style.zIndex = '5000';
            overlay.style.display = 'flex';
            overlay.style.flexDirection = 'column';
            overlay.innerHTML = `
                <div style="display:flex; align-items:center; justify-content:space-between; padding:18px 22px; border-bottom:1px solid #e0e0e0; background:#f8f9fa;">
                    <h2 style="margin:0; font-size:22px; color:#202124;">Feature Manager</h2>
                    <button id="featureManagerCloseBtn" type="button" style="background:#d93025; color:#fff; border:none; border-radius:8px; padding:8px 12px; cursor:pointer; font-size:14px; font-weight:600;">X</button>
                </div>
                <div class="feature-manager-root" style="flex:1; overflow:auto; padding:20px 24px 24px;"></div>
            `;

            document.body.appendChild(overlay);
            document.body.style.overflow = 'hidden';

            const closeBtn = overlay.querySelector('#featureManagerCloseBtn');
            if (closeBtn) {
                closeBtn.addEventListener('click', closeFeatureManagerOverlay);
            }

            const root = overlay.querySelector('.feature-manager-root');
            if (!root) return;

            overlay.addEventListener('change', async (event) => {
                const target = event.target;
                if (!(target instanceof HTMLInputElement)) return;
                const featureId = target.dataset.featureId;
                const field = target.dataset.prefField;
                if (!featureId || !field) return;

                const nextValue = !!target.checked;
                target.disabled = true;
                try {
                    await updateFeaturePreference(featureId, field, nextValue);
                    if (field === 'visible' && nextValue) {
                        await loadFeatures();
                        showSuccessPopup('Feature is now visible in your app.', 'Feature Updated');
                    } else if (field === 'visible' && !nextValue) {
                        showSuccessPopup('Feature hidden. Refresh the page to fully remove any already-loaded UI.', 'Feature Updated');
                    } else {
                        showSuccessPopup('Feature preference updated.', 'Feature Updated');
                    }
                    await refreshFeatureRegistryModal(root);
                } catch (error) {
                    target.checked = !nextValue;
                    showErrorPopup(error.message || 'Failed to update feature preference.', 'Update Failed');
                } finally {
                    target.disabled = false;
                }
            });

            overlay.addEventListener('click', async (event) => {
                const target = event.target;
                if (!(target instanceof HTMLElement)) return;
                const filter = target.getAttribute('data-feature-owner-filter');
                if (!filter) return;
                if (filter !== 'demos' && filter !== 'user_created') return;
                featureRegistryOwnerFilter = filter;
                try {
                    await refreshFeatureRegistryModal(root);
                } catch (error) {
                    root.innerHTML = `<div style="color:#b3261e;">${escapeHtml(error.message || 'Failed to load feature registry.')}</div>`;
                }
            });

            try {
                await refreshFeatureRegistryModal(root);
            } catch (error) {
                root.innerHTML = `<div style="color:#b3261e;">${escapeHtml(error.message || 'Failed to load feature registry.')}</div>`;
            }
        }

        let allEmails = [];
        let currentFilter = 'all';
        let currentCategoriesOrder = [];
        const UI_AUTO_SYNC_INTERVAL_MS = 5 * 60 * 1000;
        let uiAutoSyncTimer = null;
        let uiAutoSyncCountdownTimer = null;
        let uiAutoSyncStatusTimer = null;
        let uiNextSyncAt = null;
        let uiAutoSyncInFlight = false;
        let isAuthenticatedUser = false;
        let serverAutoSyncStatusText = '';
        let hardBannerTimer = null;
        window.currentUserDisplayName = window.currentUserDisplayName || '';
window.__categoryChats = window.__categoryChats || {};
        function displayNameFromEmail(email) {
            try {
                const e = String(email || '').toLowerCase().trim();
                if (e === 'ks4190@columbia.edu') return 'Karthik Sreedhar';
                if (e === 'lc3251@columbia.edu') return 'Lydia Chilton';
                const local = e.split('@')[0] || '';
                const parts = local.replace(/[._-]+/g, ' ').split(' ').filter(Boolean);
                return parts.map(p => p.charAt(0).toUpperCase() + p.slice(1)).join(' ') || email;
            } catch (e) {
                return email || 'You';
            }
        }

        // Build a best-effort Gmail web URL for an email or message-like object
        function buildGmailWebUrl(data) {
            try {
                const d = data || {};
                // Prefer server-provided webUrl if present
                if (d.webUrl && /^https?:\/\//i.test(String(d.webUrl))) {
                    return String(d.webUrl);
                }
                const from = String(d.originalFrom || d.from || '').trim();
                const subject = String(d.subject || '').trim();
                // Construct a Gmail search link using from and subject if available
                if (from || subject) {
                    const qParts = [];
                    if (from) qParts.push(`from:${from}`);
                    if (subject) qParts.push(`subject:"${subject}"`);
                    const q = qParts.join(' ');
                    return `https://mail.google.com/mail/u/0/#search/${encodeURIComponent(q)}`;
                }
                return '';
            } catch (_) {
                return '';
            }
        }
        // Return anchor HTML for an "Open in Gmail" button or empty string
        function gmailLinkHtml(data, size) {
            try {
                const url = buildGmailWebUrl(data);
                if (!url) return '';
                const cls = size === 'small' ? 'open-gmail-btn small' : 'open-gmail-btn';
                return `<a href="${url}" class="${cls}" title="Open in Inbox" target="_blank" rel="noopener">Open in Inbox</a>`;
            } catch (_) {
                return '';
            }
        }

        function updateAutoSyncBanner(text, isError = false) {
            const banner = document.getElementById('autoSyncBanner');
            if (!banner) return;
            const mergedText = [text, serverAutoSyncStatusText].filter(Boolean).join(' | ');
            const fallbackText = isAuthenticatedUser ? 'Next update in 5m 00s.' : 'Next update in 5m 00s.';
            const finalText = mergedText || fallbackText;
            if (!finalText) {
                banner.style.display = 'none';
                banner.textContent = '';
                return;
            }
            banner.style.display = 'flex';
            banner.textContent = finalText;
            banner.style.minHeight = '36px';
            banner.style.lineHeight = '1.3';
            banner.style.fontWeight = '600';
            banner.style.textAlign = 'center';
            banner.style.alignItems = 'center';
            banner.style.justifyContent = 'center';
            if (isError) {
                banner.style.setProperty('background', '#fdecea', 'important');
                banner.style.setProperty('color', '#8b1a1a', 'important');
                banner.style.borderBottom = '1px solid #f5c6cb';
            } else {
                banner.style.setProperty('background', '#e8f0fe', 'important');
                banner.style.setProperty('color', '#1a3f8b', 'important');
                banner.style.borderBottom = '1px solid #c7d7ff';
            }
        }

        function stopUiAutoSyncTimers() {
            if (uiAutoSyncTimer) {
                clearInterval(uiAutoSyncTimer);
                uiAutoSyncTimer = null;
            }
            if (uiAutoSyncCountdownTimer) {
                clearInterval(uiAutoSyncCountdownTimer);
                uiAutoSyncCountdownTimer = null;
            }
            if (uiAutoSyncStatusTimer) {
                clearInterval(uiAutoSyncStatusTimer);
                uiAutoSyncStatusTimer = null;
            }
            serverAutoSyncStatusText = '';
            uiNextSyncAt = null;
        }

        function startHardBannerHeartbeat() {
            if (hardBannerTimer) return;
            if (!uiNextSyncAt) uiNextSyncAt = Date.now() + UI_AUTO_SYNC_INTERVAL_MS;
            hardBannerTimer = setInterval(() => {
                const remainMs = Math.max(0, (uiNextSyncAt || (Date.now() + UI_AUTO_SYNC_INTERVAL_MS)) - Date.now());
                const totalSec = Math.ceil(remainMs / 1000);
                const mins = Math.floor(totalSec / 60);
                const secs = totalSec % 60;
                updateAutoSyncBanner(`Next update in ${mins}m ${String(secs).padStart(2, '0')}s.`);
            }, 1000);
        }

        async function refreshServerAutoSyncStatus() {
            if (!isAuthenticatedUser) return;
            try {
                const resp = await fetch('/api/auto-sync/status');
                const data = await resp.json();
                if (!resp.ok || !data.success) {
                    serverAutoSyncStatusText = 'server cron status unavailable';
                } else {
                    const next = data.nextRunAt ? new Date(data.nextRunAt) : null;
                    const nextTxt = next && !Number.isNaN(next.getTime()) ? `server next ${next.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}` : '';
                    const countTxt = (typeof data.runCount === 'number') ? `runs ${data.runCount}` : '';
                    const runTxt = data.running ? 'server cron running now' : 'server cron idle';
                    serverAutoSyncStatusText = [runTxt, countTxt, nextTxt].filter(Boolean).join(', ');
                }
            } catch (_) {
                serverAutoSyncStatusText = 'server cron status unavailable';
            } finally {
                if (uiNextSyncAt) {
                    const remainMs = Math.max(0, uiNextSyncAt - Date.now());
                    const totalSec = Math.ceil(remainMs / 1000);
                    const mins = Math.floor(totalSec / 60);
                    const secs = totalSec % 60;
                    updateAutoSyncBanner(`Next update in ${mins}m ${String(secs).padStart(2, '0')}s.`);
                } else {
                    updateAutoSyncBanner('UI update scheduler initializing...');
                }
            }
        }

        function startUiAutoSyncCountdown() {
            if (!isAuthenticatedUser) return;
            if (uiAutoSyncCountdownTimer) clearInterval(uiAutoSyncCountdownTimer);
            const render = () => {
                if (!uiNextSyncAt) return;
                const remainMs = Math.max(0, uiNextSyncAt - Date.now());
                const totalSec = Math.ceil(remainMs / 1000);
                const mins = Math.floor(totalSec / 60);
                const secs = totalSec % 60;
                updateAutoSyncBanner(`Next update in ${mins}m ${String(secs).padStart(2, '0')}s.`);
            };
            render();
            uiAutoSyncCountdownTimer = setInterval(render, 1000);
        }

        async function triggerUiAutoSync(reason) {
            if (!isAuthenticatedUser || uiAutoSyncInFlight) return;
            uiAutoSyncInFlight = true;
            try {
                const resp = await fetch('/api/auto-sync/run', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ reason: reason || 'ui-interval' })
                });
                const data = await resp.json().catch(() => ({}));
                if (!resp.ok || !data.success) {
                    const reasonText = data?.result?.reason || data?.error || 'unknown';
                    throw new Error(`Auto sync failed: ${reasonText}`);
                }
                const addedCount = Number(data?.result?.added) || 0;
                if (addedCount > 0) {
                    updateAutoSyncBanner(`Added ${addedCount} new email${addedCount === 1 ? '' : 's'} from inbox.`);
                } else if (data?.result?.reason) {
                    updateAutoSyncBanner(`No new emails synced (${data.result.reason}).`);
                } else {
                    updateAutoSyncBanner('No new emails synced.');
                }
                await loadEmails();
                uiNextSyncAt = Date.now() + UI_AUTO_SYNC_INTERVAL_MS;
                startUiAutoSyncCountdown();
            } catch (e) {
                console.error('triggerUiAutoSync failed:', e);
                updateAutoSyncBanner('Auto update failed. Retrying in 5 minutes.', true);
            } finally {
                uiAutoSyncInFlight = false;
            }
        }

        function initializeUiAutoSync() {
            stopUiAutoSyncTimers();
            if (!isAuthenticatedUser) {
                updateAutoSyncBanner('');
                return;
            }
            updateAutoSyncBanner('Next update in 5m 00s.');
            uiNextSyncAt = Date.now() + UI_AUTO_SYNC_INTERVAL_MS;
            startUiAutoSyncCountdown();
            refreshServerAutoSyncStatus();
            setTimeout(() => { try { refreshServerAutoSyncStatus(); } catch (_) {} }, 1200);
            uiAutoSyncStatusTimer = setInterval(() => {
                refreshServerAutoSyncStatus();
            }, 30000);
            uiAutoSyncTimer = setInterval(() => {
                triggerUiAutoSync('ui-interval');
            }, UI_AUTO_SYNC_INTERVAL_MS);
        }

        async function loadEmails() {
            const container = document.getElementById('emailContainer');
            container.innerHTML = '<div class="loading">Loading emails...</div>';

            try {
                // Check auth status first
                const authStatusResp = await fetch('/api/auth/status');
                const authStatus = await authStatusResp.json();

                if (!authStatusResp.ok || !authStatus.loggedIn) {
                    isAuthenticatedUser = false;
                    // Show login UI
                    document.getElementById('loginScreen').style.display = 'flex';
                    document.getElementById('appContainer').style.display = 'none';
                    stopUiAutoSyncTimers();
                    updateAutoSyncBanner('');
                    return;
                } else {
                    isAuthenticatedUser = true;
                    // Show App UI
                    document.getElementById('loginScreen').style.display = 'none';
                    document.getElementById('appContainer').style.display = 'flex';
                    if (!uiAutoSyncTimer || !uiAutoSyncCountdownTimer || !uiNextSyncAt) {
                        initializeUiAutoSync();
                    }
                }

                console.log('Fetching emails from /api/response-emails...');
                const response = await fetch('/api/response-emails');
                const data = await response.json();

                if (response.status === 401 && data.needsAuth) {
                    // Authentication required - automatically start authentication
                    container.innerHTML = `
                        <div class="loading">
                            <h3>🔐 Gmail Authentication Required</h3>
                            <p>Redirecting to Gmail authentication...</p>
                        </div>
                    `;
                    // Automatically start authentication after a brief delay
                    setTimeout(startAuthentication, 1000);
                    return;
                }

                if (data.emails) {
                    allEmails = data.emails;
                    await loadCurrentCategories();
                    populateCategories(allEmails);
                    displayEmails(allEmails);
                    updateDisplayStats(allEmails);
                } else {
                    container.innerHTML = '<div class="loading">No emails found.</div>';
                }
            } catch (error) {
                console.error('Error loading emails:', error);
                container.innerHTML = '<div class="error">Failed to load emails. Please try again.</div>';
                if (isAuthenticatedUser) {
                    updateAutoSyncBanner('UI updating in 5 minutes.');
                }
            }
        }

        async function startAuthentication() {
            try {
                // Redirect to login endpoint to start OAuth flow
                window.location.href = '/api/auth/login';
            } catch (error) {
                console.error('Error starting authentication:', error);
                showErrorPopup('Failed to start authentication. Please try again.', 'Authentication Error');
            }
        }

        async function completeAuthentication() {
            const authCode = document.getElementById('authCode').value.trim();
            if (!authCode) {
                showErrorPopup('Please enter the authorization code.', 'Missing Code');
                return;
            }

            const container = document.getElementById('emailContainer');
            container.innerHTML = '<div class="loading">Completing authentication...</div>';

            try {
                const response = await fetch('/api/auth/callback', {
                    method: 'POST',
                    headers: {
                        'Content-Type': 'application/json',
                    },
                    body: JSON.stringify({ code: authCode })
                });

                const data = await response.json();

                if (data.success) {
                    container.innerHTML = '<div class="loading">Authentication successful! Loading emails...</div>';
                    // Wait a moment then load emails
                    setTimeout(loadEmails, 1000);
                } else {
                    container.innerHTML = `<div class="error">Authentication failed: ${data.error}</div>`;
                }
            } catch (error) {
                console.error('Error completing authentication:', error);
                container.innerHTML = '<div class="error">Authentication failed. Please try again.</div>';
            }
        }

        function populateCategories(emails) {
            const categoryList = document.getElementById('categoryList');

            // Determine authoritative category order if available
            const ordered = Array.isArray(currentCategoriesOrder) && currentCategoriesOrder.length
                ? currentCategoriesOrder.slice()
                : [];

            // Build counts from emails (primary + additional categories)
            const categoryCounts = {};
            const orderedLcMap = new Map(
                ordered.map(name => [String(name || '').trim().toLowerCase(), String(name || '').trim()])
            );
            (emails || []).forEach(e => {
                const arr = Array.isArray(e?.categories) && e.categories.length
                    ? e.categories
                    : (e?.category ? [e.category] : []);
                arr.forEach(c => {
                    const raw = String(c || '').trim();
                    if (!raw) return;
                    const canonical = orderedLcMap.get(raw.toLowerCase()) || raw;
                    categoryCounts[canonical] = (categoryCounts[canonical] || 0) + 1;
                });
            });

            // Update "View All" count - show 0 if no emails
            document.getElementById('allCount').textContent = emails.length || 0;

            // Clear existing categories
            categoryList.innerHTML = '';

            // Build fallback names from the data if no authoritative order
            const fallbackNames = Array.from(new Set((emails || []).flatMap(e => {
                const arr = Array.isArray(e?.categories) && e.categories.length
                    ? e.categories
                    : (e?.category ? [e.category] : []);
                return arr;
            }))).filter(Boolean);

            // Render all authoritative categories (including zero-count user-created categories).
            const listToRender = ordered.length
                ? ordered
                : (fallbackNames.filter(name => {
                    const count = categoryCounts[name] || 0;
                    const isOther = String(name || '').trim().toLowerCase() === 'other';
                    return count > 0 || isOther;
                }));

            // If there are zero emails total, leave LHS empty (only "View All" remains)
            listToRender.forEach(category => {
                const count = categoryCounts[category] || 0;

                const categoryDiv = document.createElement('div');
                categoryDiv.className = 'category-item';
                categoryDiv.onclick = () => filterByCategory(category);

                const categoryIcon = getCategoryIcon(category);
                const catColors = getCategoryColors(category);

                categoryDiv.innerHTML = `
                    <span class="category-color-dot" style="display:inline-block;width:10px;height:10px;border-radius:50%;background:${catColors.bg};border:1px solid rgba(0,0,0,0.1);margin-right:8px;"></span>
                    <span class="category-icon">${categoryIcon}</span>
                    <span class="category-name">${category}</span>
                    <span class="category-count">${count}</span>
                `;

                categoryDiv.setAttribute('data-category', category);
                const isOther = String(category || '').trim().toLowerCase() === 'other';
                if (!isOther) {
                    const deleteBtn = document.createElement('button');
                    deleteBtn.type = 'button';
                    deleteBtn.className = 'sidebar-category-delete';
                    deleteBtn.title = `Delete "${category}"`;
                    deleteBtn.textContent = '🗑️';
                    deleteBtn.addEventListener('click', (ev) => handleSidebarCategoryDelete(ev, category, count));
                    categoryDiv.appendChild(deleteBtn);
                }
                categoryList.appendChild(categoryDiv);
            });

            // Populate people section
            populatePeople(emails);
        }

        function startNewCategoryInlineInput() {
            try {
                const categoryList = document.getElementById('categoryList');
                if (!categoryList) return;

                const existing = categoryList.querySelector('.category-item-add-input .new-category-input');
                if (existing) {
                    existing.focus();
                    existing.select();
                    return;
                }

                const row = document.createElement('div');
                row.className = 'category-item category-item-add-input';
                row.innerHTML = `
                    <span class="category-icon">➕</span>
                    <input type="text" class="new-category-input" placeholder="New category name" maxlength="80" />
                `;
                categoryList.appendChild(row);

                const input = row.querySelector('.new-category-input');
                if (!input) return;
                input.focus();

                let saving = false;
                const cancel = () => {
                    if (!saving) {
                        row.remove();
                    }
                };

                const submit = async () => {
                    if (saving) return;
                    const name = String(input.value || '').trim();
                    if (!name) {
                        row.remove();
                        return;
                    }
                    const exists = (Array.isArray(currentCategoriesOrder) ? currentCategoriesOrder : [])
                        .some(c => String(c || '').trim().toLowerCase() === name.toLowerCase());
                    if (exists) {
                        showErrorPopup(`Category "${name}" already exists.`, 'Duplicate Category');
                        input.focus();
                        input.select();
                        return;
                    }

                    saving = true;
                    try {
                        const resp = await fetch('/api/categories/add', {
                            method: 'POST',
                            headers: { 'Content-Type': 'application/json' },
                            body: JSON.stringify({ name })
                        });
                        const data = await resp.json().catch(() => ({}));
                        if (!resp.ok || !data.success) {
                            throw new Error(data.error || 'Failed to add category');
                        }
                        currentCategoriesOrder = Array.isArray(data.categories) ? data.categories : currentCategoriesOrder;
                        populateCategories(allEmails || []);
                        showSuccessPopup(`Added category "${name}".`, 'Category Added');
                    } catch (e) {
                        console.error('Failed to add category from sidebar:', e);
                        showErrorPopup('Failed to add category. Please try again.', 'Add Category Failed');
                    } finally {
                        saving = false;
                        row.remove();
                    }
                };

                input.addEventListener('keydown', (ev) => {
                    if (ev.key === 'Enter') {
                        ev.preventDefault();
                        submit();
                    } else if (ev.key === 'Escape') {
                        ev.preventDefault();
                        cancel();
                    }
                });
                input.addEventListener('blur', () => {
                    setTimeout(() => {
                        cancel();
                    }, 120);
                });
            } catch (e) {
                console.error('startNewCategoryInlineInput failed:', e);
                showErrorPopup('Failed to start adding a category.', 'Add Category Failed');
            }
        }

        async function deleteCategoryFromSidebar(name) {
            const resp = await fetch(`/api/categories/${encodeURIComponent(name)}`, { method: 'DELETE' });
            const data = await resp.json().catch(() => ({}));
            if (!resp.ok || !data.success) {
                throw new Error(data.error || 'Failed to delete category');
            }
            return data;
        }

        function handleSidebarCategoryDelete(ev, name, count) {
            if (ev && typeof ev.stopPropagation === 'function') ev.stopPropagation();
            const rawName = String(name || '').trim();
            if (!rawName) return;

            const runDelete = async () => {
                try {
                    const data = await deleteCategoryFromSidebar(rawName);
                    const movedR = (data.moved && typeof data.moved.responses === 'number') ? data.moved.responses : 0;
                    const movedU = (data.moved && typeof data.moved.unreplied === 'number') ? data.moved.unreplied : 0;
                    if ((movedR + movedU) > 0) {
                        showSuccessPopup(`Deleted "${rawName}". Moved ${movedR + movedU} email(s) to "Other".`, 'Category Deleted');
                    } else {
                        showSuccessPopup(`Deleted "${rawName}".`, 'Category Deleted');
                    }
                    try { await loadCurrentCategories(); } catch (_) {}
                    try { await loadEmails(); } catch (_) {}
                } catch (e) {
                    console.error('handleSidebarCategoryDelete failed:', e);
                    showErrorPopup('Failed to delete category. Please try again.', 'Delete Failed');
                }
            };

            (async () => {
                let numericCount = Number(count) || 0;
                try {
                    const resp = await fetch('/api/categories/all-with-counts');
                    const data = await resp.json().catch(() => ({}));
                    if (resp.ok && data && Array.isArray(data.categories)) {
                        const found = data.categories.find(c => String(c?.name || '').trim().toLowerCase() === rawName.toLowerCase());
                        if (found && Number.isFinite(found.count)) {
                            numericCount = Number(found.count) || 0;
                        }
                    }
                } catch (_) {}

                if (numericCount > 0) {
                    showConfirmPopup(
                        `Delete category "${rawName}"? Emails in this category will be moved to "Other".`,
                        runDelete,
                        () => {},
                        'Delete Category'
                    );
                    return;
                }
                runDelete();
            })();
        }

        function populatePeople(emails) {
            const peopleList = document.getElementById('peopleList');
            
            // Extract people from emails and count their threads
            const peopleThreads = {};
            
            emails.forEach(email => {
                // Get original sender from email data
                let person = 'Unknown Person';
                if (email.originalFrom) {
                    // Extract name from "Name <email@domain.com>" format
                    const nameMatch = email.originalFrom.match(/^([^<]+)/);
                    if (nameMatch) {
                        person = nameMatch[1].trim();
                    } else {
                        person = email.originalFrom.split('@')[0]; // Use email username if no name
                    }
                } else if (email.from && email.from !== 'Karthik Sreedhar') {
                    // Fallback to from field if originalFrom not available
                    const nameMatch = email.from.match(/^([^<]+)/);
                    if (nameMatch) {
                        person = nameMatch[1].trim();
                    } else {
                        person = email.from.split('@')[0];
                    }
                }
                
                // Skip if person is the user themselves
                if (person === 'Karthik Sreedhar' || person === 'Unknown Person') {
                    return;
                }
                
                // Count threads per person (using subject as thread identifier)
                const threadId = email.subject.replace(/^Re:\s*/i, '').trim();
                
                if (!peopleThreads[person]) {
                    peopleThreads[person] = {
                        threads: new Set(),
                        emails: []
                    };
                }
                
                peopleThreads[person].threads.add(threadId);
                peopleThreads[person].emails.push(email);
            });
            
            // Show all people (no filtering by thread count)
            const allPeople = Object.entries(peopleThreads)
                .sort(([a, dataA], [b, dataB]) => dataB.emails.length - dataA.emails.length); // Sort by email count
            
            // Clear existing people
            peopleList.innerHTML = '';
            
            if (allPeople.length === 0) {
                peopleList.innerHTML = '<div style="padding: 12px; color: #666; font-style: italic; text-align: center;">No people found</div>';
                return;
            }
            
            // Add people items
            allPeople.forEach(([person, data]) => {
                const personDiv = document.createElement('div');
                personDiv.className = 'category-item';
                personDiv.onclick = () => filterByPerson(person);
                
                personDiv.innerHTML = `
                    <span class="category-icon">👤</span>
                    <span class="category-name">${person}</span>
                    <span class="category-count">${data.emails.length}</span>
                `;
                
                personDiv.setAttribute('data-person', person);
                peopleList.appendChild(personDiv);
            });
        }

        function filterByPerson(person) {
            currentFilter = `person:${person}`;
            
            // Update active state in sidebar
            document.querySelectorAll('.category-item').forEach(item => {
                item.classList.remove('active');
            });
            
            // Filter emails by person
            const filteredEmails = allEmails.filter(email => {
                let emailPerson = 'Unknown Person';
                if (email.originalFrom) {
                    const nameMatch = email.originalFrom.match(/^([^<]+)/);
                    if (nameMatch) {
                        emailPerson = nameMatch[1].trim();
                    } else {
                        emailPerson = email.originalFrom.split('@')[0];
                    }
                } else if (email.from && email.from !== 'Karthik Sreedhar') {
                    const nameMatch = email.from.match(/^([^<]+)/);
                    if (nameMatch) {
                        emailPerson = nameMatch[1].trim();
                    } else {
                        emailPerson = email.from.split('@')[0];
                    }
                }
                
                return emailPerson === person;
            });
            
            document.querySelector(`[data-person="${person}"]`).classList.add('active');
            document.getElementById('currentFilter').textContent = person;
            displayEmails(filteredEmails);
            updateDisplayStats(filteredEmails);
        }

        function getCategoryIcon(category) {
            const icons = {
                'Meeting Response': '📅',
                'Academic': '🎓',
                'Financial': '💰',
                'General': '📄'
            };
            return icons[category] || '📧';
        }

// Deterministic category color utilities for dynamic/renamed/added categories
function hashString(str) {
    let h = 0;
    for (let i = 0; i < str.length; i++) {
        h = ((h << 5) - h) + str.charCodeAt(i);
        h |= 0;
    }
    return Math.abs(h);
}
function getCategoryColors(category) {
    const name = String(category || 'Uncategorized');
    const h = hashString(name) % 360;
    const s = 70;   // saturation
    const l = 88;   // lightness for pastel background
    const bg = `hsl(${h}, ${s}%, ${l}%)`;
    // Darker text color using the same hue for readability
    const fg = `hsl(${h}, 45%, 25%)`;
    return { bg, fg };
}
function getCategoryBadgeStyle(category) {
    const { bg, fg } = getCategoryColors(category);
    return `background: ${bg}; color: ${fg};`;
}

// Make category pills clickable to edit category inline
function onCategoryPillClick(ev, emailId, currentCategory) {
    try {
        if (ev && ev.stopPropagation) ev.stopPropagation();
        const pillElement = ev && (ev.currentTarget || ev.target);
        if (pillElement && emailId && currentCategory) {
            showInlineCategoryEditor(pillElement, emailId, currentCategory);
        }
    } catch (e) {
        console.error('onCategoryPillClick failed:', e);
    }
}

// Show inline category editor with autocomplete
function showInlineCategoryEditor(pillElement, emailId, currentCategory) {
    try {
        // Remove any existing editor
        const existingEditor = document.getElementById('inlineCategoryEditor');
        if (existingEditor) {
            existingEditor.remove();
        }

        // Create input element
        const input = document.createElement('input');
        input.type = 'text';
        input.id = 'inlineCategoryEditor';
        input.value = currentCategory;
        input.style.cssText = `
            padding: 6px 10px;
            border: 1px solid #4285f4;
            border-radius: 14px;
            font-size: 16px;
            color: #333;
            background: #fff;
            box-shadow: 0 0 0 2px rgba(66,133,244,0.15);
            outline: none;
            min-width: 180px;
            max-width: 320px;
        `;

        // Create autocomplete dropdown
        const dropdown = document.createElement('div');
        dropdown.id = 'categoryAutocomplete';
        dropdown.style.cssText = `
            position: absolute;
            z-index: 1200;
            background: #ffffff;
            border: 1px solid #e9ecef;
            border-radius: 6px;
            box-shadow: 0 4px 12px rgba(0,0,0,0.12);
            max-height: 200px;
            overflow-y: auto;
            min-width: 200px;
            display: none;
        `;

        // Position dropdown relative to pill
        const rect = pillElement.getBoundingClientRect();
        dropdown.style.top = (rect.bottom + window.scrollY + 4) + 'px';
        dropdown.style.left = (rect.left + window.scrollX) + 'px';

        // Replace pill with input
        const parent = pillElement.parentElement;
        parent.insertBefore(input, pillElement);
        parent.insertBefore(dropdown, pillElement);
        pillElement.style.display = 'none';

        // Focus input and select text
        input.focus();
        input.select();

        let activeIndex = -1;

        // Filter and show suggestions
        const filterSuggestions = () => {
            const query = input.value.toLowerCase().trim();
            const categories = Array.isArray(currentCategoriesOrder) ? currentCategoriesOrder : [];
            const matches = categories.filter(cat => 
                cat && cat.toLowerCase().includes(query)
            );

            dropdown.innerHTML = '';
            activeIndex = -1;

            if (matches.length === 0) {
                dropdown.style.display = 'none';
                return;
            }

            matches.forEach((cat, i) => {
                const item = document.createElement('div');
                item.className = 'priority-cat-item';
                item.style.cssText = `
                    padding: 8px 10px;
                    font-size: 13px;
                    cursor: pointer;
                `;
                item.textContent = cat;
                
                item.addEventListener('mousedown', (e) => {
                    e.preventDefault();
                    applyCategory(cat);
                });
                
                item.addEventListener('mouseover', () => {
                    activeIndex = i;
                    updateActiveItem();
                });
                
                dropdown.appendChild(item);
            });

            dropdown.style.display = 'block';
            if (matches.length > 0) {
                activeIndex = 0;
                updateActiveItem();
            }
        };

        const updateActiveItem = () => {
            const items = dropdown.querySelectorAll('.priority-cat-item');
            items.forEach((item, i) => {
                if (i === activeIndex) {
                    item.style.background = '#f5f7ff';
                } else {
                    item.style.background = '';
                }
            });
        };

        const applyCategory = async (newCategory) => {
            try {
                const trimmed = newCategory.trim();
                if (!trimmed || trimmed === currentCategory) {
                    cancelEdit();
                    return;
                }

                // Call API to update category
                await updateEmailCategory(emailId, trimmed, currentCategory);
                
                // Cleanup
                cancelEdit();
            } catch (e) {
                console.error('applyCategory failed:', e);
                showErrorPopup('Failed to update category. Please try again.', 'Update Failed');
                cancelEdit();
            }
        };

        const cancelEdit = () => {
            input.remove();
            dropdown.remove();
            pillElement.style.display = '';
        };

        // Handle input events
        input.addEventListener('input', filterSuggestions);
        input.addEventListener('focus', filterSuggestions);
        
        input.addEventListener('keydown', (ev) => {
            const items = dropdown.querySelectorAll('.priority-cat-item');
            
            if (ev.key === 'ArrowDown') {
                ev.preventDefault();
                if (items.length > 0) {
                    activeIndex = Math.min(items.length - 1, activeIndex + 1);
                    updateActiveItem();
                    items[activeIndex].scrollIntoView({ block: 'nearest' });
                }
            } else if (ev.key === 'ArrowUp') {
                ev.preventDefault();
                if (items.length > 0) {
                    activeIndex = Math.max(0, activeIndex - 1);
                    updateActiveItem();
                    items[activeIndex].scrollIntoView({ block: 'nearest' });
                }
            } else if (ev.key === 'Enter') {
                ev.preventDefault();
                if (items.length > 0 && activeIndex >= 0) {
                    const selectedCat = items[activeIndex].textContent;
                    applyCategory(selectedCat);
                } else {
                    // Allow creating new category
                    applyCategory(input.value);
                }
            } else if (ev.key === 'Escape') {
                ev.preventDefault();
                cancelEdit();
            }
        });

        input.addEventListener('blur', () => {
            // Small timeout to allow dropdown click to register
            setTimeout(() => {
                if (document.activeElement !== input) {
                    cancelEdit();
                }
            }, 150);
        });

    } catch (e) {
        console.error('showInlineCategoryEditor failed:', e);
    }
}

// Update email category via API and refresh UI
async function updateEmailCategory(emailId, newCategory, oldCategory) {
    try {
        console.log(`Updating category for ${emailId}: "${oldCategory}" -> "${newCategory}"`);

        const response = await fetch(`/api/email/${encodeURIComponent(emailId)}/category`, {
            method: 'PUT',
            headers: {
                'Content-Type': 'application/json',
            },
            body: JSON.stringify({
                category: newCategory
            })
        });

        const data = await response.json();

        if (!response.ok || !data.success) {
            throw new Error(data.error || 'Failed to update category');
        }

        console.log('Category updated successfully:', data);

        // Update the email in allEmails array
        const emailToUpdate = allEmails.find(e => e.id === emailId);
        if (emailToUpdate) {
            emailToUpdate.category = newCategory;
            emailToUpdate.categories = [newCategory];
        }

        // Update LHS menu with new counts
        const categoryCounts = data.categoryCounts || {};
        await loadCurrentCategories();
        populateCategories(allEmails);

        // Re-display emails to show updated category pill
        if (currentFilter === 'all') {
            displayEmails(allEmails);
        } else if (currentFilter === oldCategory) {
            // If we're filtered by the old category, switch to the new category view
            filterByCategory(newCategory);
        } else if (currentFilter === newCategory) {
            // If we're already on the new category, just refresh
            const filteredEmails = allEmails.filter(email => {
                const arr = Array.isArray(email?.categories) && email.categories.length
                    ? email.categories
                    : (email?.category ? [email.category] : []);
                return arr.some(c => String(c || '').toLowerCase() === String(newCategory || '').toLowerCase());
            });
            displayEmails(filteredEmails);
        } else {
            // Otherwise, just refresh current view
            const filteredEmails = allEmails.filter(email => {
                const arr = Array.isArray(email?.categories) && email.categories.length
                    ? email.categories
                    : (email?.category ? [email.category] : []);
                return arr.some(c => String(c || '').toLowerCase() === String(currentFilter || '').toLowerCase());
            });
            displayEmails(filteredEmails);
        }

        showSuccessPopup(`Category updated to "${newCategory}"`, 'Category Updated');
    } catch (e) {
        console.error('updateEmailCategory failed:', e);
        showErrorPopup('Failed to update category. Please try again.', 'Update Failed');
        throw e;
    }
}

        function filterByCategory(category) {
            currentFilter = category;
            
            // Update active state in sidebar
            document.querySelectorAll('.category-item').forEach(item => {
                item.classList.remove('active');
            });
            
            if (category === 'all') {
                document.getElementById('viewAll').classList.add('active');
                document.getElementById('currentFilter').textContent = 'All Emails';
                displayEmails(allEmails);
                updateDisplayStats(allEmails);
                // Show all priority cards when viewing all
                try { renderPriorityToday(); } catch (_) {}
            } else {
                const filteredEmails = allEmails.filter(email => {
                    const arr = Array.isArray(email?.categories) && email.categories.length
                        ? email.categories
                        : (email?.category ? [email.category] : []);
                    return arr.some(c => String(c || '').toLowerCase() === String(category || '').toLowerCase());
                });
                const catEl = document.querySelector(`[data-category="${category}"]`);
                if (catEl) catEl.classList.add('active');
                document.getElementById('currentFilter').textContent = category;
                displayEmails(filteredEmails);
                updateDisplayStats(filteredEmails);
                // Filter yellow priority cards to the selected category
                try { renderPriorityToday(category); } catch (_) {}
            }
        }

        async function displayEmails(emails) {
            const container = document.getElementById('emailContainer');
            container.innerHTML = '';

            if (emails.length === 0) {
                container.innerHTML = '<div class="loading">No emails found in this category.</div>';
                return;
            }

            const sorted = (emails || []).slice().sort((a, b) => new Date(b.date) - new Date(a.date));
            for (const email of sorted) {
                const emailDiv = document.createElement('div');
                emailDiv.className = 'email-item';
                emailDiv.onclick = () => openEmailThread(email.id, email.subject);
                
                // Apply yellow background if this email was recently added
                if (window.recentlyAddedEmailIds && window.recentlyAddedEmailIds.has(email.id)) {
                    emailDiv.style.backgroundColor = '#FFF9CC';
                }
                
                const catNames = Array.isArray(email?.categories) && email.categories.length
                    ? email.categories
                    : (email?.category ? [email.category] : []);
const pillsHtml = catNames.map(cat => {
    const cls = `category-${String(cat).toLowerCase().replace(/\s+/g, '-')}`;
    const style = getCategoryBadgeStyle(cat);
    // Make pill clickable to edit category inline (stop parent click)
    return `<span class="email-category ${cls}" style="${style}; cursor: pointer;" onclick="onCategoryPillClick(event, '${email.id}', '${String(cat).replace(/'/g, "\\'")}')">${cat}</span>`;
}).join(' ');
                
                // Get the original sender from email data
                let originalSender = 'Unknown Sender';
                if (email.originalFrom) {
                    originalSender = email.originalFrom.split('<')[0].trim();
                } else {
                    // Extract from subject if available
                    const subjectMatch = email.subject.match(/Re: (.+)/);
                    if (subjectMatch) {
                        originalSender = 'Original Sender';
                    }
                }
                
                emailDiv.innerHTML = `
                    <div class="email-content">
                        <div class="email-header">
                            <div class="email-from" style="display:flex; align-items:center; gap:8px;">${escapeHtml(originalSender)} ${gmailLinkHtml(email)}</div>
                            <div class="email-date" style="display:flex; align-items:center; gap:8px;">
                                ${formatDate(email.date)}
                                <span style="font-size: 11px; color: #9aa0a6; font-weight: 400;">${escapeHtml(email.id || '')}</span>
                            </div>
                        </div>
                        <div class="email-subject">${escapeHtml(email.subject)}</div>
                        <div class="email-meta-row">
                            <div class="email-categories">${pillsHtml}</div>
                        </div>
                        <div class="notes-preview" data-email-notes="${email.id}" style="display:none;"></div>
                    </div>
                    <div class="email-actions">
                        <button class="delete-thread-btn" onclick="deleteEmailThread('${email.id}', '${email.subject.replace(/'/g, "\\'")}', event)" title="Delete this thread">
                            🗑️
                        </button>
                    </div>
                `;
                
                const __notesEl = emailDiv.querySelector(`.notes-preview[data-email-notes="${email.id}"]`);
                if (__notesEl) { renderEmailNotesPreview(__notesEl, email.id); }
                container.appendChild(emailDiv);
            }
        }

        function formatDate(dateString) {
            const date = new Date(dateString);
            if (Number.isNaN(date.getTime())) return '';

            const now = new Date();
            const startOfToday = new Date(now.getFullYear(), now.getMonth(), now.getDate());
            const startOfEmailDay = new Date(date.getFullYear(), date.getMonth(), date.getDate());
            const dayDiff = Math.round((startOfToday - startOfEmailDay) / (24 * 60 * 60 * 1000));

            const timeText = date.toLocaleTimeString('en-US', {
                hour: 'numeric',
                minute: '2-digit'
            });
            const tzPart = new Intl.DateTimeFormat('en-US', { timeZoneName: 'short' })
                .formatToParts(date)
                .find(p => p.type === 'timeZoneName');
            const tzShort = tzPart && tzPart.value ? tzPart.value : '';

            if (dayDiff === 0) return tzShort ? `${timeText} ${tzShort}` : timeText;
            if (dayDiff === 1) return tzShort ? `Yesterday ${timeText} ${tzShort}` : `Yesterday ${timeText}`;

            const dateText = date.toLocaleDateString('en-US', {
                month: 'short',
                day: 'numeric',
                year: date.getFullYear() === now.getFullYear() ? undefined : 'numeric'
            });
            return tzShort ? `${dateText}, ${timeText} ${tzShort}` : `${dateText}, ${timeText}`;
        }

        function updateDisplayStats(emails) {
            document.getElementById('displayedCount').textContent = emails.length;
        }

        // ===== Search (subjects, bodies, and notes via /api/search-emails) =====
        let isSearchActive = false;
        let lastSearchQuery = '';
        let lastNonSearchFilter = 'all';

        function initSearchBar() {
            try {
                const input = document.getElementById('searchInput');
                const btn = document.getElementById('searchBtn');
                const clearBtn = document.getElementById('clearSearchBtn');

                if (input) {
                    input.addEventListener('keydown', (ev) => {
                        if (ev.key === 'Enter') {
                            ev.preventDefault();
                            performSearch();
                        } else if (ev.key === 'Escape') {
                            ev.preventDefault();
                            clearSearch();
                        }
                    });
                }
                if (btn) {
                    btn.addEventListener('click', () => performSearch());
                }
                if (clearBtn) {
                    clearBtn.addEventListener('click', () => clearSearch());
                }
            } catch (e) {
                console.error('initSearchBar failed:', e);
            }
        }

        async function performSearch(q) {
            try {
                const input = document.getElementById('searchInput');
                const clearBtn = document.getElementById('clearSearchBtn');
                const container = document.getElementById('emailContainer');

                const query = typeof q === 'string' ? q.trim() : String(input?.value || '').trim();
                if (!query) {
                    clearSearch();
                    return;
                }

                // Save pre-search filter so "Clear" can restore
                if (!isSearchActive) {
                    lastNonSearchFilter = currentFilter;
                }

                if (container) container.innerHTML = '<div class="loading">Searching…</div>';

                const resp = await fetch('/api/search-emails', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ query, limit: 10 })
                });
                const data = await resp.json().catch(() => ({}));

                if (!resp.ok) {
                    throw new Error(data.error || 'Search failed');
                }

                const results = Array.isArray(data.emails) ? data.emails : [];
                isSearchActive = true;
                lastSearchQuery = query;
                currentFilter = `search:${query}`;

                // Update header and render results in same format
                const cf = document.getElementById('currentFilter');
                if (cf) cf.textContent = `Search: "${query}"`;

                displayEmails(results);
                updateDisplayStats(results);

                // Show "Clear" button
                if (clearBtn) clearBtn.style.display = 'inline-block';

                // Deactivate any sidebar selection to reflect search scope
                try {
                    document.querySelectorAll('.category-item').forEach(el => el.classList.remove('active'));
                    const viewAll = document.getElementById('viewAll');
                    if (viewAll) viewAll.classList.remove('active');
                } catch (_) {}
            } catch (e) {
                console.error('performSearch failed:', e);
                const container = document.getElementById('emailContainer');
                if (container) container.innerHTML = '<div class="error">Search failed. Please try again.</div>';
            }
        }

        function clearSearch() {
            try {
                const input = document.getElementById('searchInput');
                const clearBtn = document.getElementById('clearSearchBtn');

                if (input) input.value = '';
                if (clearBtn) clearBtn.style.display = 'none';

                isSearchActive = false;
                lastSearchQuery = '';
                currentFilter = 'all';

                const cf = document.getElementById('currentFilter');
                if (cf) cf.textContent = 'All Emails';

                // Restore full list
                displayEmails(allEmails || []);
                updateDisplayStats(allEmails || []);

                // Restore sidebar state to "View All"
                try {
                    document.querySelectorAll('.category-item').forEach(el => el.classList.remove('active'));
                    const viewAll = document.getElementById('viewAll');
                    if (viewAll) viewAll.classList.add('active');
                } catch (_) {}
            } catch (e) {
                console.error('clearSearch failed:', e);
            }
        }

        async function openEmailThread(emailId, subject) {
            try {
                const listPane = document.querySelector('.email-list');
                const threadPane = document.getElementById('threadView');

                if (threadPane) {
                    threadPane.style.display = 'block';
                }
                if (listPane) {
                    listPane.style.display = 'none';
                }

                // Render skeleton header while loading
                if (threadPane) {
                    const safeSubject = (typeof escapeHtml === 'function') ? escapeHtml(subject || 'Email Thread') : (subject || 'Email Thread');
                    threadPane.innerHTML = `
                        <div class="thread-header">
                            <div class="thread-header-left">
                                <button class="back-thread-btn" onclick="backToEmailList()">← Back</button>
                                <div class="thread-title">${safeSubject}</div>
                            </div>
                            <button class="reply-thread-btn" onclick="replyToCurrentThread()">Reply</button>
                        </div>
                        <div class="thread-body">
                            <div class="loading">Loading thread...</div>
                        </div>
                    `;
                }

                // Fetch thread data (prefer live Gmail thread when available to ensure latest user message shows)
                let messages = null;
                let finalSubject = subject;

                // Try Gmail full thread by message id first
                try {
                    const g = await fetch(`/api/gmail-thread-by-message/${encodeURIComponent(emailId)}`);
                    const gd = await g.json().catch(() => ({}));
                    if (g.ok && gd && gd.success && Array.isArray(gd.messages) && gd.messages.length) {
                        messages = gd.messages;
                        if (gd.thread && gd.thread.subject) {
                            finalSubject = gd.thread.subject || finalSubject;
                        }
                    }
                } catch (_) {
                    // ignore and fall back
                }

                // Fallback to stored thread construction
                if (!messages) {
                    const response = await fetch(`/api/email-thread/${encodeURIComponent(emailId)}`);
                    const threadData = await response.json().catch(() => ({}));
                    if (response.ok && threadData && Array.isArray(threadData.messages) && threadData.messages.length) {
                        messages = threadData.messages;
                    }
                }

                if (Array.isArray(messages)) {
                    const metaEmail = (Array.isArray(allEmails) ? allEmails : []).find(e => e && e.id === emailId) || null;
                    const categories = (Array.isArray(metaEmail?.categories) && metaEmail.categories.length)
                        ? metaEmail.categories
                        : (metaEmail?.category ? [metaEmail.category] : []);
                    window.currentThreadContext = {
                        emailId,
                        subject: finalSubject,
                        categories,
                        messages
                    };
                    // Seed current context for Generate Response buttons
                    window.currentContextCategories = categories.slice();
                    currentContextCategory = categories[0] || '';
                    window.currentContextEmailId = emailId;
                    renderThreadInPane(finalSubject, messages, currentContextCategory);
                } else {
                    if (threadPane) {
                        const bodyEl = threadPane.querySelector('.thread-body');
                        if (bodyEl) bodyEl.innerHTML = '<div class="error">Failed to load email thread.</div>';
                    }
                }
            } catch (error) {
                console.error('Error loading thread:', error);
                const threadPane = document.getElementById('threadView');
                if (threadPane) {
                    const safeSubject = (typeof escapeHtml === 'function') ? escapeHtml(subject || 'Email Thread') : (subject || 'Email Thread');
                    threadPane.innerHTML = `
                        <div class="thread-header">
                            <div class="thread-header-left">
                                <button class="back-thread-btn" onclick="backToEmailList()">← Back</button>
                                <div class="thread-title">${safeSubject}</div>
                            </div>
                            <button class="reply-thread-btn" onclick="replyToCurrentThread()">Reply</button>
                        </div>
                        <div class="thread-body">
                            <div class="error">Failed to load email thread. Please try again.</div>
                        </div>
                    `;
                }
            }
        }

        function displayThread(messages) {
            const threadContainer = document.getElementById('threadContainer');
            threadContainer.innerHTML = '';
            
            messages.forEach(message => {
                const messageDiv = document.createElement('div');
                messageDiv.className = `thread-message ${message.isResponse ? 'response' : 'original'}`;
                
                const toList = Array.isArray(message.to) ? message.to.join(', ') : message.to;
                
                messageDiv.innerHTML = `
                    <div class="message-header">
                        <div class="message-from">
                            ${message.from}
                            ${message.isResponse ? '<span class="response-badge">Your Response</span>' : ''}
                        </div>
                        <div class="message-to">To: ${toList}</div>
                        <div class="message-date">${new Date(message.date).toLocaleString()}</div>
                    </div>
                    <div class="message-body">${message.body}</div>
                `;
                
                threadContainer.appendChild(messageDiv);
            });
        }

        // Render the thread inside the RHS pane (Gmail-like)
        function renderThreadInPane(subject, messages, category) {
            const threadPane = document.getElementById('threadView');
            if (!threadPane) return;

            const safeSubject = (typeof escapeHtml === 'function') ? escapeHtml(subject || 'Email Thread') : (subject || 'Email Thread');
            const sorted = (Array.isArray(messages) ? messages.slice() : []).sort((a,b) => new Date(a.date) - new Date(b.date));
            const cards = sorted.map(m => {
                const toList = Array.isArray(m.to) ? m.to.join(', ') : (m.to || '');
                const fromSafe = (typeof escapeHtml === 'function') ? escapeHtml(m.from || 'Unknown Sender') : (m.from || 'Unknown Sender');
                const toSafe = (typeof escapeHtml === 'function') ? escapeHtml(toList) : toList;
                const badge = m.isResponse ? '<span class="response-badge">Your Response</span>' : '';
                const bodyHtml = m.body != null ? String(m.body) : '';
                return `
                    <div class="thread-message-card ${m.isResponse ? 'response' : 'original'}">
                        <div class="message-header">
                            <div class="message-from" style="display:flex; align-items:center; gap:8px;">
                                ${fromSafe} ${badge}
                            </div>
                            <div class="message-to">To: ${toSafe}</div>
                            <div class="message-date">${new Date(m.date).toLocaleString()}</div>
                        </div>
                        <div class="message-body">${bodyHtml}</div>
                    </div>
                `;
            }).join('');

            threadPane.innerHTML = `
                <div class="thread-header">
                    <div class="thread-header-left">
                        <button class="back-thread-btn" onclick="backToEmailList()">← Back</button>
                        <div class="thread-title">${safeSubject}</div>
                    </div>
                    <button class="reply-thread-btn" onclick="replyToCurrentThread()">Reply</button>
                </div>
                <div class="thread-body">
                    <div id="thread-notes-preview" class="notes-preview" style="display:none;"></div>
                    ${cards || '<div class="no-emails" style="padding: 12px;">No messages in this thread.</div>'}
                    <div id="inlineReplyCompose" class="inline-compose" style="display:none; margin-top: 12px;"></div>
                </div>
            `;
            // Render email notes preview box for this thread
            try {
                const __tnp = threadPane.querySelector('#thread-notes-preview');
                const __eid = (window.currentThreadContext && window.currentThreadContext.emailId) || '';
                if (__tnp && __eid) renderEmailNotesPreview(__tnp, __eid);
            } catch (_) {}
        }

        // Back to list view
        function backToEmailList() {
            try {
                const listPane = document.querySelector('.email-list');
                const threadPane = document.getElementById('threadView');
                if (listPane) listPane.style.display = 'block';
                if (threadPane) {
                    threadPane.style.display = 'none';
                    threadPane.innerHTML = '';
                }
                window.currentThreadContext = null;
            } catch (_) {}
        }

        // Reply button entrypoint: open inline Generate Response with latest message filled in
        function replyToCurrentThread() {
            try {
                const ctx = window.currentThreadContext || {};
                const messages = Array.isArray(ctx.messages) ? ctx.messages.slice() : [];
                if (!messages.length) {
                    showErrorPopup('No messages available to reply to.', 'No Messages');
                    return;
                }
                // Prefer the latest non-response message; fallback to the last message
                const sorted = messages.slice().sort((a,b) => new Date(a.date) - new Date(b.date));
                const latestIncoming = [...sorted].reverse().find(m => !m.isResponse) || sorted[sorted.length - 1];

                // Show inline composer instead of popup
                showInlineReplyComposer(latestIncoming, ctx);
            } catch (e) {
                console.error('replyToCurrentThread failed:', e);
                showErrorPopup('Failed to open reply composer.', 'Reply Failed');
            }
        }

        // Inline composer renderer (injects Generate Response UI below thread and scrolls to it)
        function showInlineReplyComposer(latestIncoming, ctx) {
            try {
                // Remove popup modal if it exists to avoid duplicate element IDs
                const existingModal = document.getElementById('generateResponseModal');
                if (existingModal) { try { existingModal.remove(); } catch(_) {} }

                const threadPane = document.getElementById('threadView');
                const container = document.getElementById('inlineReplyCompose');
                if (!threadPane || !container) return;

                // Build inline compose once
                if (!container.hasChildNodes()) {
                    container.innerHTML = `
                        <div class="generate-form-container">
                            <form id="generateResponseForm" onsubmit="handleGenerateResponse(event)">
                                <div class="form-group">
                                    <label for="senderInput">Sender:</label>
                                    <input type="text" id="senderInput" placeholder="Enter sender email (optional)">
                                </div>
                                <div class="form-group">
                                    <label for="subjectInput">Subject:</label>
                                    <input type="text" id="subjectInput" placeholder="Enter email subject (optional)">
                                </div>
                                <div class="form-group">
                                    <label for="emailBodyInput">Email Body: <span class="required">*</span></label>
                                    <textarea id="emailBodyInput" rows="8" placeholder="Enter the email content you want to respond to..." required></textarea>
                                </div>
                                <div class="form-group">
                                    <label for="contextInput" style="display:flex; align-items:center; justify-content:space-between;">
                                        <span>Additional Context:</span>
                                        <div style="display:flex; gap:8px;">
                                            <button type="button" id="seeEmailNotesBtn" class="select-email-btn" style="display:none;">See Email Notes</button>
                                            <button type="button" id="seeCategorySummaryBtn" class="select-email-btn" style="display:none;">See Category Summary</button>
                                            <button type="button" id="seeCategoryNotesBtn" class="select-email-btn" style="display:none;">See Category Notes</button>
                                        </div>
                                    </label>
                                    <textarea id="contextInput" rows="3" placeholder="Any additional context or specific instructions (optional)"></textarea>
                                </div>
                                <div class="form-actions">
                                    <button type="submit" class="generate-submit-btn">
                                        <span class="btn-text">Generate Response</span>
                                        <span class="btn-loading" style="display: none;">Generating...</span>
                                    </button>
                                </div>
                            </form>

                            <div id="generatedResponseArea" style="display: none;">
                                <div class="response-header">
                                    <h3>Generated Response:</h3>
                                    <div style="display: flex; gap: 8px;">
                                        <button class="copy-response-btn" onclick="copyResponseToClipboard()">Copy to Clipboard</button>
                                        <button class="edit-response-btn" onclick="enableResponseEditing()">Edit</button>
                                    </div>
                                </div>
                                <div class="response-content">
                                    <div id="responseDisplay" class="response-display"></div>
                                    <textarea id="responseEditor" class="response-editor" style="display: none;"></textarea>
                                </div>
                                <div class="response-actions">
                                    <button class="save-edit-btn" onclick="saveResponseEdit()" style="display: none;">Save Changes</button>
                                    <button class="cancel-edit-btn" onclick="cancelResponseEdit()" style="display: none;">Cancel</button>
                                </div>
                            </div>

                            <div id="refineSection" style="display: none;">
                                <div class="refine-header">
                                    <h3>Refine Response:</h3>
                                </div>
                                <div class="form-group">
                                    <textarea id="refinePrompt" rows="3" placeholder="Describe how you'd like to modify the response (e.g., 'make it more formal', 'add availability for next week', 'make it shorter')"></textarea>
                                </div>
                                <div class="refine-actions">
                                    <button class="refine-btn" onclick="refineResponse()">
                                        <span class="btn-text">Refine Response</span>
                                        <span class="btn-loading" style="display: none;">Refining...</span>
                                    </button>
                                    <button class="save-response-btn" onclick="saveCurrentResponse()">
                                        <span class="btn-text">Save Response</span>
                                        <span class="btn-loading" style="display: none;">Saving...</span>
                                    </button>
                                </div>
                            </div>
                        </div>
                    `;
                }

                // Make visible and prefill fields
                container.style.display = 'block';
                const from = latestIncoming.from || '';
                const subj = latestIncoming.subject || (ctx && ctx.subject) || '';
                const body = (latestIncoming.body != null ? String(latestIncoming.body) : '');

                const senderInput = document.getElementById('senderInput');
                const subjectInput = document.getElementById('subjectInput');
                const emailBodyInput = document.getElementById('emailBodyInput');
                if (senderInput) senderInput.value = from;
                if (subjectInput) subjectInput.value = subj;
                if (emailBodyInput) emailBodyInput.value = body;

                // Expose contextual buttons for associated categories and email notes
                const cats = Array.isArray(ctx.categories) && ctx.categories.length
                    ? ctx.categories.slice()
                    : (ctx.category ? [ctx.category] : []);
                window.currentContextCategories = cats;
                currentContextCategory = cats[0] || '';
                window.currentContextEmailId = ctx.emailId || window.currentContextEmailId;

                const seeNotesBtn = document.getElementById('seeCategoryNotesBtn');
                const seeSummaryBtn = document.getElementById('seeCategorySummaryBtn');
                const seeEmailNotesBtn = document.getElementById('seeEmailNotesBtn');

                if (seeNotesBtn) {
                    if (cats.length) {
                        seeNotesBtn.style.display = 'inline-block';
                        seeNotesBtn.onclick = showSeeCategoryNotesModal;
                    } else {
                        seeNotesBtn.style.display = 'none';
                        seeNotesBtn.onclick = null;
                    }
                }
                if (seeSummaryBtn) {
                    if (cats.length) {
                        seeSummaryBtn.style.display = 'inline-block';
                        seeSummaryBtn.onclick = () => showAggregateCategorySummariesModal(cats);
                    } else {
                        seeSummaryBtn.style.display = 'none';
                        seeSummaryBtn.onclick = null;
                    }
                }
                if (seeEmailNotesBtn) {
                    if (window.currentContextEmailId) {
                        seeEmailNotesBtn.style.display = 'inline-block';
                        seeEmailNotesBtn.onclick = showEmailNotesForContext;
                    } else {
                        seeEmailNotesBtn.style.display = 'none';
                        seeEmailNotesBtn.onclick = null;
                    }
                }

                // Focus and scroll into view
                try { emailBodyInput && emailBodyInput.focus(); } catch(_) {}
                try { container.scrollIntoView({ behavior: 'smooth', block: 'start' }); }
                catch(_) { try { threadPane.scrollTop = threadPane.scrollHeight; } catch(_) {} }
            } catch (e) {
                console.error('showInlineReplyComposer failed:', e);
                showErrorPopup('Failed to render inline composer.', 'Reply Failed');
            }
        }

        function closeModal() {
            const modal = document.getElementById('threadModal');
            modal.style.display = 'none';
        }

        // Close modal when clicking outside of it
        window.onclick = function(event) {
            const modal = document.getElementById('threadModal');
            if (event.target === modal) {
                closeModal();
            }
        }

        function updateStats(emails) {
            document.getElementById('totalEmails').textContent = emails.length;
            
            const categories = [...new Set(emails.map(e => e.category))];
            document.getElementById('categories').textContent = categories.length;
            
            const thisWeek = emails.filter(email => {
                const emailDate = new Date(email.date);
                const weekAgo = new Date();
                weekAgo.setDate(weekAgo.getDate() - 7);
                return emailDate > weekAgo;
            }).length;
            document.getElementById('thisWeek').textContent = thisWeek;
        }

        // Generate Response Modal functionality
let unrepliedEmails = [];
let currentGeneratedResponse = '';
// Category notes support for Generate Response workflow
let currentContextCategory = '';
let currentContextCategories = [];
let cachedCategoryNotes = [];
let cachedGlobalNotes = [];
// Email context for "See Email Notes" in Generate Response flow
window.currentContextEmailId = window.currentContextEmailId || '';

        async function generateResponse() {
            // Show the Generate Response modal
            showGenerateResponseModal();
        }

        function showGenerateResponseModal() {
            // Create modal HTML if it doesn't exist
            let modal = document.getElementById('generateResponseModal');
            if (!modal) {
                modal = createGenerateResponseModal();
                document.body.appendChild(modal);
            }
            
            // Reset form and clear cached response
            document.getElementById('senderInput').value = '';
            document.getElementById('subjectInput').value = '';
            document.getElementById('emailBodyInput').value = '';
            document.getElementById('contextInput').value = '';
            document.getElementById('generatedResponseArea').style.display = 'none';
            document.getElementById('refineSection').style.display = 'none';
            
            // Clear the cached response
            currentGeneratedResponse = '';
            currentContextCategory = '';
            window.currentContextCategories = [];
            window.currentContextEmailId = '';

            // Ensure contextual buttons exist and order with "See Email Notes" first (leftmost)
            const _summaryBtn = document.getElementById('seeCategorySummaryBtn');
            const _notesBtn = document.getElementById('seeCategoryNotesBtn');
            let _emailBtn = document.getElementById('seeEmailNotesBtn');
            const _btnRow = (_summaryBtn && _summaryBtn.parentElement) || (_notesBtn && _notesBtn.parentElement);
            if (_btnRow) {
                if (!_emailBtn) {
                    _emailBtn = document.createElement('button');
                    _emailBtn.type = 'button';
                    _emailBtn.id = 'seeEmailNotesBtn';
                    _emailBtn.className = 'select-email-btn';
                    _emailBtn.style.display = 'none';
                    _emailBtn.textContent = 'See Email Notes';
                    _btnRow.insertBefore(_emailBtn, _btnRow.firstChild);
                } else {
                    if (_btnRow.firstChild !== _emailBtn) {
                        _btnRow.insertBefore(_emailBtn, _btnRow.firstChild);
                    }
                }
            }
            // Hide contextual buttons by default
            const seeNotesBtn = _notesBtn || document.getElementById('seeCategoryNotesBtn');
            const seeSummaryBtn = _summaryBtn || document.getElementById('seeCategorySummaryBtn');
            const seeEmailNotesBtn = _emailBtn || document.getElementById('seeEmailNotesBtn');
            if (seeNotesBtn) { seeNotesBtn.style.display = 'none'; seeNotesBtn.onclick = null; }
            if (seeSummaryBtn) { seeSummaryBtn.style.display = 'none'; seeSummaryBtn.onclick = null; }
            if (seeEmailNotesBtn) { seeEmailNotesBtn.style.display = 'none'; seeEmailNotesBtn.onclick = null; }
            
            // Remove any existing justification section
            const existingJustification = document.getElementById('justificationSection');
            if (existingJustification) {
                existingJustification.remove();
            }
            
            modal.style.display = 'block';
        }

        function createGenerateResponseModal() {
            const modal = document.createElement('div');
            modal.id = 'generateResponseModal';
            modal.className = 'modal';
            modal.innerHTML = `
                <div class="modal-content generate-response-modal">
                    <div class="modal-header">
                        <div style="display: flex; align-items: center; gap: 15px;">
                            <h2 class="modal-title">Generate Email Response</h2>
                            <button class="select-email-btn" onclick="showSelectEmailModal()">Load Email From Inbox</button>
                            <button class="select-email-btn" onclick="showSelectTestEmailModal()">Load Test Emails</button>
                        </div>
                        <button class="close" onclick="closeGenerateResponseModal()">&times;</button>
                    </div>
                    <div class="generate-form-container">
                        <form id="generateResponseForm" onsubmit="handleGenerateResponse(event)">
                            <div class="form-group">
                                <label for="senderInput">Sender:</label>
                                <input type="text" id="senderInput" placeholder="Enter sender email (optional)">
                            </div>
                            <div class="form-group">
                                <label for="subjectInput">Subject:</label>
                                <input type="text" id="subjectInput" placeholder="Enter email subject (optional)">
                            </div>
                            <div class="form-group">
                                <label for="emailBodyInput">Email Body: <span class="required">*</span></label>
                                <textarea id="emailBodyInput" rows="8" placeholder="Enter the email content you want to respond to..." required></textarea>
                            </div>
                            <div class="form-group">
                                <label for="contextInput" style="display:flex; align-items:center; justify-content:space-between;">
                                    <span>Additional Context:</span>
                                    <div style="display:flex; gap:8px;">
                                        <button type="button" id="seeEmailNotesBtn" class="select-email-btn" style="display:none;">See Email Notes</button>
                                        <button type="button" id="seeCategorySummaryBtn" class="select-email-btn" style="display:none;">See Category Summary</button>
                                        <button type="button" id="seeCategoryNotesBtn" class="select-email-btn" style="display:none;">See Category Notes</button>
                                    </div>
                                </label>
                                <textarea id="contextInput" rows="3" placeholder="Any additional context or specific instructions (optional)"></textarea>
                            </div>
                            <div class="form-actions">
                                <button type="submit" class="generate-submit-btn">
                                    <span class="btn-text">Generate Response</span>
                                    <span class="btn-loading" style="display: none;">Generating...</span>
                                </button>
                            </div>
                        </form>
                        
                        <div id="generatedResponseArea" style="display: none;">
                            <div class="response-header">
                                <h3>Generated Response:</h3>
                                <div style="display: flex; gap: 8px;">
                                    <button class="copy-response-btn" onclick="copyResponseToClipboard()">Copy to Clipboard</button>
                                    <button class="edit-response-btn" onclick="enableResponseEditing()">Edit</button>
                                </div>
                            </div>
                            <div class="response-content">
                                <div id="responseDisplay" class="response-display"></div>
                                <textarea id="responseEditor" class="response-editor" style="display: none;"></textarea>
                            </div>
                            <div class="response-actions">
                                <button class="save-edit-btn" onclick="saveResponseEdit()" style="display: none;">Save Changes</button>
                                <button class="cancel-edit-btn" onclick="cancelResponseEdit()" style="display: none;">Cancel</button>
                            </div>
                        </div>

                        <div id="refineSection" style="display: none;">
                            <div class="refine-header">
                                <h3>Refine Response:</h3>
                            </div>
                            <div class="form-group">
                                <textarea id="refinePrompt" rows="3" placeholder="Describe how you'd like to modify the response (e.g., 'make it more formal', 'add availability for next week', 'make it shorter')"></textarea>
                            </div>
                            <div class="refine-actions">
                                <button class="refine-btn" onclick="refineResponse()">
                                    <span class="btn-text">Refine Response</span>
                                    <span class="btn-loading" style="display: none;">Refining...</span>
                                </button>
                                <button class="save-response-btn" onclick="saveCurrentResponse()">
                                    <span class="btn-text">Save Response</span>
                                    <span class="btn-loading" style="display: none;">Saving...</span>
                                </button>
                            </div>
                        </div>
                    </div>
                </div>
            `;
            return modal;
        }

        async function showSelectEmailModal() {
            // Always refresh unreplied emails to reflect latest category changes
            await loadUnrepliedEmails();
            // Load current authoritative categories ordering
            await loadCurrentCategories();
            
            // Create select email modal
            let selectModal = document.getElementById('selectEmailModal');
            if (!selectModal) {
                selectModal = createSelectEmailModal();
                document.body.appendChild(selectModal);
            }
            
            populateUnrepliedEmails();
            selectModal.style.display = 'block';
        }

        async function showSelectTestEmailModal() {
            // Create select test email modal
            let selectTestModal = document.getElementById('selectTestEmailModal');
            if (!selectTestModal) {
                selectTestModal = createSelectTestEmailModal();
                document.body.appendChild(selectTestModal);
            }
            
            await loadAndPopulateTestEmails();
            selectTestModal.style.display = 'block';
        }

        function createSelectTestEmailModal() {
            const modal = document.createElement('div');
            modal.id = 'selectTestEmailModal';
            modal.className = 'modal';
            modal.innerHTML = `
                <div class="modal-content select-email-modal">
                    <div class="modal-header">
                        <h2 class="modal-title">Load Test Emails</h2>
                        <button class="close" onclick="closeSelectTestEmailModal()">&times;</button>
                    </div>
                    <div class="select-email-container">
                        <div class="email-search">
                            <input type="text" id="testEmailSearchInput" placeholder="Search test emails..." onkeyup="filterTestEmails()">
                        </div>
                        <div id="testEmailsList" class="unreplied-emails-list">
                            <div class="loading">Loading test emails...</div>
                        </div>
                    </div>
                </div>
            `;
            return modal;
        }

        async function loadAndPopulateTestEmails() {
            const container = document.getElementById('testEmailsList');
            
            try {
                const response = await fetch('/api/test-emails');
                const data = await response.json();
                
                if (data.emails && data.emails.length > 0) {
                    populateTestEmails(data.emails);
                } else {
                    container.innerHTML = '<div class="no-emails">No test emails available.</div>';
                }
            } catch (error) {
                console.error('Error loading test emails:', error);
                container.innerHTML = '<div class="error">Failed to load test emails. Please try again.</div>';
            }
        }

        function populateTestEmails(testEmails) {
            const container = document.getElementById('testEmailsList');
            container.innerHTML = '';
            
            testEmails.forEach(email => {
                const emailDiv = document.createElement('div');
                emailDiv.className = 'unreplied-email-item';
                emailDiv.onclick = () => selectTestEmail(email);
                
                emailDiv.innerHTML = `
                    <div class="unreplied-email-content">
                        <div class="unreplied-email-header">
                            <div class="unreplied-email-from">${email.from}</div>
                            <div class="unreplied-email-date">Test Email</div>
                        </div>
                        <div class="unreplied-email-subject">${email.subject}</div>
                        <div class="unreplied-email-preview">${email.body.substring(0, 150)}...</div>
                        <div class="email-category category-academic-affairs">Test Email</div>
                    </div>
                `;
                
                container.appendChild(emailDiv);
            });
        }

        function filterTestEmails() {
            const searchTerm = document.getElementById('testEmailSearchInput').value.toLowerCase();
            const emailItems = document.querySelectorAll('#testEmailsList .unreplied-email-item');
            
            emailItems.forEach(item => {
                const from = item.querySelector('.unreplied-email-from').textContent.toLowerCase();
                const subject = item.querySelector('.unreplied-email-subject').textContent.toLowerCase();
                const preview = item.querySelector('.unreplied-email-preview').textContent.toLowerCase();
                
                if (from.includes(searchTerm) || subject.includes(searchTerm) || preview.includes(searchTerm)) {
                    item.style.display = 'block';
                } else {
                    item.style.display = 'none';
                }
            });
        }

        function selectTestEmail(email) {
            // Populate the form with selected test email data
            document.getElementById('senderInput').value = email.from;
            document.getElementById('subjectInput').value = email.subject;
            document.getElementById('emailBodyInput').value = email.body;

            // If categories are present on the test email, set context categories (may be multiple)
            const cats = Array.isArray(email?.categories) && email.categories.length ? email.categories.slice() : (email.category ? [email.category] : []);
            window.currentContextCategories = cats;
            currentContextCategory = cats[0] || '';
            window.currentContextEmailId = email.id || '';

            const seeNotesBtn = document.getElementById('seeCategoryNotesBtn');
            const seeSummaryBtn = document.getElementById('seeCategorySummaryBtn');
            const seeEmailNotesBtn = document.getElementById('seeEmailNotesBtn');

            if (seeNotesBtn) {
                if (cats.length) {
                    seeNotesBtn.style.display = 'inline-block';
                    seeNotesBtn.onclick = showSeeCategoryNotesModal;
                } else {
                    seeNotesBtn.style.display = 'none';
                    seeNotesBtn.onclick = null;
                }
            }
            if (seeSummaryBtn) {
                if (cats.length) {
                    seeSummaryBtn.style.display = 'inline-block';
                    seeSummaryBtn.onclick = () => showAggregateCategorySummariesModal(cats);
                } else {
                    seeSummaryBtn.style.display = 'none';
                    seeSummaryBtn.onclick = null;
                }
            }
            if (seeEmailNotesBtn) {
                if (window.currentContextEmailId) {
                    seeEmailNotesBtn.style.display = 'inline-block';
                    seeEmailNotesBtn.onclick = showEmailNotesForContext;
                } else {
                    seeEmailNotesBtn.style.display = 'none';
                    seeEmailNotesBtn.onclick = null;
                }
            }
            
            // Close select test email modal
            closeSelectTestEmailModal();
        }

        function closeSelectTestEmailModal() {
            const modal = document.getElementById('selectTestEmailModal');
            if (modal) {
                modal.style.display = 'none';
            }
        }

        function createSelectEmailModal() {
            const modal = document.createElement('div');
            modal.id = 'selectEmailModal';
            modal.className = 'modal';
            modal.innerHTML = `
                <div class="modal-content select-email-modal">
                    <div class="modal-header">
                        <h2 class="modal-title">Load Email From Inbox</h2>
                        <button class="close" onclick="closeSelectEmailModal()">&times;</button>
                    </div>
                <div class="select-email-container">
                    <div class="email-search">
                        <input type="text" id="emailSearchInput" placeholder="Search emails..." onkeyup="filterUnrepliedEmails()">
                    </div>
                    <div style="margin-bottom: 8px; text-align: center;">
                        <button class="select-email-btn" id="updateInboxCategoriesBtn" onclick="updateInboxCategories()" style="background: #667eea; width: 100%; padding: 10px;">
                            🔄 Update Categories
                        </button>
                    </div>
                    <div style="margin-bottom: 15px; text-align: center;">
                        <button class="select-email-btn" onclick="showLoadMoreEmailsModal()" style="background: #28a745; width: 100%; padding: 12px;">
                            📥 Load More Emails from Inbox
                        </button>
                    </div>
                    <div id="unrepliedEmailsList" class="unreplied-emails-list">
                        <div class="loading">Loading unreplied emails...</div>
                    </div>
                </div>
                </div>
            `;
            return modal;
        }

        async function loadUnrepliedEmails() {
            try {
                const response = await fetch('/api/unreplied-emails');
                const data = await response.json();
                unrepliedEmails = data.emails || [];
            } catch (error) {
                console.error('Error loading unreplied emails:', error);
                unrepliedEmails = [];
            }
        }

        async function loadCurrentCategories() {
            try {
                const resp = await fetch('/api/current-categories');
                const data = await resp.json();
                currentCategoriesOrder = Array.isArray(data.categories) ? data.categories : [];
            } catch (e) {
                console.error('Error loading current categories:', e);
                currentCategoriesOrder = [];
            }
        }

/* Map a raw category name to the closest entry in the currentCategoriesOrder.
   Mirrors server-side matchToCurrentCategory behavior (case-insensitive exact, normalized key, token overlap). */
function normalizeKeyClient(s) {
    return String(s || '')
        .toLowerCase()
        .replace(/&/g, ' and ')
        .replace(/[^a-z0-9\s]/g, ' ')
        .replace(/\s+/g, ' ')
        .trim();
}
function mapToCurrentCategory(name) {
    const input = String(name || '').trim();
    const ordered = Array.isArray(currentCategoriesOrder) ? currentCategoriesOrder : [];
    if (!ordered.length) return input || 'Other';

    // 1) Case-insensitive exact
    const lower = input.toLowerCase();
    const exact = ordered.find(c => String(c || '').toLowerCase() === lower);
    if (exact) return exact;

    // 2) Normalized-key equality
    const key = normalizeKeyClient(input);
    const normalizedMap = new Map();
    ordered.forEach(c => normalizedMap.set(normalizeKeyClient(c), c));
    if (normalizedMap.has(key)) return normalizedMap.get(key);

    // 3) Token overlap heuristic
    const tokens = new Set(key.split(' ').filter(Boolean));
    let best = null;
    let bestScore = -1;
    for (const c of ordered) {
        const ck = normalizeKeyClient(c);
        const ctokens = new Set(ck.split(' ').filter(Boolean));
        let overlap = 0;
        tokens.forEach(t => { if (ctokens.has(t)) overlap++; });
        if (overlap > bestScore) {
            bestScore = overlap;
            best = c;
        }
    }
    if (best && bestScore > 0) return best;

    // 4) Fallbacks
    const fallback = ordered.find(c => String(c).toLowerCase() === 'personal & life management');
    if (fallback) return fallback;
    return ordered[0] || (input || 'Other');
}

        async function updateInboxCategories() {
            const btn = document.getElementById('updateInboxCategoriesBtn');
            const originalText = btn ? btn.textContent : null;
            try {
                if (btn) {
                    btn.disabled = true;
                    btn.textContent = 'Updating...';
                }
                // Explicit reclassification: use authoritative categories X and OpenAI
                const resp = await fetch('/api/unreplied-emails/reclassify', { method: 'POST' });
                const data = await resp.json();
                if (!resp.ok || !data.success) {
                    throw new Error(data.error || 'Reclassify failed');
                }
                // Reload lists after reclassification
                await loadUnrepliedEmails();
                await loadCurrentCategories();
                populateUnrepliedEmails();
                if (btn) {
                    const updated = typeof data.updatedCount === 'number' ? ` (${data.updatedCount} updated)` : '';
                    btn.textContent = `✓ Categories Updated${updated}`;
                    btn.style.background = '#28a745';
                    setTimeout(() => {
                        btn.textContent = '🔄 Update Categories';
                        btn.style.background = '#667eea';
                        btn.disabled = false;
                    }, 1000);
                }
            } catch (e) {
                console.error('Update categories failed:', e);
                showErrorPopup('Failed to update categories. Please try again.', 'Update Failed');
                if (btn) {
                    btn.textContent = originalText || '🔄 Update Categories';
                    btn.disabled = false;
                }
            }
        }

        function populateUnrepliedEmails() {
            const container = document.getElementById('unrepliedEmailsList');
            
            if (unrepliedEmails.length === 0) {
                container.innerHTML = '<div class="no-emails">No unreplied emails found.</div>';
                return;
            }
            
            container.innerHTML = '';
            const orderList = Array.isArray(currentCategoriesOrder) ? currentCategoriesOrder : [];
            const catIndex = (name) => {
                const n = String(name || '').toLowerCase();
                const idx = orderList.findIndex(c => String(c || '').toLowerCase() === n);
                return idx === -1 ? Number.MAX_SAFE_INTEGER : idx;
            };
            const sortedUnreplied = (unrepliedEmails || []).slice().sort((a, b) => {
                const ai = catIndex(a.category);
                const bi = catIndex(b.category);
                if (ai !== bi) return ai - bi;
                // Within the same category index, newest first
                return new Date(b.date) - new Date(a.date);
            });
            sortedUnreplied.forEach(email => {
                const emailDiv = document.createElement('div');
                emailDiv.className = 'unreplied-email-item';
                emailDiv.onclick = () => selectUnrepliedEmail(email);
                
                const categoryClass = `category-${email.category.toLowerCase().replace(/\s+/g, '-')}`;
                const catStyle = getCategoryBadgeStyle(email.category);
                
                emailDiv.innerHTML = `
                    <div class="unreplied-email-content">
                        <div class="unreplied-email-header">
                            <div class="unreplied-email-from">${email.from}</div>
                            <div class="unreplied-email-date">${formatDate(email.date)}</div>
                        </div>
                        <div class="unreplied-email-subject">${email.subject}</div>
                        <div class="unreplied-email-preview">${email.body.substring(0, 150)}...</div>
                        <div class="email-category ${categoryClass}" style="${catStyle}">${email.category}</div>
                    </div>
                `;
                
                container.appendChild(emailDiv);
            });
        }

        function filterUnrepliedEmails() {
            const searchTerm = document.getElementById('emailSearchInput').value.toLowerCase();
            const filteredEmails = unrepliedEmails.filter(email => 
                email.from.toLowerCase().includes(searchTerm) ||
                email.subject.toLowerCase().includes(searchTerm) ||
                email.body.toLowerCase().includes(searchTerm)
            );
            
            const container = document.getElementById('unrepliedEmailsList');
            container.innerHTML = '';
            
            if (filteredEmails.length === 0) {
                container.innerHTML = '<div class="no-emails">No matching emails found.</div>';
                return;
            }
            
            filteredEmails.forEach(email => {
                const emailDiv = document.createElement('div');
                emailDiv.className = 'unreplied-email-item';
                emailDiv.onclick = () => selectUnrepliedEmail(email);
                
                const categoryClass = `category-${email.category.toLowerCase().replace(/\s+/g, '-')}`;
                const catStyle = getCategoryBadgeStyle(email.category);
                
                emailDiv.innerHTML = `
                    <div class="unreplied-email-content">
                        <div class="unreplied-email-header">
                            <div class="unreplied-email-from">${email.from}</div>
                            <div class="unreplied-email-date">${formatDate(email.date)}</div>
                        </div>
                        <div class="unreplied-email-subject">${email.subject}</div>
                        <div class="unreplied-email-preview">${email.body.substring(0, 150)}...</div>
                        <div class="email-category ${categoryClass}" style="${catStyle}">${email.category}</div>
                    </div>
                `;
                
                container.appendChild(emailDiv);
            });
        }

        function selectUnrepliedEmail(email) {
            // Populate the form with selected email data
            document.getElementById('senderInput').value = email.from;
            document.getElementById('subjectInput').value = email.subject;
            document.getElementById('emailBodyInput').value = email.body;
            
            // Set current categories (may be multiple) and expose contextual buttons
            const cats = Array.isArray(email?.categories) && email.categories.length ? email.categories.slice() : (email.category ? [email.category] : []);
            window.currentContextCategories = cats;
            currentContextCategory = cats[0] || '';
            window.currentContextEmailId = email.id || '';

            const seeNotesBtn = document.getElementById('seeCategoryNotesBtn');
            const seeSummaryBtn = document.getElementById('seeCategorySummaryBtn');
            const seeEmailNotesBtn = document.getElementById('seeEmailNotesBtn');

            if (seeNotesBtn) {
                if (cats.length) {
                    seeNotesBtn.style.display = 'inline-block';
                    seeNotesBtn.onclick = showSeeCategoryNotesModal;
                } else {
                    seeNotesBtn.style.display = 'none';
                    seeNotesBtn.onclick = null;
                }
            }
            if (seeSummaryBtn) {
                if (cats.length) {
                    seeSummaryBtn.style.display = 'inline-block';
                    seeSummaryBtn.onclick = () => showAggregateCategorySummariesModal(cats);
                } else {
                    seeSummaryBtn.style.display = 'none';
                    seeSummaryBtn.onclick = null;
                }
            }
            if (seeEmailNotesBtn) {
                if (window.currentContextEmailId) {
                    seeEmailNotesBtn.style.display = 'inline-block';
                    seeEmailNotesBtn.onclick = showEmailNotesForContext;
                } else {
                    seeEmailNotesBtn.style.display = 'none';
                    seeEmailNotesBtn.onclick = null;
                }
            }

            // Close select email modal
            closeSelectEmailModal();
        }

        async function handleGenerateResponse(event) {
            event.preventDefault();
            
            const sender = document.getElementById('senderInput').value;
            const subject = document.getElementById('subjectInput').value;
            const emailBody = document.getElementById('emailBodyInput').value;
            const context = document.getElementById('contextInput').value;
            
            if (!emailBody.trim()) {
                showErrorPopup('Email body is required!', 'Missing Information');
                return;
            }
            
            // Show loading state
            const submitBtn = document.querySelector('.generate-submit-btn');
            const btnText = submitBtn.querySelector('.btn-text');
            const btnLoading = submitBtn.querySelector('.btn-loading');
            
            btnText.style.display = 'none';
            btnLoading.style.display = 'inline';
            submitBtn.disabled = true;
            
            try {
                // First, detect missing information
                const missingInfoResponse = await fetch('/api/detect-missing-info', {
                    method: 'POST',
                    headers: {
                        'Content-Type': 'application/json',
                    },
                    body: JSON.stringify({
                        sender,
                        subject,
                        emailBody
                    })
                });
                
                const missingInfoData = await missingInfoResponse.json();
                
                if (!missingInfoResponse.ok) {
                    throw new Error(missingInfoData.error || 'Failed to detect missing information');
                }
                
                // Reset loading state for validation popup
                btnText.style.display = 'inline';
                btnLoading.style.display = 'none';
                submitBtn.disabled = false;
                
                // Show validation popup
                await showMissingInfoValidationPopup(missingInfoData, sender, subject, emailBody, context);
                
            } catch (error) {
                console.error('Error in email generation process:', error);
                showErrorPopup('Failed to process email. Please try again.', 'Processing Error');
                
                // Reset loading state
                btnText.style.display = 'inline';
                btnLoading.style.display = 'none';
                submitBtn.disabled = false;
            }
        }

        async function showMissingInfoValidationPopup(missingInfoData, sender, subject, emailBody, context) {
            return new Promise((resolve) => {
                const message = missingInfoData.hasMissingInfo 
                    ? `There appears to be missing information: ${missingInfoData.missingInfo}`
                    : 'No missing information detected';
                
                const title = missingInfoData.hasMissingInfo 
                    ? 'Missing Information Detected' 
                    : 'Validation Complete';
                
                const icon = missingInfoData.hasMissingInfo ? 'warning' : 'success';
                
                // Create validation popup
                const popup = document.createElement('div');
                popup.id = 'missingInfoPopup';
                popup.className = 'popup-modal';
                popup.innerHTML = `
                    <div class="popup-content" style="max-width: 500px;">
                        <div class="popup-header">
                            <h3 class="popup-title">${title}</h3>
                        </div>
                        <div class="popup-body">
                            <span class="popup-icon popup-icon-${icon}">${icon === 'warning' ? '⚠' : '✓'}</span>
                            <p class="popup-message">${message}</p>
                            ${missingInfoData.hasMissingInfo ? `
                                <div style="margin-top: 15px;">
                                    <textarea id="userCorrectionInput" placeholder="Add any corrections or additional information (optional)" 
                                        style="width: 100%; height: 80px; padding: 8px; border: 1px solid #ddd; border-radius: 4px; font-size: 14px; resize: vertical;"></textarea>
                                </div>
                            ` : ''}
                        </div>
                        <div class="popup-actions">
                            ${missingInfoData.hasMissingInfo ? `
                                <button class="popup-btn popup-btn-secondary" id="incorrectBtn">Incorrect</button>
                                <button class="popup-btn popup-btn-primary" id="proceedBtn">Proceed</button>
                            ` : `
                                <button class="popup-btn popup-btn-success" id="proceedBtn">Proceed</button>
                            `}
                        </div>
                    </div>
                `;
                
                document.body.appendChild(popup);
                popup.style.display = 'block';
                
                const proceedBtn = popup.querySelector('#proceedBtn');
                const incorrectBtn = popup.querySelector('#incorrectBtn');
                const userCorrectionInput = popup.querySelector('#userCorrectionInput');
                
                proceedBtn.addEventListener('click', async () => {
                    const userCorrection = userCorrectionInput ? userCorrectionInput.value.trim() : '';
                    let finalContext = context;
                    
                    // Add missing information context if detected or user provided correction
                    if (missingInfoData.hasMissingInfo || userCorrection) {
                        const missingInfoContext = missingInfoData.hasMissingInfo 
                            ? `Missing information detected: ${missingInfoData.missingInfo}` 
                            : '';
                        const userContext = userCorrection 
                            ? `User correction: ${userCorrection}` 
                            : '';
                        
                        const additionalContext = [missingInfoContext, userContext].filter(c => c).join('\n');
                        finalContext = finalContext 
                            ? `${finalContext}\n\n${additionalContext}` 
                            : additionalContext;
                    }
                    
                    popup.remove();
                    await proceedWithGeneration(sender, subject, emailBody, finalContext);
                    resolve();
                });
                
                if (incorrectBtn) {
                    incorrectBtn.addEventListener('click', async () => {
                        // User says the missing information detection is incorrect
                        // Proceed with normal generation (no missing information context)
                        popup.remove();
                        await proceedWithGeneration(sender, subject, emailBody, context);
                        resolve();
                    });
                }
                
                // Close on background click
                popup.addEventListener('click', function(event) {
                    if (event.target === popup) {
                        popup.remove();
                        resolve();
                    }
                });
            });
        }

        async function proceedWithGeneration(sender, subject, emailBody, context) {
            // Show loading state
            const submitBtn = document.querySelector('.generate-submit-btn');
            const btnText = submitBtn.querySelector('.btn-text');
            const btnLoading = submitBtn.querySelector('.btn-loading');
            
            btnText.style.display = 'none';
            btnLoading.style.display = 'inline';
            submitBtn.disabled = true;
            
            try {
                const response = await fetch('/api/generate-response', {
                    method: 'POST',
                    headers: {
                        'Content-Type': 'application/json',
                    },
                    body: JSON.stringify({
                        sender,
                        subject,
                        emailBody,
                        context
                    })
                });
                
                const data = await response.json();
                
                if (data.response) {
                    currentGeneratedResponse = data.response;
                    displayGeneratedResponse(data.response, data.justification);
                } else {
                    showErrorPopup('Failed to generate response: ' + (data.error || 'Unknown error'), 'Generation Failed');
                }
            } catch (error) {
                console.error('Error generating response:', error);
                showErrorPopup('Failed to generate response. Please try again.', 'Network Error');
            } finally {
                // Reset loading state
                btnText.style.display = 'inline';
                btnLoading.style.display = 'none';
                submitBtn.disabled = false;
            }
        }

        function displayGeneratedResponse(response, justification) {
            const responseArea = document.getElementById('generatedResponseArea');
            const responseDisplay = document.getElementById('responseDisplay');
            const refineSection = document.getElementById('refineSection');
            
            // Remove "Response:" or "Response" from the beginning if present
            let cleanedResponse = response;
            if (cleanedResponse.toLowerCase().startsWith('response:')) {
                cleanedResponse = cleanedResponse.substring(9).trim();
            } else if (cleanedResponse.toLowerCase().startsWith('response')) {
                cleanedResponse = cleanedResponse.substring(8).trim();
            }
            
            // Remove "REFINED RESPONSE" header if present
            if (cleanedResponse.toLowerCase().startsWith('refined response:')) {
                cleanedResponse = cleanedResponse.substring(17).trim();
            } else if (cleanedResponse.toLowerCase().startsWith('refined response')) {
                cleanedResponse = cleanedResponse.substring(16).trim();
            }
            
            responseDisplay.innerHTML = cleanedResponse.replace(/\n/g, '<br>');
            responseArea.style.display = 'block';
            refineSection.style.display = 'block';
            
            // Create and display justification section (append if refinement)
            createJustificationSection(justification);
        }

        function createJustificationSection(justification) {
            // Check if this is a refinement by looking for existing justification
            const existingSection = document.getElementById('justificationSection');
            
            if (existingSection) {
                // This is a refinement - append new justification below existing
                const existingContent = document.getElementById('justificationContent');
                const currentJustification = existingContent.innerHTML;
                
                // Add separator and new justification
                const newJustificationHtml = `
                    ${currentJustification}
                    <hr style="margin: 20px 0; border: none; border-top: 2px solid #d2b48c; opacity: 0.5;">
                    <div style="margin-top: 15px;">
                        <strong style="color: #8b4513; font-size: 14px; text-transform: uppercase;">Refinement Justification:</strong>
                        ${formatJustification(justification)}
                    </div>
                `;
                
                existingContent.innerHTML = newJustificationHtml;
            } else {
                // This is the first generation - create new justification section
                const justificationSection = document.createElement('div');
                justificationSection.id = 'justificationSection';
                justificationSection.innerHTML = `
                    <div class="justification-container">
                        <div class="justification-header" onclick="toggleJustification()">
                            <h3>Response Justification</h3>
                            <span class="justification-toggle">◀</span>
                        </div>
                        <div class="justification-content" id="justificationContent">
                            ${formatJustification(justification)}
                        </div>
                    </div>
                `;
                
                // Insert between generated response area and refine section
                const refineSection = document.getElementById('refineSection');
                refineSection.parentNode.insertBefore(justificationSection, refineSection);
            }
        }

        function formatJustification(justification) {
            if (!justification) {
                return '<p>No justification provided.</p>';
            }
            
            // Remove "Justification:" or "Justification" from the beginning if present
            let cleanedJustification = justification;
            if (cleanedJustification.toLowerCase().startsWith('justification:')) {
                cleanedJustification = cleanedJustification.substring(13).trim();
            } else if (cleanedJustification.toLowerCase().startsWith('justification')) {
                cleanedJustification = cleanedJustification.substring(13).trim();
            }
            
            // Split justification into bullet points if it contains line breaks
            const lines = cleanedJustification.split('\n').filter(line => line.trim());
            
            if (lines.length <= 1) {
                return `<p>${cleanedJustification}</p>`;
            }
            
            // Format as bullet points, but filter out empty or very short lines
            const bulletPoints = lines
                .map(line => {
                    const trimmed = line.trim();
                    // Remove existing bullet points or dashes
                    const cleaned = trimmed.replace(/^[-•*]\s*/, '');
                    return cleaned;
                })
                .filter(cleaned => cleaned.length > 2) // Filter out empty or very short lines
                .map(cleaned => `<li>${cleaned}</li>`)
                .join('');
            
            if (bulletPoints) {
                return `<ul>${bulletPoints}</ul>`;
            } else {
                return `<p>${cleanedJustification}</p>`;
            }
        }

        function toggleJustification() {
            const content = document.getElementById('justificationContent');
            const toggle = document.querySelector('.justification-toggle');
            
            if (content.style.display === 'none' || content.style.display === '') {
                content.style.display = 'block';
                toggle.classList.add('expanded');
                toggle.textContent = '▼';
            } else {
                content.style.display = 'none';
                toggle.classList.remove('expanded');
                toggle.textContent = '◀';
            }
        }

        function enableResponseEditing() {
            const responseDisplay = document.getElementById('responseDisplay');
            const responseEditor = document.getElementById('responseEditor');
            const editBtn = document.querySelector('.edit-response-btn');
            const saveBtn = document.querySelector('.save-edit-btn');
            const cancelBtn = document.querySelector('.cancel-edit-btn');
            
            responseEditor.value = currentGeneratedResponse;
            responseDisplay.style.display = 'none';
            responseEditor.style.display = 'block';
            editBtn.style.display = 'none';
            saveBtn.style.display = 'inline-block';
            cancelBtn.style.display = 'inline-block';
        }

        function saveResponseEdit() {
            const responseDisplay = document.getElementById('responseDisplay');
            const responseEditor = document.getElementById('responseEditor');
            const editBtn = document.querySelector('.edit-response-btn');
            const saveBtn = document.querySelector('.save-edit-btn');
            const cancelBtn = document.querySelector('.cancel-edit-btn');
            
            currentGeneratedResponse = responseEditor.value;
            responseDisplay.innerHTML = currentGeneratedResponse.replace(/\n/g, '<br>');
            
            responseDisplay.style.display = 'block';
            responseEditor.style.display = 'none';
            editBtn.style.display = 'inline-block';
            saveBtn.style.display = 'none';
            cancelBtn.style.display = 'none';
        }

        function cancelResponseEdit() {
            const responseDisplay = document.getElementById('responseDisplay');
            const responseEditor = document.getElementById('responseEditor');
            const editBtn = document.querySelector('.edit-response-btn');
            const saveBtn = document.querySelector('.save-edit-btn');
            const cancelBtn = document.querySelector('.cancel-edit-btn');
            
            responseDisplay.style.display = 'block';
            responseEditor.style.display = 'none';
            editBtn.style.display = 'inline-block';
            saveBtn.style.display = 'none';
            cancelBtn.style.display = 'none';
        }

        async function refineResponse() {
            const refinePrompt = document.getElementById('refinePrompt').value.trim();
            
            if (!refinePrompt) {
                showErrorPopup('Please enter refinement instructions!', 'Missing Information');
                return;
            }
            
            // Show loading state
            const refineBtn = document.querySelector('.refine-btn');
            const btnText = refineBtn.querySelector('.btn-text');
            const btnLoading = refineBtn.querySelector('.btn-loading');
            
            btnText.style.display = 'none';
            btnLoading.style.display = 'inline';
            refineBtn.disabled = true;
            
            try {
                const response = await fetch('/api/refine-response', {
                    method: 'POST',
                    headers: {
                        'Content-Type': 'application/json',
                    },
                    body: JSON.stringify({
                        currentResponse: currentGeneratedResponse,
                        refinementPrompt: refinePrompt
                    })
                });
                
                const data = await response.json();
                
                if (data.response) {
                    currentGeneratedResponse = data.response;
                    displayGeneratedResponse(data.response, data.justification);
                    document.getElementById('refinePrompt').value = ''; // Clear refinement prompt
                } else {
                    showErrorPopup('Failed to refine response: ' + (data.error || 'Unknown error'), 'Refinement Failed');
                }
            } catch (error) {
                console.error('Error refining response:', error);
                showErrorPopup('Failed to refine response. Please try again.', 'Network Error');
            } finally {
                // Reset loading state
                btnText.style.display = 'inline';
                btnLoading.style.display = 'none';
                refineBtn.disabled = false;
            }
        }

        function closeGenerateResponseModal() {
            const modal = document.getElementById('generateResponseModal');
            if (modal) {
                modal.style.display = 'none';
            }
        }

        function closeSelectEmailModal() {
            const modal = document.getElementById('selectEmailModal');
            if (modal) {
                modal.style.display = 'none';
            }
        }

        // Close modals when clicking outside
        window.addEventListener('click', function(event) {
            const threadModal = document.getElementById('threadModal');
            const generateModal = document.getElementById('generateResponseModal');
            const selectModal = document.getElementById('selectEmailModal');
            
            if (event.target === threadModal) {
                closeModal();
            }
            if (event.target === generateModal) {
                closeGenerateResponseModal();
            }
            if (event.target === selectModal) {
                closeSelectEmailModal();
            }
        });

        // View Refinements Modal functionality
        async function showViewRefinementsModal() {
            // Create modal HTML if it doesn't exist
            let modal = document.getElementById('viewRefinementsModal');
            if (!modal) {
                modal = createViewRefinementsModal();
                document.body.appendChild(modal);
            }
            
            modal.style.display = 'block';
            await loadRefinements();
        }

        function createViewRefinementsModal() {
            const modal = document.createElement('div');
            modal.id = 'viewRefinementsModal';
            modal.className = 'modal';
            modal.innerHTML = `
                <div class="modal-content view-refinements-modal">
                    <div class="modal-header">
                        <h2 class="modal-title">Saved Refinements</h2>
                        <button class="close" onclick="closeViewRefinementsModal()">&times;</button>
                    </div>
                    <div class="refinements-container">
                        <div class="refinements-header">
                            <div class="refinements-count" id="refinementsCount">Loading...</div>
                            <button class="clear-all-btn" id="clearAllBtn" onclick="clearAllRefinements()" disabled>Clear All</button>
                        </div>
                        <div id="refinementsList">
                            <div class="loading">Loading refinements...</div>
                        </div>
                    </div>
                </div>
            `;
            return modal;
        }

        async function loadRefinements() {
            const refinementsList = document.getElementById('refinementsList');
            const refinementsCount = document.getElementById('refinementsCount');
            const clearAllBtn = document.getElementById('clearAllBtn');
            
            try {
                const response = await fetch('/api/refinements');
                const data = await response.json();
                
                if (data.refinements && data.refinements.length > 0) {
                    displayRefinements(data.refinements);
                    refinementsCount.textContent = `${data.refinements.length} refinement${data.refinements.length === 1 ? '' : 's'} saved`;
                    clearAllBtn.disabled = false;
                } else {
                    displayNoRefinements();
                    refinementsCount.textContent = 'No refinements saved';
                    clearAllBtn.disabled = true;
                }
            } catch (error) {
                console.error('Error loading refinements:', error);
                refinementsList.innerHTML = '<div class="error">Failed to load refinements. Please try again.</div>';
                refinementsCount.textContent = 'Error loading refinements';
                clearAllBtn.disabled = true;
            }
        }

        function displayRefinements(refinements) {
            const refinementsList = document.getElementById('refinementsList');
            refinementsList.innerHTML = '';
            
            refinements.forEach(refinement => {
                const refinementDiv = document.createElement('div');
                refinementDiv.className = 'refinement-item';
                
                // Check if this refinement has analysis data
                const hasAnalysis = refinement.analysis && refinement.analysis.changes && refinement.analysis.changes.length > 0;
                
                let analysisHtml = '';
                if (hasAnalysis) {
                    analysisHtml = `
                        <div class="refinement-analysis" style="margin-top: 15px; border-top: 1px solid #e9ecef; padding-top: 15px;">
                            <div class="refinement-analysis-label" style="font-weight: 600; color: #6f42c1; font-size: 12px; text-transform: uppercase; margin-bottom: 10px;">
                                Change Analysis & Categorization
                            </div>
                            <div class="refinement-changes">
                                ${refinement.analysis.changes.map((change, index) => `
                                    <div class="refinement-change" style="margin-bottom: 12px; padding: 12px; border: 1px solid #e9ecef; border-radius: 6px; background: #fefefe; box-shadow: 0 1px 3px rgba(0,0,0,0.05);">
                                        <div class="change-header" style="display: flex; justify-content: space-between; align-items: flex-start; margin-bottom: 10px;">
                                            <div class="change-description" style="font-weight: 500; color: #333; font-size: 13px; flex: 1; margin-right: 15px;">
                                                ${change.description}
                                            </div>
                                            <div class="change-category-controls" style="display: flex; align-items: center; gap: 8px; flex-shrink: 0;">
                                                <select class="change-category-select" data-refinement-id="${refinement.id}" data-change-index="${index}" 
                                                    style="padding: 4px 8px; font-size: 12px; border: 1px solid #ddd; border-radius: 4px; background: white; min-width: 120px;">
                                                    <option value="GENERALIZABLE" ${change.category === 'GENERALIZABLE' ? 'selected' : ''}>Generalizable</option>
                                                    <option value="EMAIL-SPECIFIC" ${change.category === 'EMAIL-SPECIFIC' ? 'selected' : ''}>Email-Specific</option>
                                                </select>
                                                <button class="save-category-btn" data-refinement-id="${refinement.id}" data-change-index="${index}"
                                                    style="padding: 4px 12px; font-size: 12px; background: #28a745; color: white; border: none; border-radius: 4px; cursor: pointer; font-weight: 500; transition: background-color 0.2s;">
                                                    Save Category
                                                </button>
                                            </div>
                                        </div>
                                        <div class="change-reasoning" style="font-size: 12px; color: #666; margin-bottom: 8px; line-height: 1.4;">
                                            <strong>Reasoning:</strong> ${change.reasoning}
                                        </div>
                                        <div class="change-category-info" style="font-size: 11px; color: #888; margin-bottom: 8px; padding: 6px 8px; background: ${change.category === 'GENERALIZABLE' ? '#e8f5e8' : '#fff3e0'}; border-radius: 3px; border-left: 3px solid ${change.category === 'GENERALIZABLE' ? '#28a745' : '#ff9800'};">
                                            <strong>Category:</strong> ${change.category === 'GENERALIZABLE' ? 'Generalizable - Will be applied to future responses' : 'Email-Specific - Only applies to this specific context'}
                                        </div>
                                        ${change.extractedRule ? `
                                            <div class="change-rule" style="font-size: 12px; color: #28a745; background: #f8fff9; padding: 8px; border-radius: 4px; border-left: 3px solid #28a745;">
                                                <strong>Extracted Rule:</strong> ${change.extractedRule}
                                            </div>
                                        ` : ''}
                                    </div>
                                `).join('')}
                            </div>
                        </div>
                    `;
                }
                
                refinementDiv.innerHTML = `
                    <div class="refinement-header">
                        <div class="refinement-timestamp">${formatRefinementDate(refinement.timestamp)}</div>
                        <button class="refinement-delete-btn" data-refinement-id="${refinement.id}">Delete</button>
                    </div>
                    <div class="refinement-content">
                        <div class="refinement-prompt">
                            <div class="refinement-prompt-label">Refinement Prompt</div>
                            <div class="refinement-prompt-text">${refinement.prompt}</div>
                        </div>
                        <div class="refinement-responses">
                            <div class="refinement-response refinement-original">
                                <div class="refinement-response-label">Original Response</div>
                                <div class="refinement-response-text">${refinement.originalResponse}</div>
                            </div>
                            <div class="refinement-response refinement-refined">
                                <div class="refinement-response-label">Refined Response</div>
                                <div class="refinement-response-text">${refinement.refinedResponse}</div>
                            </div>
                        </div>
                        ${analysisHtml}
                    </div>
                `;
                
                // Add event listener for delete button
                const deleteBtn = refinementDiv.querySelector('.refinement-delete-btn');
                deleteBtn.addEventListener('click', () => deleteRefinement(refinement.id));
                
                // Add event listeners for category change buttons if analysis exists
                if (hasAnalysis) {
                    const saveCategoryBtns = refinementDiv.querySelectorAll('.save-category-btn');
                    saveCategoryBtns.forEach(btn => {
                        btn.addEventListener('click', () => {
                            const refinementId = btn.getAttribute('data-refinement-id');
                            const changeIndex = parseInt(btn.getAttribute('data-change-index'));
                            const selectElement = refinementDiv.querySelector(`select[data-refinement-id="${refinementId}"][data-change-index="${changeIndex}"]`);
                            const newCategory = selectElement.value;
                            updateRefinementCategory(refinementId, changeIndex, newCategory);
                        });
                    });
                }
                
                refinementsList.appendChild(refinementDiv);
            });
        }

        function displayNoRefinements() {
            const refinementsList = document.getElementById('refinementsList');
            refinementsList.innerHTML = `
                <div class="no-refinements">
                    <div class="no-refinements-icon">📝</div>
                    <div class="no-refinements-text">No refinements saved yet</div>
                    <div class="no-refinements-subtext">Refinements will appear here when you use the "Refine Response" feature</div>
                </div>
            `;
        }

        function formatRefinementDate(timestamp) {
            const date = new Date(timestamp);
            const now = new Date();
            const diffTime = Math.abs(now - date);
            const diffMinutes = Math.floor(diffTime / (1000 * 60));
            const diffHours = Math.floor(diffTime / (1000 * 60 * 60));
            const diffDays = Math.floor(diffTime / (1000 * 60 * 60 * 24));
            
            if (diffMinutes < 1) return 'Just now';
            if (diffMinutes < 60) return `${diffMinutes} minute${diffMinutes === 1 ? '' : 's'} ago`;
            if (diffHours < 24) return `${diffHours} hour${diffHours === 1 ? '' : 's'} ago`;
            if (diffDays < 7) return `${diffDays} day${diffDays === 1 ? '' : 's'} ago`;
            
            return date.toLocaleDateString('en-US', { 
                month: 'short', 
                day: 'numeric', 
                year: date.getFullYear() !== now.getFullYear() ? 'numeric' : undefined 
            });
        }

        async function deleteRefinement(refinementId) {
            showConfirmPopup(
                'Are you sure you want to delete this refinement?',
                async () => {
                    try {
                        const response = await fetch(`/api/refinements/${refinementId}`, {
                            method: 'DELETE'
                        });
                        
                        const data = await response.json();
                        
                        if (data.success) {
                            showSuccessPopup('Refinement deleted successfully!', 'Refinement Deleted');
                            // Reload refinements to update the display
                            await loadRefinements();
                        } else {
                            showErrorPopup('Failed to delete refinement: ' + (data.error || 'Unknown error'), 'Delete Failed');
                        }
                    } catch (error) {
                        console.error('Error deleting refinement:', error);
                        showErrorPopup('Failed to delete refinement. Please try again.', 'Network Error');
                    }
                },
                () => {},
                'Delete Refinement'
            );
        }

        async function clearAllRefinements() {
            showConfirmPopup(
                'Are you sure you want to delete ALL refinements? This action cannot be undone.',
                async () => {
                    const clearAllBtn = document.getElementById('clearAllBtn');
                    const originalText = clearAllBtn.textContent;
                    clearAllBtn.textContent = 'Clearing...';
                    clearAllBtn.disabled = true;
                    
                    try {
                        const response = await fetch('/api/refinements', {
                            method: 'DELETE'
                        });
                        
                        const data = await response.json();
                        
                        if (data.success) {
                            showSuccessPopup('All refinements cleared successfully!', 'Refinements Cleared');
                            // Reload refinements to update the display
                            await loadRefinements();
                        } else {
                            showErrorPopup('Failed to clear refinements: ' + (data.error || 'Unknown error'), 'Clear Failed');
                            clearAllBtn.textContent = originalText;
                            clearAllBtn.disabled = false;
                        }
                    } catch (error) {
                        console.error('Error clearing refinements:', error);
                        showErrorPopup('Failed to clear refinements. Please try again.', 'Network Error');
                        clearAllBtn.textContent = originalText;
                        clearAllBtn.disabled = false;
                    }
                },
                () => {},
                'Clear All Refinements'
            );
        }

        function closeViewRefinementsModal() {
            const modal = document.getElementById('viewRefinementsModal');
            if (modal) {
                modal.style.display = 'none';
            }
        }

        // Save Current Response functionality
        async function saveCurrentResponse() {
            if (!currentGeneratedResponse) {
                showErrorPopup('No response to save! Please generate a response first.', 'No Response Available');
                return;
            }

            // Get the original email data from the form
            const sender = document.getElementById('senderInput').value;
            const subject = document.getElementById('subjectInput').value;
            const emailBody = document.getElementById('emailBodyInput').value;

            if (!emailBody.trim()) {
                showErrorPopup('Original email body is required to save the response!', 'Missing Information');
                return;
            }

            // Attempt to locate the original email from known lists to pass along id/webUrl for deep-linking
            let originalId = '';
            let originalWebUrl = '';
            try {
                const match = (Array.isArray(unrepliedEmails) ? unrepliedEmails : []).find(e =>
                    String(e.subject || '') === String(subject || '') &&
                    String(e.from || '') === String(sender || '')
                );
                if (match) {
                    originalId = match.id || '';
                    originalWebUrl = match.webUrl || '';
                }
            } catch (_) {}

            // Show loading state
            const saveBtn = document.querySelector('.save-response-btn');
            const btnText = saveBtn.querySelector('.btn-text');
            const btnLoading = saveBtn.querySelector('.btn-loading');
            
            btnText.style.display = 'none';
            btnLoading.style.display = 'inline';
            saveBtn.disabled = true;

            try {
                const response = await fetch('/api/save-generation', {
                    method: 'POST',
                    headers: {
                        'Content-Type': 'application/json',
                    },
                    body: JSON.stringify({
                        originalEmail: {
                            sender: sender || 'Unknown Sender',
                            subject: subject || 'No Subject',
                            body: emailBody,
                            id: originalId || undefined,
                            webUrl: originalWebUrl || undefined
                        },
                        generatedResponse: currentGeneratedResponse,
                        justification: '' // Could add justification if needed
                    })
                });

                const data = await response.json();

                if (data.success) {
                    if (data.gmailLink) {
                        // Show popup with link to Gmail
                        showCustomPopup({
                            title: 'Response Saved',
                            message: `Your response was saved successfully.<br><br><a href="${data.gmailLink}" target="_blank" rel="noopener" style="color:#1a73e8; text-decoration:underline;">Open this email in Gmail</a>`,
                            icon: 'success',
                            primaryText: 'Close',
                            type: 'alert',
                            onPrimary: () => {}
                        });
                    } else {
                        showSuccessPopup('Response saved successfully!', 'Response Saved');
                    }
                } else {
                    showErrorPopup('Failed to save response: ' + (data.error || 'Unknown error'), 'Save Failed');
                }
            } catch (error) {
                console.error('Error saving response:', error);
                showErrorPopup('Failed to save response. Please try again.', 'Network Error');
            } finally {
                // Reset loading state
                btnText.style.display = 'inline';
                btnLoading.style.display = 'none';
                saveBtn.disabled = false;
            }
        }

        // ===== Global Clean Threads (preview + apply) =====
        let cleanThreadsState = {
            scanning: false,
            applying: false,
            preview: null, // { threadsScanned, responseMessagesScanned, cleanedCount, changes: [...] }
            applied: null, // final payload after apply
            error: null
        };

        function ensureCleanThreadsModal() {
            let modal = document.getElementById('cleanThreadsModal');
            if (modal) return modal;
            modal = document.createElement('div');
            modal.id = 'cleanThreadsModal';
            modal.className = 'modal';
            modal.innerHTML = `
                <div class="modal-content" style="max-width: 700px; max-height: 80vh;">
                    <div class="modal-header">
                        <h2 class="modal-title">Clean Threads</h2>
                        <button class="close" onclick="closeCleanThreadsModal()">&times;</button>
                    </div>
                    <div id="cleanThreadsBody" style="padding:16px; max-height:60vh; overflow:auto;">
                        <div class="loading">Preparing cleaner...</div>
                    </div>
                    <div id="cleanThreadsActions" style="display:flex; justify-content:center; gap:12px; padding:12px 16px; border-top:1px solid #e9ecef;">
                        <button class="carousel-btn carousel-btn-cancel" id="cleanCancelBtn" onclick="closeCleanThreadsModal()">Cancel</button>
                        <button class="carousel-btn carousel-btn-add" id="cleanStartBtn" onclick="startCleanThreadsScan()">
                            <span class="btn-text">Start Scan</span>
                            <span class="btn-loading" style="display:none;">Scanning...</span>
                        </button>
                    </div>
                </div>
            `;
            modal.addEventListener('click', (ev) => { if (ev.target === modal) closeCleanThreadsModal(); });
            document.body.appendChild(modal);
            return modal;
        }

        function showCleanThreadsModal() {
            const modal = ensureCleanThreadsModal();
            cleanThreadsState = { scanning: false, applying: false, preview: null, applied: null, error: null };
            const body = document.getElementById('cleanThreadsBody');
            const actions = document.getElementById('cleanThreadsActions');
            if (body) {
                body.innerHTML = `
                    <div style="margin-bottom:10px; color:#555;">
                        This will scan all stored threads for quoted history (e.g., "On ... wrote:", "-----Original Message-----", or lines beginning with ">") in your responses, and propose cleaned versions that keep only the newest content.
                    </div>
                    <ul style="margin-left:18px; color:#666; line-height:1.5;">
                        <li>Step 1: Preview – scan and show how many messages can be cleaned (no changes saved)</li>
                        <li>Step 2: Approve & Apply – write cleaned content back to your database</li>
                    </ul>
                    <div style="margin-top:12px; padding:10px; background:#fff3cd; border:1px solid #ffe8a1; border-radius:6px; color:#856404;">
                        Note: This may take some time depending on the number of response messages (uses AI with heuristic fallback).
                    </div>
                `;
            }
            if (actions) {
                const startBtn = actions.querySelector('#cleanStartBtn');
                const cancelBtn = actions.querySelector('#cleanCancelBtn');
                if (startBtn) {
                    startBtn.disabled = false;
                    startBtn.querySelector('.btn-text').style.display = 'inline';
                    startBtn.querySelector('.btn-loading').style.display = 'none';
                    startBtn.textContent = ''; // reset text composition
                    startBtn.innerHTML = '<span class="btn-text">Start Scan</span><span class="btn-loading" style="display:none;">Scanning...</span>';
                }
                if (cancelBtn) cancelBtn.disabled = false;
            }
            modal.style.display = 'block';
        }

        function closeCleanThreadsModal() {
            const modal = document.getElementById('cleanThreadsModal');
            if (modal) modal.style.display = 'none';
        }

        async function startCleanThreadsScan() {
            if (cleanThreadsState.scanning || cleanThreadsState.applying) return;
            cleanThreadsState.scanning = true;
            cleanThreadsState.error = null;

            const body = document.getElementById('cleanThreadsBody');
            const actions = document.getElementById('cleanThreadsActions');
            const startBtn = actions ? actions.querySelector('#cleanStartBtn') : null;
            if (startBtn) {
                startBtn.disabled = true;
                startBtn.querySelector('.btn-text').style.display = 'none';
                startBtn.querySelector('.btn-loading').style.display = 'inline';
            }

            try {
                if (body) {
                    body.innerHTML = `
                        <div class="loading">
                            <div class="loading-spinner" style="margin-bottom:10px;"></div>
                            <div>Scanning threads for quoted replies...</div>
                            <div style="font-size:12px; color:#666; margin-top:6px;">This may take several minutes for large datasets.</div>
                        </div>
                    `;
                }

                const resp = await fetch('/api/clean-all-threads', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ apply: false })
                });
                const data = await resp.json();

                if (!resp.ok || !data.success) {
                    throw new Error(data.error || 'Scan failed');
                }

                cleanThreadsState.preview = data;
                renderCleanThreadsPreview();
            } catch (e) {
                cleanThreadsState.error = e?.message || String(e);
                renderCleanThreadsError('Failed to scan threads. Please try again.');
            } finally {
                cleanThreadsState.scanning = false;
            }
        }

        function renderCleanThreadsPreview() {
            const body = document.getElementById('cleanThreadsBody');
            const actions = document.getElementById('cleanThreadsActions');
            if (!body || !cleanThreadsState.preview) return;

            const p = cleanThreadsState.preview;
            body.innerHTML = `
                <div style="margin-bottom:10px; color:#333;">
                    <strong>Preview Results</strong>
                </div>
                <div style="display:flex; gap:12px; flex-wrap:wrap; margin-bottom:10px;">
                    <div style="flex:1 1 140px; background:#f8f9fa; border:1px solid #e9ecef; border-radius:6px; padding:10px;">
                        <div style="color:#666; font-size:12px;">Threads Scanned</div>
                        <div style="font-weight:700; font-size:18px; color:#333;">${p.threadsScanned}</div>
                    </div>
                    <div style="flex:1 1 140px; background:#f8f9fa; border:1px solid #e9ecef; border-radius:6px; padding:10px;">
                        <div style="color:#666; font-size:12px;">Responses Checked</div>
                        <div style="font-weight:700; font-size:18px; color:#333;">${p.responseMessagesScanned}</div>
                    </div>
                    <div style="flex:1 1 140px; background:#f8f9fa; border:1px solid #e9ecef; border-radius:6px; padding:10px;">
                        <div style="color:#666; font-size:12px;">Clean Candidates</div>
                        <div style="font-weight:700; font-size:18px; color:#28a745;">${p.cleanedCount}</div>
                    </div>
                </div>
                <div style="color:#666; font-size:12px; margin-bottom:8px;">
                    We will apply the cleaner only to response messages with quoted history detected. A small sample is shown below.
                </div>
                <div style="max-height:220px; overflow:auto; border:1px solid #e9ecef; border-radius:6px; background:#fff;">
                    ${
                        Array.isArray(p.changes) && p.changes.length
                        ? `
                          <table style="width:100%; border-collapse:collapse; font-size:12px;">
                            <thead>
                              <tr style="background:#f8f9fa;">
                                <th style="text-align:left; padding:6px; border-bottom:1px solid #e9ecef;">Thread</th>
                                <th style="text-align:left; padding:6px; border-bottom:1px solid #e9ecef;">Message</th>
                                <th style="text-align:right; padding:6px; border-bottom:1px solid #e9ecef;">Before</th>
                                <th style="text-align:right; padding:6px; border-bottom:1px solid #e9ecef;">After</th>
                              </tr>
                            </thead>
                            <tbody>
                              ${p.changes.map(c => `
                                <tr>
                                  <td style="padding:6px; border-bottom:1px solid #f1f3f4;">${(c.threadId || '').slice(0,24)}</td>
                                  <td style="padding:6px; border-bottom:1px solid #f1f3f4;">${(c.messageId || '').slice(0,24)}</td>
                                  <td style="padding:6px; border-bottom:1px solid #f1f3f4; text-align:right;">${c.beforeLen}</td>
                                  <td style="padding:6px; border-bottom:1px solid #f1f3f4; text-align:right; color:#28a745;">${c.afterLen}</td>
                                </tr>
                              `).join('')}
                            </tbody>
                          </table>
                        `
                        : `<div class="no-emails" style="padding:10px;">No sample changes to display.</div>`
                    }
                </div>
            `;

            if (actions) {
                actions.innerHTML = `
                    <button class="carousel-btn carousel-btn-cancel" onclick="closeCleanThreadsModal()">Cancel</button>
                    <button class="carousel-btn carousel-btn-add" id="cleanApplyBtn" onclick="applyCleanThreads()" ${p.cleanedCount > 0 ? '' : 'disabled'}>
                        <span class="btn-text">Approve & Apply</span>
                        <span class="btn-loading" style="display:none;">Applying...</span>
                    </button>
                `;
            }
        }

        function renderCleanThreadsError(msg) {
            const body = document.getElementById('cleanThreadsBody');
            const actions = document.getElementById('cleanThreadsActions');
            if (body) {
                body.innerHTML = `<div class="error">${msg}</div>`;
            }
            if (actions) {
                actions.innerHTML = `
                    <button class="carousel-btn carousel-btn-cancel" onclick="closeCleanThreadsModal()">Close</button>
                    <button class="carousel-btn carousel-btn-add" onclick="startCleanThreadsScan()">Retry</button>
                `;
            }
        }

        async function applyCleanThreads() {
            if (cleanThreadsState.applying) return;
            cleanThreadsState.applying = true;
            cleanThreadsState.error = null;

            const body = document.getElementById('cleanThreadsBody');
            const applyBtn = document.getElementById('cleanApplyBtn');
            if (applyBtn) {
                applyBtn.disabled = true;
                applyBtn.querySelector('.btn-text').style.display = 'none';
                applyBtn.querySelector('.btn-loading').style.display = 'inline';
            }

            try {
                if (body) {
                    body.innerHTML = `
                        <div class="loading">
                            <div class="loading-spinner" style="margin-bottom:10px;"></div>
                            <div>Applying cleaned responses to your database...</div>
                        </div>
                    `;
                }

                const resp = await fetch('/api/clean-all-threads', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ apply: true })
                });
                const data = await resp.json();

                if (!resp.ok || !data.success) {
                    throw new Error(data.error || 'Apply failed');
                }

                cleanThreadsState.applied = data;

                // Final stats
                if (body) {
                    body.innerHTML = `
                        <div style="margin-bottom:10px; color:#333;"><strong>Cleaning Complete</strong></div>
                        <div style="display:flex; gap:12px; flex-wrap:wrap; margin-bottom:10px;">
                            <div style="flex:1 1 140px; background:#f8f9fa; border:1px solid #e9ecef; border-radius:6px; padding:10px;">
                                <div style="color:#666; font-size:12px;">Threads Scanned</div>
                                <div style="font-weight:700; font-size:18px; color:#333;">${data.threadsScanned}</div>
                            </div>
                            <div style="flex:1 1 140px; background:#f8f9fa; border:1px solid #e9ecef; border-radius:6px; padding:10px;">
                                <div style="color:#666; font-size:12px;">Responses Checked</div>
                                <div style="font-weight:700; font-size:18px; color:#333;">${data.responseMessagesScanned}</div>
                            </div>
                            <div style="flex:1 1 140px; background:#f8f9fa; border:1px solid #e9ecef; border-radius:6px; padding:10px;">
                                <div style="color:#666; font-size:12px;">Cleaned & Saved</div>
                                <div style="font-weight:700; font-size:18px; color:#28a745;">${data.cleanedCount}</div>
                            </div>
                        </div>
                        <div style="color:#666; font-size:12px;">
                            Changes have been written to threads and response emails. You may close this dialog.
                        </div>
                    `;
                }

                const actions = document.getElementById('cleanThreadsActions');
                if (actions) {
                    actions.innerHTML = `
                        <button class="carousel-btn carousel-btn-add" onclick="closeCleanThreadsModal()">Done</button>
                    `;
                }

                try { loadEmails(); } catch (_) {}
            } catch (e) {
                cleanThreadsState.error = e?.message || String(e);
                renderCleanThreadsError('Failed to apply cleaned results. Please try again.');
            } finally {
                cleanThreadsState.applying = false;
            }
        }

        // View Saved Generations Modal functionality
        async function showViewSavedGenerationsModal() {
            // Create modal HTML if it doesn't exist
            let modal = document.getElementById('viewSavedGenerationsModal');
            if (!modal) {
                modal = createViewSavedGenerationsModal();
                document.body.appendChild(modal);
            }
            
            modal.style.display = 'block';
            await loadSavedGenerations();
        }

        function createViewSavedGenerationsModal() {
            const modal = document.createElement('div');
            modal.id = 'viewSavedGenerationsModal';
            modal.className = 'modal';
            modal.innerHTML = `
                <div class="modal-content view-saved-generations-modal">
                    <div class="modal-header">
                        <h2 class="modal-title">Saved Generations</h2>
                        <button class="close" onclick="closeViewSavedGenerationsModal()">&times;</button>
                    </div>
                    <div class="saved-generations-container">
                        <div class="saved-generations-header">
                            <div class="saved-generations-count" id="savedGenerationsCount">Loading...</div>
                            <button class="clear-all-btn" id="clearAllSavedGenerationsBtn" onclick="clearAllSavedGenerations()" disabled>Clear All</button>
                        </div>
                        <div id="savedGenerationsList">
                            <div class="loading">Loading saved generations...</div>
                        </div>
                    </div>
                </div>
            `;
            return modal;
        }

        async function loadSavedGenerations() {
            const savedGenerationsList = document.getElementById('savedGenerationsList');
            const savedGenerationsCount = document.getElementById('savedGenerationsCount');
            const clearAllBtn = document.getElementById('clearAllSavedGenerationsBtn');
            
            try {
                const response = await fetch('/api/saved-generations');
                const data = await response.json();
                
                if (data.savedGenerations && data.savedGenerations.length > 0) {
                    displaySavedGenerations(data.savedGenerations);
                    savedGenerationsCount.textContent = `${data.savedGenerations.length} generation${data.savedGenerations.length === 1 ? '' : 's'} saved`;
                    clearAllBtn.disabled = false;
                } else {
                    displayNoSavedGenerations();
                    savedGenerationsCount.textContent = 'No generations saved';
                    clearAllBtn.disabled = true;
                }
            } catch (error) {
                console.error('Error loading saved generations:', error);
                savedGenerationsList.innerHTML = '<div class="error">Failed to load saved generations. Please try again.</div>';
                savedGenerationsCount.textContent = 'Error loading saved generations';
                clearAllBtn.disabled = true;
            }
        }

        function displaySavedGenerations(savedGenerations) {
            const savedGenerationsList = document.getElementById('savedGenerationsList');
            savedGenerationsList.innerHTML = '';
            
            savedGenerations.forEach(generation => {
                const generationDiv = document.createElement('div');
                generationDiv.className = 'saved-generation-item';
                generationDiv.innerHTML = `
                    <div class="saved-generation-header">
                        <div class="saved-generation-timestamp">${formatSavedGenerationDate(generation.timestamp)}</div>
                        <button class="saved-generation-delete-btn" data-generation-id="${generation.id}">Delete</button>
                    </div>
                    <div class="saved-generation-content">
                        <div class="saved-generation-original-email">
                            <div class="saved-generation-original-label">Original Email</div>
                            <div class="saved-generation-original-details">
                                <div class="saved-generation-original-sender"><strong>From:</strong> ${generation.originalEmail.sender}</div>
                                <div class="saved-generation-original-subject"><strong>Subject:</strong> ${generation.originalEmail.subject}</div>
                                <div class="saved-generation-original-body">${generation.originalEmail.body}</div>
                            </div>
                        </div>
                        <div class="saved-generation-response">
                            <div class="saved-generation-response-label">Generated Response</div>
                            <div class="saved-generation-response-text">${generation.generatedResponse}</div>
                        </div>
                    </div>
                `;
                
                // Add event listener for delete button
                const deleteBtn = generationDiv.querySelector('.saved-generation-delete-btn');
                deleteBtn.addEventListener('click', () => deleteSavedGeneration(generation.id));
                
                savedGenerationsList.appendChild(generationDiv);
            });
        }

        function displayNoSavedGenerations() {
            const savedGenerationsList = document.getElementById('savedGenerationsList');
            savedGenerationsList.innerHTML = `
                <div class="no-saved-generations">
                    <div class="no-saved-generations-icon">💾</div>
                    <div class="no-saved-generations-text">No saved generations yet</div>
                    <div class="no-saved-generations-subtext">Generated responses will appear here when you use the "Save Response" feature</div>
                </div>
            `;
        }

        function formatSavedGenerationDate(timestamp) {
            const date = new Date(timestamp);
            const now = new Date();
            const diffTime = Math.abs(now - date);
            const diffMinutes = Math.floor(diffTime / (1000 * 60));
            const diffHours = Math.floor(diffTime / (1000 * 60 * 60));
            const diffDays = Math.floor(diffTime / (1000 * 60 * 60 * 24));
            
            if (diffMinutes < 1) return 'Just now';
            if (diffMinutes < 60) return `${diffMinutes} minute${diffMinutes === 1 ? '' : 's'} ago`;
            if (diffHours < 24) return `${diffHours} hour${diffHours === 1 ? '' : 's'} ago`;
            if (diffDays < 7) return `${diffDays} day${diffDays === 1 ? '' : 's'} ago`;
            
            return date.toLocaleDateString('en-US', { 
                month: 'short', 
                day: 'numeric', 
                year: date.getFullYear() !== now.getFullYear() ? 'numeric' : undefined 
            });
        }

        async function deleteSavedGeneration(generationId) {
            showConfirmPopup(
                'Are you sure you want to delete this saved generation?',
                async () => {
                    try {
                        const response = await fetch(`/api/saved-generations/${generationId}`, {
                            method: 'DELETE'
                        });
                        
                        const data = await response.json();
                        
                        if (data.success) {
                            showSuccessPopup('Saved generation deleted successfully!', 'Generation Deleted');
                            // Reload saved generations to update the display
                            await loadSavedGenerations();
                        } else {
                            showErrorPopup('Failed to delete saved generation: ' + (data.error || 'Unknown error'), 'Delete Failed');
                        }
                    } catch (error) {
                        console.error('Error deleting saved generation:', error);
                        showErrorPopup('Failed to delete saved generation. Please try again.', 'Network Error');
                    }
                },
                () => {},
                'Delete Saved Generation'
            );
        }

        async function clearAllSavedGenerations() {
            showConfirmPopup(
                'Are you sure you want to delete ALL saved generations? This action cannot be undone.',
                async () => {
                    const clearAllBtn = document.getElementById('clearAllSavedGenerationsBtn');
                    const originalText = clearAllBtn.textContent;
                    clearAllBtn.textContent = 'Clearing...';
                    clearAllBtn.disabled = true;
                    
                    try {
                        const response = await fetch('/api/saved-generations', {
                            method: 'DELETE'
                        });
                        
                        const data = await response.json();
                        
                        if (data.success) {
                            showSuccessPopup('All saved generations cleared successfully!', 'Generations Cleared');
                            // Reload saved generations to update the display
                            await loadSavedGenerations();
                        } else {
                            showErrorPopup('Failed to clear saved generations: ' + (data.error || 'Unknown error'), 'Clear Failed');
                            clearAllBtn.textContent = originalText;
                            clearAllBtn.disabled = false;
                        }
                    } catch (error) {
                        console.error('Error clearing saved generations:', error);
                        showErrorPopup('Failed to clear saved generations. Please try again.', 'Network Error');
                        clearAllBtn.textContent = originalText;
                        clearAllBtn.disabled = false;
                    }
                },
                () => {},
                'Clear All Saved Generations'
            );
        }

        function closeViewSavedGenerationsModal() {
            const modal = document.getElementById('viewSavedGenerationsModal');
            if (modal) {
                modal.style.display = 'none';
            }
        }

        // Update the window click event listener to include all modals
        window.addEventListener('click', function(event) {
            const threadModal = document.getElementById('threadModal');
            const generateModal = document.getElementById('generateResponseModal');
            const selectModal = document.getElementById('selectEmailModal');
            const selectTestModal = document.getElementById('selectTestEmailModal');
            const viewRefinementsModal = document.getElementById('viewRefinementsModal');
            const viewSavedGenerationsModal = document.getElementById('viewSavedGenerationsModal');
            
            if (event.target === threadModal) {
                closeModal();
            }
            if (event.target === generateModal) {
                closeGenerateResponseModal();
            }
            if (event.target === selectModal) {
                closeSelectEmailModal();
            }
            if (event.target === selectTestModal) {
                closeSelectTestEmailModal();
            }
            if (event.target === viewRefinementsModal) {
                closeViewRefinementsModal();
            }
            if (event.target === viewSavedGenerationsModal) {
                closeViewSavedGenerationsModal();
            }
        });

        // Custom Popup Modal Functions
        function showCustomPopup(options) {
            const {
                title = 'Confirmation',
                message = 'Are you sure?',
                icon = 'warning',
                primaryText = 'Confirm',
                secondaryText = 'Cancel',
                onPrimary = () => {},
                onSecondary = () => {},
                type = 'confirm', // 'confirm', 'alert', 'success'
                tertiaryText = null,
                onTertiary = () => {}
            } = options;

            // Remove existing popup if any
            const existingPopup = document.getElementById('customPopup');
            if (existingPopup) {
                existingPopup.remove();
            }

            // Create popup modal
            const popup = document.createElement('div');
            popup.id = 'customPopup';
            popup.className = 'popup-modal';
            
            const iconClass = `popup-icon-${icon}`;
            const iconSymbol = icon === 'success' ? '✓' : icon === 'warning' ? '⚠' : icon === 'danger' ? '⚠' : '?';
            
            popup.innerHTML = `
                <div class="popup-content">
                    <div class="popup-header">
                        <h3 class="popup-title">${title}</h3>
                    </div>
                    <div class="popup-body">
                        <span class="popup-icon ${iconClass}">${iconSymbol}</span>
                        <p class="popup-message">${message}</p>
                    </div>
                    <div class="popup-actions">
                        ${type === 'alert' ? '' : `<button class="popup-btn popup-btn-secondary" id="popupSecondaryBtn">${secondaryText}</button>`}
                        <button class="popup-btn ${type === 'success' ? 'popup-btn-success' : 'popup-btn-primary'}" id="popupPrimaryBtn">${primaryText}</button>
                    </div>
                    ${tertiaryText ? `<div class="popup-actions" style="padding-top:0;"><button class="popup-btn popup-btn-primary" id="popupTertiaryBtn" style="width:100%;">${tertiaryText}</button></div>` : ''}
                </div>
            `;

            document.body.appendChild(popup);
            popup.style.display = 'block';

            // Add event listeners for buttons
            const primaryBtn = popup.querySelector('#popupPrimaryBtn');
            const secondaryBtn = popup.querySelector('#popupSecondaryBtn');

            primaryBtn.addEventListener('click', () => {
                closeCustomPopup();
                onPrimary();
            });

            if (secondaryBtn) {
                secondaryBtn.addEventListener('click', () => {
                    closeCustomPopup();
                    onSecondary();
                });
            }

            const tertiaryBtn = popup.querySelector('#popupTertiaryBtn');
            if (tertiaryBtn) {
                tertiaryBtn.addEventListener('click', () => {
                    closeCustomPopup();
                    onTertiary();
                });
            }

            // Close on background click
            popup.addEventListener('click', function(event) {
                if (event.target === popup) {
                    closeCustomPopup();
                    if (type !== 'alert') onSecondary();
                }
            });
        }

        function closeCustomPopup() {
            const popup = document.getElementById('customPopup');
            if (popup) {
                popup.style.display = 'none';
                popup.remove();
            }
        }

        // Input Popup (system-styled) for text entry like Rename
        function showInputPopup(options) {
            const {
                title = 'Input Required',
                label = 'Enter value:',
                value = '',
                placeholder = '',
                primaryText = 'Save',
                secondaryText = 'Cancel',
                onPrimary = () => {},
                onSecondary = () => {}
            } = options || {};

            // Remove any existing input popup
            const existing = document.getElementById('inputPopup');
            if (existing) existing.remove();

            const popup = document.createElement('div');
            popup.id = 'inputPopup';
            popup.className = 'popup-modal';
            popup.innerHTML = `
                <div class="popup-content" style="max-width: 480px;">
                    <div class="popup-header">
                        <h3 class="popup-title">${title}</h3>
                    </div>
                    <div class="popup-body" style="text-align: left;">
                        <label for="popupTextInput" style="display:block; font-size: 13px; color:#555; margin-bottom:6px;">${label}</label>
                        <input id="popupTextInput" type="text" value="" placeholder=""
                               style="width:100%; padding:10px 12px; border:1px solid #ddd; border-radius:6px; font-size:14px; box-sizing:border-box;">
                    </div>
                    <div class="popup-actions">
                        <button class="popup-btn popup-btn-secondary" id="inputPopupSecondaryBtn">${secondaryText}</button>
                        <button class="popup-btn popup-btn-success" id="inputPopupPrimaryBtn">${primaryText}</button>
                    </div>
                </div>
            `;

            document.body.appendChild(popup);
            popup.style.display = 'block';

            const inputEl = popup.querySelector('#popupTextInput');
            const primaryBtn = popup.querySelector('#inputPopupPrimaryBtn');
            const secondaryBtn = popup.querySelector('#inputPopupSecondaryBtn');

            // Set values safely after DOM insertion to avoid HTML escaping issues
            try {
                inputEl.value = value != null ? String(value) : '';
                inputEl.placeholder = placeholder != null ? String(placeholder) : '';
            } catch(e) {
                console.error('Failed to set input popup values:', e);
            }

            // Focus and select existing text
            setTimeout(() => {
                inputEl.focus();
                inputEl.select();
            }, 0);

            const close = () => {
                popup.style.display = 'none';
                popup.remove();
            };

            primaryBtn.addEventListener('click', () => {
                const val = inputEl.value;
                close();
                try { onPrimary(val); } catch (e) { console.error(e); }
            });

            secondaryBtn.addEventListener('click', () => {
                close();
                try { onSecondary(); } catch (e) { console.error(e); }
            });

            // Submit on Enter, cancel on Escape
            inputEl.addEventListener('keydown', (ev) => {
                if (ev.key === 'Enter') {
                    ev.preventDefault();
                    primaryBtn.click();
                } else if (ev.key === 'Escape') {
                    ev.preventDefault();
                    secondaryBtn.click();
                }
            });

            // Close on background click
            popup.addEventListener('click', (ev) => {
                if (ev.target === popup) {
                    close();
                    try { onSecondary(); } catch (e) { console.error(e); }
                }
            });
        }

        // Copy to Clipboard functionality
        async function copyResponseToClipboard() {
            if (!currentGeneratedResponse) {
                showErrorPopup('No response to copy! Please generate a response first.', 'No Response Available');
                return;
            }

            try {
                await navigator.clipboard.writeText(currentGeneratedResponse);
                showSuccessPopup('Response copied to clipboard!', 'Copied Successfully');
            } catch (error) {
                console.error('Error copying to clipboard:', error);
                
                // Fallback method for older browsers
                try {
                    const textArea = document.createElement('textarea');
                    textArea.value = currentGeneratedResponse;
                    textArea.style.position = 'fixed';
                    textArea.style.left = '-999999px';
                    textArea.style.top = '-999999px';
                    document.body.appendChild(textArea);
                    textArea.focus();
                    textArea.select();
                    document.execCommand('copy');
                    textArea.remove();
                    showSuccessPopup('Response copied to clipboard!', 'Copied Successfully');
                } catch (fallbackError) {
                    console.error('Fallback copy method failed:', fallbackError);
                    showErrorPopup('Failed to copy to clipboard. Please copy the text manually.', 'Copy Failed');
                }
            }
        }

        function showSuccessPopup(message, title = 'Success') {
            showCustomPopup({
                title: title,
                message: message,
                icon: 'success',
                primaryText: 'OK',
                type: 'alert',
                onPrimary: () => {}
            });
        }

        function showErrorPopup(message, title = 'Error') {
            showCustomPopup({
                title: title,
                message: message,
                icon: 'danger',
                primaryText: 'OK',
                type: 'alert',
                onPrimary: () => {}
            });
        }

        function showConfirmPopup(message, onConfirm, onCancel = () => {}, title = 'Confirm Action') {
            showCustomPopup({
                title: title,
                message: message,
                icon: 'warning',
                primaryText: 'Confirm',
                secondaryText: 'Cancel',
                onPrimary: onConfirm,
                onSecondary: onCancel,
                type: 'confirm'
            });
        }

        // Scenario Management Functions
        async function saveScenario() {
            // Get current application state
            const currentState = {
                emails: allEmails,
                currentFilter: currentFilter,
                categories: getCurrentCategories(),
                people: getCurrentPeople(),
                timestamp: new Date().toISOString()
            };

            // Show save scenario modal
            showSaveScenarioModal(currentState);
        }

        function getCurrentCategories() {
            const categoryElements = document.querySelectorAll('#categoryList .category-item');
            const categories = [];
            categoryElements.forEach(element => {
                const name = element.querySelector('.category-name').textContent;
                const count = element.querySelector('.category-count').textContent;
                categories.push({ name, count });
            });
            return categories;
        }

        function getCurrentPeople() {
            const peopleElements = document.querySelectorAll('#peopleList .category-item');
            const people = [];
            peopleElements.forEach(element => {
                const name = element.querySelector('.category-name').textContent;
                const count = element.querySelector('.category-count').textContent;
                people.push({ name, count });
            });
            return people;
        }

        function showSaveScenarioModal(currentState) {
            // Create save scenario modal if it doesn't exist
            let modal = document.getElementById('saveScenarioModal');
            if (!modal) {
                modal = createSaveScenarioModal();
                document.body.appendChild(modal);
            }

            // Reset form
            document.getElementById('scenarioNameInput').value = '';
            document.getElementById('scenarioDescriptionInput').value = '';
            
            // Update scenario preview
            updateScenarioPreview(currentState);
            
            modal.style.display = 'block';
        }

        function createSaveScenarioModal() {
            const modal = document.createElement('div');
            modal.id = 'saveScenarioModal';
            modal.className = 'modal';
            modal.innerHTML = `
                <div class="modal-content" style="max-width: 600px;">
                    <div class="modal-header">
                        <h2 class="modal-title">Save Current Scenario</h2>
                        <button class="close" onclick="closeSaveScenarioModal()">&times;</button>
                    </div>
                    <div style="padding: 20px;">
                        <form onsubmit="confirmSaveScenario(event)">
                            <div class="form-group">
                                <label for="scenarioNameInput">Scenario Name: <span class="required">*</span></label>
                                <input type="text" id="scenarioNameInput" placeholder="Enter a name for this scenario..." required>
                            </div>
                            <div class="form-group">
                                <label for="scenarioDescriptionInput">Description (optional):</label>
                                <textarea id="scenarioDescriptionInput" rows="3" placeholder="Describe what makes this scenario unique..."></textarea>
                            </div>
                            <div class="form-group">
                                <label>Current State Preview:</label>
                                <div id="scenarioPreview" style="background: #f8f9fa; border: 1px solid #e9ecef; border-radius: 6px; padding: 15px; font-size: 14px; color: #666;">
                                    Loading preview...
                                </div>
                            </div>
                            <div class="form-actions">
                                <button type="button" class="popup-btn popup-btn-secondary" onclick="closeSaveScenarioModal()">Cancel</button>
                                <button type="submit" class="popup-btn popup-btn-success">Save Scenario</button>
                            </div>
                        </form>
                    </div>
                </div>
            `;
            return modal;
        }

        async function updateScenarioPreview(currentState) {
            const preview = document.getElementById('scenarioPreview');
            const emailCount = currentState.emails ? currentState.emails.length : 0;
            const categoryCount = currentState.categories ? currentState.categories.length : 0;
            const peopleCount = currentState.people ? currentState.people.length : 0;
            
            // Fetch current refinements and saved generations count
            let refinementsCount = 0;
            let savedGenerationsCount = 0;
            
            try {
                const [refinementsResponse, savedGenerationsResponse] = await Promise.all([
                    fetch('/api/refinements'),
                    fetch('/api/saved-generations')
                ]);
                
                const refinementsData = await refinementsResponse.json();
                const savedGenerationsData = await savedGenerationsResponse.json();
                
                refinementsCount = refinementsData.refinements ? refinementsData.refinements.length : 0;
                savedGenerationsCount = savedGenerationsData.savedGenerations ? savedGenerationsData.savedGenerations.length : 0;
            } catch (error) {
                console.error('Error fetching refinements/saved generations count:', error);
            }
            
            preview.innerHTML = `
                <strong>📧 Emails:</strong> ${emailCount} total<br>
                <strong>📂 Categories:</strong> ${categoryCount} categories<br>
                <strong>👥 People:</strong> ${peopleCount} people<br>
                <strong>🔄 Refinements:</strong> ${refinementsCount} saved<br>
                <strong>💾 Saved Responses:</strong> ${savedGenerationsCount} saved<br>
                <strong>🔍 Current Filter:</strong> ${currentState.currentFilter}<br>
                <strong>⏰ Timestamp:</strong> ${new Date(currentState.timestamp).toLocaleString()}
            `;
        }

        async function confirmSaveScenario(event) {
            if (event) {
                event.preventDefault();
            }
            
            const scenarioName = document.getElementById('scenarioNameInput').value.trim();
            const scenarioDescription = document.getElementById('scenarioDescriptionInput').value.trim();

            if (!scenarioName) {
                showErrorPopup('Please enter a scenario name!', 'Missing Information');
                return;
            }

            // Get current state
            const currentState = {
                emails: allEmails,
                currentFilter: currentFilter,
                categories: getCurrentCategories(),
                people: getCurrentPeople(),
                timestamp: new Date().toISOString()
            };

            try {
                const response = await fetch('/api/scenarios', {
                    method: 'POST',
                    headers: {
                        'Content-Type': 'application/json',
                    },
                    body: JSON.stringify({
                        name: scenarioName,
                        description: scenarioDescription,
                        state: currentState
                    })
                });

                const data = await response.json();

                if (data.success) {
                    showSuccessPopup('Scenario saved successfully!', 'Scenario Saved');
                    closeSaveScenarioModal();
                } else {
                    showErrorPopup('Failed to save scenario: ' + (data.error || 'Unknown error'), 'Save Failed');
                }
            } catch (error) {
                console.error('Error saving scenario:', error);
                showErrorPopup('Failed to save scenario. Please try again.', 'Network Error');
            }
        }

        function closeSaveScenarioModal() {
            const modal = document.getElementById('saveScenarioModal');
            if (modal) {
                modal.style.display = 'none';
            }
        }

        async function showLoadScenarioModal() {
            // Create load scenario modal if it doesn't exist
            let modal = document.getElementById('loadScenarioModal');
            if (!modal) {
                modal = createLoadScenarioModal();
                document.body.appendChild(modal);
            }

            modal.style.display = 'block';
            await loadSavedScenarios();
        }

        function createLoadScenarioModal() {
            const modal = document.createElement('div');
            modal.id = 'loadScenarioModal';
            modal.className = 'modal';
            modal.innerHTML = `
                <div class="modal-content" style="max-width: 800px; max-height: 80vh;">
                    <div class="modal-header">
                        <h2 class="modal-title">Load Saved Scenario</h2>
                        <button class="close" onclick="closeLoadScenarioModal()">&times;</button>
                    </div>
                    <div style="padding: 20px; max-height: 60vh; overflow-y: auto;">
                        <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 20px; padding-bottom: 15px; border-bottom: 2px solid #28a745;">
                            <div id="scenariosCount" style="color: #666; font-size: 14px;">Loading...</div>
                            <button class="clear-all-btn" id="clearAllScenariosBtn" onclick="clearAllScenarios()" disabled>Clear All</button>
                        </div>
                        <div id="scenariosList">
                            <div class="loading">Loading saved scenarios...</div>
                        </div>
                    </div>
                </div>
            `;
            return modal;
        }

        async function loadSavedScenarios() {
            const scenariosList = document.getElementById('scenariosList');
            const scenariosCount = document.getElementById('scenariosCount');
            const clearAllBtn = document.getElementById('clearAllScenariosBtn');

            try {
                const response = await fetch('/api/scenarios');
                const data = await response.json();

                if (data.scenarios && data.scenarios.length > 0) {
                    displayScenarios(data.scenarios);
                    scenariosCount.textContent = `${data.scenarios.length} scenario${data.scenarios.length === 1 ? '' : 's'} saved`;
                    clearAllBtn.disabled = false;
                } else {
                    displayNoScenarios();
                    scenariosCount.textContent = 'No scenarios saved';
                    clearAllBtn.disabled = true;
                }
            } catch (error) {
                console.error('Error loading scenarios:', error);
                scenariosList.innerHTML = '<div class="error">Failed to load scenarios. Please try again.</div>';
                scenariosCount.textContent = 'Error loading scenarios';
                clearAllBtn.disabled = true;
            }
        }

        function displayScenarios(scenarios) {
            const scenariosList = document.getElementById('scenariosList');
            scenariosList.innerHTML = '';

            // Add "New Scenario" option at the top
            const newScenarioDiv = document.createElement('div');
            newScenarioDiv.className = 'refinement-item';
            newScenarioDiv.style.border = '2px solid #28a745';
            newScenarioDiv.style.backgroundColor = '#f8fff9';
            newScenarioDiv.innerHTML = `
                <div class="refinement-header">
                    <div>
                        <div style="font-weight: 600; color: #28a745; margin-bottom: 4px;">🆕 New Scenario</div>
                        <div style="color: #666; font-size: 12px;">Start fresh with cleared refinements and saved generations</div>
                    </div>
                    <div style="display: flex; gap: 8px;">
                        <button class="popup-btn popup-btn-success" style="padding: 4px 8px; font-size: 12px;" onclick="loadNewScenario()">Start New</button>
                    </div>
                </div>
                <div class="refinement-content">
                    <div style="font-size: 13px; color: #666;">
                        This will clear all current refinements and saved generations, giving you a fresh start while keeping your email data intact.
                    </div>
                </div>
            `;
            scenariosList.appendChild(newScenarioDiv);

            // Add existing scenarios
            scenarios.forEach(scenario => {
                const scenarioDiv = document.createElement('div');
                scenarioDiv.className = 'refinement-item'; // Reuse existing styles
                scenarioDiv.innerHTML = `
                    <div class="refinement-header">
                        <div>
                            <div style="font-weight: 600; color: #333; margin-bottom: 4px;">${scenario.name}</div>
                            <div class="refinement-timestamp">${formatScenarioDate(scenario.timestamp)}</div>
                        </div>
                        <div style="display: flex; gap: 8px;">
                            <button class="popup-btn popup-btn-success" style="padding: 4px 8px; font-size: 12px;" onclick="loadScenario('${scenario.id}')">Load</button>
                            <button class="refinement-delete-btn" onclick="deleteScenario('${scenario.id}')">Delete</button>
                        </div>
                    </div>
                    <div class="refinement-content">
                        ${scenario.description ? `<div style="margin-bottom: 10px; font-style: italic; color: #666;">${scenario.description}</div>` : ''}
                        <div style="font-size: 13px; color: #666;">
                            <strong>🔄 Refinements:</strong> ${scenario.refinements ? scenario.refinements.length : 0} • 
                            <strong>💾 Saved Generations:</strong> ${scenario.savedGenerations ? scenario.savedGenerations.length : 0}
                        </div>
                    </div>
                `;
                scenariosList.appendChild(scenarioDiv);
            });
        }

        function displayNoScenarios() {
            const scenariosList = document.getElementById('scenariosList');
            scenariosList.innerHTML = `
                <div class="no-refinements">
                    <div class="no-refinements-icon">💾</div>
                    <div class="no-refinements-text">No scenarios saved yet</div>
                    <div class="no-refinements-subtext">Save your current email state to quickly return to it later</div>
                </div>
            `;
        }

        function formatScenarioDate(timestamp) {
            const date = new Date(timestamp);
            const now = new Date();
            const diffTime = Math.abs(now - date);
            const diffMinutes = Math.floor(diffTime / (1000 * 60));
            const diffHours = Math.floor(diffTime / (1000 * 60 * 60));
            const diffDays = Math.floor(diffTime / (1000 * 60 * 60 * 24));

            if (diffMinutes < 1) return 'Just now';
            if (diffMinutes < 60) return `${diffMinutes} minute${diffMinutes === 1 ? '' : 's'} ago`;
            if (diffHours < 24) return `${diffHours} hour${diffHours === 1 ? '' : 's'} ago`;
            if (diffDays < 7) return `${diffDays} day${diffDays === 1 ? '' : 's'} ago`;

            return date.toLocaleDateString('en-US', { 
                month: 'short', 
                day: 'numeric', 
                year: date.getFullYear() !== now.getFullYear() ? 'numeric' : undefined 
            });
        }

        async function loadScenario(scenarioId) {
            showConfirmPopup(
                'Loading this scenario will replace your current email state. Are you sure you want to continue?',
                async () => {
                    try {
                        const response = await fetch(`/api/scenarios/${scenarioId}/load`, {
                            method: 'POST'
                        });
                        const data = await response.json();

                        if (data.success) {
                            showSuccessPopup(data.message, 'Scenario Loaded');
                            closeLoadScenarioModal();
                        } else {
                            showErrorPopup('Failed to load scenario: ' + (data.error || 'Unknown error'), 'Load Failed');
                        }
                    } catch (error) {
                        console.error('Error loading scenario:', error);
                        showErrorPopup('Failed to load scenario. Please try again.', 'Network Error');
                    }
                },
                () => {},
                'Load Scenario'
            );
        }

        async function loadNewScenario() {
            showConfirmPopup(
                'This will clear all current refinements and saved generations, giving you a fresh start. Are you sure you want to continue?',
                async () => {
                    try {
                        const response = await fetch('/api/scenarios/new/load', {
                            method: 'POST'
                        });
                        const data = await response.json();

                        if (data.success) {
                            showSuccessPopup('New scenario started! All refinements and saved generations have been cleared.', 'Fresh Start');
                            closeLoadScenarioModal();
                        } else {
                            showErrorPopup('Failed to start new scenario: ' + (data.error || 'Unknown error'), 'Load Failed');
                        }
                    } catch (error) {
                        console.error('Error starting new scenario:', error);
                        showErrorPopup('Failed to start new scenario. Please try again.', 'Network Error');
                    }
                },
                () => {},
                'Start New Scenario'
            );
        }

        async function deleteScenario(scenarioId) {
            showConfirmPopup(
                'Are you sure you want to delete this scenario?',
                async () => {
                    try {
                        const response = await fetch(`/api/scenarios/${scenarioId}`, {
                            method: 'DELETE'
                        });

                        const data = await response.json();

                        if (data.success) {
                            showSuccessPopup('Scenario deleted successfully!', 'Scenario Deleted');
                            await loadSavedScenarios(); // Reload the list
                        } else {
                            showErrorPopup('Failed to delete scenario: ' + (data.error || 'Unknown error'), 'Delete Failed');
                        }
                    } catch (error) {
                        console.error('Error deleting scenario:', error);
                        showErrorPopup('Failed to delete scenario. Please try again.', 'Network Error');
                    }
                },
                () => {},
                'Delete Scenario'
            );
        }

        async function clearAllScenarios() {
            showConfirmPopup(
                'Are you sure you want to delete ALL scenarios? This action cannot be undone.',
                async () => {
                    const clearAllBtn = document.getElementById('clearAllScenariosBtn');
                    const originalText = clearAllBtn.textContent;
                    clearAllBtn.textContent = 'Clearing...';
                    clearAllBtn.disabled = true;

                    try {
                        const response = await fetch('/api/scenarios', {
                            method: 'DELETE'
                        });

                        const data = await response.json();

                        if (data.success) {
                            showSuccessPopup('All scenarios cleared successfully!', 'Scenarios Cleared');
                            await loadSavedScenarios(); // Reload the list
                        } else {
                            showErrorPopup('Failed to clear scenarios: ' + (data.error || 'Unknown error'), 'Clear Failed');
                            clearAllBtn.textContent = originalText;
                            clearAllBtn.disabled = false;
                        }
                    } catch (error) {
                        console.error('Error clearing scenarios:', error);
                        showErrorPopup('Failed to clear scenarios. Please try again.', 'Network Error');
                        clearAllBtn.textContent = originalText;
                        clearAllBtn.disabled = false;
                    }
                },
                () => {},
                'Clear All Scenarios'
            );
        }

        function closeLoadScenarioModal() {
            const modal = document.getElementById('loadScenarioModal');
            if (modal) {
                modal.style.display = 'none';
            }
        }

        // Update the window click event listener to include scenario modals
        window.addEventListener('click', function(event) {
            const threadModal = document.getElementById('threadModal');
            const generateModal = document.getElementById('generateResponseModal');
            const selectModal = document.getElementById('selectEmailModal');
            const selectTestModal = document.getElementById('selectTestEmailModal');
            const viewRefinementsModal = document.getElementById('viewRefinementsModal');
            const viewSavedGenerationsModal = document.getElementById('viewSavedGenerationsModal');
            const saveScenarioModal = document.getElementById('saveScenarioModal');
            const loadScenarioModal = document.getElementById('loadScenarioModal');
            
            if (event.target === threadModal) {
                closeModal();
            }
            if (event.target === generateModal) {
                closeGenerateResponseModal();
            }
            if (event.target === selectModal) {
                closeSelectEmailModal();
            }
            if (event.target === selectTestModal) {
                closeSelectTestEmailModal();
            }
            if (event.target === viewRefinementsModal) {
                closeViewRefinementsModal();
            }
            if (event.target === viewSavedGenerationsModal) {
                closeViewSavedGenerationsModal();
            }
            if (event.target === saveScenarioModal) {
                closeSaveScenarioModal();
            }
            if (event.target === loadScenarioModal) {
                closeLoadScenarioModal();
            }
        });

        // Function to update refinement category
        async function updateRefinementCategory(refinementId, changeIndex, newCategory) {
            try {
                const response = await fetch(`/api/refinements/${refinementId}/category`, {
                    method: 'PUT',
                    headers: {
                        'Content-Type': 'application/json',
                    },
                    body: JSON.stringify({
                        changeIndex: changeIndex,
                        newCategory: newCategory
                    })
                });

                const data = await response.json();

                if (data.success) {
                    showSuccessPopup('Category updated successfully!', 'Category Updated');
                    // Reload refinements to update the display
                    await loadRefinements();
                } else {
                    showErrorPopup('Failed to update category: ' + (data.error || 'Unknown error'), 'Update Failed');
                }
            } catch (error) {
                console.error('Error updating refinement category:', error);
                showErrorPopup('Failed to update category. Please try again.', 'Network Error');
            }
        }

        // Refresh People List functionality
        function togglePeopleSection() {
            try {
                const container = document.getElementById('peopleListContainer');
                const arrow = document.getElementById('peopleToggleArrow');
                if (!container || !arrow) return;
                const isHidden = (container.style.display === 'none' || container.style.display === '');
                if (isHidden) {
                    container.style.display = 'block';
                    arrow.textContent = '▼';
                    try {
                        const list = document.getElementById('peopleList');
                        if (list && list.children.length === 0 && Array.isArray(allEmails) && allEmails.length) {
                            populatePeople(allEmails);
                        }
                    } catch (_) {}
                } else {
                    container.style.display = 'none';
                    arrow.textContent = '◀';
                }
            } catch (e) {}
        }

        function refreshPeopleList() {
            if (allEmails && allEmails.length > 0) {
                // Recreate the people list and filters based on current email data
                populatePeople(allEmails);
                
                // Show a brief success indication
                const refreshBtn = document.querySelector('.people-refresh-btn');
                const originalText = refreshBtn.textContent;
                refreshBtn.textContent = '✓';
                refreshBtn.style.background = '#28a745';
                
                // Reset button after a short delay
                setTimeout(() => {
                    refreshBtn.textContent = originalText;
                    refreshBtn.style.background = '#4285f4';
                }, 1000);
            } else {
                // If no emails are loaded, show an error
                showErrorPopup('No email data available to refresh people list. Please load emails first.', 'Refresh Failed');
            }
        }

        // User Selector Dropdown Functions
        async function toggleUserDropdown() {
            const dropdown = document.getElementById('userDropdown');
            const button = document.querySelector('.choose-user-btn');
            
            if (dropdown.classList.contains('show')) {
                dropdown.classList.remove('show');
                button.classList.remove('active');
            } else {
                // Load users before showing dropdown
                await loadUsersDropdown();
                dropdown.classList.add('show');
                button.classList.add('active');
            }
        }

        async function loadUsersDropdown() {
            try {
                const [usersResponse, currentUserResponse] = await Promise.all([
                    fetch('/api/users'),
                    fetch('/api/current-user')
                ]);
                
                const usersData = await usersResponse.json();
                const currentUserData = await currentUserResponse.json();
                
                const users = usersData.users || [];
                const currentUser = currentUserData.currentUser;
                
                // Update current user display
                setCurrentUserHeader(currentUser);
                
                // Populate dropdown
                const dropdown = document.getElementById('userDropdown');
                dropdown.innerHTML = '';
                
                users.forEach(userEmail => {
                    const userOption = document.createElement('div');
                    userOption.className = 'user-option';
                    userOption.onclick = () => selectUser(userEmail);
                    
                    const isCurrent = userEmail === currentUser;
                    userOption.innerHTML = `
                        <span class="user-email">${userEmail}</span>
                        <span class="user-status ${isCurrent ? 'current' : ''}">${isCurrent ? 'Current' : 'Switch'}</span>
                    `;
                    
                    dropdown.appendChild(userOption);
                });
                
                // Add "Create New" option
                const createNewOption = document.createElement('div');
                createNewOption.className = 'user-option create-new';
                createNewOption.onclick = () => showCreateUserModal();
                createNewOption.innerHTML = `
                    <span class="create-new-icon">+</span>
                    <span class="create-new-text">Create New</span>
                `;
                dropdown.appendChild(createNewOption);
                
            } catch (error) {
                console.error('Error loading users:', error);
                showErrorPopup('Failed to load users. Please try again.', 'Load Error');
            }
        }

        async function selectUser(userEmail) {
            // Get current user to check if switching is needed
            try {
                const currentUserResponse = await fetch('/api/current-user');
                const currentUserData = await currentUserResponse.json();
                
                if (currentUserData.currentUser === userEmail) {
                    // Already selected user, just close dropdown
                    closeUserDropdown();
                    return;
                }
                
                // Show loading state
                const currentUserSpan = document.getElementById('currentUser');
                const originalText = currentUserSpan.textContent;
                currentUserSpan.textContent = 'Switching...';
                
                // Switch user
                const response = await fetch('/api/switch-user', {
                    method: 'POST',
                    headers: {
                        'Content-Type': 'application/json',
                    },
                    body: JSON.stringify({
                        userEmail: userEmail
                    })
                });
                
                const data = await response.json();
                
                if (data.success) {
                    // Update UI
                    setCurrentUserHeader(userEmail);
                    window.currentUserDisplayName = (data.displayName || displayNameFromEmail(userEmail));
                    
                    // Close dropdown
                    closeUserDropdown();
                    
                    // Clear cached data for the new user
                    unrepliedEmails = [];
                    allEmails = [];
                    currentFilter = 'all';
                    
                    // Show success message
                    showSuccessPopup(`Switched to user: ${userEmail}`, 'User Switched');
                    
                    // Reload emails for new user
                    loadEmails();
                } else {
                    // Restore original text on error
                    currentUserSpan.textContent = originalText;
                    showErrorPopup('Failed to switch user: ' + (data.error || 'Unknown error'), 'Switch Failed');
                }
            } catch (error) {
                console.error('Error switching user:', error);
                showErrorPopup('Failed to switch user. Please try again.', 'Network Error');
            }
        }

        function closeUserDropdown() {
            const dropdown = document.getElementById('userDropdown');
            const button = document.querySelector('.choose-user-btn');
            dropdown.classList.remove('show');
            button.classList.remove('active');
        }

        // New User Setup Modal Functions
        function showCreateUserModal() {
            const modal = document.getElementById('newUserModal');
            modal.style.display = 'block';
            
            // Close the user dropdown
            closeUserDropdown();
            
            // Reset form
            resetNewUserForm();
        }

        function closeCreateUserModal() {
            const modal = document.getElementById('newUserModal');
            modal.style.display = 'none';
        }

        function resetNewUserForm() {
            document.getElementById('newUserForm').reset();
            document.getElementById('uploadedFiles').innerHTML = '';
            
            // Reset file upload section
            const fileUploadSection = document.getElementById('fileUploadSection');
            fileUploadSection.classList.remove('dragover');
        }

        // File Upload Handling
        let uploadedCredentialsFile = null;

        function handleFileSelect(event) {
            const file = event.target.files[0];
            if (file) {
                processUploadedFile(file);
            }
        }

        function processUploadedFile(file) {
            // Validate file type
            if (!file.name.toLowerCase().endsWith('.json')) {
                showErrorPopup('Please upload a valid JSON credentials file.', 'Invalid File Type');
                return;
            }

            // Validate file size (max 5MB)
            if (file.size > 5 * 1024 * 1024) {
                showErrorPopup('File size must be less than 5MB.', 'File Too Large');
                return;
            }

            uploadedCredentialsFile = file;
            displayUploadedFile(file);
        }

        function displayUploadedFile(file) {
            const uploadedFilesContainer = document.getElementById('uploadedFiles');
            const fileSizeKB = Math.round(file.size / 1024);
            
            uploadedFilesContainer.innerHTML = `
                <div class="uploaded-file">
                    <div class="uploaded-file-info">
                        <span class="uploaded-file-icon">📄</span>
                        <div>
                            <div class="uploaded-file-name">${file.name}</div>
                            <div class="uploaded-file-size">${fileSizeKB} KB</div>
                        </div>
                    </div>
                    <button type="button" class="remove-file-btn" onclick="removeUploadedFile()">Remove</button>
                </div>
            `;
        }

        function removeUploadedFile() {
            uploadedCredentialsFile = null;
            document.getElementById('uploadedFiles').innerHTML = '';
            document.getElementById('credentialsFile').value = '';
        }

        // New User Form Submission
        async function handleNewUserSubmit(event) {
            event.preventDefault();
            
            const email = document.getElementById('newUserEmail').value.trim();
            const name = document.getElementById('newUserName').value.trim();
            const refreshRate = document.getElementById('newUserRefreshRate').value.trim();
            const projectId = document.getElementById('gcpProjectId').value.trim();
            const notes = document.getElementById('additionalNotes').value.trim();
            
            if (!email) {
                showErrorPopup('Email address is required!', 'Missing Information');
                return;
            }
            
            // Validate refresh rate
            const refreshRateNum = parseInt(refreshRate, 10);
            if (!refreshRate || isNaN(refreshRateNum) || refreshRateNum < 1 || refreshRateNum > 10) {
                showErrorPopup('Refresh rate must be a number between 1 and 10!', 'Invalid Refresh Rate');
                return;
            }
            
            if (!uploadedCredentialsFile) {
                showErrorPopup('Please upload your GCP credentials file!', 'Missing Credentials');
                return;
            }
            
            // Show loading state
            const submitBtn = document.getElementById('submitNewUserBtn');
            const btnText = submitBtn.querySelector('.btn-text');
            const btnLoading = submitBtn.querySelector('.btn-loading');
            
            btnText.style.display = 'none';
            btnLoading.style.display = 'inline';
            submitBtn.disabled = true;
            
            try {
                // For now, just show a success message since we're not implementing the backend functionality
                setTimeout(() => {
                    showSuccessPopup(
                        `New user setup initiated for ${email}. In a real implementation, this would configure the user's email access and add them to the system.`,
                        'User Setup Started'
                    );
                    closeCreateUserModal();
                    
                    // Reset loading state
                    btnText.style.display = 'inline';
                    btnLoading.style.display = 'none';
                    submitBtn.disabled = false;
                }, 2000);
                
            } catch (error) {
                console.error('Error creating new user:', error);
                showErrorPopup('Failed to create new user. Please try again.', 'Setup Failed');
                
                // Reset loading state
                btnText.style.display = 'inline';
                btnLoading.style.display = 'none';
                submitBtn.disabled = false;
            }
        }

        // Drag and Drop File Upload
        document.addEventListener('DOMContentLoaded', function() {
            const fileUploadSection = document.getElementById('fileUploadSection');
            
            if (fileUploadSection) {
                fileUploadSection.addEventListener('dragover', function(e) {
                    e.preventDefault();
                    fileUploadSection.classList.add('dragover');
                });

                fileUploadSection.addEventListener('dragleave', function(e) {
                    e.preventDefault();
                    fileUploadSection.classList.remove('dragover');
                });

                fileUploadSection.addEventListener('drop', function(e) {
                    e.preventDefault();
                    fileUploadSection.classList.remove('dragover');
                    
                    const files = e.dataTransfer.files;
                    if (files.length > 0) {
                        processUploadedFile(files[0]);
                    }
                });
            }
        });

        // Close dropdown when clicking outside
        document.addEventListener('click', function(event) {
            const dropdown = document.getElementById('userDropdown');
            const button = document.querySelector('.choose-user-btn');
            
            if (dropdown && button && !button.contains(event.target) && !dropdown.contains(event.target)) {
                closeUserDropdown();
            }
        });

        // Close new user modal when clicking outside
        window.addEventListener('click', function(event) {
            const newUserModal = document.getElementById('newUserModal');
            if (event.target === newUserModal) {
                closeCreateUserModal();
            }
        });

        // Load Email Threads Modal functionality
        let loadingOperation = null; // To track and cancel operations
        let currentThreads = [];
        let currentSlideIndex = 0;
        let selectedThreads = new Set();
        let hiddenThreads = new Set();
        let lastThreadDateFilter = null;

        /* ===== Priority Today (important emails) ===== */
let priorityTodayEmails = [];
let priorityCatDropdown = null; // active dropdown element
let priorityCatActiveIndex = -1;

async function loadPriorityToday() {
    try {
        // Show loading popup as requested
        showLoadingOverlay('Loading emails from downloaded set…', 'Fetching important emails from downloaded set…', false);

        // Ensure we have the current categories ordering for suggestions
        await loadCurrentCategories();

        const resp = await fetch('/api/priority-today');
        const data = await resp.json().catch(() => ({}));

        if (resp.status === 401 && data && data.needsAuth) {
            hideLoadingOverlay();
            // Kick off auth flow; index.html already handles startAuthentication UI
            await startAuthentication();
            return;
        }

        priorityTodayEmails = Array.isArray(data.emails) ? data.emails : [];
        
        // Read from classifier log to get categories and rationales
        try {
            console.log('[PriorityToday] Reading in classifier results.....');
            updateLoadingOverlayMessage('Loading Priority Emails from Today…', 'Reading classifier results from log…');
            const logResp = await fetch('/api/classifier-log');
            const logData = await logResp.json().catch(() => ({}));
            
            if (logResp.ok && logData.success && Array.isArray(logData.entries)) {
                // Map log entries to emails by ID
                const logByEmailId = new Map();
                logData.entries.forEach(entry => {
                    if (entry.emailId && entry.emailId !== 'N/A') {
                        logByEmailId.set(entry.emailId, entry);
                    }
                });
                
                // Enrich emails with log data - MARK EMAILS THAT HAVE LOG DATA
                priorityTodayEmails = priorityTodayEmails.map(email => {
                    const logEntry = logByEmailId.get(email.id);
                    if (logEntry) {
                        return {
                            ...email,
                            _cat: logEntry.suggestedCategory || email.category || email._cat || 'Other',
                            _catReason: logEntry.rationale || email._catReason || 'Categorized by backend classifier',
                            category: logEntry.suggestedCategory || email.category || 'Other',
                            _hasLogData: true // Mark that this email has classifier log data
                        };
                    }
                    return email;
                });
                
                console.log(`[PriorityToday] Enriched ${priorityTodayEmails.length} emails with ${logData.entries.length} log entries`);
            }
        } catch (logErr) {
            console.warn('[PriorityToday] Failed to read classifier log, using backend categories:', logErr);
        }
        // Step 2 message: Suggesting categories using the same classifier as Load More/Test Classifier
        try { updateLoadingOverlayMessage('Loading Priority Emails from Today…', 'Suggesting categories for emails…'); } catch (_) {}
        // Two-stage categorization: keyword search (primary) + classifier validation (secondary)
        try {
            const list = Array.isArray(priorityTodayEmails) ? priorityTodayEmails : [];
        list.forEach(e => {
            // PRIORITY: If email has log data from classifier, DON'T overwrite it
            if (e._hasLogData) {
                console.log(`[PriorityToday] Email "${e.subject}" has log data - preserving _cat="${e._cat}" and _catReason="${e._catReason}"`);
                return; // Skip re-categorization to preserve log data
            }
            
            // Priority 0: Use backend-provided category if it exists and is not 'Other'
            const backendCategory = String(e.category || '').trim();
            const hasValidBackendCategory = backendCategory && backendCategory.toLowerCase() !== 'other';
            
            if (hasValidBackendCategory) {
                // Backend already categorized this email - use it directly
                e._cat = backendCategory;
                e._catReason = 'Categorized by backend classifier';
                console.log(`[PriorityToday] Using backend category for "${e.subject}": _cat="${e._cat}"`);
                return; // Skip frontend re-categorization
            }
            
            // Stage 1: Keyword search - check if any category name appears in subject/body/sender
            let keywordCategory = 'Other';
            const searchText = [
                String(e.subject || ''),
                String(e.body || ''),
                String(e.from || '')
            ].join(' ').toLowerCase();
            
            // Check each category name (from currentCategoriesOrder)
            const categories = Array.isArray(currentCategoriesOrder) ? currentCategoriesOrder : [];
            for (const cat of categories) {
                const catName = String(cat || '').toLowerCase();
                if (catName && searchText.includes(catName)) {
                    keywordCategory = cat;
                    break; // Use first match
                }
            }
            
            // Stage 2: Get classifier suggestion
            const classifierTop = (Array.isArray(e?.suggestedCategories) && e.suggestedCategories.length) ? e.suggestedCategories[0] : '';
            const classifierCategory = classifierTop ? mapToCurrentCategory(classifierTop) : '';
                
                // REC LETTER OVERRIDE: If classifier suggests "Rec letter", always use that regardless of keyword search
                const recLetterRegex = /rec\s*letter/i;
                const isRecLetter = recLetterRegex.test(classifierTop || '');
                
                if (isRecLetter) {
                    // Force use of classifier's Rec Letter suggestion, bypass keyword comparison
                    e._cat = mapToCurrentCategory(classifierTop);
                    const sr = e?.suggestedReasons;
                    let reason = '';
                    if (sr && typeof sr === 'object' && !Array.isArray(sr)) {
                        if (classifierTop && sr[classifierTop]) reason = String(sr[classifierTop]);
                    } else if (Array.isArray(sr) && Array.isArray(e?.suggestedCategories)) {
                        reason = String(sr[0] || '');
                    }
                    e._catReason = reason || 'Classified as Rec Letter by AI (recommendation letter detected)';
                    console.log(`[PriorityToday] Rec Letter override applied for "${e.subject}" - bypassed keyword search`);
                } else {
                    // Normal comparison logic for non-rec-letter emails
                    const keywordNorm = String(keywordCategory || '').toLowerCase();
                    
                    // Extract classifier reason and category directly
                    const sr = e?.suggestedReasons;
                    let reason = '';
                    if (sr && typeof sr === 'object' && !Array.isArray(sr)) {
                        if (classifierTop && sr[classifierTop]) reason = String(sr[classifierTop]);
                    } else if (Array.isArray(sr) && Array.isArray(e?.suggestedCategories)) {
                        reason = String(sr[0] || '');
                    }
                    
                    // Use classifier category directly without mapping to preserve new category names
                    const finalCat = classifierTop || classifierCategory || keywordCategory || 'Other';
                    e._cat = finalCat;
                    e._catReason = reason || (classifierTop ? 'Suggested by classifier' : 'Suggested via keyword search');
                    
                    console.log(`[PriorityToday] Processed "${e.subject}": _cat="${e._cat}", _catReason="${e._catReason}"`);
                }
            });
        } catch (_) {}
        renderPriorityToday();
    } catch (e) {
        console.error('loadPriorityToday failed:', e);
        priorityTodayEmails = [];
        renderPriorityToday();
    } finally {
        try { hideLoadingOverlay(); } catch(_) {}
    }
}

/* Use the same batched classifier as Load More/Test Classifier to assign categories
   to priority emails. Results are stored on each email as _cat so the existing UI
   picks them up (email._cat || email.category). */
async function classifyPriorityEmails() {
    try {
        const list = Array.isArray(priorityTodayEmails) ? priorityTodayEmails : [];
        if (!list.length) return;

        const payload = {
            emails: list
                .filter(e => e && e.id)
                .map(e => ({
                    id: e.id,
                    subject: e.subject || '',
                    body: typeof e.body === 'string' ? e.body : (e.snippet || ''),
                    snippet: e.snippet || '',
                    from: e.from || '',
                    // seed "Other" as baseline; server will assign properly
                    category: 'Other'
                })),
            // Pass current categories to help the backend align labels consistently
            categories: Array.isArray(currentCategoriesOrder) ? currentCategoriesOrder.slice() : []
        };

        let data = null;
        try {
            const resp = await fetch('/api/ai-enhanced-categorize', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(payload)
            });
            data = await resp.json().catch(() => ({}));
            if (!resp.ok || !data || data.success !== true || !data.assignments) {
                throw new Error((data && data.error) || 'Non-OK response');
            }
        } catch (serverErr) {
            console.warn('[PriorityToday] AI-enhanced categorization failed; leaving categories as-is:', serverErr);
            return; // keep default/fallbacks; UI still works with manual edit
        }

        // Apply assignments to list as _cat using authoritative mapping
        const assignments = data.assignments || {};
        const byId = new Map(list.map(e => [e && e.id, e]));
        Object.keys(assignments).forEach(id => {
            const email = byId.get(id);
            if (email) {
                const label = assignments[id] || '';
                // Map to the most recent saved category name for consistency
                email._cat = mapToCurrentCategory(label || 'Other');
            }
        });
    } catch (e) {
        console.warn('classifyPriorityEmails failed:', e);
    }
}

function renderPriorityToday(filterCategory) {
    const host = document.getElementById('priorityContainer');
    if (!host) return;
    host.innerHTML = '';

    // Compute filtered list based on optional category (match on suggested or user-typed category)
    let list = Array.isArray(priorityTodayEmails) ? priorityTodayEmails.slice() : [];
    if (filterCategory && String(filterCategory).toLowerCase() !== 'all') {
        const target = String(filterCategory || '').trim().toLowerCase();
        list = list.filter(e => String((e && (e._cat || e.category)) || 'Other').trim().toLowerCase() === target);
    }

    if (!Array.isArray(list) || list.length === 0) {
        // nothing to render
        return;
    }

    // Title row
    const header = document.createElement('div');
    header.style.display = 'flex';
    header.style.alignItems = 'center';
    header.style.justifyContent = 'space-between';
    header.style.padding = '8px 28px 0 28px';
    header.innerHTML = `
        <div style="color:#5f6368; font-size:12px; text-transform:uppercase; letter-spacing:0.4px;">
            Priority Today — ${list.length} email${list.length===1?'':'s'}
        </div>
        <div></div>
    `;
    host.appendChild(header);

    // Cards
    list.forEach((email, idx) => {
        if (window.skippedPriorityIds && window.skippedPriorityIds.has(email.id)) { return; }
        const card = document.createElement('div');
        card.className = 'priority-card';
        card.setAttribute('data-pri-id', email.id);

        const from = String(email.from || 'Unknown Sender');
        const subj = String(email.subject || 'No Subject');
        const date = String(email.date || '');
        
        // Strip HTML tags from body to prevent style injection and layout issues
        const rawBody = (typeof email.body === 'string' ? email.body : (email.snippet || ''));
        const cleanBody = rawBody.replace(/<[^>]*>/g, '').replace(/&nbsp;/g, ' ');
        const previewText = cleanBody
                            .replace(/\s+/g, ' ')
                            .trim()
                            .slice(0, 200) + ((cleanBody && cleanBody.length > 200) ? '…' : '');

        const initialCat = email._cat || email.category || 'Other';

        card.innerHTML = `
            <div class="priority-card-left">
                <button class="priority-approve-btn-circle" title="Approve to Database">✓</button>
                <button class="priority-trash-btn" title="Skip">Skip</button>
            </div>
            <div class="priority-card-content">
                        <div class="priority-header">
                            <div style="display: flex; align-items: center; justify-content: space-between; gap: 12px;">
                                <div class="priority-title" style="flex: 1; padding-right: 0;">${escapeHtml(subj)}</div>
                                <div style="font-size: 16px; color: #5f6368; white-space: nowrap; font-weight: 500; display:flex; align-items:center; gap:8px;">
                                    ${new Date(date).toLocaleString()} 
                                    ${gmailLinkHtml(email)}
                                    ${email.__isNew || window.recentlyAddedEmailIds?.has(email.id) ? '' : `<span style="font-size: 11px; color: #9aa0a6; font-weight: 400;">${escapeHtml(email.id || '')}</span>`}
                                </div>
                            </div>
                        </div>
                <div class="priority-meta">${escapeHtml(from)}</div>
                <div class="priority-preview">${escapeHtml(previewText)}</div>
                <div class="priority-category-editor" style="position:relative;">
                    <span style="font-size:12px; color:#555;">Category:</span>
                    <input type="text" class="priority-cat-input" value="${escapeHtml(initialCat)}" placeholder="Type a category…">
                    ${email._catReason ? `<span class="priority-cat-reason-inline" title="${escapeHtml(email._catReason)}">${escapeHtml(email._catReason)}</span>` : ''}
                </div>
            </div>
        `;

        // Open thread on card click
        card.addEventListener('click', (ev) => {
            // ignore clicks on buttons or input
            const t = ev.target;
            if (t && (t.classList.contains('priority-approve-btn') || t.classList.contains('priority-trash-btn') || t.classList.contains('priority-cat-input') || (t.closest && t.closest('.priority-cat-suggest')))) {
                return;
            }
            openEmailThread(email.id, email.subject);
        });

        // Wire Approve/Trash
        const approveBtn = card.querySelector('.priority-approve-btn-circle');
        const trashBtn = card.querySelector('.priority-trash-btn');
        const catInput = card.querySelector('.priority-cat-input');

// Prevent card click when interacting within the category editor
        const editorEl = card.querySelector('.priority-category-editor');
        if (editorEl) {
            editorEl.addEventListener('click', (ev) => ev.stopPropagation());
            editorEl.addEventListener('mousedown', (ev) => ev.stopPropagation());
        }

        // Prevent card click on the circular approve button
        if (approveBtn) {
            approveBtn.addEventListener('click', async (ev) => {
                ev.stopPropagation();
                await approvePriorityEmail(email, catInput ? catInput.value.trim() : (email._cat || email.category || 'Other'), card);
            });
        }
        if (trashBtn) {
            trashBtn.addEventListener('click', async (ev) => {
                ev.stopPropagation();
                await trashPriorityEmail(email, card);
            });
        }

        // Category input: suggestions dropdown from currentCategoriesOrder (type-ahead)
        if (catInput) {
            setupPriorityCategorySuggestions(catInput, email);
        }

        host.appendChild(card);
    });
}

function setupPriorityCategorySuggestions(inputEl, email) {
    // Avoid double-binding on the same element
    if (inputEl.__catSuggestSetup) return;
    inputEl.__catSuggestSetup = true;

    let dropdown = null;
    let activeIndex = -1;

    const ensureDropdown = () => {
        if (!dropdown) {
            dropdown = document.createElement('div');
            dropdown.className = 'priority-cat-suggest';
            dropdown.style.display = 'none';
            // Ensure parent is a positioning context for absolute dropdown
            const parent = inputEl.parentElement || inputEl;
            try {
                if (getComputedStyle(parent).position === 'static') {
                    parent.style.position = 'relative';
                }
            } catch (_) {}
            parent.appendChild(dropdown);
        }
        return dropdown;
    };

    const hideDropdown = () => {
        if (dropdown) dropdown.style.display = 'none';
    };

    const filterList = () => {
        const dd = ensureDropdown();
        const q = String(inputEl.value || '').toLowerCase().trim();
        const list = Array.isArray(currentCategoriesOrder) ? currentCategoriesOrder.slice() : [];
        const matches = list
            .filter(c => !q || String(c).toLowerCase().includes(q))
            .slice(0, 8);

        dd.innerHTML = '';
        activeIndex = -1;

        if (matches.length === 0) {
            dd.style.display = 'none';
            return;
        }

        matches.forEach((name, i) => {
            const item = document.createElement('div');
            item.className = 'priority-cat-item' + (i === 0 ? ' active' : '');
            if (i === 0) activeIndex = 0;
            item.textContent = name;
            item.addEventListener('mousedown', (ev) => {
                ev.preventDefault();
                inputEl.value = name;
                try { if (email) email._cat = String(name || '').trim(); } catch(_) {}
                hideDropdown();
            });
            dd.appendChild(item);
        });
        dd.style.display = 'block';
    };

    inputEl.addEventListener('input', filterList);
    inputEl.addEventListener('input', () => {
        try {
            if (email) email._cat = String(inputEl.value || '').trim();
            const reasonEl = inputEl.closest('.priority-card')?.querySelector('.priority-cat-reason, .priority-cat-reason-inline');
            if (reasonEl) reasonEl.style.display = 'none';
        } catch(_) {}
    });
    inputEl.addEventListener('focus', filterList);
    inputEl.addEventListener('blur', () => {
        // small timeout to allow mousedown on item
        setTimeout(hideDropdown, 120);
    });

    inputEl.addEventListener('keydown', (ev) => {
        if (!dropdown || dropdown.style.display === 'none') return;
        const items = Array.from(dropdown.querySelectorAll('.priority-cat-item'));
        if (!items.length) return;

        if (ev.key === 'ArrowDown') {
            ev.preventDefault();
            activeIndex = Math.min(items.length - 1, activeIndex + 1);
            items.forEach((it, idx) => it.classList.toggle('active', idx === activeIndex));
            items[Math.max(0, activeIndex)].scrollIntoView({ block: 'nearest' });
        } else if (ev.key === 'ArrowUp') {
            ev.preventDefault();
            activeIndex = Math.max(0, activeIndex - 1);
            items.forEach((it, idx) => it.classList.toggle('active', idx === activeIndex));
            items[Math.max(0, activeIndex)].scrollIntoView({ block: 'nearest' });
        } else if (ev.key === 'Enter') {
            ev.preventDefault();
            const active = items[activeIndex] || items[0];
            if (active) {
                inputEl.value = active.textContent || inputEl.value;
                try { if (email) email._cat = String(active.textContent || inputEl.value || '').trim(); } catch(_) {}
                hideDropdown();
            }
        } else if (ev.key === 'Escape') {
            ev.preventDefault();
            hideDropdown();
        }
    });
}

// Track recently added emails for yellow highlighting
window.recentlyAddedEmailIds = window.recentlyAddedEmailIds || new Set();

function showStatsBarFlashMessage(message, isSuccess = true) {
    try {
        // Remove any existing flash message
        const existing = document.getElementById('statsBarFlashMessage');
        if (existing) existing.remove();

        // Create flash message element
        const flash = document.createElement('div');
        flash.id = 'statsBarFlashMessage';
        flash.textContent = message;
        flash.style.padding = '8px 16px';
        flash.style.borderRadius = '6px';
        flash.style.fontSize = '14px';
        flash.style.fontWeight = '500';
        flash.style.transition = 'opacity 0.3s ease';
        
        if (isSuccess) {
            flash.style.background = '#d4edda';
            flash.style.color = '#155724';
            flash.style.border = '1px solid #c3e6cb';
        } else {
            flash.style.background = '#f8d7da';
            flash.style.color = '#721c24';
            flash.style.border = '1px solid #f5c6cb';
        }

        // Insert into stats bar between stats-info and search-bar
        const statsBar = document.querySelector('.stats-bar');
        const searchBar = document.querySelector('.search-bar');
        if (statsBar && searchBar) {
            statsBar.insertBefore(flash, searchBar);
        }

        // Fade out and remove after 1.5 seconds
        setTimeout(() => {
            flash.style.opacity = '0';
            setTimeout(() => {
                try { flash.remove(); } catch(_) {}
            }, 300);
        }, 1500);
    } catch (e) {
        console.error('showStatsBarFlashMessage failed:', e);
    }
}

async function approvePriorityEmail(email, categoryValue, cardEl) {
    try {
        const primary = String(categoryValue || '').trim() || 'Other';
        const payload = {
            id: email.id,
            subject: email.subject || 'No Subject',
            from: email.from || 'Unknown Sender',
            date: email.date || new Date().toISOString(),
            body: email.body || email.snippet || '',
            snippet: email.snippet || (email.body ? String(email.body).slice(0, 100) + (email.body.length > 100 ? '...' : '') : ''),
            category: primary
        };

        // Persist
        const resp = await fetch('/api/add-approved-email', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ email: payload })
        });
        const data = await resp.json().catch(() => ({}));
        if (!resp.ok || !data.success) {
            throw new Error(data.error || 'Failed to approve email');
        }

        // Remove yellow card from priority section
        try { cardEl.remove(); } catch(_){}
        // Also remove from local priority list
        priorityTodayEmails = priorityTodayEmails.filter(e => e.id !== email.id);

        // Mark as recently added for yellow highlighting
        window.recentlyAddedEmailIds.add(email.id);

        // Refresh main list so the email appears (will be yellow initially)
        try { await loadEmails(); } catch(_) {}

        // Show flash message
        showStatsBarFlashMessage('Email approved and added to database', true);

        // After 1.5 seconds, remove yellow highlighting
        setTimeout(() => {
            window.recentlyAddedEmailIds.delete(email.id);
            // Find the email item and update its background
            const emailItems = document.querySelectorAll('.email-item');
            emailItems.forEach(item => {
                // Check if this is the recently added email by looking for matching content
                const itemSubject = item.querySelector('.email-subject');
                if (itemSubject && itemSubject.textContent === payload.subject) {
                    item.style.transition = 'background-color 0.3s ease';
                    item.style.backgroundColor = '';
                }
            });
        }, 1500);
    } catch (e) {
        console.error('approvePriorityEmail failed:', e);
        showStatsBarFlashMessage('Failed to approve email. Please try again.', false);
    }
}

async function trashPriorityEmail(email, cardEl) {
    try {
        // Ephemeral skip: do NOT persist to hidden-inbox.
        // Just hide in this session so a page refresh will load it again.
        window.skippedPriorityIds = window.skippedPriorityIds || new Set();
        if (email && email.id) {
            try { window.skippedPriorityIds.add(email.id); } catch(_){}
        }

        // Remove from UI and local array
        try { cardEl.remove(); } catch(_){}
        priorityTodayEmails = priorityTodayEmails.filter(e => e.id !== email.id);
    } catch (e) {
        console.error('trashPriorityEmail failed:', e);
        // Still remove visually
        try { cardEl.remove(); } catch(_){}
        priorityTodayEmails = priorityTodayEmails.filter(e => e.id !== email.id);
    }
}
        /* ===== Load Today (Threads + Inbox) ===== */
let todayThreads = [];
let todayEmails = [];
let selectedTodayThreads = new Set();
let selectedTodayEmails = new Set();

function ensureLoadTodayModal() {
    let modal = document.getElementById('loadTodayModal');
    if (modal) return modal;
    modal = document.createElement('div');
    modal.id = 'loadTodayModal';
    modal.className = 'modal';
    modal.innerHTML = `
            <div class="modal-content" style="max-width: 1400px; width: 95vw; height: 85vh; max-height: 85vh; display:flex; flex-direction:column;">
            <div class="modal-header">
                <h2 class="modal-title">Load Today</h2>
                <button class="close" onclick="closeLoadTodayModal()">&times;</button>
            </div>
        <div style="padding: 20px; display:flex; flex-direction:column; gap:16px; flex:1 1 auto; min-height:0;">
                    <div class="load-today-controls" style="display:flex; gap:12px; justify-content:flex-end; margin-bottom:0; flex-wrap:wrap; position:sticky; top:0; z-index:1001; padding:12px 16px; background:#fff; border-bottom:2px solid #e9ecef; box-shadow:0 2px 8px rgba(0,0,0,0.1); flex-shrink:0;">
                    <button class="carousel-nav-btn" style="background:#667eea; margin:0;" onclick="refreshLoadToday()">🔄 Refresh</button>
                    <button class="carousel-nav-btn" id="loadTodaySelectAllThreadsBtn" style="background:#28a745; margin:0;" onclick="selectAllTodayThreads()">Select All Threads</button>
                    <button class="carousel-nav-btn" id="loadTodaySelectAllEmailsBtn" style="background:#28a745; margin:0;" onclick="selectAllTodayEmails()">Select All Emails</button>
                                                            <button class="carousel-nav-btn" style="background:#17a2b8; margin:0;" onclick="addAllToday()">Add All</button>
                </div>
                <div style="display:grid; grid-template-columns: repeat(2, minmax(0, 1fr)); gap:16px; flex:1 1 auto; min-height:0; min-width:0; width:100%; overflow:hidden;">
                    <div style="display:flex; flex-direction:column; min-height:0; min-width:0; border:1px solid #e9ecef; border-radius:8px; background:#fff;">
                        <div style="padding:10px; border-bottom:1px solid #e9ecef; display:flex; align-items:center; justify-content:space-between;">
                            <div style="font-weight:600; color:#333;">Today’s Threads</div>
                            <div id="todayThreadsCount" style="color:#666; font-size:12px;">0</div>
                        </div>
                        <div id="todayThreadsList" style="flex:1 1 auto; overflow-y:auto; overflow-x:hidden; padding:10px; word-break:break-word; overflow-wrap:anywhere; display:flex; flex-direction:column; min-width:0; max-width:100%;">
                            <div class="loading">Loading threads...</div>
                        </div>
                    </div>
                    <div style="display:flex; flex-direction:column; min-height:0; min-width:0; border:1px solid #e9ecef; border-radius:8px; background:#fff;">
                        <div style="padding:10px; border-bottom:1px solid #e9ecef; display:flex; align-items:center; justify-content:space-between;">
                            <div style="font-weight:600; color:#333;">Today’s Inbox Emails</div>
                            <div id="todayEmailsCount" style="color:#666; font-size:12px;">0</div>
                        </div>
                        <div id="todayEmailsList" style="flex:1 1 auto; overflow-y:auto; overflow-x:hidden; padding:10px; word-break:break-word; overflow-wrap:anywhere; display:flex; flex-direction:column; min-width:0; max-width:100%;">
                            <div class="loading">Loading emails...</div>
                        </div>
                    </div>
                </div>
                <div style="display:flex; justify-content:center; gap:16px; padding:20px 16px 16px 16px; border-top:1px solid #e9ecef; background:#fff; flex-shrink:0;">
                    <button class="carousel-btn carousel-btn-cancel" onclick="closeLoadTodayModal()">Cancel</button>
                    <button class="carousel-btn carousel-btn-add" id="addSelectedTodayBtn" onclick="addSelectedToday()" disabled>Add Selected</button>
                </div>
            </div>
        </div>
    `;
    modal.addEventListener('click', (ev) => { if (ev.target === modal) closeLoadTodayModal(); });
    document.body.appendChild(modal);
    return modal;
}

function showLoadTodayModal() {
    window.__loadDateFilter = 'today';
    const modal = ensureLoadTodayModal();
    // reset state
    todayThreads = [];
    todayEmails = [];
    selectedTodayThreads = new Set();
    selectedTodayEmails = new Set();
    // placeholders
    const tl = document.getElementById('todayThreadsList');
    const el = document.getElementById('todayEmailsList');
    if (tl) tl.innerHTML = '<div class="loading">Loading threads...</div>';
    if (el) el.innerHTML = '<div class="loading">Loading emails...</div>';
    document.getElementById('todayThreadsCount').textContent = '0';
    document.getElementById('todayEmailsCount').textContent = '0';
    updateAddSelectedTodayBtn();
    modal.style.display = 'block';
    // fetch in parallel
    loadTodayData();
}

function showLoadPriorityPrompt() {
    try {
        showCustomPopup({
            title: 'Load Priority Emails',
            message: 'Choose categorization method for newly loaded threads and inbox emails.',
            icon: 'warning',
            primaryText: 'AI-Enhanced Categorization',
            secondaryText: 'Default Categorization',
            onPrimary: () => { try { window.__priorityCategorizationMode = 'ai'; showLoadPriorityModal(); } catch(e) { console.error(e); } },
            onSecondary: () => { try { window.__priorityCategorizationMode = 'default'; showLoadPriorityModal(); } catch(e) { console.error(e); } },
            type: 'confirm'
        });
    } catch (e) {
        console.error('showLoadPriorityPrompt failed:', e);
        try { window.__priorityCategorizationMode = 'default'; showLoadPriorityModal(); } catch(_) {}
    }
}

// Helpers for AI-enhanced categorization
function buildCategoryTokenMatchers() {
    try {
        const list = Array.isArray(currentCategoriesOrder) ? currentCategoriesOrder.slice() : [];
        const out = [];
        const seen = new Set();
        for (const name of list) {
            const key = String(name || '').toLowerCase();
            if (!key || seen.has(key)) continue;
            seen.add(key);
            let tokens = getCategorySeedTokens(name) || [];
            if (!Array.isArray(tokens) || tokens.length === 0) {
                tokens = [name];
            }
            const parts = tokens
                .map(t => String(t || '').trim())
                .filter(Boolean)
                .map(t => '\\b' + escapeRegExp(t) + '\\b');
            const re = parts.length ? new RegExp('(?:' + parts.join('|') + ')', 'i') : null;
            out.push({ name, re });
        }
        return out;
    } catch (e) {
        console.error('buildCategoryTokenMatchers failed:', e);
        return [];
    }
}

function keywordAssignEmailCategory(email) {
    try {
        const text = [email.subject || '', email.body || ''].join(' ');
        const matchers = buildCategoryTokenMatchers();
        for (const m of matchers) {
            if (m.re && m.re.test(text)) {
                return mapToCurrentCategory(m.name);
            }
        }
        return 'Other';
    } catch (_) {
        return 'Other';
    }
}

function keywordAssignThreadCategory(thread) {
    try {
        const msgs = Array.isArray(thread.messages) ? thread.messages : [];
        const bodies = msgs.slice(-6).map(m => String(m.subject || '') + ' ' + String(m.body || '')).join(' ');
        const text = (thread.subject || '') + ' ' + bodies;
        const matchers = buildCategoryTokenMatchers();
        for (const m of matchers) {
            if (m.re && m.re.test(text)) {
                return mapToCurrentCategory(m.name);
            }
        }
        return 'Other';
    } catch (_) {
        return 'Other';
    }
}

async function validateEmailsWithAI(emails) {
    // Verify assigned categories using category-summary-qa; move to Other when not a fit
    try {
        const MAX_VALIDATE = Math.min(50, emails.length);
        const targets = emails.slice(0, MAX_VALIDATE).filter(e => e && e._cat && String(e._cat).toLowerCase() !== 'other');
        const concurrency = 4;
        let i = 0;
        async function worker() {
            while (i < targets.length) {
                const idx = i++;
                const e = targets[idx];
                try {
                    const q = `Does the following email belong in the "${e._cat}" category? Answer with only YES or NO.\n\nSubject: ${e.subject || ''}\n\nBody:\n${e.body || e.snippet || ''}`;
                    const resp = await fetch('/api/category-summary-qa', {
                        method: 'POST',
                        headers: { 'Content-Type': 'application/json' },
                        body: JSON.stringify({ category: e._cat, question: q, history: [] })
                    });
                    const data = await resp.json().catch(() => ({}));
                    const ans = String((data && data.answer) || '').trim().toLowerCase();
                    if (!ans || !(ans.startsWith('y'))) {
                        e._cat = 'Other';
                    }
                } catch (err) {
                    console.warn('AI validate failed; keeping assignment for now:', err);
                }
            }
        }
        const workers = Array.from({ length: concurrency }, () => worker());
        await Promise.all(workers);
    } catch (e) {
        console.error('validateEmailsWithAI failed:', e);
    }
}

async function runPriorityAICategorization() {
    try {
        // Seed initial categories via keywords (used for threads and as fallback for emails)
        if (Array.isArray(todayEmails)) {
            for (const e of todayEmails) {
                try { e._cat = keywordAssignEmailCategory(e); } catch (_) {}
            }
        }
        if (Array.isArray(todayThreads)) {
            for (const t of todayThreads) {
                try { t._cat = keywordAssignThreadCategory(t); } catch (_) {}
            }
        }

        // Build payload for server-side AI enhanced categorization (emails only)
        const emailsPayload = (Array.isArray(todayEmails) ? todayEmails : [])
            .filter(e => e && e.id)
            .map(e => ({
                id: e.id,
                subject: e.subject || '',
                body: typeof e.body === 'string' ? e.body : (e.snippet || ''),
                snippet: e.snippet || '',
                from: e.from || '',
                // Send our current best guess as baseline; server will verify/adjust
                category: e._cat || mapToCurrentCategory(e.category || '')
            }));

        // Ensure current categories list is available
        const catList = Array.isArray(currentCategoriesOrder) ? currentCategoriesOrder.slice() : [];

        // Call backend endpoint to verify and improve assignments
        let data = null;
        try {
            const resp = await fetch('/api/ai-enhanced-categorize', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ emails: emailsPayload, categories: catList })
            });
            data = await resp.json().catch(() => ({}));
            if (!resp.ok || !data || data.success !== true || !data.assignments) {
                throw new Error((data && data.error) || 'Non-OK response');
            }
        } catch (serverErr) {
            console.warn('AI-enhanced server categorization failed; falling back to client validator:', serverErr);
            // Fallback to client-side simple validator if server is unavailable
            await validateEmailsWithAI(Array.isArray(todayEmails) ? todayEmails : []);
            return;
        }

        // Apply server assignments to todayEmails
        const assignments = data.assignments || {};
        if (assignments && typeof assignments === 'object') {
            const byId = new Map((todayEmails || []).map(e => [e && e.id, e]));
            Object.keys(assignments).forEach(id => {
                const email = byId.get(id);
                if (email) {
                    email._cat = assignments[id];
                }
            });
        }

        // Threads remain keyword-assigned for this pass; deriveThreadCategory will prefer t._cat in AI mode
    } catch (e) {
        console.error('runPriorityAICategorization failed:', e);
    }
}

function showLoadPriorityModal() {
    try { window.__loadDateFilter = 'priority3d'; } catch (_) {}
    const modal = ensureLoadTodayModal();
    // reset state (same as Load Today)
    todayThreads = [];
    todayEmails = [];
    selectedTodayThreads = new Set();
    selectedTodayEmails = new Set();
    const tl = document.getElementById('todayThreadsList');
    const el = document.getElementById('todayEmailsList');
    if (tl) tl.innerHTML = '<div class="loading">Loading threads...</div>';
    if (el) el.innerHTML = '<div class="loading">Loading emails...</div>';
    const tc = document.getElementById('todayThreadsCount');
    const ec = document.getElementById('todayEmailsCount');
    if (tc) tc.textContent = '0';
    if (ec) ec.textContent = '0';
    updateAddSelectedTodayBtn();
    modal.style.display = 'block';
    // Update modal title to reflect priority mode
    try {
        const titleEl = document.querySelector('#loadTodayModal .modal-title');
        if (titleEl) titleEl.textContent = 'Load Priority (Last 3 Days)';
    } catch (_) {}
    // Fetch data with priority filter
    loadTodayData();
}

function closeLoadTodayModal() {
    const modal = document.getElementById('loadTodayModal');
    if (modal) modal.style.display = 'none';
}

/* Open existing email-based categories editor from the popup */
/* Unreplied Email Categories (Carousel) */
let unrepliedWorkingGroups = [];
let currentUnrepliedSlideIndex = 0;
let persistedUnrepliedIds = new Set();
let unrepliedAllPool = [];
let unrepliedOrder = [];

function ensureUnrepliedEmailCategoriesModal() {
    let modal = document.getElementById('unrepliedEmailCategoriesModal');
    if (modal) return modal;
    modal = document.createElement('div');
    modal.id = 'unrepliedEmailCategoriesModal';
    modal.className = 'modal';
    modal.innerHTML = `
        <div class="modal-content thread-carousel-modal">
            <div class="modal-header">
                <h2 class="modal-title">Edit Email Categories (Unreplied)</h2>
                <button class="close" onclick="closeUnrepliedEmailCategoriesModal()">&times;</button>
            </div>
            <div class="thread-carousel-container">
                <div class="carousel-header">
                    <div class="carousel-info" id="unrepliedCarouselInfo">Loading emails...</div>
                    <div class="carousel-controls">
                        <button class="carousel-nav-btn" id="unrepliedPrevBtn" onclick="previousUnrepliedSlide()" disabled>← Previous</button>
                        <span class="carousel-counter" id="unrepliedCarouselCounter">1 / 1</span>
                        <button class="carousel-nav-btn" id="unrepliedNextBtn" onclick="nextUnrepliedSlide()" disabled>Next →</button>
                    </div>
                </div>
                <div class="thread-carousel" id="unrepliedCarousel">
                    <div class="loading">Preparing editor...</div>
                </div>
                <div class="carousel-actions">
                    <button class="carousel-btn carousel-btn-cancel" onclick="closeUnrepliedEmailCategoriesModal()">Cancel</button>
                    <button class="carousel-btn carousel-btn-add" onclick="saveUnrepliedEmailGrouping()">Save Grouping</button>
                </div>
            </div>
        </div>
    `;
    modal.addEventListener('click', (ev) => { if (ev.target === modal) closeUnrepliedEmailCategoriesModal(); });
    document.body.appendChild(modal);
    return modal;
}

function closeUnrepliedEmailCategoriesModal() {
    const modal = document.getElementById('unrepliedEmailCategoriesModal');
    if (modal) modal.style.display = 'none';
}

/* Open the unreplied-email-only carousel from Load Priority Emails */
async function openEmailCategoriesEditorFromPopup() {
    try {
        // Ensure current categories ordering is available
        try { await loadCurrentCategories(); } catch (_) {}
        const canonical = [
            'Teaching & Student Support',
            'Research & Lab Work',
            'University Administration',
            'Financial & Reimbursements',
            'Conferences',
            'Networking',
            'Personal & Life Management'
        ];
        unrepliedOrder = Array.isArray(currentCategoriesOrder) && currentCategoriesOrder.length
            ? currentCategoriesOrder.slice()
            : canonical.slice();

        // Load persisted unreplied emails
        let persisted = [];
        try {
            const resp = await fetch('/api/unreplied-emails');
            const data = await resp.json();
            persisted = Array.isArray(data.emails) ? data.emails : [];
        } catch (e) {
            persisted = [];
        }
        persistedUnrepliedIds = new Set((persisted || []).map(e => e && e.id).filter(Boolean));

        // Build union pool = persisted unreplied + newly loaded today emails (priority or today)
        const poolMap = new Map();
        (persisted || []).forEach(e => {
            if (e && e.id) poolMap.set(e.id, { ...e, __isNew: false, _cat: e.category || '' });
        });
        (todayEmails || []).forEach(e => {
            if (!e || !e.id) return;
            const isNew = !persistedUnrepliedIds.has(e.id);
            if (!poolMap.has(e.id)) {
                // normalize fields and mark new
                poolMap.set(e.id, { ...e, __isNew: !!isNew, _cat: e.category || '' });
            } else {
                // keep persisted record; but if persisted lacks snippet/webUrl, prefer richer fields
                const base = poolMap.get(e.id);
                const merged = {
                    ...base,
                    snippet: base.snippet || e.snippet || '',
                    webUrl: base.webUrl || e.webUrl || '',
                    __isNew: base.__isNew || !!isNew
                };
                poolMap.set(e.id, merged);
            }
        });
        unrepliedAllPool = Array.from(poolMap.values());

        // Group by mapped category into slides
        const idxByName = new Map(unrepliedOrder.map((n, i) => [String(n || '').toLowerCase(), i]));
        const groups = unrepliedOrder.map(n => ({ name: n, emails: [] }));
        const others = [];

        // Helper: push into group with sorting later
        const pushEmail = (catName, email) => {
            const key = String(catName || '').toLowerCase();
            const gi = idxByName.has(key) ? idxByName.get(key) : -1;
            if (gi >= 0) {
                groups[gi].emails.push(email);
            } else {
                others.push(email);
            }
        };

        // Map each email to the closest current category
        for (const e of unrepliedAllPool) {
            const mapped = mapToCurrentCategory(e._cat || e.category || '');
            e._cat = mapped || (unrepliedOrder[0] || 'Personal & Life Management');
            pushEmail(e._cat, e);
        }

        // Sort each bucket: newly loaded (yellow) first, then by date desc
        const sortEmails = (arr) => {
            arr.sort((a, b) => {
                const anew = a.__isNew ? 1 : 0;
                const bnew = b.__isNew ? 1 : 0;
                if (bnew !== anew) return bnew - anew;
                return new Date(b.date || 0) - new Date(a.date || 0);
            });
        };
        groups.forEach(g => sortEmails(g.emails));
        if (others.length) {
            sortEmails(others);
            groups.push({ name: 'Other', emails: others, isOther: true });
        }

        unrepliedWorkingGroups = groups;
        currentUnrepliedSlideIndex = 0;

        // Show modal and render
        const modal = ensureUnrepliedEmailCategoriesModal();
        renderUnrepliedEmailCarousel();
        modal.style.display = 'block';
    } catch (e) {
        console.error('openEmailCategoriesEditorFromPopup failed:', e);
        showErrorPopup('Failed to open Email Categories editor.', 'Open Failed');
    }
}

/* Sort all unreplied emails using keyword matching and open the Unreplied Email Categories editor.
   This mirrors the "Load Priority Emails → Edit Email Categories" experience, but scopes to unreplied-emails only. */
async function sortUnrepliedAndOpenEditor() {
    try {
        // Ensure unreplied emails and current categories order are loaded
        try { await loadUnrepliedEmails(); } catch (_) {}
        try { await loadCurrentCategories(); } catch (_) {}

        const list = Array.isArray(unrepliedEmails) ? unrepliedEmails.slice() : [];
        if (!list.length) {
            showErrorPopup('No unreplied emails found to sort.', 'Nothing to Sort');
            return;
        }

        // Load keyword guidelines (category names/keywords). If absent, derive tokens from saved categories.
        let guidelines = [];
        try {
            const resp = await fetch('/api/category-guidelines');
            const data = await resp.json();
            guidelines = Array.isArray(data.categories) ? data.categories : [];
        } catch (_) {
            guidelines = [];
        }

        // Build ordered category list
        const ordered =
            (Array.isArray(currentCategoriesOrder) && currentCategoriesOrder.length)
                ? currentCategoriesOrder.slice()
                : Array.from(new Set(list.map(e => e && e.category).filter(Boolean)));

        // Build category -> tokens rows
        const rows = [];
        if (guidelines.length) {
            guidelines.forEach(g => {
                const raw = String(g.name || '').trim();
                if (!raw) return;
                let tokens = raw.split(',').map(s => String(s || '').trim()).filter(Boolean);
                // If single label, augment with seed tokens for better coverage
                if (tokens.length === 1) {
                    const seeds = getCategorySeedTokens(tokens[0]) || [];
                    if (Array.isArray(seeds) && seeds.length) tokens = seeds;
                }
                const mappedName = mapToCurrentCategory(tokens[0] || raw);
                rows.push({ name: mappedName, tokens });
            });
        } else {
            // Derive tokens from category names using known seeds
            ordered.forEach(name => {
                const seeds = getCategorySeedTokens(name) || [];
                const tokens = (Array.isArray(seeds) && seeds.length) ? seeds : [name];
                rows.push({ name, tokens });
            });
        }

        // Deduplicate rows by name (case-insensitive)
        const seen = new Set();
        const catRows = [];
        for (const r of rows) {
            const key = String(r.name || '').toLowerCase();
            if (key && !seen.has(key)) {
                seen.add(key);
                catRows.push(r);
            }
        }

        // Build whole-word regex per category
        const makeWordRegex = (tokens) => {
            const parts = (tokens || [])
                .map(t => String(t || '').trim())
                .filter(Boolean)
                .map(t => '\\b' + escapeRegExp(t) + '\\b'); // defined earlier
            if (!parts.length) return null;
            return new RegExp('(?:' + parts.join('|') + ')', 'i');
        };
        const catMatchers = catRows.map(r => ({ name: r.name, re: makeWordRegex(r.tokens || []) }));

        // Classify each unreplied email based on subject/body keyword hits; fallback to existing mapping when no hit
        list.forEach(e => {
            const subj = String(e.subject || '');
            const body = String(e.body || e.snippet || '');
            const blob = subj + ' ' + body;
            let assigned = '';
            for (const cm of catMatchers) {
                if (cm.re && cm.re.test(blob)) {
                    assigned = cm.name;
                    break;
                }
            }
            e._cat = assigned ? mapToCurrentCategory(assigned) : mapToCurrentCategory(e.category || '');
            e.__isNew = false; // not highlighting; all are persisted unreplied
        });

        // Build groups strictly from ordered categories
        const order =
            (Array.isArray(currentCategoriesOrder) && currentCategoriesOrder.length)
                ? currentCategoriesOrder.slice()
                : Array.from(new Set(list.map(e => e && e._cat).filter(Boolean)));
        unrepliedOrder = order;

        const idxBy = new Map(order.map((n, i) => [String(n || '').toLowerCase(), i]));
        const groups = order.map(n => ({ name: n, emails: [] }));
        list.forEach(e => {
            const key = String(e._cat || '').toLowerCase();
            const gi = idxBy.has(key) ? idxBy.get(key) : -1;
            if (gi >= 0) groups[gi].emails.push(e);
        });

        // Set editor state without merging in any newly fetched inbox items
        unrepliedAllPool = list;
        persistedUnrepliedIds = new Set(list.map(e => e && e.id).filter(Boolean));
        unrepliedWorkingGroups = groups;
        currentUnrepliedSlideIndex = 0;

        const modal = ensureUnrepliedEmailCategoriesModal();
        renderUnrepliedEmailCarousel();
        modal.style.display = 'block';
    } catch (e) {
        console.error('sortUnrepliedAndOpenEditor failed:', e);
        showErrorPopup('Failed to sort unreplied emails. Please try again.', 'Open Failed');
    }
}

// Prompt for Sort Unreplied: present See Current vs Refresh paths
function showSortUnrepliedPrompt() {
    try {
        showCustomPopup({
            title: 'Sort Unreplied',
            message: 'Choose whether to view the current grouping as-is, or refresh with a keyword-based re-sort.',
            icon: 'warning',
            // Primary = Refresh (current behavior), Secondary = See Current (new read-only of current mapping)
            primaryText: 'Refresh',
            secondaryText: 'See Current',
            onPrimary: () => { try { sortUnrepliedAndOpenEditor(); } catch (e) { console.error(e); } },
            onSecondary: () => { try { openUnrepliedEditorCurrent(); } catch (e) { console.error(e); } },
            type: 'confirm'
        });
    } catch (e) {
        console.error('showSortUnrepliedPrompt failed:', e);
        // Fallback to existing behavior if popup fails
        try { sortUnrepliedAndOpenEditor(); } catch (_) {}
    }
}

// Open the Unreplied Email Categories editor using current stored categories (no reclassification)
async function openUnrepliedEditorCurrent() {
    try {
        // Load current unreplied set and authoritative category order
        try { await loadUnrepliedEmails(); } catch (_) {}
        try { await loadCurrentCategories(); } catch (_) {}

        const list = Array.isArray(unrepliedEmails) ? unrepliedEmails.slice() : [];
        if (!list.length) {
            showErrorPopup('No unreplied emails found to edit.', 'Nothing to Edit');
            return;
        }

        // Build the category order: use system-wide order if available; else derive from existing email categories
        const order = (Array.isArray(currentCategoriesOrder) && currentCategoriesOrder.length)
            ? currentCategoriesOrder.slice()
            : Array.from(new Set(list.map(e => e && e.category).filter(Boolean)));

        // Prepare grouping buckets
        const indexBy = new Map(order.map((n, i) => [String(n || '').toLowerCase(), i]));
        const groups = order.map(n => ({ name: n, emails: [] }));
        const others = [];

        // Assign each email to its current category (mapped to authoritative list), no keyword refresh
        for (const e of list) {
            const mapped = mapToCurrentCategory(e.category || '');
            e._cat = mapped;
            const key = String(mapped || '').toLowerCase();
            const gi = indexBy.has(key) ? indexBy.get(key) : -1;
            if (gi >= 0) groups[gi].emails.push(e);
            else others.push(e);
        }

        if (others.length) {
            groups.push({ name: 'Other', emails: others, isOther: true });
        }

        // Sort each bucket by date (newest first) to keep the editor consistent
        const sortEmails = (arr) => {
            arr.sort((a, b) => new Date(b.date || 0) - new Date(a.date || 0));
        };
        groups.forEach(g => sortEmails(g.emails));

        // Seed editor state and launch modal
        unrepliedAllPool = list;
        persistedUnrepliedIds = new Set(list.map(e => e && e.id).filter(Boolean));
        unrepliedWorkingGroups = groups;
        currentUnrepliedSlideIndex = 0;

        const modal = ensureUnrepliedEmailCategoriesModal();
        renderUnrepliedEmailCarousel();
        modal.style.display = 'block';
    } catch (e) {
        console.error('openUnrepliedEditorCurrent failed:', e);
        showErrorPopup('Failed to open current unreplied categories editor.', 'Open Failed');
    }
}

function renderUnrepliedEmailCarousel() {
    try {
        const carousel = document.getElementById('unrepliedCarousel');
        const info = document.getElementById('unrepliedCarouselInfo');
        const counter = document.getElementById('unrepliedCarouselCounter');
        if (!carousel || !info || !counter) return;

        const groups = Array.isArray(unrepliedWorkingGroups) ? unrepliedWorkingGroups : [];
        if (!groups.length) {
            carousel.innerHTML = '<div class="no-emails">No unreplied emails to edit.</div>';
            info.textContent = 'No categories';
            counter.textContent = '0 / 0';
            document.getElementById('unrepliedPrevBtn').disabled = true;
            document.getElementById('unrepliedNextBtn').disabled = true;
            return;
        }

        const totalEmails = groups.reduce((acc, g) => acc + (Array.isArray(g.emails) ? g.emails.length : 0), 0);
        info.textContent = `Found ${groups.length} categor${groups.length === 1 ? 'y' : 'ies'} • ${totalEmails} email${totalEmails === 1 ? '' : 's'}`;
        counter.textContent = `${Math.min(currentUnrepliedSlideIndex + 1, groups.length)} / ${groups.length}`;

        carousel.innerHTML = '';
        groups.forEach((group, idx) => {
            const slide = document.createElement('div');
            slide.className = `thread-slide ${idx === currentUnrepliedSlideIndex ? 'active' : ''}`;
            const count = (group.emails || []).length;
            const header = group.isOther
                ? `Other — ${count} email${count === 1 ? '' : 's'}`
                : `${escapeHtml(group.name || '')} — ${count} email${count === 1 ? '' : 's'}`;

            const emailsHtml = (group.emails || []).map(e => {
                const subj = escapeHtml(e.subject || 'No Subject');
                const from = escapeHtml(e.from || 'Unknown Sender');
                const date = e.date || '';
                const rawBody = typeof e.body === 'string' ? e.body : (e.snippet || '');
                const previewText = String(rawBody || '').replace(/\s+/g, ' ').trim();
                const preview = escapeHtml(previewText ? previewText.slice(0, 160) + (previewText.length > 160 ? '...' : '') : '');
                const catStyle = getCategoryBadgeStyle(e._cat || 'Personal & Life Management');
                const categoryClass = `category-${(e._cat || 'Personal & Life Management').toLowerCase().replace(/\s+/g, '-')}`;
                const highlightStyle = e.__isNew ? 'background:#FFF9CC;' : 'background:#fff;';

                const selectId = `unrep-cat-select-${idx}-${e.id}`;
                const options = unrepliedOrder.map(n => `<option value="${String(n).replace(/"/g, '"')}" ${String(n).toLowerCase() === String(e._cat || '').toLowerCase() ? 'selected' : ''}>${n}</option>`).join('');

                return `
                    <div style="display: block; width: 100%; margin-bottom: 8px;">
                        <div style="border:1px solid #e9ecef; border-radius:6px; padding:10px; ${highlightStyle}">
                            <div style="display:flex; justify-content:space-between; align-items:center; gap:8px; margin-bottom:6px;">
                                <div style="font-weight:600; color:#333; overflow:hidden; text-overflow:ellipsis; white-space:nowrap;">${subj}</div>
                                <div class="email-category ${categoryClass}" style="display:inline-block; padding:4px 8px; border-radius:12px; font-size:12px; font-weight:500; ${catStyle}">
                                    ${escapeHtml(e._cat || '')}
                                </div>
                            </div>
                            <div style="font-size:12px; color:#666; margin-bottom:6px;">${from} • ${formatDate(date)}</div>
                            <div style="font-size:12px; color:#777; line-height:1.4; margin-bottom:8px;">${preview}</div>
                            <div style="display:flex; align-items:center; gap:8px;">
                                <label for="${selectId}" style="font-size:12px; color:#333;">Move to:</label>
                                <select id="${selectId}" style="padding:6px 8px; border:1px solid #ddd; border-radius:6px; font-size:12px;"
                                    onchange="onChangeUnrepliedEmailCategory('${String(e.id).replace(/'/g, "\\'")}', this.value)">
                                    ${options}
                                </select>
                            </div>
                        </div>
                    </div>
                `;
            }).join('');

            slide.innerHTML = `
                <div class="thread-preview">
                    <div class="thread-subject">${header}</div>
                    <div class="thread-messages">
                        ${emailsHtml || '<div class="no-emails" style="padding:12px;">No emails in this category.</div>'}
                    </div>
                </div>
            `;
            carousel.appendChild(slide);
        });

        updateUnrepliedCarouselNavigation();
    } catch (e) {
        console.error('renderUnrepliedEmailCarousel failed:', e);
    }
}

function previousUnrepliedSlide() {
    if (currentUnrepliedSlideIndex > 0) {
        currentUnrepliedSlideIndex--;
        updateUnrepliedCarouselDisplay();
    }
}
function nextUnrepliedSlide() {
    if (currentUnrepliedSlideIndex < unrepliedWorkingGroups.length - 1) {
        currentUnrepliedSlideIndex++;
        updateUnrepliedCarouselDisplay();
    }
}
function updateUnrepliedCarouselDisplay() {
    const slides = document.querySelectorAll('#unrepliedCarousel .thread-slide');
    slides.forEach((slide, index) => {
        slide.classList.toggle('active', index === currentUnrepliedSlideIndex);
    });
    const counter = document.getElementById('unrepliedCarouselCounter');
    if (counter) counter.textContent = `${currentUnrepliedSlideIndex + 1} / ${unrepliedWorkingGroups.length}`;
    updateUnrepliedCarouselNavigation();
}
function updateUnrepliedCarouselNavigation() {
    const prevBtn = document.getElementById('unrepliedPrevBtn');
    const nextBtn = document.getElementById('unrepliedNextBtn');
    if (prevBtn) prevBtn.disabled = currentUnrepliedSlideIndex === 0;
    if (nextBtn) nextBtn.disabled = currentUnrepliedSlideIndex === unrepliedWorkingGroups.length - 1;
}

/* Move an email to a different category bucket and re-render */
function onChangeUnrepliedEmailCategory(emailId, newCategory) {
    try {
        const groups = Array.isArray(unrepliedWorkingGroups) ? unrepliedWorkingGroups : [];
        if (!groups.length) return;
        let found = null;
        let srcIdx = -1, srcPos = -1;

        for (let gi = 0; gi < groups.length; gi++) {
            const arr = Array.isArray(groups[gi].emails) ? groups[gi].emails : [];
            const pos = arr.findIndex(e => e && e.id === emailId);
            if (pos !== -1) {
                found = arr[pos];
                srcIdx = gi;
                srcPos = pos;
                break;
            }
        }
        if (!found) return;

        // Remove from source
        groups[srcIdx].emails.splice(srcPos, 1);
        // Update category
        found._cat = newCategory;

        // Find target group index (case-insensitive), create "Other" if not found
        const targetNameLc = String(newCategory || '').toLowerCase();
        let tgtIdx = groups.findIndex(g => !g.isOther && String(g.name || '').toLowerCase() === targetNameLc);
        if (tgtIdx === -1) {
            // Insert before Other (or at end if no Other)
            const otherIdx = groups.findIndex(g => g && g.isOther);
            const insertIdx = otherIdx === -1 ? groups.length : otherIdx;
            groups.splice(insertIdx, 0, { name: newCategory, emails: [] });
            tgtIdx = insertIdx;
        }

        // Add to target
        groups[tgtIdx].emails.push(found);
        // Re-sort both involved groups
        const sortEmails = (arr) => {
            arr.sort((a, b) => {
                const anew = a.__isNew ? 1 : 0;
                const bnew = b.__isNew ? 1 : 0;
                if (bnew !== anew) return bnew - anew;
                return new Date(b.date || 0) - new Date(a.date || 0);
            });
        };
        sortEmails(groups[srcIdx].emails);
        sortEmails(groups[tgtIdx].emails);

        unrepliedWorkingGroups = groups;
        // Keep the current slide visible and refresh
        renderUnrepliedEmailCarousel();
    } catch (e) {
        console.error('onChangeUnrepliedEmailCategory failed:', e);
        showErrorPopup('Failed to move email to the selected category.', 'Move Failed');
    }
}

/* Persist newly loaded emails and save category assignments for unreplied emails only */
async function saveUnrepliedEmailGrouping() {
    try {
        const groups = Array.isArray(unrepliedWorkingGroups) ? unrepliedWorkingGroups : [];
        if (!groups.length) {
            closeUnrepliedEmailCategoriesModal();
            return;
        }

        // 1) Ensure newly loaded emails are persisted into unreplied-emails.json
        const pool = Array.isArray(unrepliedAllPool) ? unrepliedAllPool : [];
        const newOnes = pool.filter(e => e && e.id && !persistedUnrepliedIds.has(e.id));

        if (newOnes.length) {
            showLoadingOverlay('Saving Emails', `Persisting ${newOnes.length} new email${newOnes.length === 1 ? '' : 's'}...`, false);
            for (let i = 0; i < newOnes.length; i++) {
                const e = newOnes[i];
                updateLoadingOverlayMessage('Saving Emails', `Saving ${i + 1} of ${newOnes.length}...`);
                try {
                    await fetch('/api/add-approved-email', {
                        method: 'POST',
                        headers: { 'Content-Type': 'application/json' },
                        body: JSON.stringify({ email: {
                            id: e.id,
                            subject: e.subject || 'No Subject',
                            from: e.from || 'Unknown Sender',
                            date: e.date || new Date().toISOString(),
                            body: e.body || e.snippet || '',
                            snippet: e.snippet || (e.body ? String(e.body).slice(0, 100) + (e.body.length > 100 ? '...' : '') : ''),
                            category: e._cat || e.category || '',
                            webUrl: e.webUrl || ''
                        }})
                    });
                    persistedUnrepliedIds.add(e.id);
                } catch (saveErr) {
                    console.warn('Failed to persist new email:', e.id, saveErr);
                }
            }
            hideLoadingOverlay();
        }

        // 2) Build assignments from grouping (exclude "Other")
        const assignments = {};
        for (const g of groups) {
            if (!g || g.isOther) continue;
            for (const e of (g.emails || [])) {
                if (e && e.id) assignments[e.id] = g.name;
            }
        }

        // 3) Save category assignments for unreplied emails only
        showLoadingOverlay('Saving Categories', 'Updating categories for unreplied emails...', false);
        const resp = await fetch('/api/unreplied/save-categories', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ assignments })
        });
        const data = await resp.json().catch(() => ({}));
        hideLoadingOverlay();
        if (!resp.ok || !data.success) {
            throw new Error(data.error || 'Failed to save categories for unreplied emails');
        }

        // 4) Refresh in-memory inbox lists used by Generate Response and Load Priority
        try { await loadUnrepliedEmails(); } catch (_) {}

        // Update the currently loaded Today Inbox list’s category pill for affected items
        try {
            const ids = Object.keys(assignments);
            if (ids.length && Array.isArray(todayEmails)) {
                const byId = new Map(todayEmails.map(e => [e && e.id, e]));
                ids.forEach(id => {
                    const item = byId.get(id);
                    if (item) item._cat = assignments[id];
                });
                renderTodayEmailsList(false);
            }
        } catch (_) {}

        // Close modal
        closeUnrepliedEmailCategoriesModal();
        showSuccessPopup(`Saved categories for ${data.updatedCount || 0} email${(data.updatedCount || 0) === 1 ? '' : 's'}.`, 'Categories Saved');
    } catch (e) {
        console.error('saveUnrepliedEmailGrouping failed:', e);
        try { hideLoadingOverlay(); } catch (_){}
        showErrorPopup('Failed to save email categories. Please try again.', 'Save Failed');
    }
}

/* Derive a category for a thread using latest response -> response-emails mapping, then subject match; else "Other" */
function deriveThreadCategory(t) {
    try {
        if (window.__priorityCategorizationMode === 'ai' && t && t._cat) {
            return mapToCurrentCategory(t._cat);
        }
        const msgs = Array.isArray(t.messages) ? t.messages : [];
        const latestResp = [...msgs].reverse().find(m => m && m.isResponse && m.id);
        if (latestResp && latestResp.id && Array.isArray(allEmails)) {
            const matchById = allEmails.find(e => e && e.id === latestResp.id);
            if (matchById && matchById.category) return mapToCurrentCategory(matchById.category);
        }
        if (Array.isArray(allEmails)) {
            const matchBySubject = allEmails.find(e => e && e.subject === (t.subject || ''));
            if (matchBySubject && matchBySubject.category) return mapToCurrentCategory(matchBySubject.category);
        }
    } catch (_) {}
    return mapToCurrentCategory('Other');
}

/* Thread-based category editor seeded only with the newly loaded threads in the popup */
async function openThreadCategoryEditor() {
    try {
        // Ensure email list is loaded for deriveThreadCategory() lookups
        if (!Array.isArray(allEmails) || allEmails.length === 0) {
            try { await loadEmails(); } catch (_) {}
        }
        // Ensure current categories are loaded for ordering/mapping
        try { await loadCurrentCategories(); } catch (_) {}

        // Fetch all saved threads from the DB via keyword search API (it always returns allThreads)
        let dbThreads = [];
        try {
            const resp = await fetch('/api/search-by-keywords', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    keywords: ['snapshot'], // arbitrary token; we only need allThreads from the response
                    options: { groupBy: 'thread', fields: ['subject', 'body'] }
                })
            });
            const data = await resp.json().catch(() => ({}));
            dbThreads = Array.isArray(data.allThreads) ? data.allThreads : [];
        } catch (e) {
            console.warn('Unable to fetch DB threads; falling back to in-popup pool only:', e);
            dbThreads = [];
        }

        // Merge DB threads with the newly loaded ones in this popup; mark new ones for highlighting
        const poolMap = new Map();
        (dbThreads || []).forEach(t => { if (t && t.id) poolMap.set(t.id, { ...t }); });
        const todays = Array.isArray(todayThreads) ? todayThreads : [];
        todays.forEach(t => {
            if (!t || !t.id) return;
            const merged = poolMap.has(t.id) ? { ...poolMap.get(t.id), __isNew: true } : { ...t, __isNew: true };
            poolMap.set(t.id, merged);
        });
        const fullPool = Array.from(poolMap.values());
        if (!fullPool.length) {
            showErrorPopup('No threads available to edit. Load threads first.', 'Nothing to Edit');
            return;
        }

        // Build keywordAllThreads and a fast id index
        window.keywordAllThreads = fullPool.slice();
        window.threadById = new Map(fullPool.map(t => [t.id, t]));

        // Build groups strictly from the saved category list and include ALL previous threads;
        // new threads (from Load Priority) are included and highlighted in yellow.
        const order = Array.isArray(currentCategoriesOrder) ? currentCategoriesOrder.slice() : [];
        // Exclude "Other" from the explicit category list to avoid duplicate Other slides
        const orderedNoOther = order.filter(n => {
            const lc = String(n || '').trim().toLowerCase();
            return lc !== 'other' && lc !== 'other threads';
        });
        const indexByName = new Map(orderedNoOther.map((n, i) => [String(n || '').toLowerCase(), i]));
        const groups = orderedNoOther.map(name => ({ name, threads: [] }));

        const others = [];
        for (const t of fullPool) {
            const mapped = mapToCurrentCategory(deriveThreadCategory(t));
            const idx = indexByName.has(String(mapped || '').toLowerCase()) ? indexByName.get(String(mapped).toLowerCase()) : -1;
            if (idx >= 0) {
                groups[idx].threads.push(t);
            } else {
                others.push(t);
            }
        }
        // Single unified "Other" bucket at the end
        groups.push({ name: 'Other', threads: others, isOther: true });

        // Persist working state and render the carousel
        window.__threadEditMode = true;
        window.keywordWorkingGroups = JSON.parse(JSON.stringify(groups));
        const modal = ensureKeywordSearchResultsModal();
        keywordResults = JSON.parse(JSON.stringify(groups));
        currentKeywordSlideIndex = 0;
        populateKeywordSearchResultsCarousel();
        modal.style.display = 'block';
    } catch (e) {
        console.error('openThreadCategoryEditor failed:', e);
        showErrorPopup('Failed to open thread category editor.', 'Open Failed');
    }
}

/* Programmatic guard to enforce single-column vertical stacking after content is rendered */
function enforceLoadTodayVertical(node) {
    try {
        if (!node) return;
        node.style.display = 'flex';
        node.style.flexDirection = 'column';
        node.style.alignItems = 'stretch';
        node.style.overflowX = 'hidden';
        node.style.minWidth = '0';
        node.style.maxWidth = '100%';
        node.style.width = '100%';

        /* Explicitly disable CSS multicol and grid on the container */
        node.style.columnCount = '1';
        node.style.columns = 'auto';
        node.style.columnWidth = 'auto';
        node.style.webkitColumnCount = '1';
        node.style.webkitColumns = 'auto';
        node.style.gridTemplateColumns = 'none';
        node.style.gridAutoFlow = 'row';

        const kids = node.children || [];
        for (let i = 0; i < kids.length; i++) {
            const k = kids[i];
            if (!k || !(k.style)) continue;
            k.style.display = 'block';
            k.style.width = '100%';
            k.style.maxWidth = '100%';
            k.style.minWidth = '0';
            k.style.float = 'none';
            k.style.clear = 'both';
            k.style.flex = '0 0 auto';
            k.style.breakInside = 'avoid-column';
            k.style.pageBreakInside = 'avoid';
        }
    } catch (_) {}
}

async function loadTodayData() {
    try {
        const [threadsResp, emailsResp] = await Promise.all([
            fetch('/api/load-email-threads', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ dateFilter: (window.__loadDateFilter === 'priority3d' ? 'priority3d' : 'today') })
            }),
            fetch('/api/fetch-more-emails', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ dateFilter: (window.__loadDateFilter === 'priority3d' ? 'priority3d' : 'today') })
            })
        ]);

        // Threads
        try {
            const tdata = await threadsResp.json();
            if (threadsResp.ok && tdata && tdata.success && Array.isArray(tdata.threads)) {
                todayThreads = tdata.threads;
            } else {
                todayThreads = [];
            }
        } catch (_) {
            todayThreads = [];
        }

        // Emails
        let authNeeded = false;
        try {
            const edata = await emailsResp.json();
            if (emailsResp.status === 401 && edata && edata.needsAuth) {
                authNeeded = true;
                todayEmails = [];
            } else if (emailsResp.ok && edata && edata.success && Array.isArray(edata.emails)) {
                todayEmails = edata.emails;
            } else {
                todayEmails = [];
            }
        } catch (_) {
            todayEmails = [];
        }

        // Ensure we have the most recently saved category ordering before rendering/sorting
        try { await loadCurrentCategories(); } catch (_) {}

        // If AI-Enhanced mode selected, run enhanced categorization before rendering
        try { if (window.__priorityCategorizationMode === 'ai') { await runPriorityAICategorization(); } } catch (_) {}

        console.log(
            '[LoadToday] threads loaded:',
            Array.isArray(todayThreads) ? todayThreads.length : -1,
            'emails loaded:',
            Array.isArray(todayEmails) ? todayEmails.length : -1,
            'mode:',
            window.__priorityCategorizationMode || 'default'
        );
        if (window.__priorityCategorizationMode === 'ai') {
            try {
                const catCount = (Array.isArray(todayEmails) ? todayEmails : []).reduce((acc, e) => {
                    const c = (e && (e._cat || e.category)) ? String(e._cat || e.category) : 'Other';
                    acc[c] = (acc[c] || 0) + 1;
                    return acc;
                }, {});
                console.log('[LoadToday][AI] email category counts:', catCount);
            } catch (err) {
                console.warn('[LoadToday][AI] failed to compute category counts:', err);
            }
        }
        renderTodayThreadsList();
        renderTodayEmailsList(authNeeded);
        /* Enforce vertical stacking post-render as a final guard */
        try {
            enforceLoadTodayVertical(document.getElementById('todayEmailsList'));
            enforceLoadTodayVertical(document.getElementById('todayThreadsList'));
        } catch (_) {}
    } catch (e) {
        console.error('loadTodayData failed:', e);
        // basic fallback
        renderTodayThreadsList();
        renderTodayEmailsList(false);
    }
}

function renderTodayThreadsList() {
    const host = document.getElementById('todayThreadsList');
    const count = document.getElementById('todayThreadsCount');
    if (!host) return;
    if (count) count.textContent = String(todayThreads.length || 0);

    if (!todayThreads.length) {
        host.innerHTML = '<div class="no-emails">No threads found for today.</div>';
        return;
    }

    // Sort by most recently saved categories order, then newest within category
    const orderList = Array.isArray(currentCategoriesOrder) ? currentCategoriesOrder : [];
    const catIndex = (name) => {
        const n = String(name || '').toLowerCase();
        const idx = orderList.findIndex(c => String(c || '').toLowerCase() === n);
        return idx === -1 ? Number.MAX_SAFE_INTEGER : idx;
    };
    const latestDate = (t) => {
        try {
            const msgs = Array.isArray(t.messages) ? t.messages : [];
            if (!msgs.length) return 0;
            const d = Math.max(...msgs.map(m => new Date(m.date || 0).getTime() || 0));
            return isFinite(d) ? d : 0;
        } catch { return 0; }
    };

    const sorted = todayThreads.slice().sort((a, b) => {
        const ca = deriveThreadCategory(a);
        const cb = deriveThreadCategory(b);
        const ai = catIndex(ca);
        const bi = catIndex(cb);
        if (ai !== bi) return ai - bi;
        return latestDate(b) - latestDate(a);
    });

    // Build cards; highlight newly loaded items
    host.innerHTML = sorted.map((t, i) => {
        const subjRaw = t.subject || 'No Subject';
        const subj = escapeHtml(subjRaw);
        const msgs = Array.isArray(t.messages) ? t.messages : [];
        const last = msgs.length ? msgs[msgs.length - 1] : null;
        const date = last?.date || '';
        const from = escapeHtml(last?.from || 'Unknown Sender');

        const rawLastBody = typeof last?.body === 'string' ? last.body : '';
        const previewText = rawLastBody.replace(/\s+/g, ' ').trim();
        const preview = escapeHtml(previewText ? previewText.slice(0, 160) + (previewText.length > 160 ? '...' : '') : '');

        const catName = deriveThreadCategory(t);
        const categoryClass = `category-${catName.toLowerCase().replace(/\s+/g, '-')}`;
        const catStyle = getCategoryBadgeStyle(catName);
        const catDisplay = escapeHtml(catName);

        return `
            <div style="display: block !important; width: 100% !important; margin-bottom: 8px; clear: both;">
                <label style="display: block !important; width: 100% !important; box-sizing: border-box; border: 1px solid #e9ecef; border-radius: 6px; padding: 10px; background: #FFF9CC; cursor: pointer;">
                    <table style="width: 100%; border-collapse: collapse;">
                        <tr>
                            <td style="width: 30px; vertical-align: top; padding-right: 10px;">
                                <input type="checkbox" id="today-thread-${i}" onchange="toggleTodayThread(${i}, this.checked)">
                            </td>
                            <td style="vertical-align: top;">
                                <div style="font-weight:600; color:#333; overflow:hidden; text-overflow:ellipsis; white-space:nowrap;">${subj}</div>
                                <div style="font-size:12px; color:#666; overflow:hidden; text-overflow:ellipsis; white-space:nowrap; margin-top: 2px;">${from} • ${formatDate(date)} ${gmailLinkHtml({ webUrl: (last && last.webUrl) || '', originalFrom: last ? (last.from || '') : '', from: last ? (last.from || '') : '', subject: t.subject || '' })}</div>
                                <div style="font-size:12px; color:#777; margin-top:4px; line-height:1.4;">${preview}</div>
                                <div class="email-category ${categoryClass}" style="display:inline-block; padding:4px 8px; border-radius:12px; font-size:12px; font-weight:500; margin-top:6px; ${catStyle}">
                                    ${catDisplay}
                                </div>
                            </td>
                        </tr>
                    </table>
                </label>
            </div>
        `;
    }).join('');
}

function renderTodayEmailsList(authNeeded) {
    const host = document.getElementById('todayEmailsList');
    const count = document.getElementById('todayEmailsCount');
    if (!host) return;

    if (authNeeded) {
        if (count) count.textContent = '0';
        host.innerHTML = `
            <div class="error" style="text-align:center;">
                Gmail authentication required to fetch today's inbox emails.<br>
                <button class="select-email-btn" style="margin-top:8px;" onclick="startAuthentication()">Authenticate</button>
            </div>
        `;
        return;
    }

    if (count) count.textContent = String(todayEmails.length || 0);

    if (!todayEmails.length) {
        host.innerHTML = '<div class="no-emails">No inbox emails found for today.</div>';
        return;
    }

    // Sort by most recently saved categories order, then newest within category
    const orderList = Array.isArray(currentCategoriesOrder) ? currentCategoriesOrder : [];
    const catIndex = (name) => {
        const n = String(name || '').toLowerCase();
        const idx = orderList.findIndex(c => String(c || '').toLowerCase() === n);
        return idx === -1 ? Number.MAX_SAFE_INTEGER : idx;
    };
    // Pre-map categories to most recently saved order for consistent sorting and display
    const augmented = todayEmails.slice().map(e => {
        const chosen = (window.__priorityCategorizationMode === 'ai' && e._cat)
            ? e._cat
            : mapToCurrentCategory(e.category || '');
        return { ...e, _cat: chosen };
    });

    const sorted = augmented.sort((a, b) => {
        const ai = catIndex(a._cat || '');
        const bi = catIndex(b._cat || '');
        if (ai !== bi) return ai - bi;
        return new Date(b.date || 0) - new Date(a.date || 0);
    });

    // Build HTML; highlight newly loaded items
    const emailsHTML = sorted.map((e, i) => {
        const subj = escapeHtml(e.subject || 'No Subject');
        const from = escapeHtml(e.from || 'Unknown Sender');
        const date = e.date || '';
        const rawBody = typeof e.body === 'string' ? e.body : '';
        const previewText = rawBody.replace(/\s+/g, ' ').trim();
        const preview = previewText ? previewText.slice(0, 160) + (previewText.length > 160 ? '...' : '') : '';
        const safePreview = escapeHtml(preview);
        const catStyle = getCategoryBadgeStyle(e._cat || 'Personal & Life Management');
        const categoryClass = `category-${(e._cat || 'Personal & Life Management').toLowerCase().replace(/\s+/g, '-')}`;

        return `
            <div style="display: block !important; width: 100% !important; margin-bottom: 8px; clear: both;">
                <label style="display: block !important; width: 100% !important; box-sizing: border-box; border: 1px solid #e9ecef; border-radius: 6px; padding: 10px; background: #FFF9CC; cursor: pointer;">
                    <table style="width: 100%; border-collapse: collapse;">
                        <tr>
                            <td style="width: 30px; vertical-align: top; padding-right: 10px;">
                                <input type="checkbox" id="today-email-${i}" onchange="toggleTodayEmail(${i}, this.checked)">
                            </td>
                            <td style="vertical-align: top;">
                                <div style="font-weight:600; color:#333; overflow:hidden; text-overflow:ellipsis; white-space:nowrap;">${subj}</div>
                                <div style="font-size:12px; color:#666; overflow:hidden; text-overflow:ellipsis; white-space:nowrap; margin-top: 2px;">${from} • ${formatDate(date)} ${gmailLinkHtml(e)}</div>
                                <div style="font-size:12px; color:#777; margin-top:4px; line-height:1.4;">${safePreview}</div>
                                <div class="email-category ${categoryClass}" style="display:inline-block; padding:4px 8px; border-radius:12px; font-size:12px; font-weight:500; margin-top:6px; ${catStyle}">
                                    ${e._cat || 'Personal & Life Management'}
                                </div>
                            </td>
                        </tr>
                    </table>
                </label>
            </div>
        `;
    }).join('');

    host.innerHTML = emailsHTML;
}

function toggleTodayThread(i, checked) {
    if (checked) selectedTodayThreads.add(i);
    else selectedTodayThreads.delete(i);
    updateAddSelectedTodayBtn();
}

function toggleTodayEmail(i, checked) {
    if (checked) selectedTodayEmails.add(i);
    else selectedTodayEmails.delete(i);
    updateAddSelectedTodayBtn();
}

function updateAddSelectedTodayBtn() {
    const btn = document.getElementById('addSelectedTodayBtn');
    const total = selectedTodayThreads.size + selectedTodayEmails.size;
    if (!btn) return;
    btn.disabled = total === 0;
    btn.textContent = total === 0 ? 'Add Selected' : `Add ${total} Selected`;
}

function selectAllTodayThreads() {
    selectedTodayThreads.clear();
    for (let i = 0; i < todayThreads.length; i++) {
        selectedTodayThreads.add(i);
        const cb = document.getElementById(`today-thread-${i}`);
        if (cb) cb.checked = true;
    }
    updateAddSelectedTodayBtn();
    const b = document.getElementById('loadTodaySelectAllThreadsBtn');
    if (b) {
        const t = b.textContent;
        b.textContent = 'All Threads ✓';
        b.disabled = true;
        setTimeout(() => { try { b.textContent = t; b.disabled = false; } catch(_){} }, 900);
    }
}

function selectAllTodayEmails() {
    selectedTodayEmails.clear();
    for (let i = 0; i < todayEmails.length; i++) {
        selectedTodayEmails.add(i);
        const cb = document.getElementById(`today-email-${i}`);
        if (cb) cb.checked = true;
    }
    updateAddSelectedTodayBtn();
    const b = document.getElementById('loadTodaySelectAllEmailsBtn');
    if (b) {
        const t = b.textContent;
        b.textContent = 'All Emails ✓';
        b.disabled = true;
        setTimeout(() => { try { b.textContent = t; b.disabled = false; } catch(_){} }, 900);
    }
}

function addAllToday() {
    selectAllTodayThreads();
    selectAllTodayEmails();
    addSelectedToday();
}

async function addSelectedToday() {
    const threadsToAdd = Array.from(selectedTodayThreads).map(i => todayThreads[i]).filter(Boolean);
    const emailsToAdd = Array.from(selectedTodayEmails).map(i => todayEmails[i]).filter(Boolean);

    if (!threadsToAdd.length && !emailsToAdd.length) {
        showErrorPopup('Please select at least one thread or email to add.', 'Nothing Selected');
        return;
    }

    showLoadingOverlay('Adding Items', 'Starting...', false);
    let addedThreads = 0, failedThreads = 0;
    let addedEmails = 0, failedEmails = 0;

    try {
        // Add threads in a single request when possible, fallback in chunks if error
        if (threadsToAdd.length) {
            try {
                updateLoadingOverlayMessage('Adding Threads', `Submitting ${threadsToAdd.length} thread(s)...`);
                const resp = await fetch('/api/add-email-threads', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ threads: threadsToAdd })
                });
                const data = await resp.json().catch(() => ({}));
                if (resp.ok && data && data.success) {
                    addedThreads = typeof data.addedCount === 'number' ? data.addedCount : threadsToAdd.length;
                } else {
                    failedThreads = threadsToAdd.length;
                }
            } catch (e) {
                console.warn('Bulk add threads failed, skipping:', e);
                failedThreads = threadsToAdd.length;
            }
        }

        // Add emails one-by-one to allow partial success
        if (emailsToAdd.length) {
            for (let i = 0; i < emailsToAdd.length; i++) {
                updateLoadingOverlayMessage('Adding Emails', `Processing ${i + 1} of ${emailsToAdd.length}...`);
                try {
                    const resp = await fetch('/api/add-approved-email', {
                        method: 'POST',
                        headers: { 'Content-Type': 'application/json' },
                        body: JSON.stringify({ email: emailsToAdd[i] })
                    });
                    const data = await resp.json().catch(() => ({}));
                    if (resp.ok && data && data.success) {
                        addedEmails++;
                    } else {
                        failedEmails++;
                    }
                } catch {
                    failedEmails++;
                }
            }
        }

        hideLoadingOverlay();
        closeLoadTodayModal();

        const parts = [];
        if (addedThreads) parts.push(`${addedThreads} thread${addedThreads === 1 ? '' : 's'} added`);
        if (addedEmails) parts.push(`${addedEmails} email${addedEmails === 1 ? '' : 's'} added`);
        if (failedThreads) parts.push(`${failedThreads} thread${failedThreads === 1 ? '' : 's'} failed`);
        if (failedEmails) parts.push(`${failedEmails} email${failedEmails === 1 ? '' : 's'} failed`);
        showSuccessPopup(parts.length ? `Completed: ${parts.join(', ')}.` : 'No items were added.', 'Load Today');

        // Refresh main lists
        try { loadEmails(); } catch(_) {}
        try { loadUnrepliedEmails(); } catch(_) {}
    } catch (e) {
        console.error('addSelectedToday failed:', e);
        try { hideLoadingOverlay(); } catch(_){}
        showErrorPopup('Failed to add selected items. Please try again.', 'Add Failed');
    }
}

function refreshLoadToday() {
    // Keep current modal open and refetch
    loadTodayData();
}

async function showLoadEmailThreadsModal() {
            // Create modal HTML if it doesn't exist
            let modal = document.getElementById('loadEmailThreadsModal');
            if (!modal) {
                modal = createLoadEmailThreadsModal();
                document.body.appendChild(modal);
            }
            
            modal.style.display = 'block';
        }

        function createLoadEmailThreadsModal() {
            const modal = document.createElement('div');
            modal.id = 'loadEmailThreadsModal';
            modal.className = 'modal';


            modal.innerHTML = `
                <div class="modal-content load-threads-modal">
                    <div class="modal-header">
                        <h2 class="modal-title">Load Email Threads</h2>
                        <button class="close" onclick="closeLoadEmailThreadsModal()">&times;</button>
                    </div>
                    <div class="load-threads-container">
                        <div class="load-threads-intro">
                            <h4>📧 Dynamic Email Thread Loading</h4>
                            <p>Load email threads directly from your inbox using MCP. Select the number of threads to retrieve and we'll show you conversations where you received an email and responded to it.</p>
                        </div>
                        
                        <div class="thread-count-selector">
                            <label for="threadCountInput">Number of Threads to Load:</label>
                            <input id="threadCountInput" type="number" min="1" max="500" value="3" step="1" class="thread-count-dropdown" style="width: 120px;" />
                            <div style="margin-top:8px;">
                                <label style="display:flex; align-items:center; gap:8px; font-size: 14px;">
                                    <input id="todayOnlyCheckbox" type="checkbox" />
                                    <span>All from Today</span>
                                </label>
                            </div>
                        </div>
                        
                        <div class="load-threads-actions">
                            <button class="load-threads-btn load-threads-btn-cancel" onclick="closeLoadEmailThreadsModal()">Cancel</button>
                            <button class="load-threads-btn load-threads-btn-load" onclick="loadEmailThreads()">Load Threads</button>
                        </div>
                    </div>
                </div>
            `;
            return modal;
        }

        async function loadEmailThreads() {
            const cb = document.getElementById('todayOnlyCheckbox');
            const input = document.getElementById('threadCountInput');
            const isToday = !!(cb && cb.checked);
            const countRaw = input ? parseInt(input.value, 10) : NaN;
            const threadCount = isToday ? null : (Number.isFinite(countRaw) ? Math.min(Math.max(countRaw, 1), 500) : 3);
            lastThreadDateFilter = isToday ? 'today' : null;
            
            // Close the initial modal
            closeLoadEmailThreadsModal();
            
            // Show loading overlay
            showLoadingOverlay('Retrieving Email Threads', 'Searching your inbox for email conversations...', true);
            
            try {
                // Create abort controller for cancellation
                loadingOperation = new AbortController();
                
                const response = await fetch('/api/load-email-threads', {
                    method: 'POST',
                    headers: {
                        'Content-Type': 'application/json',
                    },
                    body: JSON.stringify(isToday ? { dateFilter: 'today' } : { threadCount: threadCount }),
                    signal: loadingOperation.signal
                });
                
                const data = await response.json();
                
                if (data.success && data.threads && data.threads.length > 0) {
                    currentThreads = data.threads;
                    selectedThreads.clear();
                    currentSlideIndex = 0;
                    
                    // Hide loading overlay
                    hideLoadingOverlay();
                    
                    // Show thread carousel
                    showThreadCarousel();
                } else {
                    hideLoadingOverlay();
                    showErrorPopup(data.error || 'No email threads found matching the criteria.', 'No Threads Found');
                }
            } catch (error) {
                hideLoadingOverlay();
                if (error.name === 'AbortError') {
                    console.log('Thread loading was cancelled');
                } else {
                    console.error('Error loading email threads:', error);
                    showErrorPopup('Failed to load email threads. Please try again.', 'Loading Failed');
                }
            } finally {
                loadingOperation = null;
            }
        }

        function showLoadingOverlay(title, message, showCancel = false) {
            // Remove existing overlay if any
            const existingOverlay = document.getElementById('loadingOverlay');
            if (existingOverlay) {
                existingOverlay.remove();
            }
            
            const overlay = document.createElement('div');
            overlay.id = 'loadingOverlay';
            overlay.className = 'loading-overlay';
            overlay.innerHTML = `
                <div class="loading-content">
                    <div class="loading-spinner"></div>
                    <div class="loading-text">${title}</div>
                    <div class="loading-subtext">${message}</div>
                    ${showCancel ? '<button class="loading-cancel-btn" onclick="cancelLoadingOperation()">Cancel</button>' : ''}
                </div>
            `;
            
            document.body.appendChild(overlay);
        }

        function hideLoadingOverlay() {
            const overlay = document.getElementById('loadingOverlay');
            if (overlay) {
                overlay.remove();
            }
        }

        // Update the loading overlay text while an operation is in progress
        function updateLoadingOverlayMessage(title, message) {
            const overlay = document.getElementById('loadingOverlay');
            if (!overlay) return;
            const titleEl = overlay.querySelector('.loading-text');
            const subEl = overlay.querySelector('.loading-subtext');
            if (titleEl && typeof title === 'string') titleEl.textContent = title;
            if (subEl && typeof message === 'string') subEl.textContent = message;
        }

        function cancelLoadingOperation() {
            if (loadingOperation) {
                loadingOperation.abort();
                loadingOperation = null;
            }
            hideLoadingOverlay();
        }

        function showThreadCarousel() {
            // Create carousel modal if it doesn't exist
            let modal = document.getElementById('threadCarouselModal');
            if (!modal) {
                modal = createThreadCarouselModal();
                document.body.appendChild(modal);
            }
            
            populateThreadCarousel();
            modal.style.display = 'block';
        }

        function createThreadCarouselModal() {
            const modal = document.createElement('div');
            modal.id = 'threadCarouselModal';
            modal.className = 'modal';
            modal.innerHTML = `
                <div class="modal-content thread-carousel-modal">
                    <div class="modal-header">
                        <h2 class="modal-title">Select Email Threads to Add</h2>
                        <button class="close" onclick="closeThreadCarouselModal()">&times;</button>
                    </div>
                    <div class="thread-carousel-container">
                        <div class="carousel-header">
                            <div class="carousel-info" id="carouselInfo">Loading threads...</div>
                            <div class="carousel-controls">
                                <button class="carousel-nav-btn" onclick="refreshEmailThreads()" style="background: #667eea; margin-right: 10px;">🔄 Refresh Threads</button>
                                <button class="carousel-nav-btn" id="selectAllThreadsBtn" onclick="selectAllThreads()">Select All</button>
                                <button class="carousel-nav-btn" id="prevBtn" onclick="previousSlide()" disabled>← Previous</button>
                                <span class="carousel-counter" id="carouselCounter">1 / 1</span>
                                <button class="carousel-nav-btn" id="nextBtn" onclick="nextSlide()" disabled>Next →</button>
                            </div>
                        </div>
                        
                        <div class="thread-carousel" id="threadCarousel">
                            <!-- Thread slides will be populated here -->
                        </div>
                        
                        <div class="carousel-actions">
                            <button class="carousel-btn carousel-btn-cancel" onclick="closeThreadCarouselModal()">Cancel</button>
                            <button class="carousel-btn carousel-btn-add" id="addSelectedBtn" onclick="addSelectedThreads()" disabled>Add Selected Threads</button>
                        </div>
                    </div>
                </div>
            `;
            return modal;
        }

        function populateThreadCarousel() {
            const carousel = document.getElementById('threadCarousel');
            const carouselInfo = document.getElementById('carouselInfo');
            const carouselCounter = document.getElementById('carouselCounter');
            
            carousel.innerHTML = '';
            
            if (currentThreads.length === 0) {
                carousel.innerHTML = '<div class="loading">No threads to display.</div>';
                return;
            }
            
            carouselInfo.textContent = `Found ${currentThreads.length} email thread${currentThreads.length === 1 ? '' : 's'}`;
            carouselCounter.textContent = `1 / ${currentThreads.length}`;
            
            currentThreads.forEach((thread, index) => {
                const slide = document.createElement('div');
                slide.id = `thread-slide-${index}`;
                slide.className = `thread-slide ${index === 0 ? 'active' : ''}`;
                slide.innerHTML = `
                    <div class="thread-preview">
                        <div class="thread-subject">${thread.subject}</div>
                        <div class="thread-messages">
                            ${thread.messages.map((message, mi) => `
                                <div id="msg-card-${index}-${mi}" class="thread-message-preview ${message.isResponse ? 'response' : 'original'}">
                                    <div class="message-preview-header">
                                        <div class="message-preview-from">${message.from}${message.isResponse ? ' (Your Response)' : ''}</div>
                                        <div class="message-preview-date">${formatDate(message.date)}</div>
                                    </div>
                                    <div class="message-preview-subject" style="padding: 8px 12px; font-size: 13px; color: #333;">
                                        <strong>Subject:</strong>
                                        <span id="msg-subject-display-${index}-${mi}">${message.subject}</span>
                                        <input id="msg-subject-input-${index}-${mi}" type="text" style="display:none; width:100%; margin-top:6px; padding:6px; border:1px solid #ddd; border-radius:4px;">
                                    </div>
                                    <div id="msg-body-display-${index}-${mi}" class="message-preview-body">${message.body}</div>
                                    <textarea id="msg-body-input-${index}-${mi}" class="message-preview-body" style="display:none; width:100%; height:150px; padding:10px; border:1px solid #ddd; border-radius:6px;"></textarea>
                                    <div class="message-edit-actions" style="padding: 8px 12px; display: flex; gap: 8px; align-items: center;">
                                        <button id="msg-clean-btn-${index}-${mi}" class="carousel-nav-btn" style="background: #17a2b8;" onclick="cleanThreadMessage(${index}, ${mi})">Clean</button>
                                        <button id="msg-edit-btn-${index}-${mi}" class="carousel-nav-btn" style="background: #6c757d;" onclick="editThreadMessage(${index}, ${mi})">Edit</button>
                                        <button id="msg-delete-btn-${index}-${mi}" class="carousel-nav-btn" style="background: #dc3545;" onclick="deleteThreadMessage(${index}, ${mi})">Delete</button>
                                        <button id="msg-save-btn-${index}-${mi}" class="carousel-nav-btn" style="display:none; background: #28a745;" onclick="saveThreadMessage(${index}, ${mi})">Save</button>
                                        <button id="msg-cancel-btn-${index}-${mi}" class="carousel-nav-btn" style="display:none; background: #6c757d;" onclick="cancelEditThreadMessage(${index}, ${mi})">Cancel</button>
                                    </div>
                                </div>
                            `).join('')}
                        </div>
                        <div class="thread-selection">
                            <input type="checkbox" id="thread-${index}" class="thread-select-checkbox" onchange="toggleThreadSelection(${index})">
                            <label for="thread-${index}" class="thread-select-label">Add this thread to database</label>
                            <div style="margin-top:8px;">
                                <input type="checkbox" id="hide-thread-${index}" class="thread-select-checkbox" onchange="toggleHideThreadSelection(${index})">
                                <label for="hide-thread-${index}" class="thread-select-label" style="color:#c00;">Hide Permanently</label>
                            </div>
                        </div>
                    </div>
                `;
                carousel.appendChild(slide);
            });
            
            updateCarouselNavigation();
        }

        function editThreadMessage(ti, mi) {
    try {
        const subjDisp = document.getElementById(`msg-subject-display-${ti}-${mi}`);
        const subjInput = document.getElementById(`msg-subject-input-${ti}-${mi}`);
        const bodyDisp = document.getElementById(`msg-body-display-${ti}-${mi}`);
        const bodyInput = document.getElementById(`msg-body-input-${ti}-${mi}`);
        const editBtn = document.getElementById(`msg-edit-btn-${ti}-${mi}`);
        const saveBtn = document.getElementById(`msg-save-btn-${ti}-${mi}`);
        const cancelBtn = document.getElementById(`msg-cancel-btn-${ti}-${mi}`);

        // Initialize input values from current in-memory thread or display
        if (subjInput) subjInput.value = subjDisp ? subjDisp.textContent : (currentThreads?.[ti]?.messages?.[mi]?.subject || '');
        if (bodyInput) bodyInput.value = currentThreads?.[ti]?.messages?.[mi]?.body || (bodyDisp ? bodyDisp.textContent : '');

        if (subjDisp) subjDisp.style.display = 'none';
        if (subjInput) subjInput.style.display = 'block';
        if (bodyDisp) bodyDisp.style.display = 'none';
        if (bodyInput) bodyInput.style.display = 'block';

        if (editBtn) editBtn.style.display = 'none';
        if (saveBtn) saveBtn.style.display = 'inline-block';
        if (cancelBtn) cancelBtn.style.display = 'inline-block';
    } catch (e) {
        console.error('Failed to enable edit mode:', e);
    }
}

function saveThreadMessage(ti, mi) {
    try {
        const subjDisp = document.getElementById(`msg-subject-display-${ti}-${mi}`);
        const subjInput = document.getElementById(`msg-subject-input-${ti}-${mi}`);
        const bodyDisp = document.getElementById(`msg-body-display-${ti}-${mi}`);
        const bodyInput = document.getElementById(`msg-body-input-${ti}-${mi}`);
        const editBtn = document.getElementById(`msg-edit-btn-${ti}-${mi}`);
        const saveBtn = document.getElementById(`msg-save-btn-${ti}-${mi}`);
        const cancelBtn = document.getElementById(`msg-cancel-btn-${ti}-${mi}`);

        const newSubject = subjInput ? subjInput.value : (subjDisp ? subjDisp.textContent : '');
        const newBody = bodyInput ? bodyInput.value : (bodyDisp ? bodyDisp.textContent : '');

        // Update in-memory thread object so server receives edits on approval
        if (currentThreads?.[ti]?.messages?.[mi]) {
            currentThreads[ti].messages[mi].subject = newSubject;
            currentThreads[ti].messages[mi].body = newBody;
        }

        // Reflect changes in UI
        if (subjDisp) subjDisp.textContent = newSubject;
        if (bodyDisp) bodyDisp.textContent = newBody;

        if (subjInput) subjInput.style.display = 'none';
        if (bodyInput) bodyInput.style.display = 'none';
        if (subjDisp) subjDisp.style.display = 'inline';
        if (bodyDisp) bodyDisp.style.display = 'block';

        if (editBtn) editBtn.style.display = 'inline-block';
        if (saveBtn) saveBtn.style.display = 'none';
        if (cancelBtn) cancelBtn.style.display = 'none';
    } catch (e) {
        console.error('Failed to save edits:', e);
        showErrorPopup('Failed to save your edits. Please try again.', 'Save Failed');
    }
}

function cancelEditThreadMessage(ti, mi) {
    try {
        const subjDisp = document.getElementById(`msg-subject-display-${ti}-${mi}`);
        const subjInput = document.getElementById(`msg-subject-input-${ti}-${mi}`);
        const bodyDisp = document.getElementById(`msg-body-display-${ti}-${mi}`);
        const bodyInput = document.getElementById(`msg-body-input-${ti}-${mi}`);
        const editBtn = document.getElementById(`msg-edit-btn-${ti}-${mi}`);
        const saveBtn = document.getElementById(`msg-save-btn-${ti}-${mi}`);
        const cancelBtn = document.getElementById(`msg-cancel-btn-${ti}-${mi}`);

        if (subjInput) subjInput.style.display = 'none';
        if (bodyInput) bodyInput.style.display = 'none';
        if (subjDisp) subjDisp.style.display = 'inline';
        if (bodyDisp) bodyDisp.style.display = 'block';

        if (editBtn) editBtn.style.display = 'inline-block';
        if (saveBtn) saveBtn.style.display = 'none';
        if (cancelBtn) cancelBtn.style.display = 'none';
    } catch (e) {
        console.error('Failed to cancel edit mode:', e);
    }
}

async function cleanThreadMessage(ti, mi) {
    try {
        const bodyDisp = document.getElementById(`msg-body-display-${ti}-${mi}`);
        const bodyInput = document.getElementById(`msg-body-input-${ti}-${mi}`);
        let currentText = '';
        if (bodyInput && bodyInput.style.display !== 'none') {
            currentText = bodyInput.value || '';
        } else if (currentThreads?.[ti]?.messages?.[mi]?.body) {
            currentText = currentThreads[ti].messages[mi].body;
        } else if (bodyDisp) {
            currentText = bodyDisp.textContent || '';
        }

        if (!currentText || !currentText.trim()) {
            showErrorPopup('No content to clean for this message.', 'Nothing to Clean');
            return;
        }

        // Show loading while cleaning
        showLoadingOverlay('Cleaning Message', 'Extracting newest unquoted content...', false);
        // Call server to clean text using OpenAI/fallback
        const resp = await fetch('/api/clean-text', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ text: currentText })
        });
        const data = await resp.json();
        if (!resp.ok || !data.success) {
            hideLoadingOverlay();
            throw new Error(data.error || 'Clean request failed');
        }
        const cleaned = data.cleaned != null ? String(data.cleaned) : '';
        hideLoadingOverlay();

        // Show preview popup with Approve / Edit Manually
        const popup = document.createElement('div');
        popup.id = 'cleanPreviewPopup';
        popup.className = 'popup-modal';
        const safeCleaned = escapeHtml(cleaned);
        popup.innerHTML = `
            <div class="popup-content" style="max-width: 700px;">
                <div class="popup-header">
                    <h3 class="popup-title">Cleaned Text Preview</h3>
                </div>
                <div class="popup-body" style="text-align: left; max-height: 50vh; overflow: auto;">
                    <div style="font-size: 12px; color: #666; margin-bottom: 8px;">Preview the cleaned content. Approve to apply, or edit manually instead.</div>
                    <div id="cleanedPreviewArea" style="white-space: pre-wrap; font-size: 14px; line-height: 1.6; color: #333; border: 1px solid #e9ecef; padding: 12px; border-radius: 6px; background: #fff;">${safeCleaned}</div>
                </div>
                <div class="popup-actions">
                    <button class="popup-btn popup-btn-secondary" id="cleanEditManuallyBtn">Edit Manually</button>
                    <button class="popup-btn popup-btn-success" id="cleanApproveBtn">Approve</button>
                </div>
            </div>
        `;
        document.body.appendChild(popup);
        popup.style.display = 'block';

        const close = () => { try { popup.remove(); } catch(e) {} };

        document.getElementById('cleanEditManuallyBtn')?.addEventListener('click', () => {
            close(); // user will click Edit themselves if desired
        });

        document.getElementById('cleanApproveBtn')?.addEventListener('click', () => {
            try {
                // Apply cleaned text to memory and UI
                if (currentThreads?.[ti]?.messages?.[mi]) {
                    currentThreads[ti].messages[mi].body = cleaned;
                }
                if (bodyDisp) bodyDisp.textContent = cleaned;
                if (bodyInput) bodyInput.value = cleaned;
            } catch (e) {
                console.error('Failed to apply cleaned text:', e);
                showErrorPopup('Failed to apply cleaned text. Please try again.', 'Apply Failed');
            } finally {
                close();
            }
        });

        // Close on background click
        popup.addEventListener('click', (ev) => {
            if (ev.target === popup) close();
        });
    } catch (e) {
        console.error('Clean action failed:', e);
        try { hideLoadingOverlay(); } catch (_) {}
        showErrorPopup('Cleaning failed. Please try again or edit manually.', 'Clean Failed');
    }
}

function deleteThreadMessage(ti, mi) {
    try {
        if (!currentThreads?.[ti]?.messages) return;
        // Remove the message from the in-memory thread
        currentThreads[ti].messages.splice(mi, 1);
        // Rerender this slide to refresh indexing and buttons
        rerenderThreadSlide(ti);
    } catch (e) {
        console.error('Delete message failed:', e);
        showErrorPopup('Failed to delete message. Please try again.', 'Delete Failed');
    }
}

function rerenderThreadSlide(ti) {
    try {
        // Preserve selection states for this thread
        const addCb = document.getElementById(`thread-${ti}`);
        const hideCb = document.getElementById(`hide-thread-${ti}`);
        const addChecked = addCb ? addCb.checked : false;
        const hideChecked = hideCb ? hideCb.checked : false;

        // Rebuild all slides to ensure proper reindexing
        populateThreadCarousel();

        // Restore selection state
        const newAdd = document.getElementById(`thread-${ti}`);
        const newHide = document.getElementById(`hide-thread-${ti}`);
        if (newAdd) newAdd.checked = addChecked;
        if (newHide) newHide.checked = hideChecked;

        // Update add button label/state
        updateAddButton();
        // Ensure the same slide remains active
        updateCarouselDisplay();
    } catch (e) {
        console.error('Failed to rerender thread slide:', e);
    }
}

function previousSlide() {
            if (currentSlideIndex > 0) {
                currentSlideIndex--;
                updateCarouselDisplay();
            }
        }

        function nextSlide() {
            if (currentSlideIndex < currentThreads.length - 1) {
                currentSlideIndex++;
                updateCarouselDisplay();
            }
        }

        function updateCarouselDisplay() {
            const slides = document.querySelectorAll('.thread-slide');
            slides.forEach((slide, index) => {
                slide.classList.toggle('active', index === currentSlideIndex);
            });
            
            document.getElementById('carouselCounter').textContent = `${currentSlideIndex + 1} / ${currentThreads.length}`;
            updateCarouselNavigation();
        }

        function updateCarouselNavigation() {
            const prevBtn = document.getElementById('prevBtn');
            const nextBtn = document.getElementById('nextBtn');
            
            prevBtn.disabled = currentSlideIndex === 0;
            nextBtn.disabled = currentSlideIndex === currentThreads.length - 1;
        }

        function toggleThreadSelection(threadIndex) {
            const checkbox = document.getElementById(`thread-${threadIndex}`);
            
            if (checkbox.checked) {
                selectedThreads.add(threadIndex);
                // If marking for add, ensure it's not hidden
                const hideCb = document.getElementById(`hide-thread-${threadIndex}`);
                if (hideCb && hideCb.checked) {
                    hideCb.checked = false;
                    hiddenThreads.delete(threadIndex);
                }
            } else {
                selectedThreads.delete(threadIndex);
            }
            
            updateAddButton();
        }

        function toggleHideThreadSelection(threadIndex) {
            const checkbox = document.getElementById(`hide-thread-${threadIndex}`);
            if (checkbox.checked) {
                hiddenThreads.add(threadIndex);
                // If marking hidden, unselect add for safety
                const addCb = document.getElementById(`thread-${threadIndex}`);
                if (addCb && addCb.checked) {
                    addCb.checked = false;
                    selectedThreads.delete(threadIndex);
                }
            } else {
                hiddenThreads.delete(threadIndex);
            }
            updateAddButton();
        }

        function updateAddButton() {
            const addBtn = document.getElementById('addSelectedBtn');
            const selectedCount = selectedThreads.size;
            const hideCount = hiddenThreads.size;

            const total = selectedCount + hideCount;
            addBtn.disabled = total === 0;

            if (selectedCount > 0 && hideCount === 0) {
                addBtn.textContent = `Add ${selectedCount} Selected Thread${selectedCount === 1 ? '' : 's'}`;
            } else if (selectedCount === 0 && hideCount > 0) {
                addBtn.textContent = `Hide ${hideCount} Selected Thread${hideCount === 1 ? '' : 's'}`;
            } else if (selectedCount > 0 && hideCount > 0) {
                addBtn.textContent = `Add ${selectedCount} & Hide ${hideCount}`;
            } else {
                addBtn.textContent = 'Add Selected Threads';
            }
        }

        // Select all visible threads for addition (unhides any that were marked to hide)
        function selectAllThreads() {
            try {
                const total = currentThreads?.length || 0;
                selectedThreads.clear();
                for (let i = 0; i < total; i++) {
                    selectedThreads.add(i);
                    const addCb = document.getElementById(`thread-${i}`);
                    if (addCb) addCb.checked = true;
                    const hideCb = document.getElementById(`hide-thread-${i}`);
                    if (hideCb) hideCb.checked = false;
                    hiddenThreads.delete(i);
                }
                updateAddButton();
                const btn = document.getElementById('selectAllThreadsBtn');
                if (btn) {
                    btn.textContent = 'All Selected';
                    btn.disabled = true;
                    setTimeout(() => {
                        if (btn) {
                            btn.textContent = 'Select All';
                            btn.disabled = false;
                        }
                    }, 1200);
                }
            } catch (e) {
                console.error('Select All failed:', e);
            }
        }

        // Add/hide threads with partial success: skip failures and continue
        async function addSelectedThreads() {
            if (selectedThreads.size === 0 && hiddenThreads.size === 0) {
                showErrorPopup('Please select at least one thread to add or hide.', 'No Threads Selected');
                return;
            }

            const threadsToAdd = Array.from(selectedThreads).map(index => currentThreads[index]);
            const threadsToHide = Array.from(hiddenThreads).map(index => currentThreads[index]);

            const addCountRequested = threadsToAdd.length;
            const hideCountRequested = threadsToHide.length;

            const parts = [];
            if (addCountRequested > 0) parts.push(`adding ${addCountRequested}`);
            if (hideCountRequested > 0) parts.push(`hiding ${hideCountRequested}`);
            const actionText = parts.join(' and ');
            showLoadingOverlay('Processing Threads', `Preparing (${actionText})...`);

            // Try to hide threads in one call, but do not abort on failure
            try {
                if (hideCountRequested > 0) {
                    updateLoadingOverlayMessage('Processing Threads', `Hiding ${hideCountRequested} thread${hideCountRequested === 1 ? '' : 's'}...`);
                    const hideResp = await fetch('/api/hide-email-threads', {
                        method: 'POST',
                        headers: { 'Content-Type': 'application/json' },
                        body: JSON.stringify({ threads: threadsToHide })
                    });
                    // Consume JSON to avoid unhandled rejection; continue regardless of status
                    await hideResp.json().catch(() => ({}));
                }
            } catch (e) {
                console.warn('Hide threads encountered an error but proceeding with adds:', e);
            }

            // Add threads one-by-one to guarantee partial success
            let added = 0;
            let failed = 0;
            if (addCountRequested > 0) {
                for (let i = 0; i < threadsToAdd.length; i++) {
                    updateLoadingOverlayMessage(
                        'Processing Threads',
                        `Adding ${i + 1} of ${threadsToAdd.length}...`
                    );
                    try {
                        const resp = await fetch('/api/add-email-threads', {
                            method: 'POST',
                            headers: { 'Content-Type': 'application/json' },
                            body: JSON.stringify({ threads: [threadsToAdd[i]] })
                        });
                        const data = await resp.json().catch(() => ({}));
                        if (!resp.ok || !data.success) {
                            failed++;
                        } else {
                            // Prefer server-reported count when available
                            added += typeof data.addedCount === 'number' ? data.addedCount : 1;
                        }
                    } catch (e) {
                        failed++;
                    }
                }
            }

            hideLoadingOverlay();
            closeThreadCarouselModal();

            const summary = [];
            if (added > 0) summary.push(`${added} added`);
            if (hideCountRequested > 0) summary.push(`${hideCountRequested} hidden`);
            if (failed > 0) summary.push(`${failed} failed`);
            showSuccessPopup(`Completed: ${summary.join(', ')}.`, 'Threads Processed');

            // Refresh the email list to show updates
            loadEmails();
        }

        function closeLoadEmailThreadsModal() {
            const modal = document.getElementById('loadEmailThreadsModal');
            if (modal) {
                modal.style.display = 'none';
            }
        }

        function closeThreadCarouselModal() {
            const modal = document.getElementById('threadCarouselModal');
            if (modal) {
                modal.style.display = 'none';
            }
            
            // Reset state
            currentThreads = [];
            selectedThreads.clear();
            currentSlideIndex = 0;
        }

        // Load More Emails Modal functionality
        let loadMoreEmailsData = [];
        let currentLoadMoreSlideIndex = 0;
        let selectedLoadMoreEmails = new Set();
        let lastLoadMoreDateFilter = null;

        async function showLoadMoreEmailsModal() {
            // Create modal HTML if it doesn't exist
            let modal = document.getElementById('loadMoreEmailsModal');
            if (!modal) {
                modal = createLoadMoreEmailsModal();
                document.body.appendChild(modal);
            }
            
            modal.style.display = 'block';
        }

        function createLoadMoreEmailsModal() {
            const modal = document.createElement('div');
            modal.id = 'loadMoreEmailsModal';
            modal.className = 'modal';
            modal.innerHTML = `
                <div class="modal-content load-threads-modal">
                    <div class="modal-header">
                        <h2 class="modal-title">Load More Emails from Inbox</h2>
                        <button class="close" onclick="closeLoadMoreEmailsModal()">&times;</button>
                    </div>
                    <div class="load-threads-container">
                        <div class="load-threads-intro">
                            <h4>📥 Fetch Additional Emails</h4>
                            <p>Load more emails directly from your Gmail inbox using MCP. You can search for specific emails or fetch recent ones to expand your email database.</p>
                        </div>
                        
                        <div class="form-group" style="margin-bottom: 20px;">
                            <label for="emailQueryInput">Search Query (optional):</label>
                            <input type="text" id="emailQueryInput" placeholder="e.g., from:example@gmail.com, subject:meeting, has:attachment" 
                                style="width: 100%; padding: 12px; border: 1px solid #ddd; border-radius: 6px; font-size: 14px;">
                            <div style="font-size: 12px; color: #666; margin-top: 5px;">
                                Use Gmail search syntax. Leave empty to fetch recent emails.
                            </div>
                        </div>
                        
                        <div class="thread-count-selector">
                            <label for="emailCountDropdown">Number of Emails to Fetch:</label>
                            <select id="emailCountDropdown" class="thread-count-dropdown">
                                <option value="1">1 Email</option>
                                <option value="2">2 Emails</option>
                                <option value="3">3 Emails</option>
                                <option value="4">4 Emails</option>
                                <option value="5">5 Emails</option>
                                <option value="6">6 Emails</option>
                                <option value="7">7 Emails</option>
                                <option value="8">8 Emails</option>
                                <option value="9">9 Emails</option>
                                <option value="10" selected>10 Emails</option>
                                <option value="today">All from Today</option>
                            </select>
                        </div>
                        
                        <div class="load-threads-actions">
                            <button class="load-threads-btn load-threads-btn-cancel" onclick="closeLoadMoreEmailsModal()">Cancel</button>
                            <button class="load-threads-btn load-threads-btn-load" onclick="fetchAllFromToday()" style="background:#17a2b8;">Load All From Today</button>
                            <button class="load-threads-btn load-threads-btn-load" onclick="fetchMoreEmails()">Fetch Emails</button>
                        </div>
                    </div>
                </div>
            `;
            return modal;
        }

        function fetchAllFromToday() {
            try {
                const countSel = document.getElementById('emailCountDropdown');
                if (countSel) countSel.value = 'today';
            } catch (e) {
                console.warn('Unable to set dropdown to today:', e);
            }
            // Reuse existing flow
            fetchMoreEmails();
        }

        async function fetchMoreEmails() {
            const query = document.getElementById('emailQueryInput').value.trim();
            const countVal = document.getElementById('emailCountDropdown').value;
            const isToday = countVal === 'today';
            const maxResults = isToday ? null : parseInt(countVal);
            lastLoadMoreDateFilter = isToday ? 'today' : null;
            
            // Close the initial modal
            closeLoadMoreEmailsModal();
            
            // Show loading overlay
            showLoadingOverlay('Fetching Emails', 'Searching your Gmail inbox for emails...', true);
            
            try {
                // Create abort controller for cancellation
                loadingOperation = new AbortController();
                
                const response = await fetch('/api/fetch-more-emails', {
                    method: 'POST',
                    headers: {
                        'Content-Type': 'application/json',
                    },
                    body: JSON.stringify(isToday ? { dateFilter: 'today' } : { query: query || undefined, maxResults: maxResults }),
                    signal: loadingOperation.signal
                });
                
                const data = await response.json();
                
                if (response.status === 401 && data.needsAuth) {
                    // Authentication required - automatically start authentication
                    hideLoadingOverlay();
                    
                    // Show authentication guidance and automatically start the process
                    showCustomPopup({
                        title: '🔐 Gmail Authentication Required',
                        message: 'Gmail authentication is required to fetch emails from your inbox. Starting authentication process...',
                        icon: 'warning',
                        primaryText: 'Continue',
                        type: 'alert',
                        onPrimary: () => {
                            // Automatically start authentication after user acknowledges
                            startAuthentication();
                        }
                    });
                    return;
                }
                
                if (data.success && data.emails && data.emails.length > 0) {
                    loadMoreEmailsData = data.emails;
                    selectedLoadMoreEmails.clear();
                    currentLoadMoreSlideIndex = 0;

                    // Compute multi-stage category suggestions (progress updates shown in overlay)
                    try { updateLoadingOverlayMessage('Categorizing Emails', 'Preparing suggestions…'); } catch (_) {}
                    await computeLoadMoreCategorySuggestions(loadMoreEmailsData);

                    // Hide loading overlay
                    hideLoadingOverlay();

                    // Show email carousel
                    showLoadMoreEmailsCarousel();
                } else {
                    hideLoadingOverlay();
                    showErrorPopup(data.error || 'No emails found matching the criteria.', 'No Emails Found');
                }
            } catch (error) {
                hideLoadingOverlay();
                if (error.name === 'AbortError') {
                    console.log('Email fetching was cancelled');
                } else {
                    console.error('Error fetching emails:', error);
                    showErrorPopup('Failed to fetch emails. Please try again.', 'Fetch Failed');
                }
            } finally {
                loadingOperation = null;
            }
        }

        function showLoadMoreEmailsCarousel() {
            // Create carousel modal if it doesn't exist
            let modal = document.getElementById('loadMoreEmailsCarouselModal');
            if (!modal) {
                modal = createLoadMoreEmailsCarouselModal();
                document.body.appendChild(modal);
            }
            
            populateLoadMoreEmailsCarousel();
            modal.style.display = 'block';
        }

        function createLoadMoreEmailsCarouselModal() {
            const modal = document.createElement('div');
            modal.id = 'loadMoreEmailsCarouselModal';
            modal.className = 'modal';
            modal.innerHTML = `
                <div class="modal-content thread-carousel-modal">
                    <div class="modal-header">
                        <h2 class="modal-title">Select Emails to Use</h2>
                        <button class="close" onclick="closeLoadMoreEmailsCarouselModal()">&times;</button>
                    </div>
                    <div class="thread-carousel-container">
                        <div class="carousel-header">
                            <div class="carousel-info" id="loadMoreCarouselInfo">Loading emails...</div>
                            <div class="carousel-controls">
                                <button class="carousel-nav-btn" onclick="refreshLoadMoreEmails()" style="background: #667eea; margin-right: 10px;">🔄 Refresh Emails</button>
                                <button class="carousel-nav-btn" id="selectAllLoadMoreBtn" onclick="selectAllLoadMoreEmails()" style="background:#28a745; margin-right: 10px;">Select All</button>
                                <button class="carousel-nav-btn" id="loadMorePrevBtn" onclick="previousLoadMoreSlide()" disabled>← Previous</button>
                                <span class="carousel-counter" id="loadMoreCarouselCounter">1 / 1</span>
                                <button class="carousel-nav-btn" id="loadMoreNextBtn" onclick="nextLoadMoreSlide()" disabled>Next →</button>
                            </div>
                        </div>
                        
                        <div class="thread-carousel" id="loadMoreEmailCarousel">
                            <!-- Email slides will be populated here -->
                        </div>
                        
                        <div class="carousel-actions">
                            <button class="carousel-btn carousel-btn-cancel" onclick="closeLoadMoreEmailsCarouselModal()">Cancel</button>
                            <button class="carousel-btn carousel-btn-add" id="useSelectedEmailsBtn" onclick="useSelectedEmails()" disabled>Use Selected Emails</button>
                        </div>
                    </div>
                </div>
            `;
            return modal;
        }

        /* Compute multi-stage category suggestions for Load More emails.
   Stages:
   1) similarity  - average embedding cosine vs. each category (server: /api/suggest-categories)
   2) sender      - categories where >=25% of items share the sender
   3) subject     - OpenAI subject-only chooser vs. DB subjects
   4) body        - OpenAI body-based chooser vs. top bodies per category
   Aggregation:
   - For each email, merge categories suggested across stages.
   - Sort by: (appearsInStagesCount desc) then (earliestStageIndex asc) then (name asc).
   UI:
   - The caller will render these as yellow suggestion pills under each email preview. */
async function computeLoadMoreCategorySuggestions(emails) {
    try {
        if (!Array.isArray(emails) || !emails.length) return;

        const stageOrder = ['similarity', 'sender', 'subject-nn', 'body-nn', 'subject', 'body'];
        const stageLabels = {
            similarity: 'Stage 1/6: Computing similarity suggestions…',
            sender: 'Stage 2/6: Analyzing sender affinity…',
            'subject-nn': 'Stage 3/6: Nearest-neighbor by subject…',
            'body-nn': 'Stage 4/6: Nearest-neighbor by body…',
            subject: 'Stage 5/6: Subject-based suggestions…',
            body: 'Stage 6/6: Body-based suggestions…'
        };

        // Normalize payload for the API
        const minimal = emails.map(e => ({
            id: String(e.id || ''),
            subject: String(e.subject || ''),
            body: typeof e.body === 'string' ? e.body : (e.snippet || ''),
            from: String(e.from || '')
        })).filter(x => x.id);

        // Per-email aggregation
        const agg = new Map(); // id -> Map<category, { count, firstStageIx }>
        minimal.forEach(m => agg.set(m.id, new Map()));

        for (let si = 0; si < stageOrder.length; si++) {
            const stage = stageOrder[si];
            try {
                if (typeof updateLoadingOverlayMessage === 'function') {
                    updateLoadingOverlayMessage('Categorizing Emails', stageLabels[stage] || `Running ${stage}…`);
                }
            } catch (_) {}

            // Call backend for this stage
            let data = null;
            try {
                const resp = await fetch('/api/suggest-categories', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ emails: minimal, stage })
                });
                data = await resp.json().catch(() => ({}));
                if (!resp.ok || !data || data.success !== true || !data.choices) {
                    // Non-fatal: proceed to next stage
                    continue;
                }
            } catch (e) {
                // Non-fatal: proceed to next stage
                continue;
            }

            // Merge this stage's choices
            const choices = data.choices || {};
            Object.keys(choices).forEach(id => {
                const cats = Array.isArray(choices[id]) ? choices[id] : [];
                const per = agg.get(id);
                if (!per) return;
                for (const c of cats) {
                    const name = String(c || '').trim();
                    if (!name) continue;
                    if (!per.has(name)) {
                        per.set(name, { count: 1, firstStageIx: si });
                    } else {
                        const entry = per.get(name);
                        entry.count += 1;
                        // keep earliest stage index
                        if (si < entry.firstStageIx) entry.firstStageIx = si;
                        per.set(name, entry);
                    }
                }
            });
        }

        // Finalize: store sorted suggestion list on each email
        emails.forEach(e => {
            const per = agg.get(e.id);
            if (!per || !per.size) {
                e.suggestedCategories = [];
                return;
            }
            const arr = Array.from(per.entries()).map(([name, meta]) => ({ name, ...meta }));
            arr.sort((a, b) => {
                if (b.count !== a.count) return b.count - a.count;
                if (a.firstStageIx !== b.firstStageIx) return a.firstStageIx - b.firstStageIx;
                return a.name.localeCompare(b.name);
            });
            e.suggestedCategories = arr.map(x => x.name);
        });

        // Fire-and-forget logging so the terminal shows contenders per email during Load More
        try {
            const payload = (emails || []).map(e => ({
                id: e?.id || '',
                subject: e?.subject || '',
                from: e?.from || '',
                date: e?.date || '',
                suggestedCategories: Array.isArray(e?.suggestedCategories) ? e.suggestedCategories : []
            }));
            if (payload.length) {
                fetch('/api/log-loadmore-contenders', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ emails: payload })
                }).catch(() => {});
            }
        } catch (_) {}
    } catch (e) {
        try {
            if (typeof updateLoadingOverlayMessage === 'function') {
                updateLoadingOverlayMessage('Categorizing Emails', 'Suggestion pipeline failed, continuing…');
            }
        } catch (_) {}
        // Soft failure: do nothing; the UI will still work without suggestions
    }
}

function populateLoadMoreEmailsCarousel() {
            const carousel = document.getElementById('loadMoreEmailCarousel');
            const carouselInfo = document.getElementById('loadMoreCarouselInfo');
            const carouselCounter = document.getElementById('loadMoreCarouselCounter');
            
            carousel.innerHTML = '';
            
            if (loadMoreEmailsData.length === 0) {
                carousel.innerHTML = '<div class="loading">No emails to display.</div>';
                return;
            }
            
            carouselInfo.textContent = `Found ${loadMoreEmailsData.length} email${loadMoreEmailsData.length === 1 ? '' : 's'}`;
            carouselCounter.textContent = `1 / ${loadMoreEmailsData.length}`;
            
            loadMoreEmailsData.forEach((email, index) => {
                const slide = document.createElement('div');
                slide.className = `thread-slide ${index === 0 ? 'active' : ''}`;

                // Build suggested categories row (yellow pills), ordered by aggregated signals
                let suggestHtml = '';
                try {
                    const list = Array.isArray(email.suggestedCategories) ? email.suggestedCategories : [];
                    if (list.length) {
                        const pills = list.map(cat => {
                            const style = getCategoryBadgeStyle(cat); // reuse deterministic pastel styles
                            const cls = `category-${String(cat).toLowerCase().replace(/\s+/g, '-')}`;
                            // Wrap in a subtle yellow container effect by tinting the pill slightly
                            return `<span class="email-category ${cls}" style="background:#FFF9CC; color:#5f6368; border:1px solid #f1e4a6; padding:4px 8px; border-radius:12px; font-size:12px; font-weight:500; margin-right:6px;">${cat}</span>`;
                        }).join('');
                        suggestHtml = `
                            <div class="email-suggestions" style="margin-top:8px;">
                                <div style="font-size:12px; color:#666; margin-bottom:4px;">Suggested Categories:</div>
                                <div>${pills}</div>
                            </div>
                        `;
                    }
                } catch (_) {}

                slide.innerHTML = `
                    <div class="thread-preview">
                        <div class="thread-subject">${email.subject}</div>
                        <div class="thread-messages">
                            <div class="thread-message-preview original">
                                <div class="message-preview-header">
                                    <div class="message-preview-from">${email.from}</div>
                                    <div class="message-preview-date">${formatDate(email.date)}</div>
                                </div>
                                <div class="message-preview-body">${email.body.substring(0, 300)}${email.body.length > 300 ? '...' : ''}</div>
                            </div>
                        </div>
                        ${suggestHtml}
                        <div class="thread-selection">
                            <input type="checkbox" id="loadMoreEmail-${index}" class="thread-select-checkbox" onchange="toggleLoadMoreEmailSelection(${index})">
                            <label for="loadMoreEmail-${index}" class="thread-select-label">Use this email for response generation</label>
                        </div>
                    </div>
                `;
                carousel.appendChild(slide);
            });
            
            updateLoadMoreCarouselNavigation();
        }

        function previousLoadMoreSlide() {
            if (currentLoadMoreSlideIndex > 0) {
                currentLoadMoreSlideIndex--;
                updateLoadMoreCarouselDisplay();
            }
        }

        function nextLoadMoreSlide() {
            if (currentLoadMoreSlideIndex < loadMoreEmailsData.length - 1) {
                currentLoadMoreSlideIndex++;
                updateLoadMoreCarouselDisplay();
            }
        }

        function updateLoadMoreCarouselDisplay() {
            const slides = document.querySelectorAll('#loadMoreEmailCarousel .thread-slide');
            slides.forEach((slide, index) => {
                slide.classList.toggle('active', index === currentLoadMoreSlideIndex);
            });
            
            document.getElementById('loadMoreCarouselCounter').textContent = `${currentLoadMoreSlideIndex + 1} / ${loadMoreEmailsData.length}`;
            updateLoadMoreCarouselNavigation();
        }

        function updateLoadMoreCarouselNavigation() {
            const prevBtn = document.getElementById('loadMorePrevBtn');
            const nextBtn = document.getElementById('loadMoreNextBtn');
            
            prevBtn.disabled = currentLoadMoreSlideIndex === 0;
            nextBtn.disabled = currentLoadMoreSlideIndex === loadMoreEmailsData.length - 1;
        }

        function toggleLoadMoreEmailSelection(emailIndex) {
            const checkbox = document.getElementById(`loadMoreEmail-${emailIndex}`);
            
            if (checkbox.checked) {
                selectedLoadMoreEmails.add(emailIndex);
            } else {
                selectedLoadMoreEmails.delete(emailIndex);
            }
            
            updateUseEmailsButton();
        }

        function selectAllLoadMoreEmails() {
            try {
                // Select every email in the current loaded list
                selectedLoadMoreEmails.clear();
                for (let i = 0; i < (loadMoreEmailsData ? loadMoreEmailsData.length : 0); i++) {
                    selectedLoadMoreEmails.add(i);
                    const cb = document.getElementById(`loadMoreEmail-${i}`);
                    if (cb) cb.checked = true;
                }
                // Update CTA
                updateUseEmailsButton();

                // Brief success feedback on the button
                const btn = document.getElementById('selectAllLoadMoreBtn');
                if (btn) {
                    const original = btn.textContent;
                    btn.textContent = 'All Selected ✓';
                    btn.disabled = true;
                    setTimeout(() => {
                        try {
                            btn.textContent = original;
                            btn.disabled = false;
                        } catch (_) {}
                    }, 900);
                }
            } catch (e) {
                console.error('selectAllLoadMoreEmails failed:', e);
            }
        }

        function updateUseEmailsButton() {
            const useBtn = document.getElementById('useSelectedEmailsBtn');
            const selectedCount = selectedLoadMoreEmails.size;
            
            useBtn.disabled = selectedCount === 0;
            useBtn.textContent = selectedCount === 0 
                ? 'Use Selected Emails' 
                : `Use ${selectedCount} Selected Email${selectedCount === 1 ? '' : 's'}`;
        }

        async function useSelectedEmails() {
            if (selectedLoadMoreEmails.size === 0) {
                showErrorPopup('Please select at least one email to use.', 'No Emails Selected');
                return;
            }
            
            // Get the selected emails for approval
            const selectedEmails = Array.from(selectedLoadMoreEmails).map(index => loadMoreEmailsData[index]);
            
            // Close the carousel modal
            closeLoadMoreEmailsCarouselModal();
            
            // Show approval popup for each selected email
            await showEmailApprovalPopup(selectedEmails);
        }

        // Email Approval Popup functionality
        let emailsToApprove = [];
        let currentApprovalIndex = 0;

        async function showEmailApprovalPopup(emails) {
            emailsToApprove = emails;
            currentApprovalIndex = 0;
            
            if (emailsToApprove.length === 0) {
                return;
            }

            // Ensure current categories are loaded for category selection
            try { await loadCurrentCategories(); } catch (e) { console.warn('Failed to refresh category list for approval modal:', e); }
            
            showNextEmailApproval();
        }

        function showNextEmailApproval() {
            if (currentApprovalIndex >= emailsToApprove.length) {
                // All emails processed
                showApprovalComplete();
                return;
            }
            
            const email = emailsToApprove[currentApprovalIndex];
            
            // Create approval modal if it doesn't exist
            let modal = document.getElementById('emailApprovalModal');
            if (!modal) {
                modal = createEmailApprovalModal();
                document.body.appendChild(modal);
            }
            
            populateApprovalModal(email);
            modal.style.display = 'block';
        }

        function createEmailApprovalModal() {
            const modal = document.createElement('div');
            modal.id = 'emailApprovalModal';
            modal.className = 'modal';
            modal.innerHTML = `
                <div class="modal-content" style="max-width: 700px; max-height: 80vh;">
                    <div class="modal-header">
                        <h2 class="modal-title">Approve Email for Database</h2>
                        <button class="close" onclick="closeEmailApprovalModal()">&times;</button>
                    </div>
                    <div style="padding: 20px; max-height: 60vh; overflow-y: auto;">
                        <div style="background: #f0f8ff; border-left: 4px solid #4285f4; padding: 16px; margin-bottom: 20px; border-radius: 0 6px 6px 0;">
                            <h4 style="margin: 0 0 8px 0; color: #4285f4; font-size: 16px;">📧 Email Approval Required</h4>
                            <p style="margin: 0; color: #666; font-size: 14px; line-height: 1.5;">
                                Review this email before adding it to your database. You can approve it for addition or reject it.
                            </p>
                        </div>
                        
                        <div id="approvalEmailPreview" style="border: 1px solid #e9ecef; border-radius: 8px; background: white; overflow: hidden;">
                            <!-- Email preview will be populated here -->
                        </div>

                        <div style="margin-top: 12px;">
                            <label for="approvalCategorySelect" style="font-weight: 600; font-size: 13px; color: #333; margin-bottom: 6px; display: block;">Category</label>
                            <select id="approvalCategorySelect" style="width: 100%; padding: 8px; border: 1px solid #ddd; border-radius: 6px; font-size: 13px;"></select>
                        </div>
                        
                        <div style="display: flex; justify-content: space-between; align-items: center; margin-top: 20px; padding-top: 16px; border-top: 1px solid #e9ecef;">
                            <div id="approvalProgress" style="color: #666; font-size: 14px;">
                                Email 1 of 1
                            </div>
                            <div style="display: flex; gap: 12px;">
                                <button class="popup-btn popup-btn-success" onclick="approveAllRemainingEmails()" title="Approve all remaining emails in this session">Select All</button>
                                <button class="popup-btn popup-btn-secondary" onclick="rejectCurrentEmail()">❌ Reject</button>
                                <button class="popup-btn popup-btn-success" onclick="approveCurrentEmail()">✅ Approve</button>
                            </div>
                        </div>
                    </div>
                </div>
            `;
            return modal;
        }

        function populateApprovalModal(email) {
            const preview = document.getElementById('approvalEmailPreview');
            const progress = document.getElementById('approvalProgress');
            
            preview.innerHTML = `
                <div style="background: #f8f9fa; padding: 15px; border-bottom: 1px solid #e9ecef;">
                    <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 8px;">
                        <div style="font-weight: 600; color: #333; font-size: 14px;">${email.from}</div>
                        <div style="color: #666; font-size: 12px;">${formatDate(email.date)}</div>
                    </div>
                    <div style="font-weight: 500; color: #1a73e8; margin-bottom: 8px; font-size: 14px;">${email.subject}</div>
                    ${email.category ? `<div class="email-category category-${(email.category || '').toLowerCase().replace(/\s+/g, '-')}" style="display: inline-block; padding: 4px 8px; border-radius: 12px; font-size: 12px; font-weight: 500;">${email.category}</div>` : ''}
                </div>
                <div style="padding: 15px; max-height: 300px; overflow-y: auto;">
                    <div style="font-size: 14px; line-height: 1.6; color: #333; white-space: pre-wrap;">${email.body}</div>
                </div>
            `;

            // Populate category select using authoritative ordering
            try {
                const sel = document.getElementById('approvalCategorySelect');
                if (sel) {
                    const list = Array.isArray(currentCategoriesOrder) ? currentCategoriesOrder.slice() : [];
                    const cur = String(email.category || '').trim();
                    const exists = list.some(c => String(c || '').toLowerCase() === cur.toLowerCase());
                    const categories = exists || !cur ? list : [...list, cur];
                    sel.innerHTML = categories.map(c => `<option value="${String(c).replace(/"/g, '"')}">${c}</option>`).join('');
                    // Select the current email category if available; otherwise select first
                    const match = categories.find(c => String(c || '').toLowerCase() === cur.toLowerCase());
                    sel.value = match || (categories[0] || '');
                }
            } catch (e) {
                console.error('Failed to populate category select in approval modal:', e);
            }
            
            progress.textContent = `Email ${currentApprovalIndex + 1} of ${emailsToApprove.length}`;
        }

        async function approveCurrentEmail() {
            const email = emailsToApprove[currentApprovalIndex];
            // Apply explicit category override if user selected one
            try {
                const sel = document.getElementById('approvalCategorySelect');
                if (sel && sel.value) {
                    email.category = sel.value;
                }
            } catch (e) {
                console.warn('Could not read approval category selection:', e);
            }
            
            try {
                // Add the approved email to the database
                const response = await fetch('/api/add-approved-email', {
                    method: 'POST',
                    headers: {
                        'Content-Type': 'application/json',
                    },
                    body: JSON.stringify({
                        email: email
                    })
                });
                
                const data = await response.json();
                
                if (data.success) {
                    // Move to next email
                    currentApprovalIndex++;
                    showNextEmailApproval();
                } else {
                    showErrorPopup('Failed to add email to database: ' + (data.error || 'Unknown error'), 'Approval Failed');
                }
            } catch (error) {
                console.error('Error approving email:', error);
                showErrorPopup('Failed to approve email. Please try again.', 'Network Error');
            }
        }

        async function approveAllRemainingEmails() {
    try {
        const remaining = Array.isArray(emailsToApprove) ? emailsToApprove.slice(currentApprovalIndex) : [];
        if (!remaining.length) {
            showErrorPopup('No remaining emails to approve.', 'Nothing to Approve');
            return;
        }

        showConfirmPopup(
            `Approve all remaining ${remaining.length} email${remaining.length === 1 ? '' : 's'}?`,
            async () => {
                try {
                    showLoadingOverlay('Approving Emails', `Processing 0 of ${remaining.length}...`, false);
                    let success = 0;
                    let failed = 0;

                    for (let i = 0; i < remaining.length; i++) {
                        const email = remaining[i];
                        updateLoadingOverlayMessage('Approving Emails', `Processing ${i + 1} of ${remaining.length}...`);
                        try {
                            const resp = await fetch('/api/add-approved-email', {
                                method: 'POST',
                                headers: { 'Content-Type': 'application/json' },
                                body: JSON.stringify({ email })
                            });
                            const data = await resp.json().catch(() => ({}));
                            if (!resp.ok || !data.success) {
                                failed++;
                            } else {
                                success++;
                            }
                        } catch {
                            failed++;
                        }
                    }

                    hideLoadingOverlay();
                    // Finish the batch flow and show standard completion UI
                    showApprovalComplete();
                    // Optional summary
                    showSuccessPopup(`Approved ${success} email${success === 1 ? '' : 's'}${failed ? ` • ${failed} failed` : ''}.`, 'Batch Approved');
                } catch (e) {
                    console.error('approveAllRemainingEmails batch failed:', e);
                    try { hideLoadingOverlay(); } catch (_){}
                    showErrorPopup('Batch approval failed. Some emails may not have been saved.', 'Batch Failed');
                }
            },
            () => {},
            'Approve All'
        );
    } catch (e) {
        console.error('approveAllRemainingEmails failed:', e);
        showErrorPopup('Could not start batch approval. Please try again.', 'Operation Failed');
    }
}

function rejectCurrentEmail() {
            // Simply move to next email without adding to database
            currentApprovalIndex++;
            showNextEmailApproval();
        }

        function showApprovalComplete() {
            closeEmailApprovalModal();
            
            const approvedCount = currentApprovalIndex; // This would be more accurate with actual tracking
            showSuccessPopup(
                `Email approval process complete! Approved emails have been added to your database.`,
                'Approval Complete'
            );
            
            // Refresh the unreplied emails list to show newly added emails
            loadUnrepliedEmails().then(() => {
                // If the select email modal is still open, refresh its content
                const selectModal = document.getElementById('selectEmailModal');
                if (selectModal && selectModal.style.display === 'block') {
                    populateUnrepliedEmails();
                }
            });
            
            // Also refresh the main email list to show any new emails
            loadEmails();
        }

        function closeEmailApprovalModal() {
            const modal = document.getElementById('emailApprovalModal');
            if (modal) {
                modal.style.display = 'none';
            }
            
            // Reset approval state
            emailsToApprove = [];
            currentApprovalIndex = 0;
        }

        function closeLoadMoreEmailsModal() {
            const modal = document.getElementById('loadMoreEmailsModal');
            if (modal) {
                modal.style.display = 'none';
            }
        }

        function closeLoadMoreEmailsCarouselModal() {
            const modal = document.getElementById('loadMoreEmailsCarouselModal');
            if (modal) {
                modal.style.display = 'none';
            }
            
            // Reset state
            loadMoreEmailsData = [];
            selectedLoadMoreEmails.clear();
            currentLoadMoreSlideIndex = 0;
        }

        // Update the window click event listener to include new modals
        window.addEventListener('click', function(event) {
            const threadModal = document.getElementById('threadModal');
            const generateModal = document.getElementById('generateResponseModal');
            const selectModal = document.getElementById('selectEmailModal');
            const selectTestModal = document.getElementById('selectTestEmailModal');
            const viewRefinementsModal = document.getElementById('viewRefinementsModal');
            const viewSavedGenerationsModal = document.getElementById('viewSavedGenerationsModal');
            const saveScenarioModal = document.getElementById('saveScenarioModal');
            const loadScenarioModal = document.getElementById('loadScenarioModal');
            const loadEmailThreadsModal = document.getElementById('loadEmailThreadsModal');
            const threadCarouselModal = document.getElementById('threadCarouselModal');
            const loadMoreEmailsModal = document.getElementById('loadMoreEmailsModal');
            const loadMoreEmailsCarouselModal = document.getElementById('loadMoreEmailsCarouselModal');
            const userGuidelinesModal = document.getElementById('userGuidelinesModal');
            
            if (event.target === threadModal) {
                closeModal();
            }
            if (event.target === generateModal) {
                closeGenerateResponseModal();
            }
            if (event.target === selectModal) {
                closeSelectEmailModal();
            }
            if (event.target === selectTestModal) {
                closeSelectTestEmailModal();
            }
            if (event.target === viewRefinementsModal) {
                closeViewRefinementsModal();
            }
            if (event.target === viewSavedGenerationsModal) {
                closeViewSavedGenerationsModal();
            }
            if (event.target === saveScenarioModal) {
                closeSaveScenarioModal();
            }
            if (event.target === loadScenarioModal) {
                closeLoadScenarioModal();
            }
            if (event.target === loadEmailThreadsModal) {
                closeLoadEmailThreadsModal();
            }
            if (event.target === threadCarouselModal) {
                closeThreadCarouselModal();
            }
            if (event.target === loadMoreEmailsModal) {
                closeLoadMoreEmailsModal();
            }
            if (event.target === loadMoreEmailsCarouselModal) {
                closeLoadMoreEmailsCarouselModal();
            }
            if (event.target === userGuidelinesModal) {
                closeUserGuidelinesModal();
            }
        });

        // Refresh functionality for Load More Emails
        async function refreshLoadMoreEmails() {
            // Get the current query and count from the original fetch
            const query = document.getElementById('emailQueryInput') ? document.getElementById('emailQueryInput').value.trim() : '';
            const maxResults = loadMoreEmailsData.length || 10; // Use current count or default to 10
            
            // Show loading overlay
            showLoadingOverlay('Refreshing Emails', 'Fetching new emails from your Gmail inbox...', true);
            
            try {
                // Create abort controller for cancellation
                loadingOperation = new AbortController();
                
                const response = await fetch('/api/fetch-more-emails', {
                    method: 'POST',
                    headers: {
                        'Content-Type': 'application/json',
                    },
                    body: JSON.stringify(lastLoadMoreDateFilter === 'today' ? { dateFilter: 'today', refresh: true } : { query: query || undefined, maxResults: maxResults, refresh: true }),
                    signal: loadingOperation.signal
                });
                
                const data = await response.json();
                
                if (data.success && data.emails && data.emails.length > 0) {
                    // Replace current emails with new ones
                    loadMoreEmailsData = data.emails;
                    selectedLoadMoreEmails.clear();
                    currentLoadMoreSlideIndex = 0;
                    
                    // Hide loading overlay
                    hideLoadingOverlay();
                    
                    // Refresh the carousel display
                    populateLoadMoreEmailsCarousel();
                    
                    showSuccessPopup(`Refreshed with ${data.emails.length} new email${data.emails.length === 1 ? '' : 's'}!`, 'Emails Refreshed');
                } else {
                    hideLoadingOverlay();
                    showErrorPopup(data.error || 'No new emails found matching the criteria.', 'No New Emails');
                }
            } catch (error) {
                hideLoadingOverlay();
                if (error.name === 'AbortError') {
                    console.log('Email refresh was cancelled');
                } else {
                    console.error('Error refreshing emails:', error);
                    showErrorPopup('Failed to refresh emails. Please try again.', 'Refresh Failed');
                }
            } finally {
                loadingOperation = null;
            }
        }

        // Refresh functionality for Email Threads
        async function refreshEmailThreads() {
            // Get the current thread count from the original load
            const threadCount = currentThreads.length || 3; // Use current count or default to 3
            
            // Show loading overlay
            showLoadingOverlay('Refreshing Threads', 'Fetching new email threads from your inbox...', true);
            
            try {
                // Create abort controller for cancellation
                loadingOperation = new AbortController();
                
                const response = await fetch('/api/load-email-threads', {
                    method: 'POST',
                    headers: {
                        'Content-Type': 'application/json',
                    },
                    body: JSON.stringify(lastThreadDateFilter === 'today' ? { dateFilter: 'today', refresh: true } : { threadCount: threadCount, refresh: true }),
                    signal: loadingOperation.signal
                });
                
                const data = await response.json();
                
                if (data.success && data.threads && data.threads.length > 0) {
                    // Replace current threads with new ones
                    currentThreads = data.threads;
                    selectedThreads.clear();
                    currentSlideIndex = 0;
                    
                    // Hide loading overlay
                    hideLoadingOverlay();
                    
                    // Refresh the carousel display
                    populateThreadCarousel();
                    
                    showSuccessPopup(`Refreshed with ${data.threads.length} new thread${data.threads.length === 1 ? '' : 's'}!`, 'Threads Refreshed');
                } else {
                    hideLoadingOverlay();
                    showErrorPopup(data.error || 'No new email threads found matching the criteria.', 'No New Threads');
                }
            } catch (error) {
                hideLoadingOverlay();
                if (error.name === 'AbortError') {
                    console.log('Thread refresh was cancelled');
                } else {
                    console.error('Error refreshing threads:', error);
                    showErrorPopup('Failed to refresh threads. Please try again.', 'Refresh Failed');
                }
            } finally {
                loadingOperation = null;
            }
        }

        // Delete Email Thread functionality
        async function deleteEmailThread(emailId, emailSubject, event) {
            // Prevent the email item click event from firing
            event.stopPropagation();
            
            showConfirmPopup(
                `Are you sure you want to delete the email thread "${emailSubject}"? This action cannot be undone.`,
                async () => {
                    try {
                        const response = await fetch(`/api/email-thread/${emailId}`, {
                            method: 'DELETE'
                        });
                        
                        const data = await response.json();
                        
                        if (data.success) {
                            showSuccessPopup(`Email thread "${emailSubject}" deleted successfully!`, 'Thread Deleted');
                            
                            // Refresh the email list to remove the deleted thread
                            loadEmails();
                        } else {
                            showErrorPopup('Failed to delete email thread: ' + (data.error || 'Unknown error'), 'Delete Failed');
                        }
                    } catch (error) {
                        console.error('Error deleting email thread:', error);
                        showErrorPopup('Failed to delete email thread. Please try again.', 'Network Error');
                    }
                },
                () => {
                    // User cancelled - do nothing
                },
                'Delete Email Thread'
            );
        }

        // Categories Review Modal (Refresh Categories)
        let categoriesState = [];
        let categoryAssignments = {};
        // User Guidelines cache for category generation
        let userGuidelines = [];

        async function showCategoriesReviewModal() {
            try {
                // Build categories from current emails to keep existing assignments as-is
                let sourceEmails = Array.isArray(allEmails) && allEmails.length ? allEmails : [];

                if (!sourceEmails.length) {
                    // Fallback: fetch current response emails (existing saved categories)
                    const resp = await fetch('/api/response-emails');
                    const data = await resp.json();
                    if (data && Array.isArray(data.emails)) {
                        sourceEmails = data.emails;
                    }
                }

                categoriesState = groupEmailsIntoCategories(sourceEmails);

                // Seed assignments map from current categories
                categoryAssignments = {};
                categoriesState.forEach(cat => {
                    (cat.emails || []).forEach(e => {
                        if (e && e.id) categoryAssignments[e.id] = cat.name;
                    });
                });

                // Create modal once
                let modal = document.getElementById('categoriesReviewModal');
                if (!modal) {
                    modal = createCategoriesReviewModal();
                    document.body.appendChild(modal);
                }

                renderCategoriesEditor();
                modal.style.display = 'block';
            } catch (err) {
                console.error('Error opening categories editor:', err);
                showErrorPopup('Failed to open categories editor. Please try again.', 'Open Failed');
            }
        }

        function groupEmailsIntoCategories(emails) {
            const groups = {};
            (emails || []).forEach(email => {
                const name = (email.category && String(email.category)) || 'Uncategorized';
                if (!groups[name]) groups[name] = [];
                groups[name].push({
                    id: email.id,
                    subject: email.subject || 'No Subject',
                    from: email.originalFrom || email.from || 'Unknown Sender',
                    date: email.date || new Date().toISOString(),
                    snippet: email.snippet || (email.body ? email.body.substring(0, 120) + (email.body.length > 120 ? '...' : '') : 'No content available')
                });
            });
            return Object.keys(groups)
                .sort()
                .map(name => ({ name, originalName: name, emails: groups[name] }));
        }

        async function refreshCategoriesInModal() {
            try {
                // Explicit refresh: generate suggested categories from server
                const resp = await fetch('/api/generate-categories', { method: 'POST' });
                const data = await resp.json();
                if (!resp.ok || !data.success) {
                    throw new Error(data.error || 'Failed to generate categories');
                }

                categoriesState = (data.categories || []).map(c => ({
                    name: c.name,
                    originalName: c.originalName || c.name,
                    emails: Array.isArray(c.emails) ? c.emails.slice() : []
                }));

                // Reset assignments map based on refreshed groups
                categoryAssignments = {};
                categoriesState.forEach(cat => {
                    (cat.emails || []).forEach(e => {
                        if (e && e.id) categoryAssignments[e.id] = cat.name;
                    });
                });

                renderCategoriesEditor();
                showSuccessPopup('Categories refreshed from current data.', 'Refreshed');
            } catch (err) {
                console.error('Error refreshing categories in modal:', err);
                showErrorPopup('Failed to refresh categories. Please try again.', 'Refresh Failed');
            }
        }

        // Prompt for refresh mode selection: Rule Based vs AI Generated
        function promptRefreshCategoriesMode() {
            showCustomPopup({
                title: 'Refresh Categories',
                message: 'Choose a method to refresh categories.',
                icon: 'warning',
                primaryText: 'AI Generated',
                secondaryText: 'Rule Based',
                onPrimary: () => { refreshCategoriesInModalAI(); },
                onSecondary: () => { refreshCategoriesInModal(); },
                tertiaryText: 'AI Generated V2',
                onTertiary: () => { refreshCategoriesInModalAIV2(); },
                type: 'confirm'
            });
            // Append "User Guidelines" and "Keyword Search" actions below the existing buttons
            try {
                const popup = document.getElementById('customPopup');
                if (popup) {
                    const extra = document.createElement('div');
                    extra.className = 'popup-actions';
                    extra.style.paddingTop = '0';

                    // User Guidelines button
                    const ugBtn = document.createElement('button');
                    ugBtn.className = 'popup-btn popup-btn-primary';
                    ugBtn.textContent = 'User Guidelines';
                    ugBtn.style.width = '100%';
                    ugBtn.onclick = () => {
                        closeCustomPopup();
                        showUserGuidelinesModal();
                    };
                    extra.appendChild(ugBtn);

                    // Keyword Search button
                    const ksRow = document.createElement('div');
                    ksRow.className = 'popup-actions';
                    ksRow.style.paddingTop = '0';
                    const ksBtn = document.createElement('button');
                    ksBtn.className = 'popup-btn popup-btn-primary';
                    ksBtn.textContent = 'Keyword Search';
                    ksBtn.style.width = '100%';
                    ksBtn.onclick = () => {
                        closeCustomPopup();
                        showKeywordSearchModal();
                    };
                    ksRow.appendChild(ksBtn);

                    const content = popup.querySelector('.popup-content');
                    if (content) {
                        content.appendChild(extra);
                        content.appendChild(ksRow);
                    }
                }
            } catch (e) {
                console.error('Failed to append extra buttons:', e);
            }
        }

        // AI-generated categories using backend OpenAI endpoint with robust prompt & fallbacks
        // Open Keyword Results carousel using saved keywords or current categories (no regeneration)
        async function openCarouselEditing() {
            try {
                // Goal: Mirror the exact groupings shown in "Edit Categories & Notes"
                // Build carousel groups directly from categoriesState (source of truth),
                // mapping each email to its thread if available.

                // 1) Ensure categoriesState exists (if user didn't open Categories editor yet)
                if (!Array.isArray(categoriesState) || categoriesState.length === 0) {
                    // Derive categories from current RHS email list as fallback
                    categoriesState = groupEmailsIntoCategories(allEmails);
                    // Seed assignments map
                    categoryAssignments = {};
                    categoriesState.forEach(cat => {
                        (cat.emails || []).forEach(e => {
                            if (e && e.id) categoryAssignments[e.id] = cat.name;
                        });
                    });
                }

                // 2) Load all saved threads from DB once (keyword API returns allThreads snapshot)
                let allThreads = [];
                try {
                    const resp = await fetch('/api/search-by-keywords', {
                        method: 'POST',
                        headers: { 'Content-Type': 'application/json' },
                        body: JSON.stringify({
                            keywords: ['snapshot'], // arbitrary token; we only need allThreads
                            options: { groupBy: 'thread', fields: ['subject', 'body'] }
                        })
                    });
                    const data = await resp.json().catch(() => ({}));
                    allThreads = Array.isArray(data.allThreads) ? data.allThreads : [];
                } catch (e) {
                    console.warn('Unable to fetch DB threads for Carousel; will synthesize from emails only:', e);
                    allThreads = [];
                }

                // 3) Build quick lookups
                // Map from response message id -> thread
                const msgIdToThread = new Map();
                (allThreads || []).forEach(t => {
                    const msgs = Array.isArray(t.messages) ? t.messages : [];
                    msgs.forEach(m => {
                        if (m && m.id) msgIdToThread.set(m.id, t);
                    });
                });

                // Map from response email id -> full email (with body) from RHS list
                const idToEmail = new Map((allEmails || []).map(e => [e && e.id, e]).filter(([k]) => !!k));

                // 4) Construct groups exactly from categoriesState
                const builtGroups = [];
                const combinedThreadsMap = new Map(); // id -> thread for keywordAllThreads
                // Preload DB threads into combined map
                (allThreads || []).forEach(t => { if (t && t.id) combinedThreadsMap.set(t.id, t); });

                for (const cat of (categoriesState || [])) {
                    const threads = [];
                    const seenThreadIds = new Set();

                    for (const e of (cat.emails || [])) {
                        if (!e || !e.id) continue;

                        // Try to map to a real thread via latest response id
                        let thread = msgIdToThread.get(e.id);

                        // If not found, synthesize a minimal single-message thread from RHS email
                        if (!thread) {
                            const rhs = idToEmail.get(e.id);
                            const pseudoId = `pseudo-${e.id}`;
                            const fromMe = window.currentUserDisplayName || displayNameFromEmail(getActualCurrentUserEmail());
                            thread = {
                                id: pseudoId,
                                subject: (rhs && rhs.subject) || e.subject || 'No Subject',
                                messages: [
                                    {
                                        id: e.id,
                                        from: fromMe,
                                        to: [(rhs && rhs.originalFrom) || (rhs && rhs.from) || e.from || 'Unknown Recipient'],
                                        date: (rhs && rhs.date) || e.date || new Date().toISOString(),
                                        subject: (rhs && rhs.subject) || e.subject || 'No Subject',
                                        body: (rhs && rhs.body) || e.snippet || '',
                                        isResponse: true
                                    }
                                ]
                            };
                            // Add pseudo thread to combined map so facets/suggestions can reference it
                            combinedThreadsMap.set(pseudoId, thread);
                        }

                        if (thread && thread.id && !seenThreadIds.has(thread.id)) {
                            seenThreadIds.add(thread.id);
                            threads.push(thread);
                        }
                    }

                    builtGroups.push({
                        name: cat.name,
                        threads
                    });
                }

                // Optional: include an "Other" bucket only if you want a placeholder (empty by default)
                // This keeps the UI consistent without pulling in extra emails.
                builtGroups.push({ name: 'Other Threads', threads: [], isOther: true });

                // 5) Persist carousel state exactly to match Categories & Notes groupings
                window.__threadEditMode = false; // normal carousel mode
                window.keywordAllThreads = Array.from(combinedThreadsMap.values());
                window.threadById = new Map(window.keywordAllThreads.map(t => [t.id, t]));
                window.keywordWorkingGroups = builtGroups;
                window.keywordResults = deepCopy(builtGroups);
                currentKeywordSlideIndex = 0;

                // Keep "Other" last
                ensureOtherLastOrder();

                // 6) Show the carousel
                const modal = ensureKeywordSearchResultsModal();
                populateKeywordSearchResultsCarousel();
                modal.style.display = 'block';
            } catch (e) {
                console.error('openCarouselEditing failed:', e);
                showErrorPopup('Failed to open Carousel Editing. Please try again.', 'Open Failed');
            }
        }

        async function refreshCategoriesInModalAI() {
            try {
                showLoadingOverlay('Generating Categories', 'Asking AI to group your emails...', true);
                const resp = await fetch('/api/generate-categories-ai', { method: 'POST' });
                const data = await resp.json();
                if (!resp.ok || !data.success) {
                    throw new Error(data.error || 'Failed to generate AI categories');
                }

                // Normalize to internal structure
                categoriesState = (data.categories || []).map(c => ({
                    name: c.name,
                    originalName: c.originalName || c.name,
                    emails: Array.isArray(c.emails) ? c.emails.slice() : []
                }));

                // Reset assignments map based on refreshed groups
                categoryAssignments = {};
                categoriesState.forEach(cat => {
                    (cat.emails || []).forEach(e => {
                        if (e && e.id) categoryAssignments[e.id] = cat.name;
                    });
                });

                hideLoadingOverlay();
                renderCategoriesEditor();
                const modeMsg = data.mode === 'rule-based-fallback' ? 'AI unavailable, applied rule-based fallback.' : 'AI-generated categories applied.';
                showSuccessPopup(modeMsg, data.mode === 'rule-based-fallback' ? 'Fallback Applied' : 'AI Refreshed');
            } catch (err) {
                console.error('Error refreshing AI categories in modal:', err);
                hideLoadingOverlay();
                // Soft fallback to rule-based
                try {
                    await refreshCategoriesInModal();
                    showErrorPopup('AI generation failed. Applied rule-based categories instead.', 'AI Failed');
                } catch (fallbackErr) {
                    showErrorPopup('Failed to refresh categories. Please try again.', 'Refresh Failed');
                }
            }
        }

        // AI-generated categories V2 using a more detailed academic-task prompt
        async function refreshCategoriesInModalAIV2() {
            try {
                showLoadingOverlay('Generating Categories', 'Asking AI (V2) to group your emails...', true);
                const resp = await fetch('/api/generate-categories-ai-v2', { method: 'POST' });
                const data = await resp.json();
                if (!resp.ok || !data.success) {
                    throw new Error(data.error || 'Failed to generate AI categories (V2)');
                }

                // Normalize to internal structure
                categoriesState = (data.categories || []).map(c => ({
                    name: c.name,
                    originalName: c.originalName || c.name,
                    emails: Array.isArray(c.emails) ? c.emails.slice() : []
                }));

                // Reset assignments map based on refreshed groups
                categoryAssignments = {};
                categoriesState.forEach(cat => {
                    (cat.emails || []).forEach(e => {
                        if (e && e.id) categoryAssignments[e.id] = cat.name;
                    });
                });

                hideLoadingOverlay();
                renderCategoriesEditor();
                const modeMsg = data.mode === 'rule-based-fallback' ? 'AI unavailable, applied rule-based fallback.' : 'AI-generated categories (V2) applied.';
                showSuccessPopup(modeMsg, data.mode === 'rule-based-fallback' ? 'Fallback Applied' : 'AI Refreshed (V2)');
            } catch (err) {
                console.error('Error refreshing AI V2 categories in modal:', err);
                hideLoadingOverlay();
                // Soft fallback to rule-based
                try {
                    await refreshCategoriesInModal();
                    showErrorPopup('AI V2 generation failed. Applied rule-based categories instead.', 'AI V2 Failed');
                } catch (fallbackErr) {
                    showErrorPopup('Failed to refresh categories. Please try again.', 'Refresh Failed');
                }
            }
        }

        // User Guidelines modal and operations
        function ensureUserGuidelinesModal() {
            let modal = document.getElementById('userGuidelinesModal');
            if (modal) return modal;
            modal = document.createElement('div');
            modal.id = 'userGuidelinesModal';
            modal.className = 'modal';
            modal.innerHTML = `
                <div class="modal-content" style="max-width: 1000px; max-height: 85vh; display: flex; flex-direction: column;">
                    <div class="modal-header">
                        <h2 class="modal-title">User Guidelines for Categories</h2>
                        <button class="close" onclick="closeUserGuidelinesModal()">&times;</button>
                    </div>
                    <div style="padding: 16px; display: flex; flex-direction: column; gap: 12px; flex: 1 1 auto; min-height: 0;">
                        <div style="font-size: 13px; color: #666;">
                            Define your own category names and notes describing what belongs in each category. These guidelines will inform AI grouping.
                        </div>
                        <div style="display:flex; justify-content:flex-end; gap:8px;">
                            <button class="select-email-btn" id="addGuidelineBtn" style="background:#28a745;">+ Add Category</button>
                            <button class="select-email-btn" id="saveGuidelinesBtn" style="background:#6c757d;">Save Guidelines</button>
                        </div>
                        <div id="guidelinesEditor" style="flex:1 1 auto; overflow:auto; border:1px solid #e9ecef; border-radius:8px; background:#fff; padding:12px;">
                            <div class="loading">Loading guidelines...</div>
                        </div>
                        <div style="display:flex; justify-content:center; gap:12px; padding-top:8px;">
                            <button class="carousel-btn carousel-btn-cancel" onclick="closeUserGuidelinesModal()">Cancel</button>
                            <button class="carousel-btn carousel-btn-add" id="generateFromGuidelinesBtn">Generate Categories</button>
                        </div>
                    </div>
                </div>
            `;
            modal.addEventListener('click', (ev) => { if (ev.target === modal) closeUserGuidelinesModal(); });
            document.body.appendChild(modal);
            // Wire buttons
            modal.querySelector('#addGuidelineBtn').addEventListener('click', () => addGuidelineRow());
            modal.querySelector('#saveGuidelinesBtn').addEventListener('click', () => saveCategoryGuidelines());
            modal.querySelector('#generateFromGuidelinesBtn').addEventListener('click', () => generateCategoriesFromGuidelines());
            return modal;
        }

        function closeUserGuidelinesModal() {
            const modal = document.getElementById('userGuidelinesModal');
            if (modal) modal.style.display = 'none';
        }

        async function showUserGuidelinesModal() {
            const modal = ensureUserGuidelinesModal();
            // Load existing guidelines
            try {
                const resp = await fetch('/api/category-guidelines');
                const data = await resp.json();
                userGuidelines = Array.isArray(data.categories) ? data.categories.slice() : [];
            } catch (e) {
                console.error('Failed to load guidelines:', e);
                userGuidelines = [];
            }
            if (!userGuidelines.length) {
                userGuidelines = [{ name: '', notes: '' }];
            }
            renderGuidelinesEditor();
            modal.style.display = 'block';
        }

        function renderGuidelinesEditor() {
            const editor = document.getElementById('guidelinesEditor');
            if (!editor) return;
            if (!Array.isArray(userGuidelines) || !userGuidelines.length) {
                editor.innerHTML = '<div class="loading">No guidelines yet. Click "Add Category" to begin.</div>';
                return;
            }
            editor.innerHTML = '';
            userGuidelines.forEach((g, idx) => {
                const row = document.createElement('div');
                row.style.border = '1px solid #e9ecef';
                row.style.borderLeft = '4px solid #c19a6b';
                row.style.borderRadius = '6px';
                row.style.padding = '10px';
                row.style.marginBottom = '10px';
                row.innerHTML = `
                    <div style="display:flex; gap:8px; align-items:center; margin-bottom:8px;">
                        <label style="min-width:90px; font-size:13px; color:#555;">Category</label>
                        <input type="text" value="${(g.name || '').replace(/&/g,'&').replace(/"/g, '"').replace(/</g,'<').replace(/>/g,'>')}" 
                               oninput="userGuidelines[${idx}].name = this.value"
                               placeholder="Category name" 
                               style="flex:1; padding:8px; border:1px solid #ddd; border-radius:6px; font-size:14px;">
                        <button class="refinement-delete-btn" style="padding:6px 10px; font-size:12px;" onclick="removeGuidelineRow(${idx})">Delete</button>
                    </div>
                    <div>
                        <label style="display:block; font-size:13px; color:#555; margin-bottom:6px;">Notes (what belongs in this category)</label>
                        <textarea oninput="userGuidelines[${idx}].notes = this.value"
                                  placeholder="Describe what should be included here..." 
                                  style="width:100%; min-height:80px; padding:10px; border:1px solid #ddd; border-radius:6px; font-size:14px; resize:vertical;">${(g.notes || '').replace(/&/g,'&').replace(/</g, '<').replace(/>/g, '>')}</textarea>
                    </div>
                `;
                editor.appendChild(row);
            });
        }

        function addGuidelineRow() {
            userGuidelines.push({ name: '', notes: '' });
            renderGuidelinesEditor();
        }

        function removeGuidelineRow(index) {
            userGuidelines.splice(index, 1);
            if (userGuidelines.length === 0) userGuidelines.push({ name: '', notes: '' });
            renderGuidelinesEditor();
        }

        async function saveCategoryGuidelines() {
            try {
                const payload = userGuidelines
                    .map(c => ({ name: String(c?.name || '').trim(), notes: String(c?.notes || '') }))
                    .filter(c => c.name);
                const resp = await fetch('/api/category-guidelines', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ categories: payload })
                });
                const data = await resp.json();
                if (!resp.ok || !data.success) throw new Error(data.error || 'Save failed');
            } catch (e) {
                console.error('Save guidelines failed:', e);
                showErrorPopup('Failed to save guidelines. Please try again.', 'Save Failed');
            }
        }

        async function generateCategoriesFromGuidelines() {
            const modal = document.getElementById('userGuidelinesModal');
            try {
                // Save first
                await saveCategoryGuidelines();
                // Generate using backend (sends saved guidelines implicitly)
                showLoadingOverlay('Generating Categories', 'Applying your guidelines with AI...', false);
                const resp = await fetch('/api/generate-categories-guided', { method: 'POST' });
                const data = await resp.json();
                hideLoadingOverlay();
                if (!resp.ok || !data.success) {
                    throw new Error(data.error || 'Guided generation failed');
                }
                // Normalize to internal structure
                categoriesState = (data.categories || []).map(c => ({
                    name: c.name,
                    originalName: c.originalName || c.name,
                    emails: Array.isArray(c.emails) ? c.emails.slice() : []
                }));

                // Reset assignments map based on refreshed groups
                categoryAssignments = {};
                categoriesState.forEach(cat => {
                    (cat.emails || []).forEach(e => {
                        if (e && e.id) categoryAssignments[e.id] = cat.name;
                    });
                });

                // Rerender categories editor and close modal
                renderCategoriesEditor();
                if (modal) modal.style.display = 'none';
                const modeMsg = data.mode === 'rule-based-fallback' ? 'AI unavailable, applied rule-based fallback.' : 'Guided AI-generated categories applied.';
                showSuccessPopup(modeMsg, data.mode === 'rule-based-fallback' ? 'Fallback Applied' : 'Categories Updated');
            } catch (e) {
                console.error('Guided generation failed:', e);
                try { hideLoadingOverlay(); } catch (_){}
                showErrorPopup('Failed to generate categories from guidelines. Please try again.', 'Generation Failed');
            }
        }
        
        // Keyword Search modal (identical layout to User Guidelines, separate state)
let keywordGuidelines = [];
let keywordResults = [];
let keywordAllThreads = [];
let currentKeywordSlideIndex = 0;
// Selection store for "Other" group threads in the Keyword Results carousel
let selectedOtherThreadIds = new Set();

        function ensureKeywordSearchModal() {
            let modal = document.getElementById('keywordSearchModal');
            if (modal) return modal;

            modal = document.createElement('div');
            modal.id = 'keywordSearchModal';
            modal.className = 'modal';
            modal.innerHTML = `
                <div class="modal-content" style="max-width: 1000px; max-height: 85vh; display: flex; flex-direction: column;">
                    <div class="modal-header">
                        <h2 class="modal-title">Keyword Search</h2>
                        <button class="close" onclick="closeKeywordSearchModal()">&times;</button>
                    </div>
                    <div style="padding: 16px; display: flex; flex-direction: column; gap: 12px; flex: 1 1 auto; min-height: 0;">
                        <div style="font-size: 13px; color: #666;">
                            Enter category names as keywords. We will search all emails (subject and body) for these keywords and show grouped results.
                        </div>
                        <div style="display:flex; justify-content:flex-end; gap:8px;">
                            <button class="select-email-btn" id="addKeywordGuidelineBtn" style="background:#28a745;">+ Add Category</button>
                            <button class="select-email-btn" id="saveKeywordGuidelinesBtn" style="background:#6c757d;">Save</button>
                        </div>
                        <div id="keywordGuidelinesEditor" style="flex:1 1 auto; overflow:auto; border:1px solid #e9ecef; border-radius:8px; background:#fff; padding:12px;">
                            <div class="loading">Loading...</div>
                        </div>
                        <div style="display:flex; justify-content:center; gap:12px; padding-top:8px;">
                            <button class="carousel-btn carousel-btn-cancel" type="button" onclick="closeKeywordSearchModal()">Cancel</button>
                            <button class="carousel-btn carousel-btn-add" type="button" id="generateFromKeywordsBtn">Generate Categories</button>
                        </div>
                    </div>
                </div>
            `;
            modal.addEventListener('click', (ev) => {
                if (ev.target === modal) closeKeywordSearchModal();
            });
            document.body.appendChild(modal);

            // Wire buttons
            modal.querySelector('#addKeywordGuidelineBtn').addEventListener('click', addKeywordGuidelineRow);
            modal.querySelector('#saveKeywordGuidelinesBtn').addEventListener('click', saveKeywordGuidelines);
            modal.querySelector('#generateFromKeywordsBtn').addEventListener('click', generateCategoriesFromKeywords);

            return modal;
        }

        function closeKeywordSearchModal() {
            const modal = document.getElementById('keywordSearchModal');
            if (modal) modal.style.display = 'none';
        }

        async function showKeywordSearchModal() {
            const modal = ensureKeywordSearchModal();
            try {
                // Load any existing guidelines as a starting point (identical to User Guidelines behavior)
                const resp = await fetch('/api/category-guidelines');
                const data = await resp.json();
                keywordGuidelines = Array.isArray(data.categories) && data.categories.length
                    ? data.categories.slice()
                    : [{ name: '', notes: '' }];
            } catch (e) {
                console.error('Failed to load guidelines for keyword search:', e);
                keywordGuidelines = [{ name: '', notes: '' }];
            }
            renderKeywordGuidelinesEditor();
            modal.style.display = 'block';
        }

        function renderKeywordGuidelinesEditor() {
            const editor = document.getElementById('keywordGuidelinesEditor');
            if (!editor) return;
            if (!Array.isArray(keywordGuidelines) || !keywordGuidelines.length) {
                editor.innerHTML = '<div class="loading">No categories yet. Click "Add Category" to begin.</div>';
                return;
            }
            editor.innerHTML = '';
            keywordGuidelines.forEach((g, idx) => {
                const row = document.createElement('div');
                row.style.border = '1px solid #e9ecef';
                row.style.borderLeft = '4px solid #c19a6b';
                row.style.borderRadius = '6px';
                row.style.padding = '10px';
                row.style.marginBottom = '10px';
                row.innerHTML = `
                    <div style="display:flex; gap:8px; align-items:center; margin-bottom:8px;">
                        <label style="min-width:90px; font-size:13px; color:#555;">Category</label>
                        <input type="text"
                               value="${(g.name || '').replace(/&/g,'&').replace(/"/g, '"').replace(/</g,'<').replace(/>/g,'>')}"
                               oninput="keywordGuidelines[${idx}].name = this.value"
                               placeholder="Category name(s) — comma-separated allowed"
                               style="flex:1; padding:8px; border:1px solid #ddd; border-radius:6px; font-size:14px;">
                        <button class="refinement-delete-btn" style="padding:6px 10px; font-size:12px;" onclick="removeKeywordGuidelineRow(${idx})">Delete</button>
                    </div>
                    <div>
                        <label style="display:block; font-size:13px; color:#555; margin-bottom:6px;">More Info (optional)</label>
                        <textarea oninput="keywordGuidelines[${idx}].notes = this.value"
                                  placeholder="Notes (not used in the search, for your reference)"
                                  style="width:100%; min-height:80px; padding:10px; border:1px solid #ddd; border-radius:6px; font-size:14px; resize:vertical;">${(g.notes || '').replace(/&/g,'&').replace(/</g, '<').replace(/>/g, '>')}</textarea>
                    </div>
                `;
                editor.appendChild(row);
            });
        }

        function addKeywordGuidelineRow() {
            keywordGuidelines.push({ name: '', notes: '' });
            renderKeywordGuidelinesEditor();
        }

        function removeKeywordGuidelineRow(index) {
            keywordGuidelines.splice(index, 1);
            if (keywordGuidelines.length === 0) keywordGuidelines.push({ name: '', notes: '' });
            renderKeywordGuidelinesEditor();
        }

        async function saveKeywordGuidelines() {
            // Identical persistence as User Guidelines for convenience
            try {
                const payload = keywordGuidelines
                    .map(c => ({ name: String(c?.name || '').trim(), notes: String(c?.notes || '') }))
                    .filter(c => c.name);
                const resp = await fetch('/api/category-guidelines', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ categories: payload })
                });
                const data = await resp.json();
                if (!resp.ok || !data.success) throw new Error(data.error || 'Save failed');
                showSuccessPopup('Saved.', 'Keyword Search');
            } catch (e) {
                console.error('Save keyword guidelines failed:', e);
                showErrorPopup('Failed to save. Please try again.', 'Save Failed');
            }
        }

        function ensureKeywordSearchResultsModal() {
            let modal = document.getElementById('keywordSearchResultsModal');
            if (modal) return modal;

            modal = document.createElement('div');
            modal.id = 'keywordSearchResultsModal';
            modal.className = 'modal';
            modal.innerHTML = `
                <div class="modal-content thread-carousel-modal">
                    <div class="modal-header">
                        <h2 class="modal-title">Keyword Search Results</h2>
                        <button class="close" onclick="closeKeywordSearchResultsModal()">&times;</button>
                    </div>
                    <div class="thread-carousel-container">
                        <div class="carousel-header">
                            <div class="carousel-info" id="keywordCarouselInfo">Loading...</div>
                            <div class="carousel-controls">
                                <button class="carousel-nav-btn" id="keywordPrevBtn" onclick="previousKeywordSlide()" disabled>← Previous</button>
                                <span class="carousel-counter" id="keywordCarouselCounter">1 / 1</span>
                                <button class="carousel-nav-btn" id="keywordNextBtn" onclick="nextKeywordSlide()" disabled>Next →</button>
                            </div>
                        </div>
                        <div class="thread-carousel" id="keywordResultsCarousel">
                            <!-- Slides go here -->
                        </div>
                        <div class="carousel-actions">
                            <button class="carousel-btn carousel-btn-cancel" onclick="closeKeywordSearchResultsModal()">Close</button>
                            <button class="carousel-btn carousel-btn-add" id="saveKeywordGroupingBtn" onclick="saveKeywordGrouping()" style="min-width: 220px;">Save Grouping</button>
                        </div>
                    </div>
                </div>
            `;
            modal.addEventListener('click', (ev) => {
                if (ev.target === modal) closeKeywordSearchResultsModal();
            });
            document.body.appendChild(modal);
            return modal;
        }

        function closeKeywordSearchResultsModal() {
            const modal = document.getElementById('keywordSearchResultsModal');
            if (modal) modal.style.display = 'none';
            keywordResults = [];
            currentKeywordSlideIndex = 0;
        }

        function populateKeywordSearchResultsCarousel() {
            const carousel = document.getElementById('keywordResultsCarousel');
            const info = document.getElementById('keywordCarouselInfo');
            const counter = document.getElementById('keywordCarouselCounter');
            if (!carousel || !info || !counter) return;

            // Normalize and dedupe any "Other" groups (by name or flag); keep a single unified Other
            try {
                if (Array.isArray(window.keywordResults)) {
                    // Mark groups named "Other" or "Other Threads" as isOther
                    window.keywordResults = window.keywordResults.map(g => {
                        if (!g) return g;
                        const nm = String(g.name || '').trim().toLowerCase();
                        if (nm === 'other' || nm === 'other threads' || g.isOther) {
                            return { ...g, isOther: true };
                        }
                        return g;
                    });
                    // Keep only the first isOther group
                    const firstOther = window.keywordResults.findIndex(g => g && g.isOther);
                    if (firstOther !== -1) {
                        window.keywordResults = window.keywordResults.filter((g, i) => !(g && g.isOther && i !== firstOther));
                    }
                    keywordResults = window.keywordResults;
                }
            } catch (_) {}

            // Enforce "Other" as the last page before rendering
            ensureOtherLastOrder();

            // Precompute membership map: threadId -> Set of group names (non-Other) where the thread appears
            const membershipById = new Map();
            try {
                (keywordResults || []).forEach(gr => {
                    if (!gr || gr.isOther || !Array.isArray(gr.threads)) return;
                    const name = String(gr.name || '').trim();
                    gr.threads.forEach(t => {
                        const id = t && t.id;
                        if (!id) return;
                        let set = membershipById.get(id);
                        if (!set) {
                            set = new Set();
                            membershipById.set(id, set);
                        }
                        set.add(name);
                    });
                });
            } catch (e) {
                console.warn('Failed to build keyword group membership map:', e);
            }

            // Helper to render a single thread as a collapsible block (summary shows subject only)
            const threadToCollapsibleHTML = (thread, currentGroupName) => {
                const subject = escapeHtml(thread.subject || 'No Subject');
                const msgs = Array.isArray(thread.messages) ? thread.messages : [];
                const isNew = !!(thread && (thread.__isNew || thread.isNew));
                const summaryBg = isNew ? '#FFF9CC' : '#f8f9fa';
                // Indicate duplicate membership across keyword groups (excluding "Other" and the current group by name)
                let alsoIn = [];
                try {
                    const currentNameLc = String(currentGroupName || '').trim().toLowerCase();
                    const id = thread && thread.id;
                    if (id) {
                        // Prefer precomputed membership map for accuracy and performance
                        const set = membershipById.get(id);
                        if (set && set.size) {
                            alsoIn = Array.from(set)
                                .filter(n => String(n || '').trim().toLowerCase() !== currentNameLc)
                                .slice(0, 5);
                        } else {
                            // Fallback: scan rendered results then working groups
                            const names = [];
                            if (Array.isArray(keywordResults)) {
                                for (const gr of keywordResults) {
                                    if (!gr || gr.isOther) continue;
                                    const gn = String(gr.name || '').trim();
                                    if (!gn || gn.toLowerCase() === currentNameLc) continue;
                                    const has = Array.isArray(gr.threads) && gr.threads.some(t => t && t.id === id);
                                    if (has) names.push(gn);
                                }
                            }
                            const groups = getWorkingGroupsRef();
                            if (Array.isArray(groups)) {
                                for (const g of groups) {
                                    if (!g || g.isOther) continue;
                                    const gn = String(g.name || '').trim();
                                    if (!gn || gn.toLowerCase() === currentNameLc) continue;
                                    const has = Array.isArray(g.threads) && g.threads.some(t => t && t.id === id);
                                    if (has) names.push(gn);
                                }
                            }
                            const seen = new Set();
                            alsoIn = names.filter(n => {
                                const k = String(n || '').trim().toLowerCase();
                                if (!k || seen.has(k)) return false;
                                seen.add(k);
                                return true;
                            }).slice(0, 5);
                        }
                    }
                } catch (_) {}
                const alsoInHtml = alsoIn.length
                    ? `<span class="thread-meta" style="margin-left:8px;color:#6f42c1;">Also in: ${alsoIn.map(escapeHtml).join(', ')}</span>`
                    : '';
                const msgsHtml = msgs.map(m => {
                    const from = escapeHtml(m.from || 'Unknown Sender');
                    const date = formatDate(m.date || new Date().toISOString());
                    const subj = escapeHtml(m.subject || '');
                    const body = escapeHtml(m.body || '');
                    const cls = m.isResponse ? 'response' : 'original';
                    return `
                        <div class="thread-message-preview ${cls}">
                            <div class="message-preview-header">
                                <div class="message-preview-from">${from}${m.isResponse ? ' (Your Response)' : ''}</div>
                                <div class="message-preview-date">${date}</div>
                            </div>
                            <div class="message-preview-subject" style="padding: 8px 12px; font-size: 13px; color: #333;">
                                <strong>Subject:</strong> ${subj}
                            </div>
                            <div class="message-preview-body">${body}</div>
                        </div>
                    `;
                }).join('');
                // Determine whether the current group is the "Other" bucket by name
                const isOtherGroup = (() => {
                    try {
                        const currentNameLc = String(currentGroupName || '').toLowerCase();
                        // Treat name-based "Other" as Other even if working-group flag is missing
                        if (currentNameLc === 'other' || currentNameLc === 'other threads') return true;
                        const groups = getWorkingGroupsRef();
                        const g = (groups || []).find(gg => String(gg?.name || '').toLowerCase() === currentNameLc);
                        return !!(g && g.isOther);
                    } catch (_) {
                        return false;
                    }
                })();
                const safeId = String(thread.id || '').replace(/'/g, "\\'");
                return `
                    <details class="keyword-thread-collapsible" style="margin-bottom: 10px;">
                        <summary style="cursor: pointer; font-size: 14px; padding: 8px 12px; background:${summaryBg}; border:1px solid #e9ecef; border-radius:6px; display:flex; justify-content:space-between; align-items:center;">
                            <span>
                                <strong>${subject}</strong>
                                <span class="thread-meta" style="color:#666; font-weight:400;"> (${msgs.length} message${msgs.length === 1 ? '' : 's'})</span>
                                ${alsoInHtml}
                            </span>
                            ${isOtherGroup ? `<span style="display:flex; gap:6px; align-items:center;">
                                <input type="checkbox" class="thread-select-checkbox" style="margin-left:8px;" onchange="toggleOtherThreadSelection('${safeId}', this.checked)" ${selectedOtherThreadIds && selectedOtherThreadIds.has(thread.id) ? 'checked' : ''} onclick="event.stopPropagation()">
                            </span>` : `<span style="display:flex; gap:6px;">
                                <button class="carousel-nav-btn" style="background:#dc3545; padding:4px 8px; font-size:12px;" onclick="removeThreadFromKeywordGroupByName('${String(currentGroupName || '').replace(/'/g, "\\'")}', '${safeId}'); event.preventDefault(); event.stopPropagation();">Remove</button>
                            </span>`}
                        </summary>
                        <div class="thread-messages" style="margin-top:10px;">
                            ${msgsHtml || '<div class="no-emails" style="padding: 12px;">No messages available.</div>'}
                        </div>
                    </details>
                `;
            };

            carousel.innerHTML = '';
            if (!Array.isArray(keywordResults) || keywordResults.length === 0) {
                carousel.innerHTML = '<div class="loading">No results to display.</div>';
                info.textContent = 'No keyword groups';
                counter.textContent = '0 / 0';
                return;
            }

            // Build slides: one per keyword group (threads), already prepared by generateCategoriesFromKeywords()
            const uniqueTotal = Array.isArray(keywordAllThreads)
                ? keywordAllThreads.length
                : (() => {
                    try {
                        const ids = new Set();
                        (keywordResults || []).forEach(g => (g.threads || []).forEach(t => ids.add(t.id)));
                        return ids.size;
                    } catch { return 0; }
                  })();
            info.textContent = `Found ${keywordResults.length} group${keywordResults.length === 1 ? '' : 's'} • ${uniqueTotal} total thread${uniqueTotal === 1 ? '' : 's'}`;
            counter.textContent = `1 / ${keywordResults.length}`;

            keywordResults.forEach((group, index) => {
                const slide = document.createElement('div');
                slide.id = `keyword-slide-${index}`;
                slide.className = `thread-slide ${index === 0 ? 'active' : ''}`;

                const threads = Array.isArray(group.threads)
                    ? group.threads
                    : []; // Fallback handled below
                const count = threads.length;

                // New threads (flagged with __isNew or isNew) should appear at the top of each category
                const renderThreads = threads.slice().sort((a, b) => {
                    const aNew = !!(a && (a.__isNew || a.isNew));
                    const bNew = !!(b && (b.__isNew || b.isNew));
                    return aNew === bNew ? 0 : (aNew ? -1 : 1);
                });

                const itemsHtml = renderThreads.length
                    ? renderThreads.map(t => threadToCollapsibleHTML(t, group.name)).join('')
                    : `<div class="no-emails" style="padding: 16px;">No threads matched this keyword.</div>`;

                slide.innerHTML = `
                    <div class="thread-preview">
                        <div class="thread-subject">
                            ${group.isOther 
                                ? ((window.__threadEditMode ? 'Other' : 'Other Threads (no keyword match)') + ' — ' + count + ' thread' + (count === 1 ? '' : 's'))
                                : ('Keyword: ' + escapeHtml(group.name || '') + ' — ' + count + ' thread' + (count === 1 ? '' : 's'))}
                        </div>
                        ${group.isOther ? `
                        <div style="display:flex; justify-content:flex-end; align-items:center; gap:8px; margin-bottom:8px;">
                            <button class="carousel-nav-btn" id="other-move-btn-${index}" onclick="openMoveSelectedModal(${index})" disabled>Move Selected</button>
                        </div>
                        ` : ''}
                        <div class="thread-messages">
                            ${itemsHtml}
                        </div>
                    </div>
                    ${group.isOther ? '' : `
                    <div id="suggestions-anchor-${index}"></div>
                    <div class="facet-box" id="facet-box-${index}" style="border:1px solid #e9ecef;border-left:4px solid #6f42c1;border-radius:8px;background:#fff;padding:12px;margin-top:12px;margin-bottom:12px;">
                        <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:8px;">
                            <div style="font-weight:600;color:#6f42c1;">Suggested Facets</div>
                            <button class="carousel-nav-btn" style="background:#6f42c1;" onclick="regenerateFacetsForGroup(${index})">Regenerate</button>
                        </div>
                        <div id="facet-groups-${index}">
                            <div class="loading">Analyzing group facets...</div>
                        </div>
                        <div style="display:flex;gap:8px;justify-content:flex-end;margin-top:8px;">
                            <button class="carousel-nav-btn" style="background:#28a745;" onclick="applySelectedFacets(${index})">Add Threads</button>
                        </div>
                    </div>
                    `}
                    ${(group.isOther && !window.__threadEditMode) ? `
                        <div style="margin-bottom:12px; padding:14px; border: 2px dashed #17a2b8; border-radius:8px; background:#f0fbff;">
                            <button class="carousel-nav-btn" style="background:#17a2b8; font-size:16px; padding:10px 14px;" onclick="showAddKeywordsModal(${index})">➕ Add keywords to refine “Other”</button>
                            <div style="margin-top:6px; color:#0c5460; font-size:12px;">Add one or more keywords to break down the “Other” threads into new categories.</div>
                        </div>
                    ` : ''}
                `;
                carousel.appendChild(slide);
                if (!group.isOther) {
                    try { renderFacetBoxForGroup(index); } catch (e) { console.error('Facet box render failed:', e); }
                    try { ensureSuggestionsUIForGroup(index); renderSuggestionsList(index); } catch (e) { console.error('Suggestions UI failed:', e); }
                } else {
                    try { updateOtherMoveButton(index); } catch (e) { console.error('Other move button update failed:', e); }
                }
            });

            updateKeywordCarouselNavigation();
        }

        function previousKeywordSlide() {
            if (currentKeywordSlideIndex > 0) {
                currentKeywordSlideIndex--;
                updateKeywordCarouselDisplay();
            }
        }

        function nextKeywordSlide() {
            if (currentKeywordSlideIndex < keywordResults.length - 1) {
                currentKeywordSlideIndex++;
                updateKeywordCarouselDisplay();
            }
        }

        function updateKeywordCarouselDisplay() {
            const slides = document.querySelectorAll('#keywordResultsCarousel .thread-slide');
            slides.forEach((slide, index) => {
                slide.classList.toggle('active', index === currentKeywordSlideIndex);
            });
            const counter = document.getElementById('keywordCarouselCounter');
            if (counter) counter.textContent = `${currentKeywordSlideIndex + 1} / ${keywordResults.length}`;
            updateKeywordCarouselNavigation();
        }

        function updateKeywordCarouselNavigation() {
            const prevBtn = document.getElementById('keywordPrevBtn');
            const nextBtn = document.getElementById('keywordNextBtn');
            if (prevBtn) prevBtn.disabled = currentKeywordSlideIndex === 0;
            if (nextBtn) nextBtn.disabled = currentKeywordSlideIndex === keywordResults.length - 1;
        }

        // ===== Move Selected (from Other) =====
        function toggleOtherThreadSelection(threadId, checked) {
            try {
                if (!threadId) return;
                if (checked) selectedOtherThreadIds.add(threadId);
                else selectedOtherThreadIds.delete(threadId);
                // Update the move button on the current slide
                updateOtherMoveButton(currentKeywordSlideIndex);
            } catch (e) {
                console.error('toggleOtherThreadSelection failed:', e);
            }
        }

        function updateOtherMoveButton(idx) {
            try {
                // Enable/disable solely based on selection count for the rendered "Other" slide index
                const btn = document.getElementById(`other-move-btn-${idx}`);
                if (!btn) return;
                const count = (selectedOtherThreadIds instanceof Set) ? selectedOtherThreadIds.size : 0;
                btn.disabled = count === 0;
                btn.textContent = count === 0 ? 'Move Selected' : `Move ${count} Selected`;
            } catch (e) {
                console.error('updateOtherMoveButton failed:', e);
            }
        }

        function ensureMoveThreadsModal() {
            let modal = document.getElementById('moveThreadsModal');
            if (modal) return modal;
            modal = document.createElement('div');
            modal.id = 'moveThreadsModal';
            modal.className = 'modal';
            modal.innerHTML = `
                <div class="modal-content" style="max-width: 520px; max-height: 70vh;">
                    <div class="modal-header" style="border-bottom: 2px solid #17a2b8;">
                        <h2 class="modal-title">Move Selected Threads</h2>
                        <button class="close" onclick="closeMoveThreadsModal()">&times;</button>
                    </div>
                    <div style="padding:16px;">
                        <div style="margin-bottom:12px; color:#666; font-size:13px;">
                            Choose a destination category to move the selected threads from “Other”.
                        </div>
                        <div class="form-group">
                            <label for="moveTargetSelect">Destination Category</label>
                            <select id="moveTargetSelect" style="width:100%; padding:10px; border:1px solid #ddd; border-radius:6px; font-size:14px;"></select>
                        </div>
                    </div>
                    <div style="display:flex; justify-content:center; gap:12px; padding:12px 16px; border-top:1px solid #e9ecef;">
                        <button class="carousel-btn carousel-btn-cancel" onclick="closeMoveThreadsModal()">Cancel</button>
                        <button class="carousel-btn carousel-btn-add" onclick="applyMoveSelected()">Move</button>
                    </div>
                </div>
            `;
            modal.addEventListener('click', (ev) => { if (ev.target === modal) closeMoveThreadsModal(); });
            document.body.appendChild(modal);
            return modal;
        }

        function closeMoveThreadsModal() {
            const modal = document.getElementById('moveThreadsModal');
            if (modal) modal.style.display = 'none';
        }

        function openMoveSelectedModal(fromIdx) {
            try {
                // Only open if there is at least one selection
                if (!selectedOtherThreadIds || selectedOtherThreadIds.size === 0) {
                    showErrorPopup('Please select at least one thread in “Other”.', 'No Selection');
                    return;
                }
                window.__currentMoveFromIdx = fromIdx;
                const modal = ensureMoveThreadsModal();
                // Populate destination list from working groups (exclude Other)
                const sel = modal.querySelector('#moveTargetSelect');
                const groups = getWorkingGroupsRef();
                const options = (groups || [])
                    .filter(g => g && !g.isOther && g.name)
                    .map(g => String(g.name));
                sel.innerHTML = options.length
                    ? options.map(n => `<option value="${n.replace(/"/g, '"')}">${n}</option>`).join('')
                    : '<option value="" disabled>No categories available</option>';
                modal.style.display = 'block';
            } catch (e) {
                console.error('openMoveSelectedModal failed:', e);
            }
        }

        function applyMoveSelected() {
            try {
                const modal = document.getElementById('moveThreadsModal');
                const sel = modal ? modal.querySelector('#moveTargetSelect') : null;
                const targetName = sel ? String(sel.value || '').trim() : '';
                if (!targetName) {
                    showErrorPopup('Please choose a destination category.', 'Missing Destination');
                    return;
                }
                const groups = getWorkingGroupsRef();
                const targetIdx = (groups || []).findIndex(g => String(g?.name || '').toLowerCase() === targetName.toLowerCase());
                if (targetIdx === -1) {
                    showErrorPopup('Destination category not found.', 'Invalid Destination');
                    return;
                }
                const ids = Array.from(selectedOtherThreadIds);
                if (!ids.length) {
                    closeMoveThreadsModal();
                    return;
                }

                // Move and refresh
                moveThreadsToGroup(ids, targetIdx);
                selectedOtherThreadIds.clear();

                // Re-render carousel and jump to the "Other" slide in the rendered results
                populateKeywordSearchResultsCarousel();
                try {
                    const otherIdx = Array.isArray(window.keywordResults)
                        ? window.keywordResults.findIndex(g => g && g.isOther)
                        : -1;
                    currentKeywordSlideIndex = otherIdx >= 0
                        ? otherIdx
                        : Math.max(0, (window.keywordResults || []).length - 1);
                } catch (_) {
                    currentKeywordSlideIndex = Math.max(0, (window.keywordResults || []).length - 1);
                }
                updateKeywordCarouselDisplay();

                try { updateOtherMoveButton(currentKeywordSlideIndex); } catch (_) {}
                closeMoveThreadsModal();
                showSuccessPopup('Selected threads moved successfully.', 'Moved');
            } catch (e) {
                console.error('applyMoveSelected failed:', e);
                showErrorPopup('Failed to move selected threads. Please try again.', 'Move Failed');
            }
        }

        /* ===== Add Keywords from “Other” workflow ===== */
        let additionalKeywords = [];

        function ensureAddKeywordsModal() {
            let modal = document.getElementById('addKeywordsModal');
            if (modal) return modal;
            modal = document.createElement('div');
            modal.id = 'addKeywordsModal';
            modal.className = 'modal';
            modal.innerHTML = `
                <div class="modal-content" style="max-width: 700px; max-height: 80vh;">
                    <div class="modal-header" style="border-bottom: 2px solid #17a2b8;">
                        <h2 class="modal-title">Add Keywords to Refine “Other”</h2>
                        <button class="close" onclick="closeAddKeywordsModal()">&times;</button>
                    </div>
                    <div style="padding: 16px; max-height: 60vh; overflow: auto;">
                        <div style="color:#666; font-size: 13px; margin-bottom: 10px;">
                            Enter one or more keywords. We’ll search the unsorted “Other” threads and create new keyword groups.
                        </div>
                        <div id="addKeywordsEditor"></div>
                        <div style="display:flex; gap:8px; margin-top:12px;">
                            <button class="select-email-btn" style="background:#28a745;" onclick="addKeywordRow()">+ Add Keyword</button>
                            <button id="addKeywordsSaveBtn" class="select-email-btn" style="background:#6c757d;" onclick="saveAdditionalKeywords()">
                                <span class="btn-text">Save to Keyword List</span>
                                <span class="btn-loading" style="display:none;">💾 Saving...</span>
                            </button>
                        </div>
                    </div>
                    <div style="display:flex; justify-content:center; gap:12px; padding: 12px 16px; border-top:1px solid #e9ecef;">
                        <button id="addKeywordsCancelBtn" class="carousel-btn carousel-btn-cancel" onclick="closeAddKeywordsModal()">Cancel</button>
                        <button id="addKeywordsGenerateBtn" class="carousel-btn carousel-btn-add" onclick="generateMoreFromOther()">
                            <span class="btn-text">Generate</span>
                            <span class="btn-loading" style="display:none;">⏳ Generating...</span>
                        </button>
                    </div>
                </div>
            `;
            modal.addEventListener('click', (ev) => { if (ev.target === modal) closeAddKeywordsModal(); });
            document.body.appendChild(modal);
            return modal;
        }

        function renderAddKeywordsEditor() {
            const host = document.getElementById('addKeywordsEditor');
            if (!host) return;
            if (!Array.isArray(additionalKeywords) || !additionalKeywords.length) {
                additionalKeywords = [''];
            }
            host.innerHTML = additionalKeywords.map((kw, i) => `
                <div style="display:flex; gap:8px; align-items:center; margin-bottom:8px;">
                    <input type="text" value="${(kw || '').replace(/&/g,'&').replace(/</g,'<').replace(/>/g,'>').replace(/"/g,'"')}"
                           oninput="additionalKeywords[${i}] = this.value"
                           placeholder="Enter keyword..."
                           style="flex:1; padding:10px; border:1px solid #ddd; border-radius:6px; font-size:14px;">
                    <button class="refinement-delete-btn" style="padding:8px 10px; font-size:12px;" onclick="removeKeywordRow(${i})">Delete</button>
                </div>
            `).join('');
        }

        function addKeywordRow() {
            if (!Array.isArray(additionalKeywords)) additionalKeywords = [];
            additionalKeywords.push('');
            renderAddKeywordsEditor();
        }

        function removeKeywordRow(i) {
            if (!Array.isArray(additionalKeywords)) additionalKeywords = [];
            additionalKeywords.splice(i, 1);
            if (!additionalKeywords.length) additionalKeywords.push('');
            renderAddKeywordsEditor();
        }

        function showAddKeywordsModal(otherIdx) {
            // Keep focus on the Other slide by default; index provided if needed later
            window.__keywordOtherSlideIndex = otherIdx;
            const modal = ensureAddKeywordsModal();
            // Initialize with a single empty row
            additionalKeywords = [''];
            renderAddKeywordsEditor();
            modal.style.display = 'block';
        }

        function closeAddKeywordsModal() {
            const modal = document.getElementById('addKeywordsModal');
            if (modal) modal.style.display = 'none';
        }

        async function saveAdditionalKeywords() {
            const btn = document.getElementById('addKeywordsSaveBtn');
            const btnText = btn ? btn.querySelector('.btn-text') : null;
            const btnLoading = btn ? btn.querySelector('.btn-loading') : null;
            try {
                if (btn) btn.disabled = true;
                if (btnText) btnText.style.display = 'none';
                if (btnLoading) btnLoading.style.display = 'inline';

                // Merge into keywordGuidelines (unique by name, case-insensitive)
                const newNames = (additionalKeywords || [])
                    .map(s => String(s || '').trim())
                    .filter(Boolean);

                if (!newNames.length) {
                    showErrorPopup('Please enter at least one keyword.', 'No Keywords');
                    return;
                }

                const existing = new Set((keywordGuidelines || []).map(c => String(c?.name || '').toLowerCase()));
                newNames.forEach(name => {
                    const key = name.toLowerCase();
                    if (!existing.has(key)) {
                        keywordGuidelines.push({ name, notes: '' });
                        existing.add(key);
                    }
                });

                // Persist to backend using the shared saver
                await saveKeywordGuidelines();

                // Inline confirmation on the button
                if (btnText) btnText.textContent = 'Saved ✓';
                showSuccessPopup('Keywords saved to your list.', 'Saved');
            } catch (e) {
                console.error('saveAdditionalKeywords failed:', e);
                showErrorPopup('Failed to save keywords. Please try again.', 'Save Failed');
            } finally {
                if (btnLoading) btnLoading.style.display = 'none';
                if (btn) btn.disabled = false;
                setTimeout(() => {
                    try {
                        if (btnText) btnText.textContent = 'Save to Keyword List';
                        if (btnText) btnText.style.display = 'inline';
                    } catch (_) {}
                }, 1000);
            }
        }

        function computeOtherThreadIds() {
            // Build set of thread IDs assigned to any non-Other group
            const groups = getWorkingGroupsRef();
            const assigned = new Set();
            (groups || []).forEach(g => {
                if (!g || !Array.isArray(g.threads) || g.isOther) return;
                g.threads.forEach(t => { if (t && t.id) assigned.add(t.id); });
            });
            const all = Array.isArray(keywordAllThreads) ? keywordAllThreads : [];
            const other = all.filter(t => t && t.id && !assigned.has(t.id)).map(t => t.id);
            return new Set(other);
        }

        function matchThreadsByKeyword(threadList, keyword) {
            const term = String(keyword || '').trim();
            if (!term) return [];
            // Case-insensitive whole-word match against subject/body only
            const wordRe = new RegExp(`\\b${term.replace(/[.*+?^${}()|[\\]\\\\]/g, '\\\\$&')}\\b`, 'i');
            const matches = [];
            for (const t of (threadList || [])) {
                if (!t || !t.id) continue;
                if (wordRe.test(String(t.subject || ''))) { matches.push(t); continue; }
                const msgs = Array.isArray(t.messages) ? t.messages : [];
                let ok = false;
                for (const m of msgs) {
                    if (wordRe.test(String(m.subject || ''))) { ok = true; break; }
                    if (wordRe.test(String(m.body || ''))) { ok = true; break; }
                }
                if (ok) matches.push(t);
            }
            return matches;
        }

        async function generateMoreFromOther() {
            const genBtn = document.getElementById('addKeywordsGenerateBtn');
            const genText = genBtn ? genBtn.querySelector('.btn-text') : null;
            const genLoading = genBtn ? genBtn.querySelector('.btn-loading') : null;
            try {
                if (genBtn) genBtn.disabled = true;
                if (genText) genText.style.display = 'none';
                if (genLoading) genLoading.style.display = 'inline';
                // Collect keywords from editor
                const keys = (additionalKeywords || [])
                    .map(s => String(s || '').trim())
                    .filter(Boolean);
                if (!keys.length) {
                    showErrorPopup('Please enter at least one keyword.', 'No Keywords');
                    return;
                }

                // Also persist new keywords to the main list for future sessions
                try { await saveAdditionalKeywords(); } catch (_) {}

                // Use the FULL thread pool for matching so overlap across existing keyword groups is preserved.
                // We will still only remove matched threads from the "Other" bucket.
                const all = Array.isArray(keywordAllThreads) ? keywordAllThreads : [];
                const matchingPool = all.filter(t => t && t.id);

                // Prepare working groups and render groups
                const wg = getWorkingGroupsRef();
                if (!Array.isArray(keywordResults)) keywordResults = [];

                // Helper to find or create a group with given name (case-insensitive).
                const findGroupIndexByName = (arr, name) => {
                    const n = String(name || '').toLowerCase();
                    return arr.findIndex(g => String(g?.name || '').toLowerCase() === n && !g.isOther);
                };

                const ensureGroupBeforeOther = (arr, name) => {
                    const existsIdx = findGroupIndexByName(arr, name);
                    if (existsIdx !== -1) return existsIdx;
                    const otherIdx = arr.findIndex(g => g && g.isOther);
                    const insertIdx = otherIdx === -1 ? arr.length : otherIdx;
                    arr.splice(insertIdx, 0, { name, threads: [] });
                    return insertIdx;
                };

                // Create/augment groups for each keyword in both structures
                const newAssignments = new Map(); // name -> array of ids
                keys.forEach(k => newAssignments.set(k, []));

                for (const k of keys) {
                    const matched = matchThreadsByKeyword(matchingPool, k);
                    const ids = matched.map(t => t.id);
                    newAssignments.set(k, ids);

                    // 1) keywordWorkingGroups (source of truth for operations)
                    let otherIdxWg = wg.findIndex(g => g && g.isOther);
                    const targetIdxWg = ensureGroupBeforeOther(wg, k);
                    // Ensure thread objects map exists
                    const map = getThreadByIdRef();

                    // Add matched to target group (avoid dups)
                    const tgt = wg[targetIdxWg];
                    if (!Array.isArray(tgt.threads)) tgt.threads = [];
                    const have = new Set(tgt.threads.map(t => t && t.id).filter(Boolean));
                    for (const id of ids) {
                        if (have.has(id)) continue;
                        const full = map.get(id);
                        if (full) tgt.threads.push(full);
                    }

                    // Remove matched from Other only
                    if (otherIdxWg !== -1) {
                        const otherG = wg[otherIdxWg];
                        if (Array.isArray(otherG.threads)) {
                            otherG.threads = otherG.threads.filter(t => t && !ids.includes(t.id));
                        }
                    }
                }

                // After all keywords applied, rebuild "Other" in working groups to reflect removal
                rebuildOtherGroup();

                // 2) keywordResults (render state)
                let otherIdxKr = keywordResults.findIndex(g => g && g.isOther);
                for (const k of keys) {
                    const ids = newAssignments.get(k) || [];
                    if (!ids.length) continue;

                    const targetIdxKr = ensureGroupBeforeOther(keywordResults, k);
                    const tgtKr = keywordResults[targetIdxKr];
                    if (!Array.isArray(tgtKr.threads)) tgtKr.threads = [];
                    const haveKr = new Set(tgtKr.threads.map(t => t && t.id).filter(Boolean));
                    // Add matched full thread objects
                    for (const id of ids) {
                        if (haveKr.has(id)) continue;
                        const full = (Array.isArray(keywordAllThreads) ? keywordAllThreads : []).find(t => t && t.id === id);
                        if (full) tgtKr.threads.push(full);
                    }
                }
                // Recompute "Other" for keywordResults
                {
                    const assigned = new Set();
                    keywordResults.forEach(gr => {
                        if (!gr || gr.isOther || !Array.isArray(gr.threads)) return;
                        gr.threads.forEach(t => { if (t && t.id) assigned.add(t.id); });
                    });
                    const allThreads = Array.isArray(keywordAllThreads) ? keywordAllThreads : [];
                    let otherIdx = keywordResults.findIndex(x => x && x.isOther);
                    if (otherIdx === -1) {
                        keywordResults.push({ name: 'Other Threads', threads: [], isOther: true });
                        otherIdx = keywordResults.length - 1;
                    }
                    keywordResults[otherIdx].threads = allThreads.filter(t => t && t.id && !assigned.has(t.id));
                }

                // Refresh UI: keep user on the “Other” slide
                const desired = keywordResults.findIndex(g => g && g.isOther);
                populateKeywordSearchResultsCarousel();
                currentKeywordSlideIndex = desired >= 0 ? desired : 0;
                updateKeywordCarouselDisplay();

                // Close modal and notify
                closeAddKeywordsModal();
                showSuccessPopup('Created new keyword groups from “Other”. You can continue refining or save the grouping.', 'Refined');
            } catch (e) {
                console.error('generateMoreFromOther failed:', e);
                showErrorPopup('Failed to refine “Other” with new keywords. Please try again.', 'Generate Failed');
            } finally {
                if (genLoading) genLoading.style.display = 'none';
                if (genText) genText.style.display = 'inline';
                if (genBtn) genBtn.disabled = false;
            }
        }

        async function generateCategoriesFromKeywords() {
            try {
                // Helper: provide seed tokens for well-known category names so keyword search can find matches.
                // This bridges the gap between saved category names (like "Teaching & Student Support")
                // and literal words that actually occur in subjects/bodies.
                const getCategorySeedTokens = (name) => {
                    const n = String(name || '').toLowerCase().trim();
                    // Normalize common variants
                    const norm = n.replace(/&/g, 'and').replace(/\s+/g, ' ');
                    const seeds = {
                        'teaching and student support': [
                            'ta', 'teaching assistant', 'assignment', 'homework', 'hw', 'grading', 'grade',
                            'extension', 'late pass', 'resubmit', 'midterm', 'final', 'exam', 'quiz',
                            'office hours', 'syllabus'
                        ],
                        'research and lab work': [
                            'research', 'lab', 'study', 'paper', 'irb', 'pilot', 'dataset', 'experiment',
                            'user study', 'analysis', 'annotation', 'protocol', 'subject recruitment'
                        ],
                        'conferences': [
                            'conference', 'submission', 'camera ready', 'taps', 'review', 'acm', 'ieee',
                            'pcs', 'cfp', 'deadline', 'workshop', 'proceedings'
                        ],
                        'university administration': [
                            'department', 'program', 'phd', 'seas', 'clearance', 'registration', 'university',
                            'admin', 'policy', 'advising', 'course registration', 'graduation', 'cs@cu'
                        ],
                        'financial and reimbursements': [
                            'reimbursement', 'invoice', 'receipt', 'payment', 'refund', 'expense',
                            'travel grant', 'scholarship', 'stipend', 'honorarium'
                        ],
                        'networking': [
                            'opportunity', 'role', 'position', 'recruit', 'recruiter', 'connect',
                            'coffee chat', 'network', 'job', 'career', 'opening', 'hiring', 'linkedin'
                        ],
                        // Often empty by design; leave as [] to avoid over-matching
                        'personal and life management': []
                    };
                    // Special cases the app already recognizes elsewhere
                    if (norm === 'lydia chilton') {
                        return ['lydia', 'chilton', 'lc3251@columbia.edu'];
                    }
                    if (norm === 'apartment') {
                        return [
                            'apartment','lease','landlord','rent','rental','renewal','building','management',
                            'tenant','tenancy','super','maintenance','repair','repairs','utilities','doorman',
                            'roommate','sublease','move-in','move out','key pickup','broker','property manager'
                        ];
                    }
                    return seeds[norm] || [];
                };

                // Build rows: each row may contain multiple comma-separated keywords that should map to ONE category
                // Example: "ta, grading, assignment" -> category label "ta" (first token), matching emails contain any of the tokens
                const rowsRaw = Array.isArray(keywordGuidelines) ? keywordGuidelines : [];
                const rows = [];
                for (const row of rowsRaw) {
                    const raw = String(row?.name || '').trim();
                    if (!raw) continue;

                    // Start with comma-separated tokens if provided by the user
                    let tokens = raw
                        .split(',')
                        .map(s => String(s || '').trim())
                        .filter(Boolean);

                    // If the row only has a single label (e.g., a saved category name),
                    // augment it with seed tokens so the keyword search finds real matches.
                    if (tokens.length === 1) {
                        const seeds = getCategorySeedTokens(tokens[0]);
                        if (Array.isArray(seeds) && seeds.length) {
                            tokens = seeds;
                        }
                    }

                    if (!tokens.length) continue;

                    const label = tokens[0]; // Use the first token as the category name/label
                    rows.push({ label, tokens });
                }

                if (!rows.length) {
                    showErrorPopup('Please add at least one category name (keyword).', 'No Keywords');
                    return;
                }

                // Unique token list across all rows (case-sensitive by value but we’ll map by lowercase)
                const tokenSet = new Set();
                rows.forEach(r => r.tokens.forEach(t => tokenSet.add(t)));
                const allTokens = Array.from(tokenSet);

                // Prefer backend regex search grouped by thread (returns results per token)
                let perTokenResults = [];
                keywordAllThreads = [];
                try {
                    const resp = await fetch('/api/search-by-keywords', {
                        method: 'POST',
                        headers: { 'Content-Type': 'application/json' },
                        body: JSON.stringify({
                            keywords: allTokens,
                            options: {
                                fields: ['subject', 'body'],
                                caseSensitive: false,
                                wholeWord: true,
                                groupBy: 'thread'
                            }
                        })
                    });
                    const data = await resp.json();
                    if (!resp.ok || !data.success) {
                        throw new Error(data.error || 'Search failed');
                    }
                    perTokenResults = Array.isArray(data.results) ? data.results : [];
                    keywordAllThreads = Array.isArray(data.allThreads) ? data.allThreads : [];
                } catch (err) {
                    console.warn('Backend thread regex search failed, falling back to client filtering by email:', err);
                    // Fallback: client-side email-level grouping -> synthesize pseudo-threads with one message
                    let emails = [];
                    try {
                        const r = await fetch('/api/response-emails');
                        const d = await r.json();
                        emails = Array.isArray(d.emails) ? d.emails : [];
                    } catch (e) {
                        console.error('Failed to load response emails for fallback:', e);
                        emails = [];
                    }
                    // Build pseudo threads list (single-message) for local matching and subsequent UI operations
                    keywordAllThreads = emails.map(e => ({
                        id: `pseudo-${e.id}`,
                        subject: e.subject || 'No Subject',
                        messages: [
                            {
                                id: e.id,
                                from: e.originalFrom || e.from || 'Unknown Sender',
                                to: [e.from || 'Unknown Recipient'],
                                date: e.date || new Date().toISOString(),
                                subject: e.subject || 'No Subject',
                                body: e.body || e.snippet || '',
                                isResponse: true
                            }
                        ]
                    }));

                    // Locally compute per-token matches
                    perTokenResults = allTokens.map(tok => {
                        const wordRe = new RegExp(`\\b${String(tok).replace(/[.*+?^${}()|[\\]\\\\]/g, '\\\\$&')}\\b`, 'i');
                        const matchedThreads = keywordAllThreads.filter(t => {
                            if (wordRe.test(String(t.subject || ''))) return true;
                            const msgs = Array.isArray(t.messages) ? t.messages : [];
                            return msgs.some(m => (wordRe.test(String(m.subject || '')) || wordRe.test(String(m.body || ''))));
                        });
                        return { name: tok, threads: matchedThreads };
                    });
                }

                // Build a quick lookup: token (lowercased) -> threads[]
                const tokenToThreads = new Map();
                (perTokenResults || []).forEach(entry => {
                    const key = String(entry?.name || '').toLowerCase();
                    const arr = Array.isArray(entry?.threads) ? entry.threads : [];
                    // Keep only threads with messages (sanity)
                    const clean = arr.filter(t => Array.isArray(t.messages) && t.messages.length > 0);
                    tokenToThreads.set(key, clean);
                });

                // Merge tokens within each row into a single category (OR semantics across tokens)
                const groups = [];
                const usedIds = new Set();
                rows.forEach(row => {
                    const seen = new Set();
                    const union = [];
                    row.tokens.forEach(tok => {
                        const key = String(tok || '').toLowerCase();
                        const list = tokenToThreads.get(key) || [];
                        for (const t of list) {
                            if (!t || !t.id) continue;
                            if (seen.has(t.id)) continue;
                            seen.add(t.id);
                            union.push(t);
                        }
                    });
                    groups.push({
                        name: row.label,
                        threads: union
                    });
                    union.forEach(t => usedIds.add(t.id));
                });

                // Compute unmatched threads and append a final "Other Threads" slide (always include, even if empty)
                try {
                    const otherThreads = (keywordAllThreads || [])
                        .filter(t => Array.isArray(t.messages) && t.messages.length > 0)
                        .filter(t => !usedIds.has(t.id));
                    groups.push({ name: 'Other Threads', threads: otherThreads, isOther: true });
                } catch (e) {
                    console.warn('Failed to compute unmatched threads:', e);
                }

                // Persist results for UI
                keywordResults = groups;
                // Working copy for interactive grouping (latest wins, unique assignment when moving)
                window.keywordWorkingGroups = JSON.parse(JSON.stringify(groups));
                // Build thread index for fast lookups
                window.threadById = new Map();
                (keywordAllThreads || []).forEach(t => { try { if (t && t.id) window.threadById.set(t.id, t); } catch(_){} });
                currentKeywordSlideIndex = 0;

                // Show results carousel
                const modal = ensureKeywordSearchResultsModal();
                populateKeywordSearchResultsCarousel();
                modal.style.display = 'block';

                // Close the entry modal
                closeKeywordSearchModal();
            } catch (e) {
                console.error('Keyword search failed:', e);
                showErrorPopup('Failed to generate keyword-based categories. Please try again.', 'Keyword Search Failed');
            }
        }

        function createCategoriesReviewModal() {
            const modal = document.createElement('div');
            modal.id = 'categoriesReviewModal';
            modal.className = 'modal';
            modal.innerHTML = `
                <div class="modal-content" style="max-width: 85vw; width: 85vw; max-height: 85vh; display: flex; flex-direction: column; overflow: hidden;">
                    <div class="modal-header" style="flex: 0 0 auto;">
                        <h2 class="modal-title">Review Generated Categories</h2>
                        <button class="close" onclick="closeCategoriesReviewModal()">&times;</button>
                    </div>
                    <div style="padding: 16px; display: flex; flex-direction: column; gap: 12px; flex: 1 1 auto; min-height: 0;">
                            <div style="display: flex; gap: 12px; align-items: center; flex-wrap: wrap;">
                                <button class="select-email-btn" onclick="addNewCategory()">+ Add Category</button>
                                <button class="select-email-btn" onclick="promptRefreshCategoriesMode()">🔄 Refresh Categories</button>
                                <button class="select-email-btn" onclick="openCarouselEditing()">Carousel Editing</button>
                                <button class="select-email-btn" onclick="showSortUnrepliedPrompt()" title="Choose to view current grouping or refresh with keyword sort" style="background:#8b5cf6;">Sort Unreplied</button>
                                <button class="select-email-btn" onclick="showSummarizeCategoriesModal()" title="Generate or edit summaries for one or more categories" style="background:#17a2b8;">🧠 Summarize Categories</button>
                                <button class="select-email-btn" onclick="showSeeAllCategoriesModal()" title="View all categories with counts; delete will migrate emails to “Other”" style="background:#0ea5e9;">👁️ See All Categories</button>
                                <span style="color:#666; font-size:12px;">Drag emails between categories. Click “Approve & Save” to apply changes.</span>
                            </div>
                        <div id="categoriesEditorContainer" style="flex: 0 0 60vh; height: 60vh; min-height: 0; overflow: hidden;">
                            <div id="categoriesEditor" style="height: 100%; display:flex; gap:12px; overflow-x:auto; overflow-y:hidden; align-items: stretch; padding-bottom:8px;"></div>
                        </div>
                        <div style="display:flex; justify-content:center; gap:12px; margin-top: 8px; flex: 0 0 auto;">
                            <button class="carousel-btn carousel-btn-cancel" onclick="closeCategoriesReviewModal()">Cancel</button>
                            <button class="carousel-btn carousel-btn-add" onclick="approveAndSaveCategories()">Approve & Save</button>
                        </div>
                    </div>
                </div>
            `;
            // Close on click backdrop
            modal.addEventListener('click', (ev) => {
                if (ev.target === modal) closeCategoriesReviewModal();
            });
            return modal;
        }

        function closeCategoriesReviewModal() {
            const modal = document.getElementById('categoriesReviewModal');
            if (modal) modal.style.display = 'none';
        }

        function renderCategoriesEditor() {
            const editor = document.getElementById('categoriesEditor');
            if (!editor) return;
            editor.innerHTML = '';

            if (!Array.isArray(categoriesState) || categoriesState.length === 0) {
                editor.innerHTML = '<div class="loading" style="width:100%;">No categories generated.</div>';
                return;
            }

            categoriesState.forEach((cat, index) => {
                const col = document.createElement('div');
                col.className = 'category-column';
                col.setAttribute('data-category', cat.name);
                col.setAttribute('ondragover', 'categoriesAllowDrop(event)');
                col.setAttribute('ondrop', `categoriesHandleDrop(event, ${index})`);
                col.style.minWidth = '420px';
                col.style.background = '#f8f9fa';
                col.style.border = '1px solid #e9ecef';
                col.style.borderRadius = '8px';
                col.style.padding = '12px';
                col.style.display = 'flex';
                col.style.flexDirection = 'column';
                col.style.height = '100%';

                const header = document.createElement('div');
                header.style.display = 'flex';
                header.style.alignItems = 'center';
                header.style.justifyContent = 'space-between';
                header.style.marginBottom = '8px';

                const title = document.createElement('div');
                title.style.display = 'flex';
                title.style.alignItems = 'center';
                title.style.gap = '8px';

                const nameSpan = document.createElement('span');
                nameSpan.textContent = cat.name;
                nameSpan.style.fontWeight = '600';
                nameSpan.style.fontSize = '14px';

                const renameBtn = document.createElement('button');
                renameBtn.textContent = 'Rename';
                renameBtn.className = 'select-email-btn';
                renameBtn.style.padding = '4px 8px';
                renameBtn.style.fontSize = '12px';
                renameBtn.addEventListener('click', () => renameCategory(index));

                const notesBtn = document.createElement('button');
                notesBtn.textContent = 'See Notes';
                notesBtn.className = 'select-email-btn';
                notesBtn.style.padding = '4px 8px';
                notesBtn.style.fontSize = '12px';
                notesBtn.style.background = '#6c757d';
                notesBtn.style.borderColor = '#6c757d';
                notesBtn.addEventListener('click', () => showCategoryNotesModal(cat.name));

                const summaryBtn = document.createElement('button');
                summaryBtn.textContent = 'View Summary';
                summaryBtn.className = 'select-email-btn';
                summaryBtn.style.padding = '4px 8px';
                summaryBtn.style.fontSize = '12px';
                summaryBtn.style.background = '#5a67d8';
                summaryBtn.style.borderColor = '#5a67d8';
                summaryBtn.title = 'View/edit the saved summary and ask questions';
                summaryBtn.addEventListener('click', () => showCategorySummaryModal(cat.name));

                title.appendChild(nameSpan);
                title.appendChild(renameBtn);
                title.appendChild(notesBtn);
                title.appendChild(summaryBtn);
                // Add "Suggest Categories" for the Other bucket
                try {
                    if (String(cat.name || '').toLowerCase() === 'other') {
                        const suggestBtn = document.createElement('button');
                        suggestBtn.textContent = 'Suggest Categories';
                        suggestBtn.className = 'select-email-btn';
                        suggestBtn.style.padding = '4px 8px';
                        suggestBtn.style.fontSize = '12px';
                        suggestBtn.style.background = '#17a2b8';
                        suggestBtn.style.borderColor = '#17a2b8';
                        suggestBtn.title = 'Use AI and rules to suggest new categories from Other';
                        suggestBtn.addEventListener('click', () => openSuggestCategoriesModal(index));
                        title.appendChild(suggestBtn);
                    }
                } catch (e) {
                    console.error('Failed to attach Suggest Categories button:', e);
                }

                const count = document.createElement('span');
                count.className = 'category-count';
                count.textContent = (cat.emails || []).length;

                header.appendChild(title);
                header.appendChild(count);

                const list = document.createElement('div');
                list.className = 'category-email-list';
                list.style.display = 'flex';
                list.style.flexDirection = 'column';
                list.style.gap = '8px';
                list.style.flex = '1 1 auto';
                list.style.minHeight = '0';
                list.style.overflowY = 'auto';
                list.style.paddingRight = '8px';
                list.style.webkitOverflowScrolling = 'touch';

                (cat.emails || []).forEach(e => {
                    const item = document.createElement('div');
                    item.className = 'category-email';
                    item.setAttribute('draggable', 'true');
                    item.setAttribute('ondragstart', `categoriesDragStart(event, '${e.id}')`);
                    item.style.border = '1px solid #e9ecef';
                    item.style.background = 'white';
                    item.style.borderLeft = '4px solid #c19a6b';
                    item.style.borderRadius = '6px';
                    item.style.padding = '8px';

                    const subj = document.createElement('div');
                    subj.style.fontWeight = '600';
                    subj.style.fontSize = '13px';
                    subj.style.color = '#333';
                    subj.textContent = e.subject || 'No Subject';

                    const meta = document.createElement('div');
                    meta.style.fontSize = '12px';
                    meta.style.color = '#666';
                    meta.textContent = `${(e.from || 'Unknown').toString()} • ${formatDate(e.date || new Date().toISOString())}`;

                    const prev = document.createElement('div');
                    prev.style.fontSize = '12px';
                    prev.style.color = '#777';
                    prev.style.marginTop = '4px';
                    prev.textContent = (e.snippet || '').toString();

                    item.appendChild(subj);
                    item.appendChild(meta);
                    item.appendChild(prev);

                    list.appendChild(item);
                });

                col.appendChild(header);
                col.appendChild(list);
                editor.appendChild(col);
            });
        }

        /* ===== Suggest Categories from "Other" (Rules + AI) ===== */
let suggestCategoriesState = {
    otherIndex: -1,
    suggestions: [], // [{ name, emailIds: [], source }]
    selected: new Set(), // indices of suggestions selected
    keywords: [] // user-entered keywords for additional category suggestions
};

function ensureSuggestCategoriesModal() {
    let modal = document.getElementById('suggestCategoriesModal');
    if (modal) return modal;
    modal = document.createElement('div');
    modal.id = 'suggestCategoriesModal';
    modal.className = 'modal';
    modal.innerHTML = `
        <div class="modal-content" style="max-width: 900px; max-height: 80vh;">
            <div class="modal-header" style="border-bottom: 2px solid #17a2b8;">
                <h2 class="modal-title">Suggested Categories from "Other"</h2>
                <button class="close" onclick="closeSuggestCategoriesModal()">&times;</button>
            </div>

            <!-- Additional Keywords toolbar -->
            <div style="padding: 12px 16px; border-bottom: 1px solid #e9ecef;">
                <div style="display:flex; justify-content:space-between; align-items:center; margin-bottom:8px;">
                    <div style="font-weight:600; color:#333;">Additional Keywords</div>
                                    <div style="display:flex; gap:8px;">
                                        <button type="button" id="seeCategorySummaryBtn" class="select-email-btn" style="display:none;">See Category Summary</button>
                                        <button type="button" id="seeCategoryNotesBtn" class="select-email-btn" style="display:none;">See Category Notes</button>
                                        <button type="button" id="seeEmailNotesBtn" class="select-email-btn" style="display:none;">See Email Notes</button>
                                    </div>
                </div>
                <div id="suggestKeywordsEditor"></div>
                <div style="color:#666; font-size:12px; margin-top:6px;">
                    Enter one or more keywords. We will search emails in “Other” and propose additional category suggestions for each keyword.
                </div>
            </div>

            <div id="suggestCategoriesBody" style="padding: 16px; max-height: 60vh; overflow: auto;">
                <div class="loading">Computing suggestions...</div>
            </div>
            <div style="display:flex; justify-content:center; gap:12px; padding: 12px 16px; border-top:1px solid #e9ecef;">
                <button class="carousel-btn carousel-btn-cancel" onclick="closeSuggestCategoriesModal()">Cancel</button>
                <button class="carousel-btn carousel-btn-add" onclick="applySuggestedCategoriesFromOther()">Save</button>
            </div>
        </div>
    `;
    modal.addEventListener('click', (ev) => { if (ev.target === modal) closeSuggestCategoriesModal(); });
    document.body.appendChild(modal);

    // Wire keyword toolbar buttons
    try {
        const addBtn = modal.querySelector('#sugAddKwBtn');
        const findBtn = modal.querySelector('#sugFindKwBtn');
        if (addBtn) addBtn.addEventListener('click', addSuggestKeywordRow);
        if (findBtn) findBtn.addEventListener('click', generateKeywordSuggestionsFromOther);
    } catch (e) {
        console.warn('Failed to wire keyword toolbar buttons:', e);
    }

    return modal;
}

function closeSuggestCategoriesModal() {
    const modal = document.getElementById('suggestCategoriesModal');
    if (modal) modal.style.display = 'none';
    suggestCategoriesState = { otherIndex: -1, suggestions: [], selected: new Set(), keywords: [] };
}

/* ===== Suggest Categories – Additional Keyword helpers ===== */
function renderSuggestKeywordsEditor() {
    try {
        const host = document.getElementById('suggestKeywordsEditor');
        if (!host) return;
        if (!Array.isArray(suggestCategoriesState.keywords) || !suggestCategoriesState.keywords.length) {
            suggestCategoriesState.keywords = [''];
        }
        host.innerHTML = suggestCategoriesState.keywords.map((kw, i) => `
            <div style="display:flex; gap:8px; align-items:center; margin-bottom:8px;">
                <input type="text"
                       value="${String(kw || '').replace(/&/g,'&').replace(/</g,'<').replace(/>/g,'>').replace(/"/g,'"')}"
                       oninput="suggestCategoriesState.keywords[${i}] = this.value"
                       placeholder="Enter keyword..."
                       style="flex:1; padding:8px; border:1px solid #ddd; border-radius:6px; font-size:14px;">
                <button class="refinement-delete-btn" style="padding:6px 10px; font-size:12px;" onclick="removeSuggestKeywordRow(${i})">Delete</button>
            </div>
        `).join('');
    } catch (e) {
        console.error('renderSuggestKeywordsEditor failed:', e);
    }
}
function addSuggestKeywordRow() {
    try {
        if (!Array.isArray(suggestCategoriesState.keywords)) suggestCategoriesState.keywords = [];
        suggestCategoriesState.keywords.push('');
        renderSuggestKeywordsEditor();
    } catch (e) {
        console.error('addSuggestKeywordRow failed:', e);
    }
}
function removeSuggestKeywordRow(i) {
    try {
        if (!Array.isArray(suggestCategoriesState.keywords)) suggestCategoriesState.keywords = [];
        suggestCategoriesState.keywords.splice(i, 1);
        if (!suggestCategoriesState.keywords.length) suggestCategoriesState.keywords.push('');
        renderSuggestKeywordsEditor();
    } catch (e) {
        console.error('removeSuggestKeywordRow failed:', e);
    }
}
function generateKeywordSuggestionsFromOther() {
    try {
        const otherIdx = suggestCategoriesState.otherIndex;
        const otherCat = (categoriesState || [])[otherIdx];

        // Build pools: ALL emails across categories, and ONLY "Other" emails
        const allEmailObjs = Array.isArray(categoriesState)
            ? categoriesState.flatMap(c => Array.isArray(c.emails) ? c.emails : [])
            : [];
        const otherEmailObjs = Array.isArray(otherCat?.emails) ? otherCat.emails : [];

        const raw = (suggestCategoriesState.keywords || []).map(s => String(s || '').trim()).filter(Boolean);
        if (!raw.length) {
            showErrorPopup('Please enter at least one keyword.', 'No Keywords');
            return;
        }
        if (!allEmailObjs.length) {
            showErrorPopup('No emails available to search. Try refreshing categories first.', 'No Emails');
            return;
        }

        // Whole-word, case-insensitive patterns
        const esc = (s) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
        const patterns = raw.map(k => ({ name: k, re: new RegExp(`\\b${esc(k)}\\b`, 'i') }));

        // Quick lookup sets
        const otherIdSet = new Set(otherEmailObjs.map(e => e && e.id).filter(Boolean));

        // For each keyword, search ACROSS ALL emails to decide if a suggestion is relevant,
        // but collect emailIds ONLY from "Other" for actual movement on Save.
        const newSug = [];
        for (const p of patterns) {
            let anyMatchAcrossAll = false;
            const otherIds = [];

            for (const e of allEmailObjs) {
                const subj = String(e?.subject || '');
                const snip = String(e?.snippet || '');
                const hit = p.re.test(subj) || p.re.test(snip);
                if (hit) {
                    anyMatchAcrossAll = true;
                    if (otherIdSet.has(e.id)) otherIds.push(e.id);
                }
            }

            // Only add a suggestion if the keyword matches something in the dataset at all.
            // emailIds reflect only "Other" emails so Save will move those out of "Other".
            if (anyMatchAcrossAll) {
                const uniqOtherIds = Array.from(new Set(otherIds));
                newSug.push({ name: p.name, emailIds: uniqOtherIds, source: 'keyword' });
            }
        }

        if (!newSug.length) {
            showErrorPopup('No matches found for the provided keywords across your emails.', 'No Matches');
            return;
        }

        // Merge into suggestions list, de-dup by name (case-insensitive), union of emailIds (still Other-only)
        const existing = suggestCategoriesState.suggestions || [];
        const map = new Map(); // name lc -> { name, set, source }
        existing.forEach(s => {
            const key = String(s?.name || '').toLowerCase();
            if (!key) return;
            const set = new Set(Array.isArray(s.emailIds) ? s.emailIds : []);
            map.set(key, { name: s.name, set, source: s.source || 'ai' });
        });
        newSug.forEach(s => {
            const key = String(s.name || '').toLowerCase();
            if (!map.has(key)) {
                map.set(key, { name: s.name, set: new Set(s.emailIds || []), source: s.source || 'keyword' });
            } else {
                const ent = map.get(key);
                (s.emailIds || []).forEach(id => ent.set.add(id));
                if (ent.source !== 'keyword') ent.source = 'keyword';
            }
        });

        suggestCategoriesState.suggestions = Array.from(map.values()).map(x => ({
            name: x.name,
            emailIds: Array.from(x.set),
            source: x.source || 'keyword'
        }));
        renderSuggestCategoriesList();
        showSuccessPopup('Added keyword-based suggestions (searched across all emails). Select the ones you want to create.', 'Suggestions Added');
    } catch (e) {
        console.error('generateKeywordSuggestionsFromOther failed:', e);
        showErrorPopup('Failed to compute keyword suggestions. Please try again.', 'Suggest Failed');
    }
}

async function openSuggestCategoriesModal(otherIndex) {
    try {
        const modal = ensureSuggestCategoriesModal();
        const body = document.getElementById('suggestCategoriesBody');
        suggestCategoriesState.otherIndex = otherIndex;
        suggestCategoriesState.suggestions = [];
        suggestCategoriesState.selected = new Set();
    if (body) body.innerHTML = '<div class="loading">Computing suggestions...</div>';
    modal.style.display = 'block';
    // Initialize keyword editor
    suggestCategoriesState.keywords = [''];
    renderSuggestKeywordsEditor();

        const otherCat = (categoriesState || [])[otherIndex];
        const emailObjs = Array.isArray(otherCat?.emails) ? otherCat.emails : [];
        if (!emailObjs.length) {
            if (body) body.innerHTML = '<div class="no-emails" style="padding: 12px;">No emails in "Other" to suggest from.</div>';
            return;
        }
        const emailIds = emailObjs.map(e => e.id).filter(Boolean);
        const resp = await fetch('/api/suggest-categories-from-other', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ emailIds })
        });
        const data = await resp.json().catch(() => ({}));
        const suggestions = Array.isArray(data?.suggestions) ? data.suggestions : [];
        suggestCategoriesState.suggestions = suggestions;

        renderSuggestCategoriesList();
    } catch (e) {
        console.error('openSuggestCategoriesModal failed:', e);
        showErrorPopup('Failed to suggest categories. Please try again.', 'Suggest Failed');
        try { closeSuggestCategoriesModal(); } catch (_) {}
    }
}

function renderSuggestCategoriesList() {
    const body = document.getElementById('suggestCategoriesBody');
    if (!body) return;
    const list = suggestCategoriesState.suggestions || [];
    if (!list.length) {
        body.innerHTML = '<div class="no-emails" style="padding: 12px;">No suggestions available. Try adding more emails to "Other".</div>';
        return;
    }
    const srcBadge = (src) => {
        const label = src === 'person' ? 'Person' : src === 'topic' ? 'Topic' : 'AI';
        const color = src === 'person' ? '#6f42c1' : (src === 'topic' ? '#17a2b8' : '#4285f4');
        return `<span style="display:inline-block; padding:2px 6px; border-radius:10px; font-size:11px; color:#fff; background:${color};">${label}</span>`;
    };
    const rows = list.map((sug, idx) => {
        const count = Array.isArray(sug.emailIds) ? sug.emailIds.length : 0;
        const checked = suggestCategoriesState.selected.has(idx) ? 'checked' : '';
        const safeName = String(sug.name || '').replace(/&/g,'&').replace(/</g,'<').replace(/>/g,'>').replace(/"/g,'"');
        return `
            <label style="display:flex; align-items:center; justify-content:space-between; gap:12px; border:1px solid #e9ecef; border-left:4px solid #c19a6b; border-radius:6px; padding:10px; margin-bottom:8px; background:#fff;">
                <div style="display:flex; align-items:center; gap:10px; min-width:0;">
                    <input type="checkbox" data-suggest-idx="${idx}" ${checked} onchange="toggleSuggestCategorySelection(${idx}, this.checked)">
                    <div style="min-width:0;">
                        <div style="font-weight:600; color:#333; font-size:14px; overflow:hidden; text-overflow:ellipsis;">${safeName}</div>
                        <div style="font-size:12px; color:#666;">${srcBadge(sug.source || 'ai')} • ${count} email${count===1?'':'s'}</div>
                    </div>
                </div>
            </label>
        `;
    }).join('');
    body.innerHTML = `
        <div style="margin-bottom:8px; color:#666; font-size:13px;">
            Select the categories you want to add. Each category contains at least 5 emails. On save, emails are moved out of "Other" into the new categories.
        </div>
        ${rows}
    `;
}

function toggleSuggestCategorySelection(idx, isChecked) {
    if (isChecked) suggestCategoriesState.selected.add(idx);
    else suggestCategoriesState.selected.delete(idx);
}

function applySuggestedCategoriesFromOther() {
    try {
        const otherIdx = suggestCategoriesState.otherIndex;
        if (otherIdx < 0 || otherIdx >= categoriesState.length) {
            closeSuggestCategoriesModal();
            return;
        }
        const otherCat = categoriesState[otherIdx] || { emails: [] };
        const otherEmails = Array.isArray(otherCat.emails) ? otherCat.emails : [];
        const byId = new Map(otherEmails.map(e => [e.id, e]));
        const selectedIdxs = Array.from(suggestCategoriesState.selected.values()).sort((a,b)=>a-b);
        if (!selectedIdxs.length) {
            closeSuggestCategoriesModal();
            return;
        }

        // Merge-or-create target categories; collect ids to remove from Other
        const toRemove = new Set();
        selectedIdxs.forEach(si => {
            const sug = suggestCategoriesState.suggestions[si];
            if (!sug || !Array.isArray(sug.emailIds) || !sug.emailIds.length) return;
            const targetName = String(sug.name || 'New Category').trim() || 'New Category';
            // Find existing category with same name (case-insensitive)
            const existingIdx = categoriesState.findIndex(c => String(c?.name || '').toLowerCase() === targetName.toLowerCase());
            if (existingIdx !== -1 && existingIdx !== otherIdx) {
                // Merge into existing category
                const dest = categoriesState[existingIdx];
                dest.emails = Array.isArray(dest.emails) ? dest.emails : [];
                sug.emailIds.forEach(id => {
                    const obj = byId.get(id);
                    if (obj && !dest.emails.some(e => e.id === obj.id)) {
                        dest.emails.push(obj);
                        toRemove.add(id);
                    }
                });
            } else {
                // Create new category before Other
                const newEmails = [];
                sug.emailIds.forEach(id => {
                    const obj = byId.get(id);
                    if (obj) {
                        newEmails.push(obj);
                        toRemove.add(id);
                    }
                });
                categoriesState.splice(Math.max(0, otherIdx), 0, {
                    name: targetName,
                    originalName: targetName,
                    emails: newEmails
                });
                // Adjust otherIdx because we inserted before it
                if (otherIdx >= 0) {
                    suggestCategoriesState.otherIndex += 1;
                }
            }
        });

        // Remove moved ids from Other
        if (toRemove.size) {
            categoriesState[suggestCategoriesState.otherIndex].emails =
                categoriesState[suggestCategoriesState.otherIndex].emails.filter(e => !toRemove.has(e.id));
        }

        // Ensure "Other" is at the far right
        try {
            let oi = categoriesState.findIndex(c => String(c?.name || '').toLowerCase() === 'other');
            if (oi !== -1 && oi !== categoriesState.length - 1) {
                const otherCol = categoriesState.splice(oi, 1)[0];
                categoriesState.push(otherCol);
            }
        } catch (_) {}

        // Re-render the editor UI
        renderCategoriesEditor();
        closeSuggestCategoriesModal();
        showSuccessPopup('Added suggested categories. You can continue organizing or Approve & Save.', 'Categories Added');
    } catch (e) {
        console.error('applySuggestedCategoriesFromOther failed:', e);
        showErrorPopup('Failed to apply suggestions. Please try again.', 'Apply Failed');
    }
}

function addNewCategory() {
            let base = 'New Category';
            let name = base;
            const existing = new Set(categoriesState.map(c => c.name));
            let i = 1;
            while (existing.has(name)) {
                i += 1;
                name = `${base} ${i}`;
            }
            categoriesState.push({ name, originalName: name, emails: [] });
            renderCategoriesEditor();
        }

        function renameCategory(index) {
            const current = categoriesState[index]?.name || 'Category';

            showInputPopup({
                title: 'Rename Category',
                label: 'New category name:',
                value: current,
                placeholder: 'Enter category name',
                primaryText: 'Save',
                secondaryText: 'Cancel',
                onPrimary: (newNameRaw) => {
                    const newName = (newNameRaw || '').trim();
                    if (!newName) {
                        showErrorPopup('Please enter a valid category name.', 'Rename Failed');
                        return;
                    }
                    // Ensure uniqueness
                    const exists = categoriesState.some((c, i) => i !== index && c.name.toLowerCase() === newName.toLowerCase());
                    if (exists) {
                        showErrorPopup('A category with that name already exists.', 'Rename Failed');
                        return;
                    }

                    if (!categoriesState[index].originalName) { categoriesState[index].originalName = current; }
categoriesState[index].renamedFrom = current;
categoriesState[index].name = newName;

                    // Update current assignments pointing to the old name
                    const newAssignments = {};
                    categoriesState.forEach(cat => {
                        (cat.emails || []).forEach(e => { newAssignments[e.id] = cat.name; });
                    });
                    categoryAssignments = newAssignments;

                    renderCategoriesEditor();
                }
            });
        }

        function categoriesDragStart(ev, emailId) {
            try { ev.dataTransfer.setData('text/plain', emailId); } catch (e) {}
        }

        function categoriesAllowDrop(ev) {
            ev.preventDefault();
        }

        function categoriesHandleDrop(ev, targetIndex) {
            ev.preventDefault();
            let emailId = '';
            try { emailId = ev.dataTransfer.getData('text/plain'); } catch (e) {}
            if (!emailId) return;

            moveEmailToCategory(emailId, targetIndex);
        }

        function moveEmailToCategory(emailId, targetIndex) {
            if (targetIndex < 0 || targetIndex >= categoriesState.length) return;

            // Find current location
            let foundIndex = -1;
            let emailObj = null;
            categoriesState.forEach((cat, ci) => {
                const idx = (cat.emails || []).findIndex(e => e.id === emailId);
                if (idx !== -1) {
                    foundIndex = ci;
                    emailObj = cat.emails[idx];
                }
            });

            if (!emailObj) return;
            if (foundIndex === targetIndex) return;

            // Remove from old
            categoriesState[foundIndex].emails = categoriesState[foundIndex].emails.filter(e => e.id !== emailId);
            // Add to new
            categoriesState[targetIndex].emails.push(emailObj);
            // Update assignment
            categoryAssignments[emailId] = categoriesState[targetIndex].name;

            renderCategoriesEditor();
        }

        async function approveAndSaveCategories() {
            try {
                // Send explicit assignments to guarantee IDs map to category moves.
                const assignments = {};
                categoriesState.forEach(cat => {
                    const name = (cat && cat.name) ? String(cat.name) : '';
                    (cat && Array.isArray(cat.emails) ? cat.emails : []).forEach(e => {
                        if (e && e.id && name) assignments[e.id] = name;
                    });
                });
                const body = { assignments, categories: categoriesState };

                const resp = await fetch('/api/save-categories', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify(body)
                });
                const data = await resp.json();
                if (!resp.ok || !data.success) {
                    throw new Error(data.error || 'Failed to save categories');
                }

                // Reflect changes in-memory
                // Build map from categoriesState
                const map = {};
                categoriesState.forEach(cat => {
                    (cat.emails || []).forEach(e => { if (e && e.id) map[e.id] = cat.name; });
                });

                // Update allEmails categories
                allEmails = (allEmails || []).map(email => {
                    const newCat = map[email.id];
                    return newCat ? { ...email, category: newCat } : email;
                });

                // Refresh UI: categories and list
                await loadCurrentCategories();
                populateCategories(allEmails);
                currentFilter = 'all';
                filterByCategory('all');
                updateDisplayStats(allEmails);

                // Also refresh the inbox/unreplied emails view so "Load Email From Inbox" reflects updated categories
                await loadUnrepliedEmails();
                const selectEmailModalEl = document.getElementById('selectEmailModal');
                if (selectEmailModalEl && selectEmailModalEl.style.display === 'block') {
                    populateUnrepliedEmails();
                }

                closeCategoriesReviewModal();
                showSuccessPopup(`Categories updated successfully! ${data.updatedCount || 0} email(s) re-categorized.`, 'Categories Saved');
            } catch (err) {
                console.error('Error saving categories:', err);
                showErrorPopup('Failed to save categories. Please try again.', 'Save Failed');
            }
        }

        // Category Notes Modal and CRUD
        let currentNotesCategory = '';

        function ensureCategoryNotesModal() {
            let modal = document.getElementById('categoryNotesModal');
            if (modal) return modal;

            modal = document.createElement('div');
            modal.id = 'categoryNotesModal';
            modal.className = 'modal';
            modal.innerHTML = `
                <div class="modal-content" style="max-width: 700px; max-height: 80vh;">
                    <div class="modal-header">
                        <h2 class="modal-title">Notes for: <span id="categoryNotesTitle"></span></h2>
                        <button class="close" onclick="closeCategoryNotesModal()">&times;</button>
                    </div>
                    <div style="padding: 16px; display: flex; flex-direction: column; gap: 12px; max-height: 60vh; overflow: hidden;">
                        <div style="display: flex; justify-content: space-between; align-items: center;">
                            <div style="color:#666; font-size: 14px;">Add and manage notes for this category</div>
                            <button class="select-email-btn" id="addCategoryNoteBtn">+ Add List Item</button>
                        </div>
                        <div id="categoryNotesList" style="flex: 1 1 auto; overflow-y: auto; border: 1px solid #e9ecef; border-radius: 8px; background: #fff; padding: 12px;">
                            <div class="loading">Loading notes...</div>
                        </div>
                    </div>
                </div>
            `;
            // Close on backdrop click
            modal.addEventListener('click', (ev) => {
                if (ev.target === modal) closeCategoryNotesModal();
            });
            document.body.appendChild(modal);

            // Wire Add button
            modal.querySelector('#addCategoryNoteBtn').addEventListener('click', addNoteForCurrentCategory);

            return modal;
        }

        function closeCategoryNotesModal() {
            const modal = document.getElementById('categoryNotesModal');
            if (modal) modal.style.display = 'none';
        }

        // Inject a summary section into the Category Notes modal and wire actions
        function ensureCategoryNotesSummaryInjected(modalEl) {
            try {
                const host = modalEl || document.getElementById('categoryNotesModal');
                if (!host) return;
                if (host.querySelector('#categorySummaryInNotes')) return;

                const contentBody = host.querySelector('.modal-content > div:nth-child(2)');
                if (!contentBody) return;

                const container = document.createElement('div');
                container.id = 'categorySummaryInNotes';
                container.style.border = '1px solid #e9ecef';
                container.style.borderLeft = '4px solid #5a67d8';
                container.style.borderRadius = '8px';
                container.style.background = '#fff';
                container.style.padding = '12px';
                container.style.marginBottom = '8px';
                container.innerHTML = `
                    <div style="display:flex; justify-content:space-between; align-items:center; margin-bottom:6px;">
                        <div style="font-weight:600; color:#333;">Category Summary</div>
                    </div>
                    <div id="categorySummaryText" style="white-space:pre-wrap; font-size:14px; color:#333; margin-bottom:10px;">Loading summary…</div>
                    <div style="border-top:1px solid #e9ecef; padding-top:10px;">
                        <div style="font-weight:600; color:#333; margin-bottom:6px;">Q&A</div>
                        <div id="catNotesChat" style="max-height:220px; overflow:auto; border:1px solid #e9ecef; border-radius:8px; padding:10px; background:#fff; margin-bottom:8px;">
                            <div style="color:#666; font-style:italic; text-align:center;">Start the conversation by asking a question about this category.</div>
                        </div>
                        <div style="display:flex; gap:8px;">
                            <input id="catNotesQuestionInput" type="text" placeholder="Type your question..." 
                                   style="flex:1; padding:10px; border:1px solid #ddd; border-radius:6px; font-size:14px;">
                            <button class="select-email-btn" style="background:#17a2b8;" id="catNotesSendBtn">Send</button>
                            <button class="select-email-btn" style="background:#6c757d;" id="catNotesResetBtn">Reset</button>
                        </div>
                    </div>
                `;

                // Insert at top of body, above notes toolbar
                contentBody.insertBefore(container, contentBody.firstChild);

                // Wire inline Q&A controls to existing logic
                const sendBtn = host.querySelector('#catNotesSendBtn');
                const resetBtn = host.querySelector('#catNotesResetBtn');
                const input = host.querySelector('#catNotesQuestionInput');
                if (sendBtn) sendBtn.onclick = () => { try { askCategoryQuestion(); } catch(_) {} };
                if (resetBtn) resetBtn.onclick = () => { try { resetCategoryChat(); } catch(_) {} };
                if (input) {
                    input.onkeydown = (ev) => {
                        if (ev.key === 'Enter') {
                            ev.preventDefault();
                            try { askCategoryQuestion(); } catch(_) {}
                        }
                    };
                }
            } catch (e) {}
        }

        async function loadCategorySummaryIntoNotesModal(category) {
            try {
                const resp = await fetch('/api/category-summaries');
                const data = await resp.json().catch(() => ({}));
                const summaries = (data && data.summaries) || {};
                const txt = summaries && typeof summaries[category] === 'string' ? summaries[category] : '(No summary saved)';
                const node = document.getElementById('categorySummaryText');
                if (node) node.textContent = txt;
            } catch (_) {
                const node = document.getElementById('categorySummaryText');
                if (node) node.textContent = '(Failed to load summary)';
            }
        }

        // ===== Category Summaries: selection, generation, editor, and per-category view/QA =====
        function ensureSummarizeCategoriesModal() {
            let modal = document.getElementById('summarizeCategoriesModal');
            if (modal) return modal;
            modal = document.createElement('div');
            modal.id = 'summarizeCategoriesModal';
            modal.className = 'modal';
            modal.innerHTML = `
                <div class="modal-content" style="max-width: 700px; max-height: 80vh;">
                    <div class="modal-header">
                        <h2 class="modal-title">Summarize Categories</h2>
                        <button class="close" onclick="closeSummarizeCategoriesModal()">&times;</button>
                    </div>
                    <div style="padding:16px; max-height:60vh; overflow:auto;">
                        <div style="color:#666; font-size:13px; margin-bottom:8px;">
                            Select one or more categories to summarize. You can edit and save the generated summaries.
                        </div>
                        <div id="summarizeCategoriesList" style="border:1px solid #e9ecef; border-radius:8px; background:#fff; padding:10px; max-height:45vh; overflow:auto;">
                            <div class="loading">Loading categories...</div>
                        </div>
                        <div style="margin-top:12px; display:flex; align-items:center; gap:10px;">
                            <label style="display:flex; align-items:center; gap:6px; font-size:13px; color:#333;">
                                <input type="checkbox" id="summarizeOverwriteCheckbox" checked>
                                <span>Overwrite existing summaries</span>
                            </label>
                        </div>
                    </div>
                    <div style="display:flex; justify-content:center; gap:12px; padding:12px 16px; border-top:1px solid #e9ecef;">
                        <button class="carousel-btn carousel-btn-cancel" onclick="closeSummarizeCategoriesModal()">Cancel</button>
                        <button class="carousel-btn carousel-btn-add" id="summarizeGenerateBtn" onclick="summarizeSelectedCategories()">
                            <span class="btn-text">Summarize</span>
                            <span class="btn-loading" style="display:none;">Summarizing...</span>
                        </button>
                    </div>
                </div>
            `;
            modal.addEventListener('click', (ev) => { if (ev.target === modal) closeSummarizeCategoriesModal(); });
            document.body.appendChild(modal);
            return modal;
        }

        function showSummarizeCategoriesModal() {
            const modal = ensureSummarizeCategoriesModal();
            const list = document.getElementById('summarizeCategoriesList');
            try {
                const names = Array.isArray(categoriesState) ? categoriesState.map(c => c && c.name).filter(Boolean) : [];
                if (!names.length) {
                    list.innerHTML = '<div class="no-emails" style="padding:10px;">No categories available.</div>';
                } else {
                    list.innerHTML = names.map((name, i) => `
                        <label style="display:flex; align-items:center; gap:10px; border:1px solid #e9ecef; border-radius:6px; padding:8px; margin-bottom:8px; background:#fafafa;">
                            <input type="checkbox" id="summ-cat-${i}" data-cat="${String(name).replace(/"/g, '"')}">
                            <span style="font-weight:600; color:#333;">${name}</span>
                        </label>
                    `).join('');
                }
            } catch (e) {
                list.innerHTML = '<div class="error">Failed to load categories.</div>';
            }
            modal.style.display = 'block';
        }

        function closeSummarizeCategoriesModal() {
            const modal = document.getElementById('summarizeCategoriesModal');
            if (modal) modal.style.display = 'none';
        }

        function ensureSummariesEditorModal() {
            let modal = document.getElementById('summariesEditorModal');
            if (modal) return modal;
            modal = document.createElement('div');
            modal.id = 'summariesEditorModal';
            modal.className = 'modal';
            modal.innerHTML = `
                <div class="modal-content" style="max-width: 900px; max-height: 80vh;">
                    <div class="modal-header">
                        <h2 class="modal-title">Edit Category Summaries</h2>
                        <button class="close" onclick="closeSummariesEditorModal()">&times;</button>
                    </div>
                    <div id="summariesEditorBody" style="padding:16px; max-height:60vh; overflow:auto;">
                        <div class="loading">Preparing editor...</div>
                    </div>
                    <div style="display:flex; justify-content:center; gap:12px; padding:12px 16px; border-top:1px solid #e9ecef;">
                        <button class="carousel-btn carousel-btn-cancel" onclick="closeSummariesEditorModal()">Close</button>
                        <button class="carousel-btn carousel-btn-add" id="saveSummariesBtn" onclick="saveEditedSummaries()">
                            <span class="btn-text">Save All</span>
                            <span class="btn-loading" style="display:none;">Saving...</span>
                        </button>
                    </div>
                </div>
            `;
            modal.addEventListener('click', (ev) => { if (ev.target === modal) closeSummariesEditorModal(); });
            document.body.appendChild(modal);
            return modal;
        }

        function renderSummariesEditor(summariesMap) {
            const host = document.getElementById('summariesEditorBody');
            if (!host) return;
            const names = Object.keys(summariesMap || {});
            if (!names.length) {
                host.innerHTML = '<div class="no-emails" style="padding:12px;">No summaries generated.</div>';
                return;
            }
            host.innerHTML = names.map(name => {
                const val = summariesMap[name] || '';
                return `
                    <div style="border:1px solid #e9ecef; border-left:4px solid #5a67d8; border-radius:6px; background:#fff; padding:10px; margin-bottom:10px;">
                        <div style="font-weight:600; color:#333; margin-bottom:6px;">${name}</div>
                        <textarea class="summary-editor" data-cat="${name.replace(/"/g, '"')}"
                                  style="width:100%; min-height:100px; padding:10px; border:1px solid #ddd; border-radius:6px; font-size:14px; resize:vertical;">${val.replace(/&/g,'&').replace(/</g,'<').replace(/>/g,'>').replace(/"/g,'"')}</textarea>
                    </div>
                `;
            }).join('');
        }

        async function summarizeSelectedCategories() {
            try {
                const btn = document.getElementById('summarizeGenerateBtn');
                const txt = btn ? btn.querySelector('.btn-text') : null;
                const ld = btn ? btn.querySelector('.btn-loading') : null;
                if (btn) btn.disabled = true;
                if (txt) txt.style.display = 'none';
                if (ld) ld.style.display = 'inline';

                const checks = Array.from(document.querySelectorAll('#summarizeCategoriesList input[type="checkbox"]'));
                const selected = checks.filter(c => c.checked).map(c => c.getAttribute('data-cat')).filter(Boolean);
                if (!selected.length) {
                    showErrorPopup('Please select at least one category.', 'No Categories Selected');
                    if (btn) btn.disabled = false;
                    if (txt) txt.style.display = 'inline';
                    if (ld) ld.style.display = 'none';
                    return;
                }
                const overwrite = !!document.getElementById('summarizeOverwriteCheckbox')?.checked;

                const resp = await fetch('/api/generate-category-summaries', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ categories: selected, overwrite })
                });
                const data = await resp.json();
                if (!resp.ok || !data.success) {
                    throw new Error(data.error || 'Generation failed');
                }

                // Open editor with results
                window.__tempSummaries__ = data.summaries || {};
                closeSummarizeCategoriesModal();
                const editor = ensureSummariesEditorModal();
                renderSummariesEditor(window.__tempSummaries__);
                editor.style.display = 'block';
            } catch (e) {
                console.error('summarizeSelectedCategories failed:', e);
                showErrorPopup('Failed to generate summaries. Please try again.', 'Summarize Failed');
            } finally {
                const btn = document.getElementById('summarizeGenerateBtn');
                const txt = btn ? btn.querySelector('.btn-text') : null;
                const ld = btn ? btn.querySelector('.btn-loading') : null;
                if (txt) txt.style.display = 'inline';
                if (ld) ld.style.display = 'none';
                if (btn) btn.disabled = false;
            }
        }

        function closeSummariesEditorModal() {
            const modal = document.getElementById('summariesEditorModal');
            if (modal) modal.style.display = 'none';
        }

        async function saveEditedSummaries() {
            try {
                const btn = document.getElementById('saveSummariesBtn');
                const txt = btn ? btn.querySelector('.btn-text') : null;
                const ld = btn ? btn.querySelector('.btn-loading') : null;
                if (btn) btn.disabled = true;
                if (txt) txt.style.display = 'none';
                if (ld) ld.style.display = 'inline';

                const fields = Array.from(document.querySelectorAll('#summariesEditorBody .summary-editor'));
                const summaries = {};
                fields.forEach(f => {
                    const name = f.getAttribute('data-cat');
                    const val = f.value || '';
                    if (name) summaries[name] = val;
                });

                const resp = await fetch('/api/category-summaries', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ summaries })
                });
                const data = await resp.json();
                if (!resp.ok || !data.success) {
                    throw new Error(data.error || 'Save failed');
                }

                showSuccessPopup('Summaries saved successfully.', 'Saved');
                closeSummariesEditorModal();
            } catch (e) {
                console.error('saveEditedSummaries failed:', e);
                showErrorPopup('Failed to save summaries. Please try again.', 'Save Failed');
            } finally {
                const btn = document.getElementById('saveSummariesBtn');
                const txt = btn ? btn.querySelector('.btn-text') : null;
                const ld = btn ? btn.querySelector('.btn-loading') : null;
                if (txt) txt.style.display = 'inline';
                if (ld) ld.style.display = 'none';
                if (btn) btn.disabled = false;
            }
        }

        function ensureCategorySummaryModal() {
            let modal = document.getElementById('categorySummaryModal');
            if (modal) return modal;
            modal = document.createElement('div');
            modal.id = 'categorySummaryModal';
            modal.className = 'modal';
            modal.innerHTML = `
                <div class="modal-content" style="max-width: 800px; max-height: 80vh;">
                    <div class="modal-header">
                        <h2 class="modal-title">Category Summary: <span id="catSummaryTitle"></span></h2>
                        <button class="close" onclick="closeCategorySummaryModal()">&times;</button>
                    </div>
                    <div style="padding:16px; display:flex; flex-direction:column; gap:12px; max-height:60vh; overflow:auto;">
                        <div>
                            <label style="display:block; font-weight:600; margin-bottom:6px; color:#333;">Summary</label>
                            <textarea id="catSummaryEditor" style="width:100%; min-height:160px; padding:10px; border:1px solid #ddd; border-radius:6px; font-size:14px; resize:vertical;"></textarea>
                            <div style="margin-top:8px; text-align:right;">
                                <button class="select-email-btn" style="background:#28a745;" onclick="saveCurrentCategorySummary()">
                                    Save Summary
                                </button>
                            </div>
                        </div>
                        <div style="border-top:1px solid #e9ecef; padding-top:10px;">
                            <label style="display:block; font-weight:600; margin-bottom:6px; color:#333;">Ask a Question</label>
                            <div id="catSummaryChat" style="max-height:240px; overflow:auto; border:1px solid #e9ecef; border-radius:8px; padding:10px; background:#fff; margin-bottom:8px;">
                                <div style="color:#666; font-style:italic; text-align:center;">Start the conversation by asking a question about this category.</div>
                            </div>
                            <div style="display:flex; gap:8px;">
                                <input id="catSummaryQuestionInput" type="text" placeholder="Type your question..." 
                                       style="flex:1; padding:10px; border:1px solid #ddd; border-radius:6px; font-size:14px;">
                                <button class="select-email-btn" style="background:#17a2b8;" onclick="askCategoryQuestion()">Send</button>
                                <button class="select-email-btn" style="background:#6c757d;" onclick="resetCategoryChat()">Reset</button>
                            </div>
                        </div>
                    </div>
                </div>
            `;
            modal.addEventListener('click', (ev) => { if (ev.target === modal) closeCategorySummaryModal(); });
            document.body.appendChild(modal);
            return modal;
        }

        function closeCategorySummaryModal() {
            const modal = document.getElementById('categorySummaryModal');
            if (modal) modal.style.display = 'none';
        }

        let __currentSummaryCategory = '';
        async function showCategorySummaryModal(category) {
            try {
                __currentSummaryCategory = category;
                const modal = ensureCategorySummaryModal();
                const titleEl = document.getElementById('catSummaryTitle');
                const editor = document.getElementById('catSummaryEditor');
                if (titleEl) titleEl.textContent = category;

                // Load existing summaries
                let existing = {};
                try {
                    const resp = await fetch('/api/category-summaries');
                    const data = await resp.json();
                    existing = data && data.summaries ? data.summaries : {};
                } catch (_) {}
                const txt = existing && typeof existing[category] === 'string' ? existing[category] : '';
                if (editor) editor.value = txt;

                // Initialize chat history for this category and render
                window.__categoryChats = window.__categoryChats || {};
                window.__categoryChats[category] = window.__categoryChats[category] || [];

                modal.style.display = 'block';

                // Render chat and wire Enter-to-send
                setTimeout(() => {
                    try {
                        renderCategoryChat(true);
                        const inputEl = document.getElementById('catSummaryQuestionInput');
                        if (inputEl) {
                            inputEl.onkeydown = (ev) => {
                                if (ev.key === 'Enter') {
                                    ev.preventDefault();
                                    askCategoryQuestion();
                                }
                            };
                            inputEl.focus();
                        }
                    } catch (_) {}
                }, 0);
            } catch (e) {
                console.error('showCategorySummaryModal failed:', e);
                showErrorPopup('Failed to load summary.', 'Load Failed');
            }
        }

        async function saveCurrentCategorySummary() {
            try {
                const editor = document.getElementById('catSummaryEditor');
                const val = editor ? editor.value : '';
                const resp = await fetch('/api/category-summaries', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ name: __currentSummaryCategory, summary: val })
                });
                const data = await resp.json();
                if (!resp.ok || !data.success) {
                    throw new Error(data.error || 'Save failed');
                }
                showSuccessPopup('Summary saved.', 'Saved');
            } catch (e) {
                console.error('saveCurrentCategorySummary failed:', e);
                showErrorPopup('Failed to save summary.', 'Save Failed');
            }
        }

        async function askCategoryQuestion() {
            try {
                const input = document.getElementById('catSummaryQuestionInput') || document.getElementById('catNotesQuestionInput');
                const q = input ? String(input.value || '').trim() : '';
                if (!q) {
                    showErrorPopup('Please enter a question.', 'Missing Question');
                    return;
                }

                // Clear input immediately
                if (input) input.value = '';

                // Ensure chat store for current category
                const cat = __currentSummaryCategory;
                window.__categoryChats = window.__categoryChats || {};
                const chat = (window.__categoryChats[cat] = window.__categoryChats[cat] || []);

                // Append user message and a placeholder assistant "Thinking..."
                chat.push({ role: 'user', content: q });
                chat.push({ role: 'assistant', content: 'Thinking...' });
                renderCategoryChat(true);

                // Send with full history excluding the last placeholder
                const history = chat.slice(0, chat.length - 1);

                const resp = await fetch('/api/category-summary-qa', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ category: cat, question: q, history })
                });
                const data = await resp.json();

                // Replace placeholder with real answer
                const answerText = (resp.ok && data && data.success && data.answer) ? data.answer : "I don't have enough information to answer that confidently.";
                chat[chat.length - 1] = { role: 'assistant', content: normalizeChatContent(answerText) };
                renderCategoryChat(true);
            } catch (e) {
                console.error('askCategoryQuestion failed:', e);
                // Fallback: replace placeholder if present
                try {
                    const chat = window.__categoryChats?.[__currentSummaryCategory];
                    if (Array.isArray(chat) && chat.length && chat[chat.length - 1]?.content === 'Thinking...') {
                        chat[chat.length - 1] = { role: 'assistant', content: "I couldn't get an answer right now." };
                        renderCategoryChat(true);
                    }
                } catch (_) {}
                showErrorPopup('Failed to answer question.', 'Q&A Failed');
            }
        }

function renderCategoryChat(scrollToEnd) {
            try {
                const host = document.getElementById('catSummaryChat') || document.getElementById('catNotesChat');
                if (!host) return;
                const cat = __currentSummaryCategory;
                const chat = (window.__categoryChats && window.__categoryChats[cat]) ? window.__categoryChats[cat] : [];

                if (!chat.length) {
                    host.innerHTML = '<div style="color:#666; font-style:italic; text-align:center;">Start the conversation by asking a question about this category.</div>';
                } else {
                    host.innerHTML = chat.map(m => {
                        const isUser = String(m.role || '') === 'user';
                        const align = isUser ? 'flex-end' : 'flex-start';
                        const bg = isUser ? '#e3f2fd' : '#f8f9fa';
                        const border = isUser ? '#90caf9' : '#e9ecef';
                        const safe = escapeHtml(normalizeChatContent(m.content || ''));
                        return `
                            <div style="display:flex; justify-content:${align}; margin:4px 0;">
                                <div style="max-width:55%; white-space:pre-wrap; padding:6px 8px; border:1px solid ${border}; border-radius:6px; background:${bg}; color:#333; font-size:12.5px; line-height:1.35; text-indent:0;">
                                    ${safe}
                                </div>
                            </div>
                        `;
                    }).join('');
                }

                if (scrollToEnd) {
                    host.scrollTop = host.scrollHeight;
                } else {
                    setTimeout(() => { try { host.scrollTop = host.scrollHeight; } catch(_){} }, 0);
                }
            } catch (e) {
                console.error('renderCategoryChat failed:', e);
            }
        }

function resetCategoryChat() {
            try {
                const cat = __currentSummaryCategory;
                if (!cat) return;
                window.__categoryChats = window.__categoryChats || {};
                window.__categoryChats[cat] = [];
                renderCategoryChat(true);
            } catch (e) {
                console.error('resetCategoryChat failed:', e);
            }
        }

        async function showCategoryNotesModal(category) {
            currentNotesCategory = category;
            __currentSummaryCategory = category;
            const modal = ensureCategoryNotesModal();
            const titleEl = modal.querySelector('#categoryNotesTitle');
            titleEl.textContent = category;
            modal.style.display = 'block';

            // Ensure a summary section exists and populate it; render chat inline
            try {
                ensureCategoryNotesSummaryInjected(modal);
                await loadCategorySummaryIntoNotesModal(category);
                renderCategoryChat(true);
            } catch (_) {}

            await loadCategoryNotes(category);
        }

        async function loadCategoryNotes(category) {
            const list = document.getElementById('categoryNotesList');
            if (!list) return;
            list.innerHTML = '<div class="loading">Loading notes...</div>';
            try {
                const resp = await fetch(`/api/notes?category=${encodeURIComponent(category)}`);
                const data = await resp.json();
                const notes = Array.isArray(data.notes) ? data.notes : [];
                renderCategoryNotesList(category, notes);
            } catch (e) {
                console.error('Failed to load notes:', e);
                list.innerHTML = '<div class="error">Failed to load notes. Please try again.</div>';
            }
        }

        function renderCategoryNotesList(category, notes) {
            const list = document.getElementById('categoryNotesList');
            if (!list) return;

            if (!notes.length) {
                list.innerHTML = `
                    <div style="text-align:center; color:#666; padding:24px;">
                        No notes yet. Click "Add List Item" to create your first note.
                    </div>
                `;
                return;
            }

            list.innerHTML = '';
            notes.forEach(note => {
                const row = document.createElement('div');
                row.style.display = 'flex';
                row.style.alignItems = 'flex-start';
                row.style.justifyContent = 'space-between';
                row.style.gap = '12px';
                row.style.border = '1px solid #e9ecef';
                row.style.borderLeft = '4px solid #c19a6b';
                row.style.borderRadius = '6px';
                row.style.padding = '10px';
                row.style.marginBottom = '8px';
                row.setAttribute('data-note-id', note.id);

                const left = document.createElement('div');
                left.style.flex = '1 1 auto';
                left.style.color = '#333';
                left.style.whiteSpace = 'pre-wrap';
                left.textContent = note.text || '';

                const right = document.createElement('div');
                right.style.display = 'flex';
                right.style.alignItems = 'center';
                right.style.gap = '8px';

                const scopeSelect = document.createElement('select');
                scopeSelect.style.padding = '4px 8px';
                scopeSelect.style.fontSize = '12px';
                scopeSelect.style.border = '1px solid #ddd';
                scopeSelect.style.borderRadius = '4px';
                const scopes = ['GLOBAL', 'LOCAL'];
                scopes.forEach(s => {
                    const opt = document.createElement('option');
                    opt.value = s;
                    opt.textContent = s === 'GLOBAL' ? 'Global' : 'Local';
                    if ((note.scope || 'GLOBAL') === s) opt.selected = true;
                    scopeSelect.appendChild(opt);
                });

                const saveScopeBtn = document.createElement('button');
                saveScopeBtn.className = 'popup-btn popup-btn-success';
                saveScopeBtn.style.padding = '4px 8px';
                saveScopeBtn.style.fontSize = '12px';
                saveScopeBtn.textContent = 'Save';
                saveScopeBtn.addEventListener('click', () => updateNoteScope(note.id, scopeSelect.value));

                const editBtn = document.createElement('button');
                editBtn.className = 'popup-btn popup-btn-secondary';
                editBtn.style.padding = '4px 8px';
                editBtn.style.fontSize = '12px';
                editBtn.textContent = 'Edit';
                editBtn.addEventListener('click', () => editNoteText(note.id, note.text || ''));

                const deleteBtn = document.createElement('button');
                deleteBtn.className = 'refinement-delete-btn';
                deleteBtn.style.padding = '4px 8px';
                deleteBtn.style.fontSize = '12px';
                deleteBtn.textContent = 'Delete';
                deleteBtn.addEventListener('click', () => deleteNote(note.id));

                right.appendChild(scopeSelect);
                right.appendChild(saveScopeBtn);
                right.appendChild(editBtn);
                right.appendChild(deleteBtn);

                row.appendChild(left);
                row.appendChild(right);
                list.appendChild(row);
            });
        }

        function addNoteForCurrentCategory() {
            if (!currentNotesCategory) return;
            showInputPopup({
                title: 'Add Note',
                label: 'Note text:',
                placeholder: 'Enter note...',
                primaryText: 'Add',
                onPrimary: async (val) => {
                    const text = (val || '').trim();
                    if (!text) {
                        showErrorPopup('Please enter some text for the note.', 'Missing Text');
                        return;
                    }
                    try {
                        const resp = await fetch('/api/notes', {
                            method: 'POST',
                            headers: { 'Content-Type': 'application/json' },
                            body: JSON.stringify({
                                category: currentNotesCategory,
                                text,
                                scope: 'GLOBAL' // default as requested
                            })
                        });
                        const data = await resp.json();
                        if (!resp.ok || !data.success) {
                            throw new Error(data.error || 'Create failed');
                        }
                        await loadCategoryNotes(currentNotesCategory);
                    } catch (e) {
                        console.error('Failed to add note:', e);
                        showErrorPopup('Failed to add note. Please try again.', 'Add Failed');
                    }
                }
            });
        }

        function editNoteText(noteId, currentText) {
            showInputPopup({
                title: 'Edit Note',
                label: 'Note text:',
                value: currentText || '',
                primaryText: 'Save',
                onPrimary: async (val) => {
                    try {
                        const resp = await fetch(`/api/notes/${encodeURIComponent(noteId)}`, {
                            method: 'PUT',
                            headers: { 'Content-Type': 'application/json' },
                            body: JSON.stringify({ text: val != null ? String(val) : '' })
                        });
                        const data = await resp.json();
                        if (!resp.ok || !data.success) {
                            throw new Error(data.error || 'Update failed');
                        }
                        await loadCategoryNotes(currentNotesCategory);
                    } catch (e) {
                        console.error('Failed to update note:', e);
                        showErrorPopup('Failed to update note. Please try again.', 'Update Failed');
                    }
                }
            });
        }

        function deleteNote(noteId) {
            showConfirmPopup(
                'Are you sure you want to delete this note?',
                async () => {
                    try {
                        const resp = await fetch(`/api/notes/${encodeURIComponent(noteId)}`, { method: 'DELETE' });
                        const data = await resp.json();
                        if (!resp.ok || !data.success) {
                            throw new Error(data.error || 'Delete failed');
                        }
                        await loadCategoryNotes(currentNotesCategory);
                    } catch (e) {
                        console.error('Failed to delete note:', e);
                        showErrorPopup('Failed to delete note. Please try again.', 'Delete Failed');
                    }
                },
                () => {},
                'Delete Note'
            );
        }

        async function updateNoteScope(noteId, newScope) {
            try {
                const resp = await fetch(`/api/notes/${encodeURIComponent(noteId)}`, {
                    method: 'PUT',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ scope: newScope })
                });
                const data = await resp.json();
                if (!resp.ok || !data.success) {
                    throw new Error(data.error || 'Scope update failed');
                }
                showSuccessPopup('Scope updated.', 'Updated');
                await loadCategoryNotes(currentNotesCategory);
            } catch (e) {
                console.error('Failed to update scope:', e);
                showErrorPopup('Failed to update scope. Please try again.', 'Update Failed');
            }
        }

        // See Category Notes popup for Generate Response workflow
        function ensureSeeCategoryNotesModal() {
            let modal = document.getElementById('seeCategoryNotesModal');
            if (modal) return modal;

            modal = document.createElement('div');
            modal.id = 'seeCategoryNotesModal';
            modal.className = 'modal';
            modal.innerHTML = `
                <div class="modal-content" style="max-width: 900px; max-height: 80vh;">
                    <div class="modal-header">
                        <h2 class="modal-title">Category Notes</h2>
                        <button class="close" onclick="closeSeeCategoryNotesModal()">&times;</button>
                    </div>
                    <div style="padding: 16px; display: flex; flex-direction: column; gap: 12px; max-height: 60vh; overflow: hidden;">
                        <div style="font-size: 13px; color: #666;">Select notes to insert into the Additional Context field.</div>
                        <div style="display: flex; gap: 16px; flex: 1 1 auto; min-height: 0;">
                            <div style="flex: 1 1 0; display: flex; flex-direction: column; min-width: 0;">
                                <div id="seeNotesCategoryTitle" style="font-weight: 600; margin-bottom: 8px;">Category Notes</div>
                                <div id="seeNotesCategoryList" style="flex: 1 1 auto; overflow: auto; border: 1px solid #e9ecef; border-radius: 8px; padding: 10px; background: #fff;">
                                    <div class="loading">Loading...</div>
                                </div>
                            </div>
                            <div style="flex: 1 1 0; display: flex; flex-direction: column; min-width: 0;">
                                <div style="font-weight: 600; margin-bottom: 8px;">Global Notes (Other Categories)</div>
                                <div id="seeNotesGlobalList" style="flex: 1 1 auto; overflow: auto; border: 1px solid #e9ecef; border-radius: 8px; padding: 10px; background: #fff;">
                                    <div class="loading">Loading...</div>
                                </div>
                            </div>
                        </div>
                        <div style="display: flex; justify-content: center; gap: 12px; padding-top: 8px;">
                            <button class="popup-btn popup-btn-secondary" type="button" onclick="closeSeeCategoryNotesModal()">Cancel</button>
                            <button class="popup-btn popup-btn-success" id="applyCategoryNotesBtn" type="button">Add</button>
                        </div>
                    </div>
                </div>
            `;
            modal.addEventListener('click', (ev) => {
                if (ev.target === modal) closeSeeCategoryNotesModal();
            });
            document.body.appendChild(modal);
            return modal;
        }

        function closeSeeCategoryNotesModal() {
            const modal = document.getElementById('seeCategoryNotesModal');
            if (modal) modal.style.display = 'none';
        }

        /* Normalize chat message content:
   - Strip BOM and leading whitespace (including Unicode NBSP/space variants)
   - Remove leading tabs/spaces at the start of EACH line (fixes "tab at beginning" issue)
   - Collapse 3+ blank lines down to max 2 */
function normalizeChatContent(text) {
    try {
        let s = String(text || '');

        // Normalize non-breaking spaces to regular spaces first
        s = s.replace(/\u00A0/g, ' ');

        // Remove optional BOM and any leading whitespace at the very start (unicode aware)
        s = s.replace(/^\uFEFF?/, '');
        s = s.replace(/^[\s\u00A0\u1680\u2000-\u200B\u202F\u205F\u3000]+/, '');

        // Remove leading spaces/tabs (including unicode spaces) on every line
        s = s.replace(/^[\t \u00A0\u1680\u2000-\u200B\u202F\u205F\u3000]+/gm, '');

        // Collapse excessive blank lines
        s = s.replace(/\n{3,}/g, '\n\n');

        return s;
    } catch (_) {
        return String(text || '');
    }
}

/* HTML-escape utility (correctly encodes special chars) */
function escapeHtml(s) {
    return String(s)
        .replace(/&/g, '&')
        .replace(/</g, '<')
        .replace(/>/g, '>')
        .replace(/"/g, '"')
        .replace(/'/g, '&#39;');
}
function escapeRegExp(s) {
    return String(s).replace(/[.*+?^${}()|[\]\\]/g, '\\\\$&');
}

/* Global helper: seed tokens for common category names to improve keyword matching */
function getCategorySeedTokens(name) {
    const n = String(name || '').toLowerCase().trim();
    // Normalize common variants
    const norm = n.replace(/&/g, 'and').replace(/\s+/g, ' ');
    const seeds = {
        'teaching and student support': [
            'ta', 'teaching assistant', 'assignment', 'homework', 'hw', 'grading', 'grade',
            'extension', 'late pass', 'resubmit', 'midterm', 'final', 'exam', 'quiz',
            'office hours', 'syllabus'
        ],
        'research and lab work': [
            'research', 'lab', 'study', 'paper', 'irb', 'pilot', 'dataset', 'experiment',
            'user study', 'analysis', 'annotation', 'protocol', 'subject recruitment'
        ],
        'conferences': [
            'conference', 'submission', 'camera ready', 'taps', 'review', 'acm', 'ieee',
            'pcs', 'cfp', 'deadline', 'workshop', 'proceedings'
        ],
        'university administration': [
            'department', 'program', 'phd', 'seas', 'clearance', 'registration', 'university',
            'admin', 'policy', 'advising', 'course registration', 'graduation', 'cs@cu'
        ],
        'financial and reimbursements': [
            'reimbursement', 'invoice', 'receipt', 'payment', 'refund', 'expense',
            'travel grant', 'scholarship', 'stipend', 'honorarium'
        ],
        'networking': [
            'opportunity', 'role', 'position', 'recruit', 'recruiter', 'connect',
            'coffee chat', 'network', 'job', 'career', 'opening', 'hiring', 'linkedin'
        ],
        // Often empty by design; leave as [] to avoid over-matching
        'personal and life management': []
    };
    // Special cases the app recognizes elsewhere
    if (norm === 'lydia chilton') {
        return ['lydia', 'chilton', 'lc3251@columbia.edu'];
    }
    if (norm === 'apartment') {
        return [
            'apartment','lease','landlord','rent','rental','renewal','building','management',
            'tenant','tenancy','super','maintenance','repair','repairs','utilities','doorman',
            'roommate','sublease','move-in','move out','key pickup','broker','property manager'
        ];
    }
    return seeds[norm] || [];
}

        function renderSeeCategoryNotesLists() {
            const catList = document.getElementById('seeNotesCategoryList');
            const globList = document.getElementById('seeNotesGlobalList');
            if (!catList || !globList) return;

            const makeItem = (note, includeCategory = false) => {
                const catLabel = includeCategory ? `<span style="color:#999; font-size:12px;"> [${escapeHtml(note.category)}]</span>` : '';
                return `<label style="display:block; margin-bottom:8px; cursor:pointer;">
                    <input type="checkbox" data-id="${note.id}" style="margin-right:8px;">
                    <span style="white-space:pre-wrap;">${escapeHtml(note.text || '')}</span>${catLabel}
                </label>`;
            };

            catList.innerHTML = cachedCategoryNotes.length
                ? cachedCategoryNotes.map(n => makeItem(n, false)).join('')
                : `<div style="color:#666; font-style:italic; text-align:center; padding:8px;">No notes for this category.</div>`;

            globList.innerHTML = cachedGlobalNotes.length
                ? cachedGlobalNotes.map(n => makeItem(n, true)).join('')
                : `<div style="color:#666; font-style:italic; text-align:center; padding:8px;">No global notes from other categories.</div>`;
        }

        async function showSeeCategoryNotesModal() {
            const modal = ensureSeeCategoryNotesModal();

            // Set heading
            const titleEl = document.getElementById('seeNotesCategoryTitle');
            const cats = (Array.isArray(window.currentContextCategories) && window.currentContextCategories.length)
                ? window.currentContextCategories.slice()
                : (currentContextCategory ? [currentContextCategory] : []);
            if (titleEl) {
                titleEl.textContent = cats.length
                    ? `Notes for: ${cats.join(', ')}`
                    : 'Category Notes';
            }

            // Loading states
            const catList = document.getElementById('seeNotesCategoryList');
            const globList = document.getElementById('seeNotesGlobalList');
            if (catList) catList.innerHTML = '<div class="loading">Loading...</div>';
            if (globList) globList.innerHTML = '<div class="loading">Loading...</div>';

            modal.style.display = 'block';

            try {
                // Fetch all notes once and split on the client
                const resp = await fetch('/api/notes');
                const data = await resp.json();
                const allNotes = Array.isArray(data.notes) ? data.notes : [];

                const cats = (Array.isArray(window.currentContextCategories) && window.currentContextCategories.length)
                    ? window.currentContextCategories
                    : (currentContextCategory ? [currentContextCategory] : []);
                cachedCategoryNotes = allNotes.filter(n => cats.includes(n.category));
                cachedGlobalNotes = allNotes.filter(n => (n.scope === 'GLOBAL' && !cats.includes(n.category)));

                renderSeeCategoryNotesLists();

                const applyBtn = document.getElementById('applyCategoryNotesBtn');
                if (applyBtn) {
                    applyBtn.onclick = applySelectedNotesToContext;
                }
            } catch (e) {
                console.error('Failed to load notes:', e);
                if (catList) catList.innerHTML = '<div class="error">Failed to load notes.</div>';
                if (globList) globList.innerHTML = '<div class="error">Failed to load notes.</div>';
            }
        }

        function applySelectedNotesToContext() {
            const catList = document.getElementById('seeNotesCategoryList');
            const globList = document.getElementById('seeNotesGlobalList');
            if (!catList || !globList) return;

            const selectedIds = [];
            catList.querySelectorAll('input[type="checkbox"]:checked').forEach(cb => selectedIds.push(cb.getAttribute('data-id')));
            globList.querySelectorAll('input[type="checkbox"]:checked').forEach(cb => selectedIds.push(cb.getAttribute('data-id')));

            const byId = new Map([...cachedCategoryNotes, ...cachedGlobalNotes].map(n => [n.id, n]));
            const selectedTexts = selectedIds
                .map(id => byId.get(id))
                .filter(Boolean)
                .map(n => n.text || '')
                .filter(t => t && t.trim());

            if (!selectedTexts.length) {
                closeSeeCategoryNotesModal();
                return;
            }

            const insertText = selectedTexts.join('\n\n');
            const ctx = document.getElementById('contextInput');
            if (ctx) {
                ctx.value = ctx.value && ctx.value.trim()
                    ? (ctx.value.trimEnd() + '\n\n' + insertText)
                    : insertText;
            }

            closeSeeCategoryNotesModal();
        }

        // ===== Facet Box logic for Keyword Results =====

        // Working grouping state (array of { name, threads, isOther? }) maintained separate from keywordResults
        let keywordWorkingGroups = Array.isArray(window.keywordWorkingGroups) ? window.keywordWorkingGroups : [];
        let threadById = window.threadById instanceof Map ? window.threadById : new Map();

        function deepCopy(obj) { try { return JSON.parse(JSON.stringify(obj)); } catch { return obj; } }

        // Always read the latest refs from window to avoid stale copies after modal opens
        function getWorkingGroupsRef() {
            if (Array.isArray(window.keywordWorkingGroups)) {
                keywordWorkingGroups = window.keywordWorkingGroups;
            }
            if (!Array.isArray(keywordWorkingGroups)) keywordWorkingGroups = [];
            return keywordWorkingGroups;
        }
        function getThreadByIdRef() {
            if (window.threadById instanceof Map) {
                threadById = window.threadById;
            }
            return threadById instanceof Map ? threadById : new Map();
        }

        // Ensure "Other" group is the last slide in both the working groups and rendered results
        function ensureOtherLastOrder() {
            try {
                if (Array.isArray(window.keywordWorkingGroups)) {
                    window.keywordWorkingGroups = window.keywordWorkingGroups
                        .slice()
                        .sort((a, b) => ((a && a.isOther) ? 1 : 0) - ((b && b.isOther) ? 1 : 0));
                    keywordWorkingGroups = window.keywordWorkingGroups;
                }
                if (Array.isArray(window.keywordResults)) {
                    window.keywordResults = window.keywordResults
                        .slice()
                        .sort((a, b) => ((a && a.isOther) ? 1 : 0) - ((b && b.isOther) ? 1 : 0));
                    keywordResults = window.keywordResults;
                }
            } catch (e) {
                console.warn('ensureOtherLastOrder failed:', e);
            }
        }

        function getWorkingGroup(idx) {
            const groups = getWorkingGroupsRef();
            return groups[idx] || { name: '', threads: [] };
        }

        async function renderFacetBoxForGroup(idx) {
            try {
                const box = document.getElementById(`facet-groups-${idx}`);
                if (!box) return;
                box.innerHTML = '<div class="loading">Analyzing group facets...</div>';

                const group = getWorkingGroup(idx) || { threads: [] };

                // Cap analysis size to avoid oversized payloads and speed up facet generation
                const CAP_THREADS = group.isOther ? 60 : 40;
                const CAP_MESSAGES_PER_THREAD = 6;
                const CAP_BODY_CHARS = 800;

                // Sort threads by latest message date (desc) and cap count
                const threadsSorted = (group.threads || []).slice().sort((a, b) => {
                    const ad = Array.isArray(a.messages) && a.messages.length
                        ? Math.max(...a.messages.map(m => new Date(m.date || 0).getTime() || 0))
                        : 0;
                    const bd = Array.isArray(b.messages) && b.messages.length
                        ? Math.max(...b.messages.map(m => new Date(m.date || 0).getTime() || 0))
                        : 0;
                    return bd - ad;
                });
                const limitedThreads = threadsSorted.slice(0, CAP_THREADS);

                // Build compact payload
                const payload = {
                    threads: limitedThreads.map(t => ({
                        id: t.id,
                        subject: t.subject || '',
                        messages: (Array.isArray(t.messages) ? t.messages.slice(-CAP_MESSAGES_PER_THREAD) : []).map(m => ({
                            from: m.from || '',
                            to: Array.isArray(m.to) ? m.to.slice(0, 10) : (m.to ? [m.to] : []),
                            subject: m.subject || '',
                            body: String(m.body || '').slice(0, CAP_BODY_CHARS),
                            isResponse: !!m.isResponse
                        }))
                    }))
                };

                let facets = { people: [], domains: [], phrases: [] };
                let truncatedNote = '';
                if (limitedThreads.length > 0) {
                    try {
                        const resp = await fetch('/api/keyword-group-facets', {
                            method: 'POST',
                            headers: { 'Content-Type': 'application/json' },
                            body: JSON.stringify(payload)
                        });
                        if (!resp.ok) {
                            const text = await resp.text().catch(() => '');
                            console.warn('Facet API non-OK status:', resp.status, text);
                        }
                        const data = await resp.json().catch(() => ({}));
                        if (data && data.success && data.facets) facets = data.facets;
                    } catch (e) {
                        console.warn('Facet API failed, using empty suggestions:', e);
                    }
                } else {
                    // Avoid 400 from backend when group has no threads; skip API call
                    console.info('Facet API skipped: group has 0 threads for idx', idx);
                }

                // Client-side fallback: if API returned empty facets, compute simple heuristics here so "Regenerate" is always functional
                try {
                    const isEmpty = (!Array.isArray(facets.people) || facets.people.length === 0)
                                 && (!Array.isArray(facets.domains) || facets.domains.length === 0)
                                 && (!Array.isArray(facets.phrases) || facets.phrases.length === 0);

                    if (isEmpty) {
                        const MAX_RET = 12;
                        const emailRe = /[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/ig;
                        const stop = new Set(['the','a','an','and','or','of','in','on','at','to','for','from','by','with','about','as','is','it','this','that','be','are','was','were','will','shall','would','should','could','can','do','does','did','has','have','had','i','you','he','she','we','they','them','me','my','your','our','their','his','her','re','fw','fwd','dear','hi','hello','thanks','thank','regards','best','please']);
                        const counts = {
                            people: new Map(),
                            domains: new Map(),
                            phrases: new Map()
                        };
                        const bumpOncePerThread = (map, key, seenSet) => {
                            const k = String(key || '').trim().toLowerCase();
                            if (!k) return;
                            if (seenSet.has(k)) return;
                            seenSet.add(k);
                            map.set(k, (map.get(k) || 0) + 1);
                        };
                        const normalize = s => String(s || '');
                        const userEmail = getActualCurrentUserEmail().toLowerCase();

                        for (const t of limitedThreads) {
                            const seenPpl = new Set();
                            const seenDom = new Set();
                            const seenPhr = new Set();

                            const texts = [];
                            try {
                                texts.push(normalize(t.subject));
                                (Array.isArray(t.messages) ? t.messages : []).forEach(m => {
                                    texts.push(normalize(m.subject));
                                    texts.push(normalize(m.body));
                                    // from
                                    (normalize(m.from).match(emailRe) || []).forEach(em => {
                                        const emL = em.toLowerCase();
                                        if (!userEmail || !emL.includes(userEmail)) bumpOncePerThread(counts.people, emL, seenPpl);
                                        const at = emL.lastIndexOf('@');
                                        if (at > -1) bumpOncePerThread(counts.domains, emL.slice(at + 1), seenDom);
                                    });
                                    // to
                                    const toArr = Array.isArray(m.to) ? m.to : (m.to ? [m.to] : []);
                                    toArr.forEach(addr => {
                                        (normalize(addr).match(emailRe) || []).forEach(em => {
                                            const emL = em.toLowerCase();
                                            if (!userEmail || !emL.includes(userEmail)) bumpOncePerThread(counts.people, emL, seenPpl);
                                            const at = emL.lastIndexOf('@');
                                            if (at > -1) bumpOncePerThread(counts.domains, emL.slice(at + 1), seenDom);
                                        });
                                    });
                                });
                            } catch {}

                            // simple 2-3 gram extraction
                            const textAll = texts.join(' ').toLowerCase().replace(/[^a-z0-9\s]/g, ' ').replace(/\s+/g, ' ').trim();
                            if (textAll) {
                                const words = textAll.split(' ').filter(w => w && w.length >= 2 && !stop.has(w));
                                for (let n = 2; n <= 3; n++) {
                                    for (let i = 0; i + n <= words.length; i++) {
                                        const ph = words.slice(i, i + n).join(' ');
                                        if (ph.length >= 5) bumpOncePerThread(counts.phrases, ph, seenPhr);
                                    }
                                }
                            }
                        }

                        const rank = (map) => Array.from(map.entries()).sort((a,b) => b[1]-a[1] || a[0].localeCompare(b[0])).map(([k]) => k);
                        const topPeople = rank(counts.people).slice(0, MAX_RET);
                        const topDomains = rank(counts.domains).slice(0, MAX_RET);
                        const topPhrases = rank(counts.phrases).slice(0, MAX_RET);

                        // Only adopt fallback if it actually yields something meaningful
                        if (topPeople.length || topDomains.length || topPhrases.length) {
                            facets = {
                                people: topPeople,
                                domains: topDomains,
                                phrases: topPhrases
                            };
                        }
                    }
                } catch (fe) {
                    console.warn('Facet client fallback failed:', fe);
                }

                if ((group.threads || []).length > CAP_THREADS) {
                    truncatedNote = `<div style="color:#6c757d;font-size:12px;margin:4px 0 8px 0;">
                        Suggestions based on top ${CAP_THREADS} of ${(group.threads || []).length} threads (newest first)
                    </div>`;
                }

                box.innerHTML = truncatedNote + buildFacetGroupsHTML(idx, facets);
            } catch (e) {
                console.error('renderFacetBoxForGroup failed:', e);
            }
        }

        function regenerateFacetsForGroup(idx) {
            renderFacetBoxForGroup(idx);
        }

        function buildFacetGroupsHTML(idx, facets) {
            const section = (title, items, key) => {
                const content = (items || []).length
                    ? items.map((v, i) => `
                        <label style="display:inline-flex;align-items:center;gap:6px;margin:4px 10px 4px 0;">
                            <input type="checkbox" data-facet-type="${key}" data-facet-value="${escapeHtml(v)}" />
                            <span>${escapeHtml(v)}</span>
                        </label>`).join('')
                    : `<div style="color:#666;font-style:italic;">No ${title.toLowerCase()} found</div>`;
                return `
                    <div style="margin-bottom:8px;">
                        <div style="font-weight:600;color:#333;margin-bottom:4px;">${title}</div>
                        <div>${content}</div>
                    </div>
                `;
            };
            return `
                ${section('People', facets.people || [], 'people')}
                ${section('Domains', facets.domains || [], 'domains')}
                ${section('Phrases', facets.phrases || [], 'phrases')}
            `;
        }

        function applySelectedFacets(idx) {
            try {
                // Collect selected facets (OR matching)
                const container = document.getElementById(`facet-groups-${idx}`);
                if (!container) return;
                const checks = Array.from(container.querySelectorAll('input[type="checkbox"]:checked'));
                if (!checks.length) {
                    showErrorPopup('Please select at least one facet before adding threads.', 'No Facets Selected');
                    return;
                }
                const selected = checks.map(cb => ({
                    type: cb.getAttribute('data-facet-type'),
                    value: cb.getAttribute('data-facet-value') || ''
                })).filter(f => f.value);

                // Compute matching thread IDs from the full pool (keywordAllThreads)
                const pool = Array.isArray(keywordAllThreads) ? keywordAllThreads : [];
                const matchIds = [];
                for (const t of pool) {
                    if (!t || !t.id) continue;
                    if (threadMatchesAnyFacet(t, selected)) {
                        matchIds.push(t.id);
                    }
                }

                if (!matchIds.length) {
                    showErrorPopup('No additional threads matched the selected facets.', 'No Matches');
                    return;
                }

                // Unique assignment: latest wins
                moveThreadsToGroup(matchIds, idx);

                // Refresh UI and facets for this group
                const keepIndex = currentKeywordSlideIndex;
                populateKeywordSearchResultsCarousel();
                currentKeywordSlideIndex = Math.min(keepIndex, keywordWorkingGroups.length - 1);
                updateKeywordCarouselDisplay();

                // Re-render facets for the updated group (async)
                setTimeout(() => { try { renderFacetBoxForGroup(idx); } catch(_){} }, 0);
            } catch (e) {
                console.error('applySelectedFacets failed:', e);
                showErrorPopup('Failed to add threads. Please try again.', 'Operation Failed');
            }
        }

        /* ===== Similar Threads Suggestions (Pure OpenAI) ===== */

// Suggestions store per keyword slide index
let keywordSuggestions = (typeof window !== 'undefined' && window.keywordSuggestions) ? window.keywordSuggestions : {};
function getSuggestionsRef() {
    if (typeof window !== 'undefined') {
        window.keywordSuggestions = window.keywordSuggestions || keywordSuggestions || {};
        keywordSuggestions = window.keywordSuggestions;
    }
    return keywordSuggestions;
}

function ensureSuggestionsUIForGroup(idx) {
    try {
        // Skip suggestions for the "Other" bucket
        const grp = getWorkingGroup(idx);
        if (grp && grp.isOther) return;

        const slide = document.getElementById(`keyword-slide-${idx}`);
        if (!slide) return;
        // Already created?
        if (slide.querySelector(`#suggestions-box-${idx}`)) return;

        const box = document.createElement('div');
        box.className = 'suggestions-box';
        box.id = `suggestions-box-${idx}`;
        box.style.border = '1px solid #e9ecef';
        box.style.borderLeft = '4px solid #17a2b8';
        box.style.borderRadius = '8px';
        box.style.background = '#fff';
        box.style.padding = '12px';
        box.style.marginTop = '12px';

        box.innerHTML = `
            <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:8px;">
                <div style="font-weight:600;color:#0c5460;">Suggested Similar Threads (AI)</div>
                <button id="suggest-btn-${idx}" class="carousel-nav-btn" style="background:#17a2b8;" onclick="suggestMoreThreads(${idx})">Suggest More Threads</button>
            </div>
            <div id="suggestions-list-${idx}">
                <div class="loading">No suggestions yet. Click "Suggest More Threads".</div>
            </div>
        `;

        // Append below the thread preview (prefer anchor if present)
        const anchor = document.getElementById(`suggestions-anchor-${idx}`);
        if (anchor) anchor.appendChild(box);
        else slide.appendChild(box);
    } catch (e) {
        console.error('ensureSuggestionsUIForGroup failed:', e);
    }
}

function renderSuggestionsList(idx) {
    try {
        const listEl = document.getElementById(`suggestions-list-${idx}`);
        if (!listEl) return;
        const store = getSuggestionsRef();
        const items = Array.isArray(store[idx]) ? store[idx] : [];
        if (!items.length) {
            listEl.innerHTML = `<div class="loading">No suggestions yet.</div>`;
            return;
        }
        listEl.innerHTML = items.map(t => buildSuggestionCard(t, idx)).join('');
    } catch (e) {
        console.error('renderSuggestionsList failed:', e);
    }
}

function buildSuggestionCard(thread, idx) {
    const subject = escapeHtml(thread.subject || 'No Subject');
    const msgs = Array.isArray(thread.messages) ? thread.messages : [];
    // Indicate duplicate membership across keyword groups (excluding "Other")
    let alsoIn = [];
    try {
        const groups = getWorkingGroupsRef();
        alsoIn = groups
            .filter(g => !g.isOther)
            .filter(g => Array.isArray(g.threads) && g.threads.some(t => t && t.id === (thread && thread.id)))
            .map(g => String(g.name || ''))
            .slice(0, 5);
    } catch (_) {}
    const alsoInHtml = alsoIn.length
        ? `<span class="thread-meta" style="margin-left:8px;color:#6f42c1;">Also in: ${alsoIn.map(escapeHtml).join(', ')}</span>`
        : '';
    const msgsHtml = msgs.map(m => {
        const from = escapeHtml(m.from || 'Unknown Sender');
        const date = formatDate(m.date || new Date().toISOString());
        const subj = escapeHtml(m.subject || '');
        const body = escapeHtml(m.body || '');
        const cls = m.isResponse ? 'response' : 'original';
        return `
            <div class="thread-message-preview ${cls}">
                <div class="message-preview-header">
                    <div class="message-preview-from">${from}${m.isResponse ? ' (Your Response)' : ''}</div>
                    <div class="message-preview-date">${date}</div>
                </div>
                <div class="message-preview-subject" style="padding: 8px 12px; font-size: 13px; color: #333;">
                    <strong>Subject:</strong> ${subj}
                </div>
                <div class="message-preview-body">${body}</div>
            </div>
        `;
    }).join('');
    return `
        <details class="keyword-thread-collapsible" style="margin-bottom: 10px; border:1px solid #e9ecef; border-radius:6px; background:#fafafa;">
            <summary style="cursor: pointer; font-size: 14px; padding: 8px 12px; background:#f8f9fa; border-bottom:1px solid #e9ecef; display:flex; justify-content:space-between; align-items:center;">
                <span><strong>${subject}</strong> <span class="thread-meta" style="color:#666; font-weight:400;">(${msgs.length} message${msgs.length === 1 ? '' : 's'})</span>${alsoInHtml}</span>
                <span style="display:flex; gap:6px;">
                    <button class="carousel-nav-btn" style="background:#28a745; padding:4px 8px; font-size:12px;" onclick="acceptSuggestedThread(${idx}, '${String(thread.id || '').replace(/'/g, "\\'")}'); event.preventDefault(); event.stopPropagation();">Accept</button>
                    <button class="carousel-nav-btn" style="background:#dc3545; padding:4px 8px; font-size:12px;" onclick="rejectSuggestedThread(${idx}, '${String(thread.id || '').replace(/'/g, "\\'")}'); event.preventDefault(); event.stopPropagation();">Reject</button>
                </span>
            </summary>
            <div class="thread-messages" style="margin-top:10px;">
                ${msgsHtml || '<div class="no-emails" style="padding: 12px;">No messages available.</div>'}
            </div>
        </details>
    `;
}

async function suggestMoreThreads(idx) {
    try {
        const btn = document.getElementById(`suggest-btn-${idx}`);
        if (btn) { btn.disabled = true; btn.textContent = 'Suggesting...'; }

        // Working groups and current group (positives)
        const groups = getWorkingGroupsRef();
        const group = groups[idx] || { threads: [] };
        const positives = Array.isArray(group.threads) ? group.threads : [];

        // Candidates = all threads NOT already in this group
        const allThreads = Array.isArray(keywordAllThreads) ? keywordAllThreads : [];
        const inGroupIds = new Set(positives.map(t => t && t.id).filter(Boolean));
        const candidates = allThreads.filter(t => t && t.id && !inGroupIds.has(t.id));

        // If no candidates, show empty suggestions and exit
        if (!candidates.length) {
            const store = getSuggestionsRef();
            store[idx] = [];
            renderSuggestionsList(idx);
            return;
        }

        // Vectorize threads locally with TF-IDF and rank by cosine similarity to the positive centroid
        // Caps to keep computation reasonable
        const CAP_MSGS = 6;
        const CAP_BODY = 800;

        // Tokenization helpers
        const STOP = new Set([
            'the','a','an','and','or','of','in','on','at','to','for','from','by','with','about','as','is','it','this','that',
            'be','are','was','were','will','shall','would','should','could','can','do','does','did','has','have','had',
            'i','you','he','she','we','they','them','me','my','your','our','their','his','her',
            're','fw','fwd','dear','hi','hello','thanks','thank','regards','best','please'
        ]);
        const normText = (s) => String(s || '').toLowerCase();
        const extractTextFromThread = (t) => {
            try {
                const subj = normText(t.subject || '');
                const msgs = Array.isArray(t.messages) ? t.messages.slice(-CAP_MSGS) : [];
                const parts = [subj];
                for (const m of msgs) {
                    parts.push(normText(m.subject || ''));
                    parts.push(normText(String(m.body || '').slice(0, CAP_BODY)));
                }
                return parts.join(' ');
            } catch {
                return '';
            }
        };
        const tokenize = (text) => {
            const words = normText(text).replace(/[^a-z0-9\s]/g, ' ').split(/\s+/).filter(Boolean);
            return words.filter(w => w.length >= 2 && !STOP.has(w));
        };

        // Build documents for TF-IDF: positives and candidates
        const docs = [];
        const pushDoc = (id, text) => {
            const toks = tokenize(text);
            const tf = new Map();
            for (const w of toks) tf.set(w, (tf.get(w) || 0) + 1);
            const maxTf = Math.max(1, ...tf.values());
            docs.push({ id, tf, maxTf });
        };

        // Build positive docs (if none, use keyword name as pseudo-positive)
        if (positives.length) {
            for (const t of positives) {
                pushDoc(t.id, extractTextFromThread(t));
            }
        } else {
            // Pseudo positive from the group name to avoid empty centroid
            const seed = normText(group.name || '');
            pushDoc('__seed__', seed);
        }

        // Build candidate docs
        for (const t of candidates) {
            pushDoc(t.id, extractTextFromThread(t));
        }

        // Document frequency (DF) and vocabulary
        const DF = new Map();
        for (const d of docs) {
            for (const term of d.tf.keys()) {
                DF.set(term, (DF.get(term) || 0) + 1);
            }
        }
        const N = docs.length;
        const IDF = new Map(); // idf(term) = ln((N+1)/(df+1)) + 1
        for (const [term, df] of DF.entries()) {
            IDF.set(term, Math.log((N + 1) / (df + 1)) + 1);
        }

        // Build normalized TF-IDF vectors (sparse as Map<term, weight>)
        const buildTfidf = (d) => {
            const vec = new Map();
            let norm2 = 0;
            for (const [term, cnt] of d.tf.entries()) {
                const tf = cnt / d.maxTf;
                const idf = IDF.get(term) || 0;
                const w = tf * idf;
                if (w > 0) {
                    vec.set(term, w);
                    norm2 += w * w;
                }
            }
            const norm = Math.sqrt(norm2) || 1;
            // Normalize to unit length
            for (const [term, w] of vec.entries()) vec.set(term, w / norm);
            return vec;
        };

        // Compute TF-IDF vectors
        const vectors = new Map(); // id -> Map<term, weight>
        for (const d of docs) {
            vectors.set(d.id, buildTfidf(d));
        }

        // Positive centroid (average of positive vectors, renormalized)
        const posIds = positives.length ? positives.map(t => t.id) : ['__seed__'];
        const centroid = new Map();
        if (posIds.length) {
            // Sum
            for (const pid of posIds) {
                const v = vectors.get(pid) || new Map();
                for (const [term, w] of v.entries()) {
                    centroid.set(term, (centroid.get(term) || 0) + w);
                }
            }
            // Average
            for (const [term, sum] of centroid.entries()) {
                centroid.set(term, sum / posIds.length);
            }
            // Renormalize to unit vector
            let c2 = 0;
            for (const w of centroid.values()) c2 += w * w;
            const cn = Math.sqrt(c2) || 1;
            for (const [term, w] of centroid.entries()) {
                centroid.set(term, w / cn);
            }
        }

        // Cosine similarity: centroid dot candidate
        const cosine = (v) => {
            let dot = 0;
            // iterate over smaller map for speed; choose centroid (likely smaller) as driver
            for (const [term, cw] of centroid.entries()) {
                const vw = v.get(term);
                if (vw) dot += cw * vw;
            }
            return dot; // since both are unit vectors
        };

        // Rank candidates
        const scored = [];
        for (const t of candidates) {
            const v = vectors.get(t.id) || new Map();
            const score = centroid.size ? cosine(v) : 0;
            scored.push({ t, score });
        }
        scored.sort((a, b) => b.score - a.score);

        // Take top 10 suggestions
        const top = scored.slice(0, 10).map(s => s.t);

        // Persist and render
        const store = getSuggestionsRef();
        store[idx] = top;
        renderSuggestionsList(idx);
    } catch (e) {
        console.error('suggestMoreThreads failed:', e);
        showErrorPopup('Failed to compute suggestions. Please try again.', 'Suggest Failed');
    } finally {
        const btn = document.getElementById(`suggest-btn-${idx}`);
        if (btn) { btn.disabled = false; btn.textContent = 'Suggest More Threads'; }
    }
}

function acceptSuggestedThread(idx, threadId) {
    try {
        // Move into current group (latest wins)
        moveThreadsToGroup([threadId], idx);

        // Remove from suggestion list
        const store = getSuggestionsRef();
        const current = Array.isArray(store[idx]) ? store[idx] : [];
        store[idx] = current.filter(t => t && t.id !== threadId);

        // Refresh UI: keep on the same slide, rebuild carousel to update counts and content
        const keepIndex = currentKeywordSlideIndex;
        populateKeywordSearchResultsCarousel();
        currentKeywordSlideIndex = Math.min(keepIndex, keywordWorkingGroups.length - 1);
        updateKeywordCarouselDisplay();

        // Ensure suggestions and facets re-render for this group
        try { ensureSuggestionsUIForGroup(idx); renderSuggestionsList(idx); } catch (_) {}
        try { renderFacetBoxForGroup(idx); } catch (_) {}
    } catch (e) {
        console.error('acceptSuggestedThread failed:', e);
        showErrorPopup('Failed to accept thread. Please try again.', 'Accept Failed');
    }
}

function rejectSuggestedThread(idx, threadId) {
    try {
        const store = getSuggestionsRef();
        const current = Array.isArray(store[idx]) ? store[idx] : [];
        store[idx] = current.filter(t => t && t.id !== threadId);
        renderSuggestionsList(idx);
    } catch (e) {
        console.error('rejectSuggestedThread failed:', e);
        showErrorPopup('Failed to reject suggestion. Please try again.', 'Reject Failed');
    }
}

function fieldContains(hay, needle) {
            try {
                const H = String(hay || '').toLowerCase();
                const N = String(needle || '').toLowerCase();
                return H.includes(N);
            } catch { return false; }
        }

        function threadMatchesAnyFacet(thread, facets) {
            try {
                if (!Array.isArray(facets) || facets.length === 0) return false;
                // Prepare data
                const subj = String(thread.subject || '');
                const msgs = Array.isArray(thread.messages) ? thread.messages : [];
                for (const facet of facets) {
                    const val = facet.value || '';
                    if (!val) continue;
                    const type = facet.type;

                    // Domains: look for '@domain' in from/to headers
                    if (type === 'domains') {
                        const dom = val.toLowerCase();
                        let ok = false;
                        if (thread.originalFrom && thread.originalFrom.toLowerCase().includes(dom)) ok = true;
                        if (!ok && thread.from && String(thread.from).toLowerCase().includes(dom)) ok = true;
                        if (!ok) {
                            for (const m of msgs) {
                                if (String(m.from || '').toLowerCase().includes(dom)) { ok = true; break; }
                                const toArr = Array.isArray(m.to) ? m.to : (m.to ? [m.to] : []);
                                if (toArr.some(x => String(x || '').toLowerCase().includes(dom))) { ok = true; break; }
                            }
                        }
                        if (ok) return true;
                        continue;
                    }

                    // People: match either name fragments or email addresses in from/to
                    if (type === 'people') {
                        const needle = val.toLowerCase();
                        let ok = false;
                        const headers = [];
                        if (thread.originalFrom) headers.push(thread.originalFrom);
                        if (thread.from) headers.push(thread.from);
                        for (const m of msgs) {
                            headers.push(m.from || '');
                            const toArr = Array.isArray(m.to) ? m.to : (m.to ? [m.to] : []);
                            headers.push(...toArr);
                        }
                        if (headers.some(h => String(h || '').toLowerCase().includes(needle))) return true;
                        // Also allow phrase match fallback below (name in subject/body)
                        // fall-through as phrase
                    }

                    // Phrases or fallback: match in subject/body
                    if (fieldContains(subj, val)) return true;
                    for (const m of msgs) {
                        if (fieldContains(m.subject || '', val)) return true;
                        if (fieldContains(m.body || '', val)) return true;
                    }
                }
                return false;
            } catch { return false; }
        }

        function removeThreadFromOtherOnly(threadId) {
            const groups = getWorkingGroupsRef();
            for (const g of groups) {
                if (!Array.isArray(g.threads)) continue;
                if (g.isOther) {
                    g.threads = g.threads.filter(t => t && t.id !== threadId);
                }
            }
        }

        function addThreadToGroup(threadId, idx) {
            const tgt = getWorkingGroup(idx);
            if (!tgt) return;
            if (!Array.isArray(tgt.threads)) tgt.threads = [];
            // Get full thread object from the latest index
            const map = getThreadByIdRef();
            const full = map.get(threadId);
            if (!full) return;
            // Avoid duplicates
            if (!tgt.threads.some(t => t && t.id === threadId)) {
                tgt.threads.push(full);
            }
        }

        function moveThreadsToGroup(threadIds, idx) {
            const ids = Array.from(new Set((threadIds || []).filter(Boolean)));
            if (!ids.length) return;

            // Update working groups (source of truth)
            ids.forEach(id => {
                // Allow threads to appear in multiple keyword groups; only remove from "Other"
                removeThreadFromOtherOnly(id);
                addThreadToGroup(id, idx);
            });
            // Rebuild "Other" so it only contains threads not present in any keyword group
            rebuildOtherGroup();

            // Keep rendered keywordResults in sync so UI reflects additions immediately
            try {
                const groups = getWorkingGroupsRef();
                const target = groups[idx];
                const targetName = String(target?.name || '');
                if (!Array.isArray(keywordResults)) window.keywordResults = (keywordResults = []);

                // Ensure target group exists in keywordResults (insert before Other)
                let rIdx = keywordResults.findIndex(kg => String(kg?.name || '').toLowerCase() === targetName.toLowerCase() && !kg.isOther);
                if (rIdx === -1) {
                    let otherIdx = keywordResults.findIndex(x => x && x.isOther);
                    const insertIdx = otherIdx === -1 ? keywordResults.length : otherIdx;
                    keywordResults.splice(insertIdx, 0, { name: targetName, threads: [] });
                    rIdx = insertIdx;
                }

                const tgtKr = keywordResults[rIdx];
                if (!Array.isArray(tgtKr.threads)) tgtKr.threads = [];
                const have = new Set(tgtKr.threads.map(t => t && t.id).filter(Boolean));
                const map = getThreadByIdRef();

                ids.forEach(id => {
                    const full = map.get(id);
                    if (full && !have.has(id)) {
                        tgtKr.threads.push(full);
                    }
                });

                // Recompute "Other" bucket in keywordResults to exclude newly assigned threads
                let otherIdx = keywordResults.findIndex(x => x && x.isOther);
                if (otherIdx === -1) {
                    keywordResults.push({ name: 'Other Threads', threads: [], isOther: true });
                    otherIdx = keywordResults.length - 1;
                }
                const assigned = new Set();
                keywordResults.forEach(gr => {
                    if (!gr || gr.isOther || !Array.isArray(gr.threads)) return;
                    gr.threads.forEach(t => { if (t && t.id) assigned.add(t.id); });
                });
                const allThreads = Array.isArray(keywordAllThreads) ? keywordAllThreads : [];
                keywordResults[otherIdx].threads = allThreads.filter(t => t && t.id && !assigned.has(t.id));

                // Keep "Other" last after updates
                ensureOtherLastOrder();
            } catch (_) {}
        }

        function rebuildOtherGroup() {
            try {
                const groups = getWorkingGroupsRef();
                // Ensure an "Other Threads" bucket exists
                let otherIdx = groups.findIndex(g => g && g.isOther);
                if (otherIdx === -1) {
                    groups.push({ name: 'Other Threads', threads: [], isOther: true });
                    otherIdx = groups.length - 1;
                }
                const assigned = new Set();
                groups.forEach((g) => {
                    if (!g || !Array.isArray(g.threads)) return;
                    if (g.isOther) return;
                    g.threads.forEach(t => { if (t && t.id) assigned.add(t.id); });
                });
                const all = Array.isArray(keywordAllThreads) ? keywordAllThreads : [];
                const others = all.filter(t => t && t.id && !assigned.has(t.id));
                groups[otherIdx].threads = others;
                // Persist back to window for other consumers
                window.keywordWorkingGroups = groups;
            } catch (e) {
                console.warn('rebuildOtherGroup failed:', e);
            }
        }

        // Name-based remove to keep behavior robust even if arrays diverge in order
        function removeThreadFromKeywordGroupByName(groupName, threadId) {
            try {
                const nameLc = String(groupName || '').toLowerCase();
                const groups = getWorkingGroupsRef();
                const idx = (groups || []).findIndex(g => String(g?.name || '').toLowerCase() === nameLc);
                if (idx === -1) return;

                // Delegate to index-based path for reuse
                removeThreadFromKeywordGroup(idx, threadId);
            } catch (e) {
                console.error('removeThreadFromKeywordGroupByName failed:', e);
            }
        }

        function removeThreadFromKeywordGroup(idx, threadId) {
            try {
                const groups = getWorkingGroupsRef();
                if (!Array.isArray(groups) || idx < 0 || idx >= groups.length) return;
                const g = groups[idx];
                if (!g || !Array.isArray(g.threads)) return;

                // Remove the thread from the specified keyword group only
                g.threads = g.threads.filter(t => t && t.id !== threadId);

                // Keep keywordResults in sync with working groups for immediate UI updates
                try {
                    const groupName = String(g.name || '');
                    const rIdx = Array.isArray(keywordResults)
                        ? keywordResults.findIndex(kg => String(kg?.name || '').toLowerCase() === groupName.toLowerCase())
                        : -1;
                    if (Array.isArray(keywordResults) && rIdx !== -1) {
                        const kg = keywordResults[rIdx];
                        if (kg && Array.isArray(kg.threads)) {
                            kg.threads = kg.threads.filter(t => t && t.id !== threadId);
                        }
                        // Ensure "Other" bucket exists and recompute it in keywordResults too
                        let otherIdx = keywordResults.findIndex(x => x && x.isOther);
                        if (otherIdx === -1) {
                            keywordResults.push({ name: 'Other Threads', threads: [], isOther: true });
                            otherIdx = keywordResults.length - 1;
                        }
                        const assigned = new Set();
                        keywordResults.forEach((gr) => {
                            if (!gr || !Array.isArray(gr.threads)) return;
                            if (gr.isOther) return;
                            gr.threads.forEach(t => { if (t && t.id) assigned.add(t.id); });
                        });
                        const allThreads = Array.isArray(keywordAllThreads) ? keywordAllThreads : [];
                        keywordResults[otherIdx].threads = allThreads.filter(t => t && t.id && !assigned.has(t.id));
                    }

                    // Keep "Other" last after removal
                    ensureOtherLastOrder();
                } catch (_) {}

                // Rebuild "Other" so any thread not present in any keyword group moves there
                rebuildOtherGroup();

                // Re-render the carousel and keep user on the same slide
                const keepIndex = currentKeywordSlideIndex;
                populateKeywordSearchResultsCarousel();
                currentKeywordSlideIndex = Math.min(keepIndex, getWorkingGroupsRef().length - 1);
                updateKeywordCarouselDisplay();

                // Re-render facets and suggestions for this group (best-effort)
                try { ensureSuggestionsUIForGroup(idx); renderSuggestionsList(idx); } catch (_) {}
                try { renderFacetBoxForGroup(idx); } catch (_) {}
            } catch (e) {
                console.error('removeThreadFromKeywordGroup failed:', e);
                showErrorPopup('Failed to remove thread from category. Please try again.', 'Remove Failed');
            }
        }

function saveKeywordGrouping() {
    try {
        const groups = getWorkingGroupsRef();

        // If we are in thread edit mode (popup-scoped), persist assignments to disk and return to popup
        if (window.__threadEditMode) {
            // Build assignments { responseEmailId: categoryName } from non-Other groups
            const assignments = {};
            for (const g of groups) {
                if (!g || g.isOther) continue;
                const catName = g.name || '';
                for (const t of (g.threads || [])) {
                    const msg = Array.isArray(t.messages)
                        ? t.messages.filter(m => m && m.isResponse).sort((a,b)=> new Date(b.date)-new Date(a.date))[0]
                        : null;
                    const respId = msg && msg.id;
                    if (respId) assignments[respId] = catName;
                }
            }

            // Persist grouping:
            // 1) Ensure any threads not yet in DB are added (so their response IDs exist in response-emails.json)
            // 2) Save category assignments
            (async () => {
                try {
                    // Step 1: Add missing threads (those whose latest response id is not in allEmails yet)
                    const currentIds = new Set((allEmails || []).map(e => e && e.id).filter(Boolean));
                    const threadsToAddMap = new Map();
                    for (const g of groups) {
                        if (!g || !Array.isArray(g.threads)) continue;
                        for (const t of g.threads) {
                            const msg = Array.isArray(t?.messages)
                                ? t.messages.filter(m => m && m.isResponse).sort((a, b) => new Date(b.date) - new Date(a.date))[0]
                                : null;
                            const respId = msg && msg.id;
                            if (respId && !currentIds.has(respId) && t && t.id) {
                                // Use the full thread object from the index if available to guarantee shape
                                const full = (window.threadById instanceof Map) ? window.threadById.get(t.id) : null;
                                threadsToAddMap.set(t.id, full || t);
                            }
                        }
                    }
                    const threadsToAdd = Array.from(threadsToAddMap.values());
                    if (threadsToAdd.length) {
                        try {
                            const addResp = await fetch('/api/add-email-threads', {
                                method: 'POST',
                                headers: { 'Content-Type': 'application/json' },
                                body: JSON.stringify({ threads: threadsToAdd })
                            });
                            // consume body even if not ok to avoid unhandled rejection
                            await addResp.json().catch(() => ({}));
                        } catch (addErr) {
                            console.warn('Adding missing threads failed; proceeding to save categories anyway:', addErr);
                        }
                    }

                    // Step 2: Save category assignments
                    const resp = await fetch('/api/save-categories', {
                        method: 'POST',
                        headers: { 'Content-Type': 'application/json' },
                        body: JSON.stringify({ assignments })
                    });
                    const data = await resp.json();
                    if (!resp.ok || !data.success) {
                        throw new Error(data.error || 'Failed to save categories');
                    }

                    // Reload authoritative RHS data so both the popup and the Categories editor reflect the changes
                    try { await loadEmails(); } catch (_) {}

                    // Refresh saved categories order and re-render popup lists
                    try { await loadCurrentCategories(); } catch (_) {}
                    renderTodayThreadsList();
                    renderTodayEmailsList(false);

                    // Close the thread grouping modal and clear mode
                    try { closeKeywordSearchResultsModal(); } catch (_) {}
                    window.__threadEditMode = false;

                    showSuccessPopup('Thread(s) persisted and categories saved. Popup updated.', 'Saved');
                } catch (e) {
                    console.error('Thread category save failed:', e);
                    showErrorPopup('Failed to save thread categories. Please try again.', 'Save Failed');
                }
            })();

            return;
        }

        // Default behavior: open Categories editor with buckets (include Other), then save via Approve & Save there
        const buckets = [];
        for (const g of groups) {
            if (!g) continue;
            const emails = [];
            const seen = new Set();
            for (const t of (g.threads || [])) {
                const msg = Array.isArray(t.messages)
                    ? t.messages.filter(m => m && m.isResponse).sort((a,b)=> new Date(b.date)-new Date(a.date))[0]
                    : null;
                const respId = msg && msg.id;
                if (!respId || seen.has(respId)) continue;
                const e = (allEmails || []).find(x => x && x.id === respId);
                if (!e) continue;
                seen.add(respId);
                emails.push({
                    id: e.id,
                    subject: e.subject || 'No Subject',
                    from: e.originalFrom || e.from || 'Unknown Sender',
                    date: e.date || new Date().toISOString(),
                    snippet: e.snippet || (e.body ? String(e.body).slice(0, 120) + (e.body.length > 120 ? '...' : '') : 'No content available')
                });
            }
            const bucketName = g.isOther ? 'Other' : (g.name || 'Unnamed');
            const bucket = { name: bucketName, originalName: bucketName, emails };
            if (g.isOther) buckets.push(bucket);
            else if (emails.length) buckets.push(bucket);
        }
        if (!buckets.length) {
            buckets.push({ name: 'Other', originalName: 'Other', emails: [] });
        }
        startCategoriesEditorWithBuckets(buckets);
        try { closeKeywordSearchResultsModal(); } catch (_) {}
    } catch (e) {
        console.error('saveKeywordGrouping failed:', e);
        showErrorPopup('Failed to prepare grouping for save. Please try again.', 'Save Failed');
    }
}

        function startCategoriesEditorWithBuckets(buckets) {
            try {
                // Set global categoriesState and assignments
                categoriesState = deepCopy(buckets || []);
                categoryAssignments = {};
                categoriesState.forEach(cat => {
                    (cat.emails || []).forEach(e => { if (e && e.id) categoryAssignments[e.id] = cat.name; });
                });
                // Ensure modal exists and render
                let modal = document.getElementById('categoriesReviewModal');
                if (!modal) {
                    modal = createCategoriesReviewModal();
                    document.body.appendChild(modal);
                }
                renderCategoriesEditor();
                modal.style.display = 'block';
            } catch (e) {
                console.error('startCategoriesEditorWithBuckets failed:', e);
                showErrorPopup('Failed to open categories editor with grouping.', 'Open Failed');
            }
        }

/* ===== Per-email Notes (Main UI) ===== */
let currentEmailNotesId = '';

function ensureEmailNotesModal() {
    let modal = document.getElementById('emailNotesModal');
    if (modal) return modal;
    modal = document.createElement('div');
    modal.id = 'emailNotesModal';
    modal.className = 'modal';
    modal.innerHTML = `
        <div class="modal-content" style="max-width: 700px; max-height: 80vh;">
            <div class="modal-header">
                <h2 class="modal-title">Email Notes</h2>
                <button class="close" onclick="closeEmailNotesModal()">&times;</button>
            </div>
            <div style="padding:16px; display:flex; flex-direction:column; gap:10px; max-height:60vh; overflow:auto;">
                <div id="emailNotesListMain" style="border:1px solid #e9ecef; border-radius:8px; background:#fff; padding:10px; min-height:80px; max-height:40vh; overflow:auto;">
                    <div class="loading">Loading notes...</div>
                </div>
                <div style="display:flex; gap:8px; align-items:flex-start;">
                    <textarea id="emailNotesInputMain" rows="2" placeholder="Add a note..." style="flex:1; padding:8px; border:1px solid #ddd; border-radius:6px; font-size:13px;"></textarea>
                    <button class="select-email-btn" onclick="addEmailNoteMain()">Add</button>
                </div>
            </div>
        </div>
    `;
    modal.addEventListener('click', (ev) => { if (ev.target === modal) closeEmailNotesModal(); });
    document.body.appendChild(modal);
    return modal;
}

function openEmailNotes(emailId, ev) {
    try { if (ev && ev.stopPropagation) ev.stopPropagation(); } catch(_) {}
    currentEmailNotesId = emailId || '';
    const modal = ensureEmailNotesModal();
    modal.style.display = 'block';
    loadEmailNotesMain(emailId);
}

function closeEmailNotesModal() {
    const modal = document.getElementById('emailNotesModal');
    if (modal) modal.style.display = 'none';
}

async function loadEmailNotesMain(emailId) {
    const listEl = document.getElementById('emailNotesListMain');
    if (listEl) listEl.innerHTML = '<div class="loading">Loading notes...</div>';
    try {
        if (!emailId) {
            if (listEl) listEl.innerHTML = '<div class="empty">No notes yet.</div>';
            return;
        }
        const r = await fetch(`/api/email-notes/${encodeURIComponent(emailId)}`);
        const d = await r.json();
        const notes = Array.isArray(d.notes) ? d.notes : [];
        renderEmailNotesListMain(notes);
    } catch (e) {
        if (listEl) listEl.innerHTML = '<div class="error">Failed to load notes.</div>';
    }
}

function renderEmailNotesListMain(notes) {
    const listEl = document.getElementById('emailNotesListMain');
    if (!listEl) return;
    if (!Array.isArray(notes) || notes.length === 0) {
        listEl.innerHTML = '<div class="empty">No notes yet.</div>';
        return;
    }
    const html = notes.map(n => {
        const ts = new Date(n.updatedAt || n.createdAt || Date.now());
        const when = isNaN(ts) ? '' : ts.toLocaleString();
        const safeText = escapeHtml(n.text || '');
        return `
            <div style="border:1px solid #e9ecef; border-radius:6px; padding:8px; margin-bottom:8px; background:#fff;">
                <div style="display:flex; align-items:center; justify-content:space-between; margin-bottom:4px;">
                    <div style="font-size:12px; color:#666;">${when}</div>
                    <button class="refinement-delete-btn" style="padding:4px 8px; font-size:12px;" title="Delete note" onclick="deleteEmailNoteMain('${n.id}')">🗑️</button>
                </div>
                <div style="white-space:pre-wrap; font-size:13px; color:#333;">${safeText}</div>
            </div>
        `;
    }).join('');
    listEl.innerHTML = html;
}

async function addEmailNoteMain() {
    try {
        const emailId = currentEmailNotesId || '';
        if (!emailId) return;
        const input = document.getElementById('emailNotesInputMain');
        const text = (input?.value || '').trim();
        if (!text) return;
        const r = await fetch(`/api/email-notes/${encodeURIComponent(emailId)}`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ text })
        });
        const d = await r.json();
        if (!r.ok || !d.success) {
            showErrorPopup('Failed to add note. Please try again.', 'Add Note Failed');
            return;
        }
        if (input) input.value = '';
        await loadEmailNotesMain(emailId);
    } catch (e) {
        showErrorPopup('Failed to add note. Please try again.', 'Add Note Failed');
    }
}

async function deleteEmailNoteMain(noteId) {
    try {
        const emailId = currentEmailNotesId || '';
        if (!emailId || !noteId) return;
        const r = await fetch(`/api/email-notes/${encodeURIComponent(emailId)}/${encodeURIComponent(noteId)}`, {
            method: 'DELETE'
        });
        const d = await r.json().catch(() => ({}));
        if (!r.ok || !d.success) {
            showErrorPopup('Failed to delete note. Please try again.', 'Delete Failed');
            return;
        }
        // Invalidate cache and refresh list
        try {
            if (window.__emailNotesCache) {
                delete window.__emailNotesCache[emailId];
            }
        } catch (_) {}
        await loadEmailNotesMain(emailId);
        // Refresh any inline previews for this email
        try {
            document.querySelectorAll(`.notes-preview[data-email-notes="${emailId}"]`).forEach(el => {
                renderEmailNotesPreview(el, emailId);
            });
            const tnp = document.getElementById('thread-notes-preview');
            if (tnp) renderEmailNotesPreview(tnp, emailId);
        } catch (_) {}
    } catch (e) {
        showErrorPopup('Failed to delete note. Please try again.', 'Delete Failed');
    }
}

/* Inline notes preview helpers (cache, summarize, render) */
window.__emailNotesCache = window.__emailNotesCache || {};

async function getEmailNotesCached(emailId) {
    try {
        const key = String(emailId || '');
        if (!key) return [];
        if (window.__emailNotesCache[key]) return window.__emailNotesCache[key];
        const r = await fetch(`/api/email-notes/${encodeURIComponent(key)}`);
        const d = await r.json().catch(() => ({}));
        const notes = Array.isArray(d.notes) ? d.notes : [];
        window.__emailNotesCache[key] = notes;
        return notes;
    } catch (_) {
        return [];
    }
}

function summarizeNotes(notes, maxChars = 160, maxItems = 2) {
    try {
        const arr = (Array.isArray(notes) ? notes : []).map(n => String(n?.text || '').trim()).filter(Boolean);
        if (!arr.length) return { text: '', truncated: false };
        const picked = arr.slice(0, maxItems);
        let text = picked.join(' • ');
        let truncated = false;
        if (text.length > maxChars) {
            text = text.slice(0, maxChars - 1).trimEnd() + '…';
            truncated = true;
        }
        // If there are more notes beyond maxItems, treat as truncated to show "View all"
        if (arr.length > maxItems) truncated = true;
        return { text, truncated };
    } catch (_) {
        return { text: '', truncated: false };
    }
}

async function renderEmailNotesPreview(el, emailId) {
    try {
        if (!el || !emailId) return;
        const notes = await getEmailNotesCached(emailId);
        if (!Array.isArray(notes) || notes.length === 0) {
            el.style.display = 'none';
            el.textContent = '';
            return;
        }
        const { text, truncated } = summarizeNotes(notes);
        if (!text) {
            el.style.display = 'none';
            el.textContent = '';
            return;
        }
        // Basic content
        el.innerHTML = '';
        const span = document.createElement('span');
        span.textContent = text;
        el.appendChild(span);
        if (truncated) {
            const more = document.createElement('span');
            more.className = 'more';
            more.textContent = 'View all';
            el.appendChild(more);
        }
        el.style.display = 'block';
        el.onclick = (ev) => {
            try { if (ev && ev.stopPropagation) ev.stopPropagation(); } catch(_){}
            openEmailNotes(emailId, ev);
        };
    } catch (_) {
        try { el.style.display = 'none'; } catch(_){}
    }
}
/* ===== End Per-email Notes (Main UI) ===== */

        // Load emails when page loads
        function promptAndGoLoadMore() {
            // Open system-styled modal instead of native browser prompt
            showLoadMorePromptModal();
        }

        // Launch classifier evaluation UI with a descriptive loading popup
        function openTestClassifier() {
            try {
                showLoadingOverlay(
                    'Running Classifier',
                    'Training on 80% of labeled emails and evaluating on 20%… This may take a few seconds.',
                    false
                );
            } catch (_) {}
            // Navigate to the evaluation UI where the run executes and results are displayed
            setTimeout(() => {
                window.location.href = '/test-classifier.html';
            }, 350);
        }

        function ensureLoadMorePromptModal() {
            let modal = document.getElementById('loadMorePromptModal');
            if (modal) return modal;

            modal = document.createElement('div');
            modal.id = 'loadMorePromptModal';
            modal.className = 'modal';
            modal.innerHTML = `
                <div class="modal-content load-threads-modal">
                    <div class="modal-header">
                        <h2 class="modal-title">Load More Emails</h2>
                        <button class="close" onclick="closeLoadMorePromptModal()">&times;</button>
                    </div>
                    <div class="load-threads-container">
                        <div class="load-threads-intro">
                            <h4>📥 How many emails should we load?</h4>
                            <p>Choose the number of emails to fetch from your inbox. You can adjust categories on the next screen.</p>
                        </div>

                        <div class="thread-count-selector">
                            <label for="loadMoreCountInput">Number of Emails (1–50):</label>
                            <input id="loadMoreCountInput" type="number" min="1" max="50" value="10" step="1" class="thread-count-dropdown" style="width: 140px;" />
                            <div id="loadMoreCountError" style="margin-top:8px; color:#d93025; font-size:12px; display:none;">Please enter a number between 1 and 50.</div>
                        </div>

                        <div class="load-threads-actions">
                            <button class="load-threads-btn load-threads-btn-cancel" onclick="closeLoadMorePromptModal()">Cancel</button>
                            <button class="load-threads-btn load-threads-btn-load" onclick="confirmLoadMoreCount()">Load</button>
                        </div>
                    </div>
                </div>
            `;

            // Close on backdrop click
            modal.addEventListener('click', (ev) => {
                if (ev.target === modal) closeLoadMorePromptModal();
            });

            document.body.appendChild(modal);

            // Enter key to submit
            setTimeout(() => {
                try {
                    const input = document.getElementById('loadMoreCountInput');
                    if (input) {
                        input.addEventListener('keydown', (ev) => {
                            if (ev.key === 'Enter') {
                                ev.preventDefault();
                                confirmLoadMoreCount();
                            }
                        });
                    }
                } catch (_) {}
            }, 0);

            return modal;
        }

        function showLoadMorePromptModal() {
            const modal = ensureLoadMorePromptModal();
            // Reset defaults each time it opens
            const input = document.getElementById('loadMoreCountInput');
            const err = document.getElementById('loadMoreCountError');
            if (input) input.value = '10';
            if (err) err.style.display = 'none';
            modal.style.display = 'block';
            // Focus input for quick entry
            setTimeout(() => { try { input && input.focus(); input && input.select(); } catch(_) {} }, 0);
        }

        function closeLoadMorePromptModal() {
            const modal = document.getElementById('loadMorePromptModal');
            if (modal) modal.style.display = 'none';
        }

        function confirmLoadMoreCount() {
            try {
                const input = document.getElementById('loadMoreCountInput');
                const err = document.getElementById('loadMoreCountError');
                const raw = input ? parseInt(input.value, 10) : NaN;
                const n = Number.isFinite(raw) ? raw : 10;
                const count = Math.max(1, Math.min(50, n));
                if (!Number.isFinite(raw) || raw < 1 || raw > 50) {
                    if (err) err.style.display = 'block';
                    return;
                }
                closeLoadMorePromptModal();
                window.location.href = '/load.html?count=' + count;
            } catch (e) {
                // Fallback
                closeLoadMorePromptModal();
                window.location.href = '/load.html?count=10';
            }
        }

        function showFlashFromQuery() {
            try {
                const params = new URLSearchParams(window.location.search);
                const msg = params.get('msg');
                if (!msg) return;

                // Create a temporary success bar just below the fixed header (64px)
                const container = document.querySelector('.gmail-container') || document.body;
                const bar = document.createElement('div');
                bar.textContent = msg;
                bar.style.position = 'fixed';
                bar.style.top = '64px';
                bar.style.left = '0';
                bar.style.right = '0';
                bar.style.background = '#28a745';
                bar.style.color = '#fff';
                bar.style.padding = '10px 16px';
                bar.style.textAlign = 'center';
                bar.style.zIndex = '1500';
                container.appendChild(bar);

                // Auto-hide after 2.5s
                setTimeout(() => { try { bar.remove(); } catch(_){} }, 2500);

                // Remove ?msg= from URL so it doesn't persist on refresh
                const url = new URL(window.location.href);
                url.searchParams.delete('msg');
                window.history.replaceState({}, '', url.toString());
            } catch (_) {}
        }

        document.addEventListener('DOMContentLoaded', function() {
            startHardBannerHeartbeat();
            const openFeatureManagerBtn = document.getElementById('openFeatureManagerBtn');
            if (openFeatureManagerBtn) {
                openFeatureManagerBtn.addEventListener('click', openFeatureManager);
            }
            const openFeatureGeneratorBtn = document.getElementById('openFeatureGeneratorBtn');
            if (openFeatureGeneratorBtn) {
                openFeatureGeneratorBtn.addEventListener('click', openFeatureGenerator);
            }
            // Wire up login button
            const loginBtn = document.getElementById('loginBtn');
            if (loginBtn) {
                loginBtn.onclick = () => {
                    window.location.href = '/api/auth/login';
                };
            }

            // Run initializers, then load Priority Today first with popup,
            // then load the regular emails list.
            loadCurrentUser();
            loadFeatures(); // Load feature plugins
            initSearchBar();
            showFlashFromQuery();
            (async () => {
                try {
                    await loadEmails();
                    initializeUiAutoSync();
                    // Kick off auto-sync in background so initial UI is not blocked by Gmail fetch latency.
                    try {
                        fetch('/api/auto-sync/run', {
                            method: 'POST',
                            headers: { 'Content-Type': 'application/json' },
                            body: JSON.stringify({ reason: 'initial-page-load' })
                        })
                        .then(async (syncResp) => {
                            const syncData = await syncResp.json().catch(() => ({}));
                            if (!syncResp.ok || !syncData.success) {
                                console.warn('Initial auto-sync failed:', syncData?.error || syncData?.result?.reason || 'unknown');
                            }
                        })
                        .catch(() => {});
                    } catch (_) {}
                } catch (_){}
            })();
        });

        // Load current user on page load
        async function loadCurrentUser() {
            try {
                // First check auth status to get the logged in email
                const authStatusResp = await fetch('/api/auth/status');
                const authStatus = await authStatusResp.json();

                if (authStatus.loggedIn && authStatus.userEmail) {
                    setCurrentUserHeader(authStatus.userEmail);
                    window.currentUserDisplayName = displayNameFromEmail(authStatus.userEmail);
                } else {
                    const response = await fetch('/api/current-user');
                    const data = await response.json();
                    setCurrentUserHeader(data.currentUser);
                    window.currentUserDisplayName = data.displayName || displayNameFromEmail(data.currentUser);
                }
            } catch (error) {
                console.error('Error loading current user:', error);
            }
        }
    /* ===== Seed Categories (MCP Important) ===== */
let __seedItems = [];
let __seedCategories = [];

function ensureSeedCategoriesModal() {
    let modal = document.getElementById('seedCategoriesModal');
    if (modal) return modal;
    modal = document.createElement('div');
    modal.id = 'seedCategoriesModal';
    modal.className = 'modal';
    modal.innerHTML = `
        <div class="modal-content" style="max-width: 1100px; max-height: 80vh; display:flex; flex-direction:column;">
            <div class="modal-header">
                <h2 class="modal-title">Seed Categories</h2>
                <button class="close" onclick="closeSeedCategoriesModal()">&times;</button>
            </div>
            <div style="padding:16px; flex:1 1 auto; overflow:auto;">
                <div id="seedList" style="min-height:200px;">
                    <div class="loading">Loading important emails...</div>
                </div>
            </div>
            <div style="display:flex; justify-content:center; gap:12px; padding:12px 16px; border-top:1px solid #e9ecef;">
                <button class="carousel-btn carousel-btn-cancel" onclick="closeSeedCategoriesModal()">Cancel</button>
                <button class="carousel-btn carousel-btn-add" onclick="seedAddAll()">Add All</button>
            </div>
        </div>
    `;
    modal.addEventListener('click', (ev) => { if (ev.target === modal) closeSeedCategoriesModal(); });
    document.body.appendChild(modal);
    return modal;
}

function closeSeedCategoriesModal() {
    const modal = document.getElementById('seedCategoriesModal');
    if (modal) modal.style.display = 'none';
}

async function showSeedCategoriesModal() {
    const modal = ensureSeedCategoriesModal();
    __seedItems = [];
    // Load current categories for dropdowns
    try {
        const resp = await fetch('/api/current-categories');
        const data = await resp.json();
        __seedCategories = Array.isArray(data.categories) ? data.categories : [];
    } catch (_) { __seedCategories = []; }

    // Fetch from MCP-backed endpoint (with progress logs on server)
    const host = document.getElementById('seedList');
    if (host) host.innerHTML = '<div class="loading">Loading important emails...</div>';
    try {
        const r = await fetch('/api/seed-categories/list');
        const data = await r.json();
        if (!r.ok || !data.success) throw new Error(data.error || 'Failed');
        __seedItems = Array.isArray(data.items) ? data.items.map(it => ({ ...it, category: it.category || '', categories: Array.isArray(it.categories) ? it.categories : [] })) : [];
        renderSeedList();
    } catch (e) {
        if (host) host.innerHTML = '<div class="error">Failed to load important emails. Gmail authentication may be required. Use the Authenticate flow (you will be prompted automatically) and try again.</div>';
    }
    modal.style.display = 'block';
}

function seedTagHtml(tags) {
    const parts = [];
    if (tags && tags.unreplied) {
        parts.push(`<span class="email-category" style="background:#e3f2fd;color:#1565c0; margin-right:6px;">Unreplied</span>`);
    }
    if (tags && tags.thread) {
        parts.push(`<span class="email-category" style="background:#f0e8ff;color:#6f42c1; margin-right:6px;">Thread</span>`);
    }
    return parts.join('');
}

function renderSeedList() {
    const host = document.getElementById('seedList');
    if (!host) return;
    if (!Array.isArray(__seedItems) || __seedItems.length === 0) {
        host.innerHTML = '<div class="no-emails">No items to display.</div>';
        return;
    }
    const rows = __seedItems.map((it, i) => {
        const tags = seedTagHtml(it.tags || {});
        const from = escapeHtml(it.from || 'Unknown Sender');
        const subj = escapeHtml(it.subject || 'No Subject');
        const date = formatDate(it.date || new Date().toISOString());

        // Build pills row for primary + additional categories
        const selected = Array.from(new Set([...(Array.isArray(it.categories) ? it.categories : []), it.category].filter(Boolean)));
        const pills = selected.map(cat => {
            const style = getCategoryBadgeStyle(cat || 'Other');
            const cls = `category-${String(cat || 'Other').toLowerCase().replace(/\s+/g, '-')}`;
            return `<span class="email-category ${cls}" style="${style}; margin-right:6px;">${escapeHtml(cat)}</span>`;
        }).join('');

        return `
            <div style="border:1px solid #e9ecef; border-radius:8px; padding:10px; margin-bottom:8px; display:flex; gap:10px; align-items:flex-start;">
                <div style="flex:1 1 auto; min-width:0;">
                    <div style="display:flex; align-items:center; justify-content:space-between; gap:8px;">
                        <div style="font-weight:600; color:#333; overflow:hidden; text-overflow:ellipsis; white-space:nowrap;">${subj}</div>
                        <div style="display:flex; align-items:center; gap:8px;">
                            ${tags}
                            <button class="select-email-btn" title="Edit categories" onclick="seedEditCategory(${i}, this)" style="padding:6px 10px; font-size:12px;">Edit Categories</button>
                            <button class="refinement-delete-btn" title="Hide this item" onclick="seedTrashItem(${i})">🗑️</button>
                        </div>
                    </div>
                    <div style="font-size:12px; color:#666; margin-top:4px;">${from} • ${date}</div>
                    <div style="margin-top:6px;">${pills}</div>
                </div>
            </div>
        `;
    }).join('');
    host.innerHTML = rows;
}

async function seedTrashItem(index) {
    try {
        const it = __seedItems[index];
        if (!it) return;
        await fetch('/api/hidden-inbox/add', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ id: it.id, subject: it.subject, date: it.date })
        });
        __seedItems.splice(index, 1);
        renderSeedList();
    } catch (e) {
        showErrorPopup('Failed to hide this item. Please try again.', 'Hide Failed');
    }
}

async function seedEditCategory(index, anchorEl) {
    try {
        // Refresh categories list
        try {
            const resp = await fetch('/api/current-categories');
            const data = await resp.json();
            __seedCategories = Array.isArray(data.categories) ? data.categories : __seedCategories;
        } catch (_) {}

        const it = __seedItems[index];
        if (!it) return;
        if (!Array.isArray(it.categories)) it.categories = [];

        // Remove existing picker
        const existing = document.getElementById('seedCatPicker');
        if (existing) existing.remove();

        // Build picker container
        const picker = document.createElement('div');
        picker.id = 'seedCatPicker';
        picker.style.position = 'absolute';
        picker.style.zIndex = '3000';
        picker.style.background = '#fff';
        picker.style.border = '1px solid #e0e0e0';
        picker.style.borderRadius = '8px';
        picker.style.boxShadow = '0 6px 18px rgba(0,0,0,0.18)';
        picker.style.padding = '10px';
        picker.style.maxWidth = '320px';

        const rect = anchorEl.getBoundingClientRect();
        picker.style.top = (window.scrollY + rect.bottom + 6) + 'px';
        picker.style.left = (window.scrollX + rect.left) + 'px';

        // Selected sets
const selectedSet = new Set([...(it.categories || []), it.category].filter(Boolean));
let primary = it.category || Array.from(selectedSet)[0] || '';

        // Build list of checkboxes + radio for primary
        const list = document.createElement('div');
        list.style.maxHeight = '220px';
        list.style.overflow = 'auto';
        list.style.border = '1px solid #e9ecef';
        list.style.borderRadius = '6px';
        list.style.padding = '8px';
        list.style.marginBottom = '8px';

        const renderRow = (name) => {
            const id = `seed-pick-${index}-${name.replace(/[^a-z0-9]+/gi, '-').toLowerCase()}`;
            const row = document.createElement('label');
            row.style.display = 'flex';
            row.style.alignItems = 'center';
            row.style.justifyContent = 'space-between';
            row.style.gap = '8px';
            row.style.marginBottom = '6px';

            const left = document.createElement('span');
            left.style.display = 'flex';
            left.style.alignItems = 'center';
            left.style.gap = '8px';

            const cb = document.createElement('input');
            cb.type = 'checkbox';
            cb.id = id;
            cb.checked = selectedSet.has(name);
            cb.onchange = () => {
                if (cb.checked) {
                    selectedSet.add(name);
                    if (!primary) primary = name;
                } else {
                    selectedSet.delete(name);
                    if (primary === name) {
                        primary = Array.from(selectedSet)[0] || '';
                    }
                }
            };

            const text = document.createElement('span');
            text.textContent = name;

            left.appendChild(cb);
            left.appendChild(text);

            const right = document.createElement('span');
            const rb = document.createElement('input');
            rb.type = 'radio';
            rb.name = `seed-primary-${index}`;
            rb.checked = (primary === name);
            rb.title = 'Set as primary category';
            rb.onchange = () => {
                if (!selectedSet.has(name)) selectedSet.add(name);
                primary = name;
            };
            right.appendChild(rb);

            row.appendChild(left);
            row.appendChild(right);
            return row;
        };

        // Populate list
        (__seedCategories || []).forEach(name => {
            const row = renderRow(String(name));
            list.appendChild(row);
        });

        // Add new category UI
        const addRow = document.createElement('div');
        addRow.style.display = 'flex';
        addRow.style.gap = '6px';
        addRow.style.margin = '6px 0';
        const input = document.createElement('input');
        input.type = 'text';
        input.placeholder = 'Add new category...';
        input.style.flex = '1';
        input.style.padding = '8px';
        input.style.border = '1px solid #ddd';
        input.style.borderRadius = '6px';
        const addBtn = document.createElement('button');
        addBtn.className = 'select-email-btn';
        addBtn.textContent = 'Add';
        addBtn.style.padding = '6px 10px';
        addBtn.onclick = async () => {
            const n = (input.value || '').trim();
            if (!n) return;
            // Optimistically add to dropdown and selection
            if (!__seedCategories.some(c => String(c).toLowerCase() === n.toLowerCase())) {
                __seedCategories.push(n);
                const row = renderRow(n);
                list.appendChild(row);
            }
            selectedSet.add(n);
            if (!primary) primary = n;
            input.value = '';
            // Persist category name to server list
            try {
                await fetch('/api/categories/add', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ name: n })
                });
            } catch(_) {}
        };

        addRow.appendChild(input);
        addRow.appendChild(addBtn);

        // Action buttons
        const actions = document.createElement('div');
        actions.style.display = 'flex';
        actions.style.justifyContent = 'flex-end';
        actions.style.gap = '8px';
        const apply = document.createElement('button');
        apply.className = 'popup-btn popup-btn-success';
        apply.textContent = 'Apply';
apply.onclick = () => {
    const cats = Array.from(selectedSet);
    // Ensure primary exists if any category selected
    if (!primary && cats.length) primary = cats[0];
    // If nothing was selected, leave uncategorized (no auto-default)
    it.category = primary || '';
    // Store additional categories (excluding primary)
    it.categories = cats.filter(c => String(c).toLowerCase() !== String(it.category || '').toLowerCase());
    renderSeedList();
    picker.remove();
};
        const cancel = document.createElement('button');
        cancel.className = 'popup-btn popup-btn-secondary';
        cancel.textContent = 'Cancel';
        cancel.onclick = () => picker.remove();

        actions.appendChild(cancel);
        actions.appendChild(apply);

        // Compose picker
        const title = document.createElement('div');
        title.textContent = 'Edit Categories';
        title.style.fontWeight = '600';
        title.style.marginBottom = '6px';

        picker.appendChild(title);
        picker.appendChild(list);
        picker.appendChild(addRow);
        picker.appendChild(actions);

        document.body.appendChild(picker);

        // Outside click to close
        const onDocClick = (ev) => {
            if (!picker.contains(ev.target)) {
                try { picker.remove(); } catch(_) {}
                document.removeEventListener('click', onDocClick);
            }
        };
        setTimeout(() => document.addEventListener('click', onDocClick), 0);
    } catch (e) {
        console.error('seedEditCategory failed:', e);
    }
}

function ensureSeedDescriptionsModal() {
    let modal = document.getElementById('seedDescriptionsModal');
    if (modal) return modal;
    modal = document.createElement('div');
    modal.id = 'seedDescriptionsModal';
    modal.className = 'modal';
    modal.innerHTML = `
        <div class="modal-content" style="max-width: 900px; max-height: 80vh; display:flex; flex-direction:column;">
            <div class="modal-header">
                <h2 class="modal-title">Category Descriptions (Optional)</h2>
                <button class="close" onclick="closeSeedDescriptionsModal()">&times;</button>
            </div>
            <div id="seedDescBody" style="padding:16px; flex:1 1 auto; overflow:auto;">
                <div class="loading">Preparing...</div>
            </div>
            <div style="display:flex; justify-content:center; gap:12px; padding:12px 16px; border-top:1px solid #e9ecef;">
                <button class="carousel-btn carousel-btn-cancel" onclick="closeSeedDescriptionsModal()">Skip</button>
                <button class="carousel-btn carousel-btn-add" onclick="saveSeedDescriptions()">Save</button>
            </div>
        </div>
    `;
    modal.addEventListener('click', (ev) => { if (ev.target === modal) closeSeedDescriptionsModal(); });
    document.body.appendChild(modal);
    return modal;
}

function closeSeedDescriptionsModal() {
    const modal = document.getElementById('seedDescriptionsModal');
    if (modal) modal.style.display = 'none';
}

function renderSeedDescriptions(categories) {
    const host = document.getElementById('seedDescBody');
    if (!host) return;
    if (!Array.isArray(categories) || !categories.length) {
        host.innerHTML = '<div class="no-emails" style="padding:12px;">No categories found.</div>';
        return;
    }
    host.innerHTML = categories.map(c => `
        <div style="border:1px solid #e9ecef; border-left:4px solid #c19a6b; border-radius:6px; background:#fff; padding:10px; margin-bottom:10px;">
            <div style="font-weight:600; color:#333; margin-bottom:6px;">${escapeHtml(c)}</div>
            <textarea class="seed-desc" data-cat="${c.replace(/"/g, '"')}"
                      placeholder="Enter an optional description for this category (used to help AI categorization later)."
                      style="width:100%; min-height:80px; padding:10px; border:1px solid #ddd; border-radius:6px; font-size:14px; resize:vertical;"></textarea>
        </div>
    `).join('');
}

async function seedAddAll() {
  try {
    if (!Array.isArray(__seedItems) || __seedItems.length === 0) {
      showErrorPopup('Nothing to add.', 'No Items');
      return;
    }

    // Determine categorized vs uncategorized
    const isCategorized = (it) => {
      const primary = String(it?.category || '').trim();
      const extras = Array.isArray(it?.categories) ? it.categories.filter(Boolean) : [];
      return !!primary || extras.length > 0;
    };
    const toAdd = __seedItems.filter(isCategorized);
    const skippedCount = __seedItems.length - toAdd.length;

    const proceed = async () => {
      if (toAdd.length === 0) {
        closeSeedCategoriesModal();
        showSuccessPopup('No categorized emails to add.', 'Nothing Added');
        return;
      }

      showLoadingOverlay('Saving Emails', `Persisting ${toAdd.length} email${toAdd.length === 1 ? '' : 's'}...`, false);
      try {
        const resp = await fetch('/api/seed-categories/add-all', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ items: toAdd })
        });
        const data = await resp.json();
        hideLoadingOverlay();
        if (!resp.ok || !data.success) throw new Error(data.error || 'Failed to add');

        // Categories involved in this seeding run (from items actually added)
        const cats = Array.from(
          new Set(
            toAdd.flatMap(it => {
              const primary = String(it.category || '').trim();
              const extras = Array.isArray(it.categories) ? it.categories.filter(Boolean) : [];
              return [primary, ...extras].filter(Boolean);
            })
          )
        );

        // Generate summaries for categories that don't already have one (do not overwrite)
        if (cats.length > 0) {
          showLoadingOverlay('Generating Category Summaries', 'Please wait while summaries are generated...', false);
          try {
            await fetch('/api/generate-category-summaries', {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({ categories: cats, overwrite: false })
            }).then(r => r.json()).catch(() => ({}));
          } catch (_) {}
          hideLoadingOverlay();
        }

        // Show optional category descriptions popup
        const modal = ensureSeedDescriptionsModal();
        renderSeedDescriptions(cats);
        modal.style.display = 'block';

        showSuccessPopup(
          `Added ${toAdd.length} item${toAdd.length === 1 ? '' : 's'} to database.${skippedCount > 0 ? ' ' + skippedCount + ' uncategorized skipped.' : ''}`,
          'Added'
        );
      } catch (e) {
        console.error('seedAddAll failed:', e);
        hideLoadingOverlay();
        showErrorPopup('Failed to add items. Please try again.', 'Add Failed');
      }
    };

    if (skippedCount > 0) {
      showCustomPopup({
        title: 'Uncategorized Emails Detected',
        message: `${skippedCount} email${skippedCount === 1 ? '' : 's'} have not been categorized and will not be added to database - please press Confirm to proceed`,
        icon: 'warning',
        primaryText: 'Confirm',
        secondaryText: 'Cancel',
        onPrimary: proceed,
        onSecondary: () => {},
        type: 'confirm'
      });
    } else {
      await proceed();
    }
  } catch (e) {
    console.error('seedAddAll wrapper failed:', e);
    showErrorPopup('Failed to add items. Please try again.', 'Add Failed');
  }
}

async function saveSeedDescriptions() {
    try {
        const fields = Array.from(document.querySelectorAll('#seedDescBody .seed-desc'));
        const summaries = {};
        fields.forEach(f => {
            const cat = f.getAttribute('data-cat');
            const val = (f.value || '').trim();
            if (cat && val) summaries[cat] = val;
        });
        if (Object.keys(summaries).length === 0) {
            closeSeedDescriptionsModal();
            closeSeedCategoriesModal();
            return;
        }
        const resp = await fetch('/api/category-summaries', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ summaries })
        });
        const data = await resp.json();
        if (!resp.ok || !data.success) throw new Error(data.error || 'Save failed');
        showSuccessPopup('Category descriptions saved.', 'Saved');
        closeSeedDescriptionsModal();
        closeSeedCategoriesModal();
    } catch (e) {
        console.error('saveSeedDescriptions failed:', e);
        showErrorPopup('Failed to save descriptions.', 'Save Failed');
    }
}

/* ===== Load More (Important): unified list + AI categorization + Edit Categories ===== */
let __lmItems = [];        // [{ id, subject, from, date, snippet, body, tags: {unreplied, thread}, category }]
let __lmCategories = [];   // authoritative categories list for picker

function ensureLoadMoreResultsModal() {
    let modal = document.getElementById('loadMoreResultsModal');
    if (modal) return modal;
    modal = document.createElement('div');
    modal.id = 'loadMoreResultsModal';
    modal.className = 'modal';
    modal.innerHTML = `
        <div class="modal-content" style="max-width: 1100px; max-height: 80vh; display:flex; flex-direction:column;">
            <div class="modal-header">
                <h2 class="modal-title">Load More (Important)</h2>
                <div style="display:flex; gap:8px; align-items:center;">
                    <button class="select-email-btn" id="lmEditCategoriesBtn" style="background:#6f42c1;" title="Open category editor">Edit Categories</button>
                    <button class="close" onclick="closeLoadMoreResultsModal()">&times;</button>
                </div>
            </div>
            <div style="padding:16px; flex:1 1 auto; overflow:auto;">
                <div id="loadMoreList">
                    <div class="loading">Preparing results...</div>
                </div>
            </div>
            <div style="display:flex; justify-content:center; gap:12px; padding:12px 16px; border-top:1px solid #e9ecef;">
                <button class="carousel-btn carousel-btn-cancel" onclick="closeLoadMoreResultsModal()">Cancel</button>
                <button class="carousel-btn carousel-btn-add" onclick="lmAddAll()">Add All</button>
            </div>
        </div>
    `;
    modal.addEventListener('click', (ev) => { if (ev.target === modal) closeLoadMoreResultsModal(); });
    document.body.appendChild(modal);

    // Wire Edit Categories button
    const editBtn = modal.querySelector('#lmEditCategoriesBtn');
    if (editBtn) {
        editBtn.addEventListener('click', lmOpenEditCategories);
    }
    return modal;
}

function closeLoadMoreResultsModal() {
    const modal = document.getElementById('loadMoreResultsModal');
    if (modal) modal.style.display = 'none';
}

function normalizeSubjectKey(s) {
    return String(s || '').toLowerCase().replace(/^re:\s*/i, '').trim();
}

async function showLoadMoreImportantPrompt() {
    showCustomPopup({
        title: 'Load More Important Emails',
        message: 'Enter the number of important emails/threads to load:',
        icon: 'warning',
        primaryText: 'Load',
        secondaryText: 'Cancel',
        onPrimary: async () => {
            const count = prompt('How many items would you like to load? (1-50)', '10');
            const n = parseInt(count, 10);
            if (!Number.isFinite(n) || n < 1 || n > 50) {
                showErrorPopup('Please enter a number between 1 and 50.', 'Invalid Input');
                return;
            }
            try {
                await lmRunFlow(n);
            } catch (e) {
                console.error('Load More flow failed:', e);
                showErrorPopup('Failed to load more emails. Please try again.', 'Load More Failed');
            }
        },
        onSecondary: () => {},
        type: 'confirm'
    });
}

async function lmRunFlow(count) {
    // Show modal immediately
    const modal = ensureLoadMoreResultsModal();
    modal.style.display = 'block';
    const list = document.getElementById('loadMoreList');
    if (list) list.innerHTML = '<div class="loading">Loading important emails...</div>';

    // Load category list
    try {
        const resp = await fetch('/api/current-categories');
        const data = await resp.json();
        __lmCategories = Array.isArray(data.categories) ? data.categories : [];
    } catch (_) {
        __lmCategories = [];
    }

    // Fetch more important emails (overfetch to allow dedup by subject)
    const overfetch = Math.min(count * 3, 100);
    let rawEmails = [];
    try {
        const resp = await fetch('/api/fetch-more-emails', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ query: 'is:important', maxResults: overfetch })
        });
        const data = await resp.json();
        rawEmails = Array.isArray(data.emails) ? data.emails : [];
        if (resp.status === 401 && data.needsAuth) {
            if (list) list.innerHTML = `
                <div class="error" style="text-align:center;">
                    Gmail authentication required to fetch important emails.<br>
                    <button class="select-email-btn" style="margin-top:8px;" onclick="startAuthentication()">Authenticate</button>
                </div>
            `;
            return;
        }
    } catch (e) {
        if (list) list.innerHTML = '<div class="error">Failed to fetch emails.</div>';
        throw e;
    }

    // Build reference sets from DB to compute tags and threads
    let existingResponses = [];
    let existingThreads = [];
    try {
        const r1 = await fetch('/api/response-emails'); const d1 = await r1.json();
        existingResponses = Array.isArray(d1.emails) ? d1.emails : [];
    } catch (_) {}
    try {
        const r2 = await fetch('/api/search-by-keywords', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ keywords: ['snapshot'], options: { groupBy: 'thread', fields: ['subject','body'] } })
        });
        const d2 = await r2.json();
        existingThreads = Array.isArray(d2.allThreads) ? d2.allThreads : [];
    } catch (_) {}

    const respBySubj = new Set(existingResponses.map(e => normalizeSubjectKey(e.subject)));
    const threadBySubj = new Set(existingThreads.map(t => normalizeSubjectKey(t.subject)));

    // Dedup by normalized subject and produce exactly 'count' items
    const bySubj = new Map();
    for (const e of rawEmails) {
        const key = normalizeSubjectKey(e.subject);
        const tags = {
            unreplied: true, // loaded from inbox
            thread: threadBySubj.has(key) || respBySubj.has(key)
        };
        if (!bySubj.has(key)) {
            bySubj.set(key, { id: e.id, subject: e.subject || 'No Subject', from: e.from || 'Unknown Sender', date: e.date || new Date().toISOString(), snippet: e.snippet || '', body: e.body || '', tags, category: 'Other' });
        } else {
            const curr = bySubj.get(key);
            // keep latest by date
            if (new Date(e.date) > new Date(curr.date)) {
                curr.id = e.id;
                curr.from = e.from || curr.from;
                curr.date = e.date || curr.date;
                curr.snippet = e.snippet || curr.snippet;
                curr.body = e.body || curr.body;
            }
            curr.tags.unreplied = curr.tags.unreplied || tags.unreplied;
            curr.tags.thread = curr.tags.thread || tags.thread;
            bySubj.set(key, curr);
        }
    }

    let items = Array.from(bySubj.values()).sort((a, b) => new Date(b.date) - new Date(a.date)).slice(0, count);
    // Assign default category 'Other'
    items = items.map(it => ({ ...it, category: 'Other' }));
    __lmItems = items;

    // Auto-categorize using server-side AI (with summaries/examples)
    try {
        const payload = {
            emails: __lmItems.map(e => ({
                id: e.id,
                subject: e.subject || '',
                body: typeof e.body === 'string' ? e.body : (e.snippet || ''),
                snippet: e.snippet || '',
                from: e.from || '',
                category: 'Other'
            }))
        };
        const catResp = await fetch('/api/ai-enhanced-categorize', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(payload)
        });
        const catData = await catResp.json();
        if (catData && catData.success && catData.assignments) {
            const map = catData.assignments || {};
            __lmItems = __lmItems.map(it => ({ ...it, category: map[it.id] || it.category || 'Other' }));
        }
    } catch (e) {
        console.warn('AI-enhanced categorize failed; keeping default categories:', e);
    }

    lmRenderList();
}

function lmRenderList() {
    const host = document.getElementById('loadMoreList');
    if (!host) return;
    if (!Array.isArray(__lmItems) || !__lmItems.length) {
        host.innerHTML = '<div class="no-emails">No items found.</div>';
        return;
    }
    host.innerHTML = __lmItems.map((it, i) => {
        const catStyle = getCategoryBadgeStyle(it.category || 'Other');
        const categoryClass = `category-${(it.category || 'Other').toLowerCase().replace(/\\s+/g,'-')}`;
        const tags = [
            it.tags && it.tags.unreplied ? '<span class="email-category" style="background:#e3f2fd;color:#1565c0; margin-right:6px;">Unreplied</span>' : '',
            it.tags && it.tags.thread ? '<span class="email-category" style="background:#f0e8ff;color:#6f42c1; margin-right:6px;">Thread</span>' : ''
        ].join('');
        return `
            <div style="border:1px solid #e9ecef; border-radius:8px; padding:10px; margin-bottom:8px; display:flex; gap:10px; align-items:flex-start;">
                <div style="flex:1 1 auto; min-width:0;">
                    <div style="display:flex; align-items:center; justify-content:space-between; gap:8px;">
                        <div style="font-weight:600; color:#333; overflow:hidden; text-overflow:ellipsis; white-space:nowrap;">${escapeHtml(it.subject || 'No Subject')}</div>
                        <div style="display:flex; align-items:center; gap:8px;">
                            ${tags}
                            <span class="email-category ${categoryClass}" data-lm-cat="${i}" style="${catStyle}; cursor:pointer;" title="Click to change category" onclick="lmEditCategory(${i}, this)">${escapeHtml(it.category || 'Other')}</span>
                            <button class="refinement-delete-btn" title="Hide this item" onclick="lmTrashItem(${i})">🗑️</button>
                        </div>
                    </div>
                    <div style="font-size:12px; color:#666; margin-top:4px;">${escapeHtml(it.from || 'Unknown Sender')} • ${formatDate(it.date || new Date().toISOString())}</div>
                    ${it.snippet ? `<div style="font-size:12px; color:#777; margin-top:6px; line-height:1.4;">${escapeHtml(it.snippet)}</div>` : ''}
                </div>
            </div>
        `;
    }).join('');
}

async function lmTrashItem(index) {
    try {
        const it = __lmItems[index];
        if (!it) return;
        await fetch('/api/hidden-inbox/add', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ id: it.id, subject: it.subject, date: it.date })
        });
        __lmItems.splice(index, 1);
        lmRenderList();
    } catch (e) {
        showErrorPopup('Failed to hide this item. Please try again.', 'Hide Failed');
    }
}

async function lmEditCategory(index, anchorEl) {
    try {
        // Refresh authoritative categories to include any newly added ones
        try {
            const resp = await fetch('/api/current-categories');
            const data = await resp.json();
            __lmCategories = Array.isArray(data.categories) ? data.categories : __lmCategories;
        } catch (_) {}

        const it = __lmItems[index];
        if (!it) return;

        // Remove any existing picker
        const existing = document.getElementById('lmCatPicker');
        if (existing) existing.remove();

        const picker = document.createElement('div');
        picker.id = 'lmCatPicker';
        picker.style.position = 'absolute';
        picker.style.zIndex = '3000';
        picker.style.background = '#fff';
        picker.style.border = '1px solid #e0e0e0';
        picker.style.borderRadius = '6px';
        picker.style.boxShadow = '0 4px 12px rgba(0,0,0,0.15)';
        picker.style.padding = '8px';

        const rect = anchorEl.getBoundingClientRect();
        picker.style.top = (window.scrollY + rect.bottom + 6) + 'px';
        picker.style.left = (window.scrollX + rect.left) + 'px';

        const sel = document.createElement('select');
        sel.style.padding = '8px';
        sel.style.minWidth = '220px';
        sel.style.border = '1px solid #ddd';
        sel.style.borderRadius = '6px';
        const opts = (__lmCategories || []).map(c => `<option ${String(c).toLowerCase() === String(it.category || '').toLowerCase() ? 'selected' : ''}>${c}</option>`).join('');
        sel.innerHTML = opts + `<option value="__add__">Add Category...</option>`;

        const applyBtn = document.createElement('button');
        applyBtn.className = 'popup-btn popup-btn-success';
        applyBtn.style.marginLeft = '8px';
        applyBtn.textContent = 'Apply';
        applyBtn.onclick = async () => {
            const val = sel.value;
            if (val === '__add__') {
                const name = prompt('Enter new category name:');
                const n = (name || '').trim();
                if (!n) return;
                try {
                    const resp = await fetch('/api/categories/add', {
                        method: 'POST',
                        headers: { 'Content-Type': 'application/json' },
                        body: JSON.stringify({ name: n })
                    });
                    const data = await resp.json();
                    if (!resp.ok || !data.success) throw new Error(data.error || 'Failed to add category');
                    __lmCategories = data.categories || __lmCategories;
                    it.category = n;
                    lmRenderList();
                } catch (e) {
                    showErrorPopup('Failed to add category. Please try again.', 'Add Category Failed');
                }
            } else {
                it.category = val;
                lmRenderList();
            }
            picker.remove();
        };

        const cancelBtn = document.createElement('button');
        cancelBtn.className = 'popup-btn popup-btn-secondary';
        cancelBtn.style.marginLeft = '8px';
        cancelBtn.textContent = 'Cancel';
        cancelBtn.onclick = () => picker.remove();

        picker.appendChild(sel);
        picker.appendChild(applyBtn);
        picker.appendChild(cancelBtn);
        document.body.appendChild(picker);

        const onDocClick = (ev) => {
            if (!picker.contains(ev.target)) {
                try { picker.remove(); } catch(_) {}
                document.removeEventListener('click', onDocClick);
            }
        };
        setTimeout(() => document.addEventListener('click', onDocClick), 0);
    } catch (e) {
        console.error('lmEditCategory failed:', e);
    }
}

/* Persist all loaded items to unreplied-emails.json (emails) */
async function lmAddAll() {
    try {
        if (!Array.isArray(__lmItems) || !__lmItems.length) {
            closeLoadMoreResultsModal();
            return;
        }
        showLoadingOverlay('Saving Emails', `Persisting ${__lmItems.length} email${__lmItems.length === 1 ? '' : 's'}...`, false);
        for (let i = 0; i < __lmItems.length; i++) {
            const it = __lmItems[i];
            updateLoadingOverlayMessage('Saving Emails', `Saving ${i + 1} of ${__lmItems.length}...`);
            try {
                // Ensure any novel category names are appended to categories.json
                if (__lmCategories && !__lmCategories.some(c => String(c).toLowerCase() === String(it.category || '').toLowerCase())) {
                    try {
                        await fetch('/api/categories/add', {
                            method: 'POST',
                            headers: { 'Content-Type': 'application/json' },
                            body: JSON.stringify({ name: it.category || 'Other' })
                        });
                        // Refresh categories cache
                        try {
                            const r = await fetch('/api/current-categories');
                            const d = await r.json();
                            __lmCategories = Array.isArray(d.categories) ? d.categories : __lmCategories;
                        } catch (_){}
                    } catch (_){}
                }
                await fetch('/api/add-approved-email', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ email: {
                        id: it.id,
                        subject: it.subject || 'No Subject',
                        from: it.from || 'Unknown Sender',
                        date: it.date || new Date().toISOString(),
                        body: it.body || it.snippet || '',
                        snippet: it.snippet || (it.body ? String(it.body).slice(0, 100) + (it.body.length > 100 ? '...' : '') : ''),
                        category: it.category || 'Other'
                    }})
                });
            } catch (e) {
                console.warn('Failed to save email:', it.id, e);
            }
        }
        hideLoadingOverlay();
        closeLoadMoreResultsModal();
        showSuccessPopup('All items saved successfully.', 'Saved');

        // Refresh RHS lists
        try { loadEmails(); } catch (_){}
        try { loadUnrepliedEmails(); } catch (_){}
    } catch (e) {
        console.error('lmAddAll failed:', e);
        try { hideLoadingOverlay(); } catch (_){}
        showErrorPopup('Failed to save items. Please try again.', 'Save Failed');
    }
}

/* Build categoriesState from __lmItems and open the carousel editor */
function lmOpenEditCategories() {
    try {
        // Build categoriesState similar to Edit Categories & Notes editor (group by assigned category)
        const groupsBy = new Map();
        (__lmItems || []).forEach(e => {
            const name = e.category || 'Other';
            const list = groupsBy.get(name) || [];
            list.push({
                id: e.id,
                subject: e.subject || 'No Subject',
                from: e.from || 'Unknown Sender',
                date: e.date || new Date().toISOString(),
                snippet: e.snippet || (e.body ? String(e.body).slice(0, 120) + (e.body.length > 120 ? '...' : '') : '')
            });
            groupsBy.set(name, list);
        });
        // Compose categoriesState with "new" items highlighted later in carousel
        categoriesState = Array.from(groupsBy.keys()).map(name => ({
            name,
            originalName: name,
            emails: groupsBy.get(name)
        }));
        // Launch the same carousel editing experience
        openCarouselEditing();
    } catch (e) {
        console.error('lmOpenEditCategories failed:', e);
        showErrorPopup('Failed to open Edit Categories.', 'Open Failed');
    }
}
/* ===== Aggregate Category Summaries (multi-category view) ===== */
function ensureAggregateCategorySummariesModal() {
    let modal = document.getElementById('aggregateCategorySummariesModal');
    if (modal) return modal;
    modal = document.createElement('div');
    modal.id = 'aggregateCategorySummariesModal';
    modal.className = 'modal';
    modal.innerHTML = `
        <div class="modal-content" style="max-width: 900px; max-height: 80vh; display:flex; flex-direction:column;">
            <div class="modal-header">
                <h2 class="modal-title">Category Summaries</h2>
                <button class="close" onclick="closeAggregateCategorySummariesModal()">&times;</button>
            </div>
            <div id="aggregateSummariesBody" style="padding:16px; flex:1 1 auto; overflow:auto;">
                <div class="loading">Loading summaries...</div>
            </div>
        </div>
    `;
    modal.addEventListener('click', (ev) => { if (ev.target === modal) closeAggregateCategorySummariesModal(); });
    document.body.appendChild(modal);
    return modal;
}
function closeAggregateCategorySummariesModal() {
    const modal = document.getElementById('aggregateCategorySummariesModal');
    if (modal) modal.style.display = 'none';
}
async function showAggregateCategorySummariesModal(categories) {
    try {
        const cats = Array.isArray(categories) ? categories.slice() : (categories ? [categories] : []);
        const modal = ensureAggregateCategorySummariesModal();
        const body = document.getElementById('aggregateSummariesBody');
        if (body) body.innerHTML = '<div class="loading">Loading summaries...</div>';
        modal.style.display = 'block';

        let summaries = {};
        try {
            const resp = await fetch('/api/category-summaries');
            const data = await resp.json();
            summaries = (data && data.summaries) || {};
        } catch (e) {
            summaries = {};
        }

        const sections = cats.map(cat => {
            const txt = summaries && typeof summaries[cat] === 'string' ? summaries[cat] : '(No summary saved)';
            return `
                <div style="border:1px solid #e9ecef; border-left:4px solid #5a67d8; border-radius:6px; background:#fff; padding:12px; margin-bottom:10px;">
                    <div style="display:flex; justify-content:space-between; align-items:center; margin-bottom:8px;">
                        <div style="font-weight:600; color:#333;">${escapeHtml(cat)}</div>
                        <div style="display:flex; gap:8px;">
                            <button class="select-email-btn" style="background:#5a67d8;" onclick="showCategorySummaryModal('${String(cat).replace(/'/g, "\\'")}')">Open Q&A</button>
                        </div>
                    </div>
                    <div style="white-space:pre-wrap; font-size:14px; color:#333;">${escapeHtml(txt)}</div>
                </div>
            `;
        }).join('');

        if (body) {
            body.innerHTML = cats.length ? sections : '<div class="no-emails" style="padding:12px;">No categories selected.</div>';
        }
    } catch (e) {
        console.error('showAggregateCategorySummariesModal failed:', e);
        showErrorPopup('Failed to load category summaries.', 'Load Failed');
    }
}

/* ===== See Email Notes from Generate Response ===== */
function showEmailNotesForContext() {
    try {
        const id = window.currentContextEmailId || '';
        if (!id) {
            showErrorPopup('No email selected for notes.', 'No Email');
            return;
        }
        const modal = ensureEmailNotesModal();
        modal.style.display = 'block';
        loadEmailNotesMain(id);
    } catch (e) {
        console.error('showEmailNotesForContext failed:', e);
        showErrorPopup('Failed to open email notes.', 'Open Failed');
    }
}
/* ===== See All Categories (counts + delete/migrate) ===== */
function ensureSeeAllCategoriesModal() {
    let modal = document.getElementById('seeAllCategoriesModal');
    if (modal) return modal;
    modal = document.createElement('div');
    modal.id = 'seeAllCategoriesModal';
    modal.className = 'modal';
    modal.innerHTML = `
        <div class="modal-content" style="max-width: 640px; max-height: 80vh; display:flex; flex-direction:column;">
            <div class="modal-header" style="border-bottom: 2px solid #0ea5e9;">
                <h2 class="modal-title">All Categories</h2>
                <button class="close" onclick="closeSeeAllCategoriesModal()">&times;</button>
            </div>
            <div id="allCategoriesBody" style="padding: 16px; overflow:auto; max-height: 60vh;">
                <div class="loading">Loading categories…</div>
            </div>
            <div style="display:flex; justify-content:center; gap:12px; padding: 12px 16px; border-top:1px solid #e9ecef;">
                <button class="carousel-btn carousel-btn-cancel" onclick="closeSeeAllCategoriesModal()">Close</button>
            </div>
        </div>
    `;
    modal.addEventListener('click', (ev) => { if (ev.target === modal) closeSeeAllCategoriesModal(); });
    document.body.appendChild(modal);
    return modal;
}
function closeSeeAllCategoriesModal() {
    const modal = document.getElementById('seeAllCategoriesModal');
    if (modal) modal.style.display = 'none';
}
async function showSeeAllCategoriesModal() {
    const modal = ensureSeeAllCategoriesModal();
    const body = document.getElementById('allCategoriesBody');
    if (body) body.innerHTML = '<div class="loading">Loading categories…</div>';
    modal.style.display = 'block';
    try {
        const resp = await fetch('/api/categories/all-with-counts');
        const data = await resp.json();
        if (!resp.ok || !data || !Array.isArray(data.categories)) {
            throw new Error(data.error || 'Failed to load categories');
        }
        renderAllCategoriesList(data.categories);
    } catch (e) {
        if (body) body.innerHTML = '<div class="error">Failed to load categories. Please try again.</div>';
        console.error('showSeeAllCategoriesModal failed:', e);
    }
}
function renderAllCategoriesList(list) {
    const body = document.getElementById('allCategoriesBody');
    if (!body) return;
    const items = Array.isArray(list) ? list.slice() : [];
    if (!items.length) {
        body.innerHTML = '<div class="no-emails" style="padding:12px;">No categories found.</div>';
        return;
    }
    // Keep "Other" last
    items.sort((a, b) => {
        const ao = String(a.name || '').toLowerCase() === 'other' ? 1 : 0;
        const bo = String(b.name || '').toLowerCase() === 'other' ? 1 : 0;
        if (ao !== bo) return ao - bo;
        return String(a.name || '').localeCompare(String(b.name || ''));
    });
    const rows = items.map(c => {
        const name = String(c.name || '');
        const count = Number.isFinite(c.count) ? c.count : 0;
        const isOther = name.toLowerCase() === 'other';
        return `
            <div style="display:flex; align-items:center; justify-content:space-between; gap:12px; border:1px solid #e9ecef; border-left:4px solid #0ea5e9; border-radius:6px; padding:10px; margin-bottom:8px; background:#fff;">
                <div style="display:flex; align-items:center; gap:10px; min-width:0;">
                    <div style="font-weight:600; color:#333; overflow:hidden; text-overflow:ellipsis;">${escapeHtml(name)}</div>
                    <span class="email-category" style="background:#f1f3f4; color:#333; padding:3px 10px; border-radius:12px; font-size:12px;">${count}</span>
                </div>
                <div style="display:flex; gap:8px;">
                    <button class="refinement-delete-btn" title="${isOther ? 'Cannot delete Other' : 'Delete and migrate emails to “Other”'}" ${isOther ? 'disabled' : ''} onclick="${isOther ? '' : `deleteCategoryAndRefresh('${name.replace(/'/g, "\\'")}')`}">Delete</button>
                </div>
            </div>
        `;
    }).join('');
    body.innerHTML = `
        <div style="color:#666; font-size:13px; margin-bottom:8px;">
            Deleting a category will migrate its emails to “Other”.
        </div>
        ${rows}
    `;
}
function deleteCategoryAndRefresh(name) {
    showConfirmPopup(
        `Delete category “${name}”? All its emails will be moved to “Other”.`,
        async () => {
            try {
                const resp = await fetch(`/api/categories/${encodeURIComponent(name)}`, { method: 'DELETE' });
                const data = await resp.json();
                if (!resp.ok || !data.success) throw new Error(data.error || 'Delete failed');
                const movedR = (data.moved && typeof data.moved.responses === 'number') ? data.moved.responses : 0;
                const movedU = (data.moved && typeof data.moved.unreplied === 'number') ? data.moved.unreplied : 0;
                showSuccessPopup(`Deleted “${name}”. Migrated ${movedR} responses and ${movedU} unreplied to “Other”.`, 'Category Deleted');
                // Refresh lists and sidebar
                try { await loadCurrentCategories(); } catch (_){}
                try { await loadEmails(); } catch (_){}
                // Re-fetch category counts list
                showSeeAllCategoriesModal();
            } catch (e) {
                console.error('deleteCategory failed:', e);
                showErrorPopup('Failed to delete category. Please try again.', 'Delete Failed');
            }
        },
        () => {},
        'Delete Category'
    );
}
/* ===== End See All Categories ===== */
