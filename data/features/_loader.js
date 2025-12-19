/**
 * Feature Loader System
 * 
 * This module provides a hook-based system for loading and executing custom features.
 * Features are defined in separate .js files in the data/features/ directory.
 * 
 * Usage in server.js:
 *   const features = require('./data/features/_loader');
 *   await features.init();
 *   const results = await features.executeHook('onEmailsLoaded', { emails, user });
 */

const fs = require('fs');
const path = require('path');

const FEATURES_DIR = __dirname;
const REGISTRY_PATH = path.join(FEATURES_DIR, '_registry.json');

// In-memory feature store
let loadedFeatures = [];
let registry = { enabled: {}, config: {} };

/**
 * Load the registry file (enabled/disabled features + saved configs)
 */
function loadRegistry() {
  try {
    if (fs.existsSync(REGISTRY_PATH)) {
      const data = JSON.parse(fs.readFileSync(REGISTRY_PATH, 'utf8'));
      registry = {
        enabled: data.enabled || {},
        config: data.config || {}
      };
    }
  } catch (e) {
    console.warn('[Features] Failed to load registry:', e?.message);
    registry = { enabled: {}, config: {} };
  }
  return registry;
}

/**
 * Save the registry file
 */
function saveRegistry() {
  try {
    fs.writeFileSync(REGISTRY_PATH, JSON.stringify(registry, null, 2));
  } catch (e) {
    console.error('[Features] Failed to save registry:', e?.message);
  }
}

/**
 * Load all feature files from the features directory
 */
function loadFeatures() {
  loadedFeatures = [];
  
  try {
    const files = fs.readdirSync(FEATURES_DIR);
    
    for (const file of files) {
      // Skip loader, registry, and non-JS files
      if (file.startsWith('_') || !file.endsWith('.js')) continue;
      
      const featurePath = path.join(FEATURES_DIR, file);
      
      try {
        // Clear require cache to allow hot-reloading
        delete require.cache[require.resolve(featurePath)];
        
        const feature = require(featurePath);
        
        if (!feature.name) {
          console.warn(`[Features] Skipping ${file}: missing 'name' export`);
          continue;
        }
        
        // Set default enabled state (true by default for new features)
        if (registry.enabled[feature.name] === undefined) {
          registry.enabled[feature.name] = true;
        }
        
        // Merge saved config with feature's default config
        if (feature.config && registry.config[feature.name]) {
          feature.config = { ...feature.config, ...registry.config[feature.name] };
        }
        
        loadedFeatures.push({
          ...feature,
          _file: file,
          _path: featurePath
        });
        
        console.log(`[Features] Loaded: ${feature.name} (triggers: ${(feature.triggers || []).join(', ')})`);
      } catch (e) {
        console.error(`[Features] Failed to load ${file}:`, e?.message);
      }
    }
    
    saveRegistry();
  } catch (e) {
    console.error('[Features] Failed to scan features directory:', e?.message);
  }
  
  return loadedFeatures;
}

/**
 * Initialize the feature system
 */
async function init() {
  console.log('[Features] Initializing feature system...');
  loadRegistry();
  loadFeatures();
  console.log(`[Features] Loaded ${loadedFeatures.length} feature(s)`);
  return { featureCount: loadedFeatures.length };
}

/**
 * Execute all features registered for a specific hook
 * @param {string} hookName - The hook to execute (e.g., 'onEmailsLoaded')
 * @param {object} context - Context data passed to each feature
 * @returns {Promise<Array>} - Results from all executed features
 */
async function executeHook(hookName, context = {}) {
  const results = [];
  
  for (const feature of loadedFeatures) {
    // Skip disabled features
    if (!registry.enabled[feature.name]) continue;
    
    // Check if this feature listens to this hook
    const triggers = feature.triggers || [];
    if (!triggers.includes(hookName) && !triggers.includes('*')) continue;
    
    try {
      if (typeof feature.execute === 'function') {
        const result = await feature.execute({
          ...context,
          hook: hookName,
          featureName: feature.name,
          featureConfig: feature.config || {}
        });
        
        if (result) {
          results.push({
            feature: feature.name,
            hook: hookName,
            result
          });
        }
      }
    } catch (e) {
      console.error(`[Features] Error executing ${feature.name} on ${hookName}:`, e?.message);
      results.push({
        feature: feature.name,
        hook: hookName,
        error: e?.message || 'Unknown error'
      });
    }
  }
  
  return results;
}

/**
 * Get list of all loaded features with their status
 */
function listFeatures() {
  return loadedFeatures.map(f => ({
    name: f.name,
    description: f.description || '',
    triggers: f.triggers || [],
    enabled: registry.enabled[f.name] !== false,
    hasConfig: !!f.config,
    file: f._file
  }));
}

/**
 * Enable or disable a feature
 */
function setFeatureEnabled(featureName, enabled) {
  registry.enabled[featureName] = !!enabled;
  saveRegistry();
  return { name: featureName, enabled: registry.enabled[featureName] };
}

/**
 * Update a feature's configuration
 */
function updateFeatureConfig(featureName, config) {
  registry.config[featureName] = config;
  
  // Update in-memory feature config
  const feature = loadedFeatures.find(f => f.name === featureName);
  if (feature) {
    feature.config = { ...feature.config, ...config };
  }
  
  saveRegistry();
  return { name: featureName, config: registry.config[featureName] };
}

/**
 * Get a specific feature's details
 */
function getFeature(featureName) {
  const feature = loadedFeatures.find(f => f.name === featureName);
  if (!feature) return null;
  
  return {
    name: feature.name,
    description: feature.description || '',
    triggers: feature.triggers || [],
    enabled: registry.enabled[feature.name] !== false,
    config: feature.config || {},
    file: feature._file
  };
}

/**
 * Reload all features (useful after adding new feature files)
 */
function reload() {
  console.log('[Features] Reloading features...');
  loadRegistry();
  loadFeatures();
  return { featureCount: loadedFeatures.length };
}

module.exports = {
  init,
  executeHook,
  listFeatures,
  getFeature,
  setFeatureEnabled,
  updateFeatureConfig,
  reload
};
