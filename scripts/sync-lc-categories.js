const { initMongo, setUserDoc } = require('../db');
const fs = require('fs');
const path = require('path');

async function syncCategories() {
  try {
    const userEmail = 'lc3251@columbia.edu';
    
    // Initialize MongoDB
    await initMongo();
    console.log('MongoDB initialized');
    
    // Load categories from file
    const categoriesPath = path.join(__dirname, '..', 'data', userEmail, 'categories.json');
    const categoriesData = JSON.parse(fs.readFileSync(categoriesPath, 'utf8'));
    console.log(`Loaded categories for ${userEmail}:`, categoriesData.categories);
    
    // Save to MongoDB
    await setUserDoc('categories', userEmail, categoriesData);
    console.log('✓ Categories synced to MongoDB');
    
    // Load summaries from file
    const summariesPath = path.join(__dirname, '..', 'data', userEmail, 'categorysummaries.json');
    const summariesData = JSON.parse(fs.readFileSync(summariesPath, 'utf8'));
    console.log(`Loaded ${Object.keys(summariesData.summaries).length} category summaries`);
    
    // Save to MongoDB
    await setUserDoc('category_summaries', userEmail, summariesData);
    console.log('✓ Category summaries synced to MongoDB');
    
    console.log('\n✓ Successfully synced all data to MongoDB for', userEmail);
    process.exit(0);
  } catch (error) {
    console.error('Error syncing to MongoDB:', error);
    process.exit(1);
  }
}

syncCategories();
