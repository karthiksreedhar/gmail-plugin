const fetch = require('node-fetch');

async function testAPIFormatting() {
  try {
    console.log('Testing API formatting preservation...\n');
    
    const response = await fetch('http://localhost:3000/api/response-emails');
    const data = await response.json();
    
    // Find the email with "woke up under the weather"
    const testEmail = data.emails.find(email => 
      email.body && email.body.includes('woke up under the weather')
    );
    
    if (testEmail) {
      console.log('=== FOUND TEST EMAIL ===');
      console.log('Subject:', testEmail.subject);
      console.log('Body length:', testEmail.body.length);
      console.log('\n=== EMAIL BODY ===');
      console.log(testEmail.body);
      console.log('\n=== ANALYSIS ===');
      console.log('Contains \\n characters:', testEmail.body.includes('\n'));
      console.log('Number of \\n characters:', (testEmail.body.match(/\n/g) || []).length);
      
      // Check if it has proper line breaks
      const lines = testEmail.body.split('\n');
      console.log('Number of lines:', lines.length);
      console.log('First few lines:');
      lines.slice(0, 5).forEach((line, i) => {
        console.log(`  ${i + 1}: "${line}"`);
      });
    } else {
      console.log('Test email not found. Available emails:');
      data.emails.slice(0, 3).forEach(email => {
        console.log(`- ${email.subject}`);
        console.log(`  Body preview: ${email.body.substring(0, 100)}...`);
      });
    }
    
  } catch (error) {
    console.error('Error testing API:', error.message);
  }
}

testAPIFormatting();
