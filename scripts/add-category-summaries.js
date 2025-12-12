#!/usr/bin/env node

/**
 * Add category summaries for "Flights" and "Student Interest" 
 * for user lc3251@columbia.edu
 * - Updates both local JSON file and MongoDB
 */

const fs = require('fs');
const path = require('path');
const { initMongo, getUserDoc, setUserDoc } = require('../db');

const USER_EMAIL = 'lc3251@columbia.edu';
const USER_DATA_DIR = path.join(__dirname, '..', 'data', USER_EMAIL);

// Define the new summaries
const NEW_SUMMARIES = {
  'Flights': `This category collects all air-travel–related email, centered on active and upcoming trips. Common messages include:
• Booking confirmations, e-tickets, and itinerary receipts from airlines and partner services.
• Operational updates such as gate changes, schedule adjustments, delays, cancellations, or aircraft swaps.
• Check-in reminders, boarding notifications, seat assignments, upgrade offers, and baggage receipts.
• Post-flight items like baggage claims, delay acknowledgments, vouchers, or compensation notices.
Sender intent & common asks
Airlines are primarily informing you of status changes or requesting timely action: check in, review a modified itinerary, confirm acceptance of a change, download a boarding pass, or track checked baggage. Some messages are purely informational but time-sensitive.
Triage & response
Scan immediately when traveling or within 72 hours of departure.
Flag delays, gate changes, or rebooking notices; verify connection impact.
Save confirmations and baggage receipts until the trip is fully completed.
Calendar check-in windows and departure times automatically.
Archive marketing or upgrade offers once reviewed.
Style & policy notes
Do not forward booking details unnecessarily. Keep record locators, ticket numbers, and baggage tags accessible until travel concludes.`,

  'Student Interest': `Student Interest (Research Inquiries)
This folder contains inbound messages from undergraduate or master's students expressing interest in getting involved in research. Typical emails include:
• Cold outreach from students asking to join a lab, collaborate on a project, or work as a research assistant (paid or for credit).
• Follow-ups referencing a class, talk, paper, website, or recommendation from another faculty member or student.
• Requests for meetings, office hours, or brief introductory calls to discuss potential involvement.
• Attachments such as résumés, transcripts, GitHub links, writing samples, or short project pitches.
Sender intent & common asks
Senders are seeking mentorship, research experience, or affiliation with ongoing work. Common requests include a meeting, guidance on how to get involved, feedback on fit, or consideration for an open or future position.
Triage & response
Skim for signals of fit (relevant coursework, skills, or specific reference to current projects).
Flag strong matches for follow-up; archive generic or misaligned inquiries.
Reply within 3–7 days using a courteous, expectation-setting response.
Share standard prerequisites (skills, time commitment, funding constraints) or redirect to lab website/materials.
Schedule meetings only when mutual fit or capacity is likely.
Style & policy notes
Be encouraging but realistic. Avoid committing to supervision or funding prematurely. Keep responses brief, kind, and consistent; use a template when possible. Do not collect or store transcripts or sensitive records unless a formal role is under consideration.`
};

async function updateLocalFile() {
  const filePath = path.join(USER_DATA_DIR, 'categorysummaries.json');
  
  try {
    let data = { summaries: {} };
    
    // Load existing data if file exists
    if (fs.existsSync(filePath)) {
      data = JSON.parse(fs.readFileSync(filePath, 'utf8'));
      if (!data.summaries || typeof data.summaries !== 'object') {
        data.summaries = {};
      }
    }
    
    let added = 0;
    for (const [category, summary] of Object.entries(NEW_SUMMARIES)) {
      if (!data.summaries[category]) {
        data.summaries[category] = summary;
        added++;
        console.log(`  ✓ Added: "${category}"`);
      } else {
        console.log(`  ⚠️  Skipped: "${category}" (already exists)`);
      }
    }
    
    // Add updatedAt timestamp
    data.updatedAt = new Date().toISOString();
    
    // Ensure directory exists
    if (!fs.existsSync(USER_DATA_DIR)) {
      fs.mkdirSync(USER_DATA_DIR, { recursive: true });
    }
    
    // Write the file
    fs.writeFileSync(filePath, JSON.stringify(data, null, 2));
    
    return { success: true, added, total: Object.keys(data.summaries).length };
  } catch (error) {
    console.error(`  ❌ Error updating local file:`, error.message);
    return { success: false, error: error.message };
  }
}

async function updateMongoDB() {
  try {
    const doc = await getUserDoc('category_summaries', USER_EMAIL);
    
    let summaries = {};
    if (doc && doc.summaries && typeof doc.summaries === 'object') {
      summaries = { ...doc.summaries };
    }
    
    let added = 0;
    for (const [category, summary] of Object.entries(NEW_SUMMARIES)) {
      if (!summaries[category]) {
        summaries[category] = summary;
        added++;
        console.log(`  ✓ Added: "${category}"`);
      } else {
        console.log(`  ⚠️  Skipped: "${category}" (already exists)`);
      }
    }
    
    // Update MongoDB
    await setUserDoc('category_summaries', USER_EMAIL, {
      summaries,
      updatedAt: new Date().toISOString()
    });
    
    return { success: true, added, total: Object.keys(summaries).length };
  } catch (error) {
    console.error(`  ❌ Error updating MongoDB:`, error.message);
    return { success: false, error: error.message };
  }
}

async function main() {
  console.log('\n📝 Adding Category Summaries for lc3251@columbia.edu');
  console.log('='.repeat(70));
  console.log('Adding summaries for: Flights, Student Interest\n');

  try {
    // Connect to MongoDB
    console.log('📡 Connecting to MongoDB...');
    await initMongo();
    console.log('✅ Connected to MongoDB\n');

    // Update local file
    console.log('📄 Updating categorysummaries.json...');
    const localResult = await updateLocalFile();

    // Update MongoDB
    console.log('\n📄 Updating category_summaries in MongoDB...');
    const mongoResult = await updateMongoDB();

    // Summary
    console.log('\n' + '='.repeat(70));
    console.log('📊 Summary:');
    console.log('='.repeat(70));
    
    if (localResult.success) {
      console.log(`\nLocal File:`);
      console.log(`  Added: ${localResult.added} new summaries`);
      console.log(`  Total: ${localResult.total} summaries in file`);
    } else {
      console.log(`\n❌ Local File Update Failed: ${localResult.error}`);
    }
    
    if (mongoResult.success) {
      console.log(`\nMongoDB:`);
      console.log(`  Added: ${mongoResult.added} new summaries`);
      console.log(`  Total: ${mongoResult.total} summaries in collection`);
    } else {
      console.log(`\n❌ MongoDB Update Failed: ${mongoResult.error}`);
    }
    
    const totalAdded = (localResult.added || 0) + (mongoResult.added || 0);
    console.log(`\n✅ Total summaries added: ${totalAdded}`);
    console.log('='.repeat(70));

    process.exit(0);
  } catch (error) {
    console.error('\n❌ Fatal error:', error);
    process.exit(1);
  }
}

main();
