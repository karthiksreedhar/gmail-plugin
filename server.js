const express = require('express');
const cors = require('cors');
const path = require('path');
const fs = require('fs');
const OpenAI = require('openai');

// Initialize OpenAI client
const openai = new OpenAI({
  apiKey: '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'
});

const app = express();
const PORT = 3000;

// Middleware
app.use(cors());
app.use(express.json());
app.use(express.static('public'));

// Data file paths - user-specific storage
const USER_EMAIL = 'ks4190@columbia.edu';
const USER_DATA_DIR = path.join(__dirname, 'data', USER_EMAIL);
const DATA_FILE_PATH = path.join(USER_DATA_DIR, 'scenarios.json');
const RESPONSE_EMAILS_PATH = path.join(USER_DATA_DIR, 'response-emails.json');
const EMAIL_THREADS_PATH = path.join(USER_DATA_DIR, 'email-threads.json');
const TEST_EMAILS_PATH = path.join(USER_DATA_DIR, 'test-emails.json');
const UNREPLIED_EMAILS_PATH = path.join(USER_DATA_DIR, 'unreplied-emails.json');

// Function to load data from file
function loadDataFromFile() {
  try {
    if (fs.existsSync(DATA_FILE_PATH)) {
      const data = fs.readFileSync(DATA_FILE_PATH, 'utf8');
      const parsedData = JSON.parse(data);
      return {
        scenarios: parsedData.scenarios || [],
        refinements: parsedData.refinements || [],
        savedGenerations: parsedData.savedGenerations || []
      };
    }
  } catch (error) {
    console.error('Error loading data from file:', error);
  }
  return {
    scenarios: [],
    refinements: [],
    savedGenerations: []
  };
}

// Function to save data to file
function saveDataToFile(data) {
  try {
    // Ensure data directory exists
    const dataDir = path.dirname(DATA_FILE_PATH);
    if (!fs.existsSync(dataDir)) {
      fs.mkdirSync(dataDir, { recursive: true });
    }
    
    fs.writeFileSync(DATA_FILE_PATH, JSON.stringify(data, null, 2));
    console.log('Data saved to file successfully');
  } catch (error) {
    console.error('Error saving data to file:', error);
  }
}

// Function to load email data from JSON files
function loadEmailData(filePath) {
  try {
    if (fs.existsSync(filePath)) {
      const data = fs.readFileSync(filePath, 'utf8');
      return JSON.parse(data);
    }
  } catch (error) {
    console.error(`Error loading email data from ${filePath}:`, error);
  }
  return null;
}

// Function to load response emails from JSON file
function loadResponseEmails() {
  const data = loadEmailData(RESPONSE_EMAILS_PATH);
  return data ? data.emails || [] : [];
}

// Function to load email threads from JSON file
function loadEmailThreads() {
  const data = loadEmailData(EMAIL_THREADS_PATH);
  return data ? data.threads || [] : [];
}

// Function to load test emails from JSON file
function loadTestEmails() {
  const data = loadEmailData(TEST_EMAILS_PATH);
  return data ? data.emails || [] : [];
}

// Function to load unreplied emails from JSON file
function loadUnrepliedEmails() {
  const data = loadEmailData(UNREPLIED_EMAILS_PATH);
  return data ? data.emails || [] : [];
}

// Load initial data from file
const persistentData = loadDataFromFile();

// Store for email memory/categories, refinements, saved generations, and scenarios
let emailMemory = {
  categories: [],
  responses: [],
  refinements: persistentData.refinements,
  savedGenerations: persistentData.savedGenerations,
  scenarios: persistentData.scenarios
};

// Email categorization logic for CS PhD student with MS in Journalism who TAs
function categorizeEmail(subject, body, from) {
  const subjectLower = subject.toLowerCase();
  const bodyLower = body.toLowerCase();
  const fromLower = from.toLowerCase();

  // Teaching & Student Support
  if (subjectLower.includes('hw') || subjectLower.includes('homework') || subjectLower.includes('assignment') ||
      subjectLower.includes('extension') || subjectLower.includes('late pass') || subjectLower.includes('resubmit') ||
      subjectLower.includes('grading') || subjectLower.includes('ta spreadsheet') || subjectLower.includes('midterm') ||
      bodyLower.includes('late pass') || bodyLower.includes('extension') || bodyLower.includes('homework') ||
      bodyLower.includes('assignment') || bodyLower.includes('resubmit') || bodyLower.includes('slack')) {
    return 'Teaching & Student Support';
  }

  // Research & Lab Work
  if (subjectLower.includes('daplab') || subjectLower.includes('lab') || subjectLower.includes('research') ||
      subjectLower.includes('study') || subjectLower.includes('paper') || subjectLower.includes('hci') ||
      fromLower.includes('lydia') || fromLower.includes('chilton') || subjectLower.includes('tweetorials') ||
      bodyLower.includes('research') || bodyLower.includes('study') || bodyLower.includes('paper') ||
      bodyLower.includes('lydia') || subjectLower.includes('pilot study')) {
    return 'Research & Lab Work';
  }

  // Conferences
  if (subjectLower.includes('conference') || subjectLower.includes('iui') || subjectLower.includes('c&c') ||
      subjectLower.includes('nsf') || subjectLower.includes('grant') || subjectLower.includes('review') ||
      subjectLower.includes('pcs') || subjectLower.includes('taps') || subjectLower.includes('acm') ||
      bodyLower.includes('conference') || bodyLower.includes('grant') || bodyLower.includes('review') ||
      bodyLower.includes('submission') || bodyLower.includes('paper')) {
    return 'Conferences';
  }

  // University Administration
  if (subjectLower.includes('cs@cu') || subjectLower.includes('welcome') || subjectLower.includes('clearance') ||
      subjectLower.includes('pdl') || subjectLower.includes('prep day') || subjectLower.includes('graduation') ||
      subjectLower.includes('phd') || subjectLower.includes('ms program') || subjectLower.includes('seas') ||
      fromLower.includes('columbia.edu') && (subjectLower.includes('program') || subjectLower.includes('department') ||
      subjectLower.includes('admin') || bodyLower.includes('program') || bodyLower.includes('department'))) {
    return 'University Administration';
  }

  // Financial & Reimbursements
  if (subjectLower.includes('reimbursement') || subjectLower.includes('scholarship') || subjectLower.includes('nicar') ||
      subjectLower.includes('egsc') || subjectLower.includes('financial') || subjectLower.includes('payment') ||
      bodyLower.includes('reimbursement') || bodyLower.includes('scholarship') || bodyLower.includes('check') ||
      bodyLower.includes('payment') || bodyLower.includes('refund')) {
    return 'Financial & Reimbursements';
  }

  // Networking
  if (subjectLower.includes('tiktok') || subjectLower.includes('job') || subjectLower.includes('opportunity') ||
      subjectLower.includes('chat') || subjectLower.includes('connect') || subjectLower.includes('career') ||
      bodyLower.includes('opportunity') || bodyLower.includes('role') || bodyLower.includes('position') ||
      bodyLower.includes('career') || bodyLower.includes('recruiting')) {
    return 'Networking';
  }

  // Personal & Life Management (default for everything else)
  return 'Personal & Life Management';
}

// API endpoint to get response emails using JSON data
app.get('/api/response-emails', async (req, res) => {
  try {
    console.log('Loading response emails from JSON file...');
    
    // Load email data from JSON file
    const responseEmails = loadResponseEmails();
    
    if (responseEmails.length === 0) {
      console.warn('No response emails found in JSON file');
      return res.json({ emails: [] });
    }
    
    // Validate and fix any email data issues
    const validatedEmails = [];
    
    responseEmails.forEach((email, index) => {
      // Validate required fields
      if (!email.id || !email.subject || !email.from || !email.body) {
        console.error(`Email at index ${index} missing required fields:`, {
          id: !!email.id,
          subject: !!email.subject,
          from: !!email.from,
          body: !!email.body
        });
        return; // Skip invalid emails
      }

      // Ensure all fields have proper values
      const validatedEmail = {
        id: email.id,
        subject: email.subject || 'No Subject',
        from: email.from || 'Unknown Sender',
        originalFrom: email.originalFrom || 'Unknown Sender',
        date: email.date || new Date().toISOString(),
        category: email.category || categorizeEmail(email.subject, email.body, email.from),
        body: email.body || 'No content available',
        snippet: email.snippet || (email.body ? email.body.substring(0, 100) + (email.body.length > 100 ? '...' : '') : 'No content available')
      };

      validatedEmails.push(validatedEmail);
    });

    if (validatedEmails.length !== responseEmails.length) {
      console.warn(`Filtered out ${responseEmails.length - validatedEmails.length} invalid emails`);
    }

    console.log(`Returning ${validatedEmails.length} validated emails from JSON file`);
    res.json({ emails: validatedEmails });
  } catch (error) {
    console.error('Error fetching response emails:', error);
    res.status(500).json({ error: 'Failed to fetch response emails', details: error.message });
  }
});

// API endpoint to get thread for a specific email
app.get('/api/email-thread/:emailId', async (req, res) => {
  try {
    const emailId = req.params.emailId;
    console.log(`Fetching thread for email ID: ${emailId}`);
    
    // Load email threads from JSON file
    const emailThreads = loadEmailThreads();
    
    // Find the specific email thread by matching the id field
    const thread = emailThreads.find(t => t.id === emailId);
    
    if (thread) {
      // Create proper thread data structure from the JSON data
      const threadData = {
        messages: [
          {
            id: 'original-' + thread.id,
            from: thread.originalFrom || 'Unknown Sender',
            to: [thread.from],
            date: new Date(new Date(thread.date).getTime() - 86400000).toISOString(),
            subject: thread.subject.replace('Re: ', ''),
            body: thread.originalBody || 'Original email content not available',
            isResponse: false
          },
          {
            id: thread.id,
            from: thread.from,
            to: [thread.originalFrom || 'Unknown Sender'],
            date: thread.date,
            subject: thread.subject,
            body: thread.body,
            isResponse: true
          }
        ]
      };
      
      console.log(`Returning thread data from JSON file for email: ${thread.subject}`);
      return res.json(threadData);
    }
    
    // If no thread found in JSON, try to construct from response emails
    const responseEmails = loadResponseEmails();
    const email = responseEmails.find(e => e.id === emailId);
    
    if (!email) {
      return res.status(404).json({ error: 'Email thread not found' });
    }
    
    // Create thread data using originalBody from response emails
    const threadData = {
      messages: [
        {
          id: 'original-' + email.id,
          from: email.originalFrom || 'Unknown Sender',
          to: [email.from],
          date: new Date(new Date(email.date).getTime() - 86400000).toISOString(),
          subject: email.subject.replace('Re: ', ''),
          body: email.originalBody || 'Original email content not available',
          isResponse: false
        },
        {
          id: email.id,
          from: email.from,
          to: [email.originalFrom || 'Unknown Sender'],
          date: email.date,
          subject: email.subject,
          body: email.body,
          isResponse: true
        }
      ]
    };
    
    console.log(`Returning constructed thread data for email: ${email.subject}`);
    res.json(threadData);
  } catch (error) {
    console.error('Error fetching email thread:', error);
    res.status(500).json({ error: 'Failed to fetch email thread' });
  }
});

// API endpoint to generate response using OpenAI
app.post('/api/generate-response', async (req, res) => {
  try {
    const { sender, subject, emailBody, context } = req.body;
    
    // Check if this is a missing information case
    const isMissingInfoRequest = context && context.includes('Missing information detected:');
    let missingInfoContext = '';
    
    if (isMissingInfoRequest) {
      const missingInfoMatch = context.match(/Missing information detected: (.+?)(?:\n|$)/);
      const missingInfo = missingInfoMatch ? missingInfoMatch[1] : 'some information';
      missingInfoContext = `\n\nIMPORTANT: This email is missing information (${missingInfo}). Your response should follow your usual tone and style, but must politely ask for the missing information to be provided.`;
    }
    
    // Load response emails from JSON file
    const responseEmails = loadResponseEmails();

    // Build comprehensive prompt with database data
    let prompt = `You are an assistant that helps write email responses. Given the following new email (with sender, subject, and content), a list of previous emails, and responses. Your task is to generate a response email that as closely as possible matches the user's previous tone, style, and response length. DO NOT add any extra explanation, exposition, or content beyond what is typical in the user's previous responses. First, identify the most similar previous email(s) to the new email. Then, model the new response as closely as possible after the user's previous response(s) to those similar emails, matching length, structure, and style (but do not make it identical to any previous email, just similar). DO NOT include links in the response unless it is contextually required. First, identify the sign-off(s) the user uses in previous responses (e.g., 'Thanks, Karthik'). Use the same sign-off in the generated response. The length of the generated response should be as close as possible to the user's previous responses. The response should be written from the user's perspective, as if the user is replying to the original sender, NOT addressed to the user. After the response, provide a justification as a bullet point list. In the justification, explicitly list which previous emails are most similar to the new email and briefly explain why. Reference these by sender, subject, content, or feedback as needed. Do not add extra content or summary in the justification.

NEW EMAIL TO RESPOND TO:
From: ${sender || 'Unknown sender'}
Subject: ${subject || 'No subject'}
Body: ${emailBody}

PREVIOUS EMAIL RESPONSES:
`;

    // Add email responses from JSON data
    responseEmails.forEach((email, index) => {
      prompt += `\n--- EMAIL ${index + 1} ---\n`;
      prompt += `Category: ${email.category}\n`;
      prompt += `Subject: ${email.subject}\n`;
      prompt += `From: ${email.originalFrom || 'Unknown'}\n`;
      prompt += `Your Response: ${email.body}\n\n`;
    });

    // Add only GENERALIZABLE refinements if they exist
    if (emailMemory.refinements && emailMemory.refinements.length > 0) {
      const generalizableRefinements = emailMemory.refinements.filter(refinement => {
        // Check if refinement has analysis and contains generalizable changes
        if (refinement.analysis && refinement.analysis.changes) {
          return refinement.analysis.changes.some(change => change.category === 'GENERALIZABLE');
        }
        // If no analysis exists (legacy refinements), include them for backward compatibility
        return true;
      });

      if (generalizableRefinements.length > 0) {
        prompt += `\nPREVIOUS GENERALIZABLE REFINEMENTS (apply these patterns to new responses):\n`;
        generalizableRefinements.forEach((refinement, index) => {
          prompt += `\n--- GENERALIZABLE REFINEMENT ${index + 1} ---\n`;
          prompt += `Refinement Request: ${refinement.prompt}\n`;
          prompt += `Original Response: ${refinement.originalResponse}\n`;
          prompt += `Refined Response: ${refinement.refinedResponse}\n`;
          
          // Add extracted rules if available
          if (refinement.analysis && refinement.analysis.changes) {
            const generalizableChanges = refinement.analysis.changes.filter(change => change.category === 'GENERALIZABLE');
            if (generalizableChanges.length > 0) {
              prompt += `Generalizable Rules:\n`;
              generalizableChanges.forEach(change => {
                if (change.extractedRule) {
                  prompt += `- ${change.extractedRule}\n`;
                }
              });
            }
          }
          prompt += `\n`;
        });
      }
    }

    // Add ALL saved generations if they exist
    if (emailMemory.savedGenerations && emailMemory.savedGenerations.length > 0) {
      prompt += `\nPREVIOUS SAVED GENERATIONS:\n`;
      emailMemory.savedGenerations.forEach((generation, index) => {
        prompt += `\n--- SAVED GENERATION ${index + 1} ---\n`;
        prompt += `Original Email: ${JSON.stringify(generation.originalEmail)}\n`;
        prompt += `Generated Response: ${generation.generatedResponse}\n`;
        prompt += `Justification: ${generation.justification}\n\n`;
      });
    }

    // Add additional context if provided
    if (context && context !== 'None') {
      prompt += `\nADDITIONAL CONTEXT: ${context}${missingInfoContext}\n`;
    } else if (missingInfoContext) {
      prompt += `\nADDITIONAL CONTEXT: ${missingInfoContext}\n`;
    }

    prompt += `\nGenerate the response following the instructions above. Format your response as:

RESPONSE:
[The actual email response content only - from greeting to sign-off, no subject line or metadata]

JUSTIFICATION:
[Bullet point list explaining which previous emails are most similar and why]`;

    const completion = await openai.chat.completions.create({
      model: "o3",
      messages: [{ role: "user", content: prompt }],
      max_completion_tokens: 2000
    });

    const fullResponse = completion.choices[0].message.content.trim();
    
    // Parse the response to separate the email content from justification
    const responseParts = fullResponse.split('JUSTIFICATION:');
    let emailResponse = responseParts[0].replace('RESPONSE:', '').trim();
    let justification = responseParts[1] ? responseParts[1].trim() : "Generated based on comprehensive analysis of previous email responses to match established tone and style patterns";
    
    // Clean up the email response - remove any remaining metadata
    emailResponse = emailResponse
      .replace(/^(Response:|RESPONSE:)/i, '')
      .replace(/^(Subject:|SUBJECT:).+$/gm, '')
      .replace(/^(From:|FROM:).+$/gm, '')
      .replace(/^(To:|TO:).+$/gm, '')
      .trim();
    
    res.json({ 
      response: emailResponse,
      justification: justification
    });
  } catch (error) {
    console.error('Error generating response:', error);
    res.status(500).json({ error: 'Failed to generate response' });
  }
});

// Function to analyze refinement and categorize changes
async function analyzeRefinement(originalResponse, refinement) {
  try {
    const analysisPrompt = `You are analyzing a user's refinement to an email response. Your task is to identify all requested changes and categorize each one as either GENERALIZABLE or EMAIL-SPECIFIC.

GENERALIZABLE changes are:
- Writing style preferences (tone, formality, structure)
- Communication patterns that apply across contexts
- General response strategies or approaches
- Consistent personality traits or professional voice
- Standard ways of handling common situations

EMAIL-SPECIFIC changes are:
- Factual information tied to a specific moment in time
- Personal circumstances that may change
- Context-dependent details (dates, locations, specific people)
- Situational responses that don't apply broadly
- One-time decisions or temporary conditions

Original Email Response: ${originalResponse}
User Refinement: ${refinement}

Please analyze the refinement and return a JSON object with this structure:
{
  "changes": [
    {
      "description": "Brief description of the change",
      "category": "GENERALIZABLE" or "EMAIL-SPECIFIC",
      "reasoning": "Why this change fits this category",
      "extractedRule": "If GENERALIZABLE, the general rule to apply (null if EMAIL-SPECIFIC)"
    }
  ]
}`;

    const completion = await openai.chat.completions.create({
      model: "o3",
      messages: [{ role: "user", content: analysisPrompt }],
      max_completion_tokens: 1000
    });

    const analysisResult = completion.choices[0].message.content.trim();
    
    try {
      return JSON.parse(analysisResult);
    } catch (parseError) {
      console.error('Error parsing refinement analysis:', parseError);
      // Return a fallback structure
      return {
        changes: [{
          description: "Unable to parse analysis",
          category: "EMAIL-SPECIFIC",
          reasoning: "Analysis parsing failed",
          extractedRule: null
        }]
      };
    }
  } catch (error) {
    console.error('Error analyzing refinement:', error);
    // Return a fallback structure
    return {
      changes: [{
        description: "Analysis failed",
        category: "EMAIL-SPECIFIC", 
        reasoning: "Error occurred during analysis",
        extractedRule: null
      }]
    };
  }
}

// API endpoint to refine response
app.post('/api/refine-response', async (req, res) => {
  try {
    const { currentResponse, refinementPrompt } = req.body;
    
    const prompt = `Please refine the following email response based on the user's feedback:

Current response:
${currentResponse}

Refinement request:
${refinementPrompt}

Please provide the refined response:`;

    const completion = await openai.chat.completions.create({
      model: "o3",
      messages: [{ role: "user", content: prompt }],
      max_completion_tokens: 1500
    });

    const refinedResponse = completion.choices[0].message.content.trim();
    
    // Analyze the refinement to categorize changes
    const analysis = await analyzeRefinement(currentResponse, refinementPrompt);
    
    // Store refinement in memory with analysis
    emailMemory.refinements.push({
      id: Date.now().toString(),
      timestamp: new Date().toISOString(),
      prompt: refinementPrompt,
      originalResponse: currentResponse,
      refinedResponse: refinedResponse,
      analysis: analysis
    });
    
    res.json({ 
      response: refinedResponse,
      justification: "Refined based on user feedback",
      analysis: analysis
    });
  } catch (error) {
    console.error('Error refining response:', error);
    res.status(500).json({ error: 'Failed to refine response' });
  }
});

// API endpoint to save generated response
app.post('/api/save-generation', async (req, res) => {
  try {
    const { originalEmail, generatedResponse, justification } = req.body;
    
    const savedGeneration = {
      id: Date.now().toString(),
      timestamp: new Date().toISOString(),
      originalEmail,
      generatedResponse,
      justification
    };
    
    emailMemory.savedGenerations.push(savedGeneration);
    
    res.json({ success: true, id: savedGeneration.id });
  } catch (error) {
    console.error('Error saving generation:', error);
    res.status(500).json({ error: 'Failed to save generation' });
  }
});

// API endpoint to get refinements
app.get('/api/refinements', (req, res) => {
  res.json({ refinements: emailMemory.refinements });
});

// API endpoint to get saved generations
app.get('/api/saved-generations', (req, res) => {
  res.json({ savedGenerations: emailMemory.savedGenerations });
});

// API endpoint to delete refinement
app.delete('/api/refinements/:id', (req, res) => {
  const id = req.params.id;
  emailMemory.refinements = emailMemory.refinements.filter(r => r.id !== id);
  res.json({ success: true });
});

// API endpoint to delete saved generation
app.delete('/api/saved-generations/:id', (req, res) => {
  const id = req.params.id;
  emailMemory.savedGenerations = emailMemory.savedGenerations.filter(g => g.id !== id);
  res.json({ success: true });
});

// API endpoint to clear all refinements
app.delete('/api/refinements', (req, res) => {
  emailMemory.refinements = [];
  res.json({ success: true });
});

// API endpoint to clear all saved generations
app.delete('/api/saved-generations', (req, res) => {
  emailMemory.savedGenerations = [];
  res.json({ success: true });
});

// API endpoint to detect missing information
app.post('/api/detect-missing-info', async (req, res) => {
  try {
    const { sender, subject, emailBody } = req.body;
    
    const prompt = `You are an email analyst. Analyze this email and look for obvious missing information that would prevent generating a proper response.

From: ${sender || 'Not provided'}
Subject: ${subject || 'Not provided'}
Body: ${emailBody}

Only flag missing information if it's clearly and explicitly mentioned but not provided:
1. ATTACHMENTS: Only if the email explicitly says "attached", "see attachment", or similar but no attachment is present
2. LINKS: Only if the email explicitly says "here's the link", "click here", or similar but no link is provided
3. SPECIFIC REFERENCES: Only if the email explicitly references something that should be included but is clearly missing

Be conservative - only flag obvious cases where something is explicitly mentioned as being included but is clearly absent.

Respond in this exact format:
hasMissingInfo: [true/false]
missingInfo: [brief description of what's obviously missing, or "None" if nothing is clearly missing]

Only flag clear, obvious cases.`;

    const completion = await openai.chat.completions.create({
      model: "o3",
      messages: [{ role: "user", content: prompt }],
      max_completion_tokens: 200
    });

    const analysis = completion.choices[0].message.content.trim();
    
    // Parse the response more robustly
    const lines = analysis.split('\n');
    let hasMissingInfo = false;
    let missingInfo = '';
    
    for (const line of lines) {
      if (line.toLowerCase().includes('hasmissinginfo:')) {
        hasMissingInfo = line.toLowerCase().includes('true');
      } else if (line.toLowerCase().includes('missinginfo:')) {
        missingInfo = line.substring(line.indexOf(':') + 1).trim();
      }
    }
    
    // Fallback parsing if structured format isn't found
    if (!missingInfo && analysis.toLowerCase().includes('missing')) {
      hasMissingInfo = true;
      missingInfo = analysis;
    }
    
    res.json({ hasMissingInfo, missingInfo: missingInfo || 'No missing information detected' });
  } catch (error) {
    console.error('Error detecting missing info:', error);
    res.status(500).json({ error: 'Failed to detect missing information' });
  }
});

// API endpoint to get test emails for response generation testing
app.get('/api/test-emails', async (req, res) => {
  try {
    console.log('Fetching test emails from JSON file...');
    
    // Load test emails from JSON file
    const testEmails = loadTestEmails();
    
    if (testEmails.length === 0) {
      console.warn('No test emails found in JSON file');
      return res.json({ emails: [] });
    }
    
    console.log(`Returning ${testEmails.length} test emails from JSON file`);
    res.json({ emails: testEmails });
  } catch (error) {
    console.error('Error fetching test emails:', error);
    res.status(500).json({ 
      error: 'Failed to fetch test emails', 
      details: error.message,
      emails: [] 
    });
  }
});

// API endpoint to get unreplied emails from Gmail inbox
app.get('/api/unreplied-emails', async (req, res) => {
  try {
    console.log('Fetching unreplied emails from JSON file...');
    
    // Load unreplied emails from JSON file
    const unrepliedEmails = loadUnrepliedEmails();
    
    if (unrepliedEmails.length === 0) {
      console.warn('No unreplied emails found in JSON file');
      return res.json({ emails: [] });
    }
    
    // Sort emails chronologically (newest first)
    unrepliedEmails.sort((a, b) => new Date(b.date) - new Date(a.date));
    
    console.log(`Returning ${unrepliedEmails.length} unreplied emails from JSON file`);
    res.json({ emails: unrepliedEmails });
    
  } catch (error) {
    console.error('Error fetching unreplied emails:', error);
    res.status(500).json({ 
      error: 'Failed to fetch unreplied emails', 
      details: error.message,
      emails: [] // Return empty array as fallback
    });
  }
});

// Scenario management endpoints
app.get('/api/scenarios', (req, res) => {
  res.json({ scenarios: emailMemory.scenarios });
});

app.post('/api/scenarios', (req, res) => {
  try {
    const { name, description, emails } = req.body;
    
    const scenario = {
      id: Date.now().toString(),
      name,
      description,
      emails,
      createdAt: new Date().toISOString()
    };
    
    emailMemory.scenarios.push(scenario);
    
    // Save to file
    saveDataToFile({
      scenarios: emailMemory.scenarios,
      refinements: emailMemory.refinements,
      savedGenerations: emailMemory.savedGenerations
    });
    
    res.json({ success: true, scenario });
  } catch (error) {
    console.error('Error creating scenario:', error);
    res.status(500).json({ error: 'Failed to create scenario' });
  }
});

app.delete('/api/scenarios/:id', (req, res) => {
  try {
    const id = req.params.id;
    emailMemory.scenarios = emailMemory.scenarios.filter(s => s.id !== id);
    
    // Save to file
    saveDataToFile({
      scenarios: emailMemory.scenarios,
      refinements: emailMemory.refinements,
      savedGenerations: emailMemory.savedGenerations
    });
    
    res.json({ success: true });
  } catch (error) {
    console.error('Error deleting scenario:', error);
    res.status(500).json({ error: 'Failed to delete scenario' });
  }
});

// Start a new scenario (clear refinements and saved generations)
app.post('/api/scenarios/new/load', (req, res) => {
  try {
    // Clear refinements and saved generations
    emailMemory.refinements = [];
    emailMemory.savedGenerations = [];
    
    // Save the cleared state to file
    saveDataToFile({
      scenarios: emailMemory.scenarios,
      refinements: emailMemory.refinements,
      savedGenerations: emailMemory.savedGenerations
    });
    
    res.json({ 
      success: true, 
      message: 'New scenario started! All refinements and saved generations have been cleared.'
    });
  } catch (error) {
    console.error('Error starting new scenario:', error);
    res.status(500).json({ error: 'Failed to start new scenario' });
  }
});

// Load a specific scenario
app.post('/api/scenarios/:id/load', (req, res) => {
  try {
    const id = req.params.id;
    const scenario = emailMemory.scenarios.find(s => s.id === id);
    
    if (!scenario) {
      return res.status(404).json({ error: 'Scenario not found' });
    }
    
    // Load the scenario's refinements and saved generations
    if (scenario.refinements) {
      emailMemory.refinements = scenario.refinements;
    }
    if (scenario.savedGenerations) {
      emailMemory.savedGenerations = scenario.savedGenerations;
    }
    
    // Save the updated state to file
    saveDataToFile({
      scenarios: emailMemory.scenarios,
      refinements: emailMemory.refinements,
      savedGenerations: emailMemory.savedGenerations
    });
    
    res.json({ 
      success: true, 
      message: `Scenario "${scenario.name}" loaded successfully!`
    });
  } catch (error) {
    console.error('Error loading scenario:', error);
    res.status(500).json({ error: 'Failed to load scenario' });
  }
});

// Clear all scenarios
app.delete('/api/scenarios', (req, res) => {
  try {
    emailMemory.scenarios = [];
    
    // Save to file
    saveDataToFile({
      scenarios: emailMemory.scenarios,
      refinements: emailMemory.refinements,
      savedGenerations: emailMemory.savedGenerations
    });
    
    res.json({ success: true });
  } catch (error) {
    console.error('Error clearing all scenarios:', error);
    res.status(500).json({ error: 'Failed to clear scenarios' });
  }
});

// Serve the main HTML file
app.get('/', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

// Start server
app.listen(PORT, () => {
  console.log(`Server running on http://localhost:${PORT}`);
  console.log(`Data directory: ${USER_DATA_DIR}`);
  console.log(`Loaded ${emailMemory.scenarios.length} scenarios, ${emailMemory.refinements.length} refinements, ${emailMemory.savedGenerations.length} saved generations`);
});
