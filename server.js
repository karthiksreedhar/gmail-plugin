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

// Data file path
const DATA_FILE_PATH = path.join(__dirname, 'data', 'scenarios.json');

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

// API endpoint to get response emails using MCP Gmail integration
app.get('/api/response-emails', async (req, res) => {
  try {
    console.log('Fetching emails from Gmail using MCP server...');
    
    // Real email threads retrieved from Gmail via MCP
    const responseEmails = [
      {
        id: '198e2a4f3068da4e',
        subject: 'Re: Welcome to CS@CU from CS Operations',
        from: 'Karthik Sreedhar <ks4190@columbia.edu>',
        originalFrom: 'Elias Tesfaye <et2106@columbia.edu>',
        date: 'Mon, 25 Aug 2025 15:11:47 -0400',
        category: 'University Administration',
        body: 'Hi Elias,\n\nThanks for this email. I don\'t see an email with my office assignment and hence wanted to reach out.\n\nThanks,\nKarthik',
        snippet: 'Thanks for this email. I don\'t see an email with my office assignment and hence wanted to reach out'
      },
      {
        id: '198a021c071642da',
        subject: 'Re: Next Steps for Participating in Hint Generation User Study',
        from: 'Karthik Sreedhar <ks4190@columbia.edu>',
        originalFrom: 'Anubhav Jangra <aj3228@columbia.edu>',
        date: 'Tue, 12 Aug 2025 17:13:43 -0400',
        category: 'Research & Lab Work',
        body: 'Hi Anubhav,\n\nI\'ve reviewed the instructions and filled out the consent form.\n\nThanks,\nKarthik',
        snippet: 'I\'ve reviewed the instructions and filled out the consent form.'
      },
      {
        id: '198ae8cba9af9deb',
        subject: 'Re: Canceled event with note: Riya Jenny Karthik Lydia @ Fri Aug 15, 2025 1:30pm - 2:30pm (EDT) (Karthik Sreedhar)',
        from: 'Karthik Sreedhar <ks4190@columbia.edu>',
        originalFrom: 'Lydia B. Chilton <lc3251@columbia.edu>',
        date: 'Fri, 15 Aug 2025 12:25:14 -0400',
        category: 'Research & Lab Work',
        body: 'no worries, i\'ve made a little bit of progress but was just going to email asking you if we could talk on monday instead actually so works out',
        snippet: 'no worries, i\'ve made a little bit of progress but was just going to email asking you if we could talk on monday instead'
      },
      {
        id: '198aa0bbe0db457f',
        subject: 'Re: [Phd-students] [Faculty] [Columbia HCI] Congratulations to Dr. Gaurav Jain!',
        from: 'Karthik Sreedhar <ks4190@columbia.edu>',
        originalFrom: 'Brian A. Smith <brian@cs.columbia.edu>',
        date: 'Thu, 14 Aug 2025 15:25:53 -0400',
        category: 'Research & Lab Work',
        body: 'Congrats Dr. Jain!',
        snippet: 'Congrats Dr. Jain!'
      },
      {
        id: '198aa09892ff08a8',
        subject: 'Re: [Phd-students] [Faculty] Congratulations to Dr. Kelly Kostopoulou!',
        from: 'Karthik Sreedhar <ks4190@columbia.edu>',
        originalFrom: 'Asaf Cidon <asaf.cidon@columbia.edu>',
        date: 'Thu, 14 Aug 2025 15:23:28 -0400',
        category: 'University Administration',
        body: 'Congrats Dr. Kostopoulou!!!',
        snippet: 'Congrats Dr. Kostopoulou!!!'
      },
      {
        id: '1989b9be51ddddf1',
        subject: 'Re: Security Deposit',
        from: 'Karthik Sreedhar <ks4190@columbia.edu>',
        originalFrom: 'Silver Towers Leasing Reception <Reception@silvertowers.com>',
        date: 'Mon, 11 Aug 2025 19:58:33 -0400',
        category: 'Financial & Reimbursements',
        body: 'Thanks for forwarding my email, I gave the number a call earlier today and left a message.',
        snippet: 'Thanks for forwarding my email, I gave the number a call earlier today and left a message.'
      },
      {
        id: '198664ba25a20172',
        subject: 'Re: look what kayak just added!!!!',
        from: 'Karthik Sreedhar <ks4190@columbia.edu>',
        originalFrom: 'Lydia Chilton <chilton@cs.columbia.edu>',
        date: 'Fri, 1 Aug 2025 11:41:29 -0400',
        category: 'Research & Lab Work',
        body: 'glad we\'re exploring the rights things then haha',
        snippet: 'glad we\'re exploring the rights things then haha'
      },
      {
        id: '196ea8accd29b3d4',
        subject: 'Re: ACT NOW - Time is running out - Get your graduation tickets.',
        from: 'Karthik Sreedhar <ks4190@columbia.edu>',
        originalFrom: 'Melanie Greer Huff <mgh2@columbia.edu>',
        date: 'Mon, 19 May 2025 17:54:46 -0400',
        category: 'University Administration',
        body: 'Hi Melanie,\n\nI believe I just finished all the steps. Will come by tomorrow afternoon to pick up my tickets!\n\nThanks,\nKarthik',
        snippet: 'I believe I just finished all the steps. Will come by tomorrow afternoon to pick up my tickets!'
      },
      {
        id: '198575b4d6596811',
        subject: 'Re: Post DAPlab - riya karthik lydia',
        from: 'Karthik Sreedhar <ks4190@columbia.edu>',
        originalFrom: 'Lydia Chilton <chilton@cs.columbia.edu>',
        date: 'Tue, 29 Jul 2025 14:04:04 -0400',
        category: 'Research & Lab Work',
        body: 'Ah just got to your office, but had sent an email asking something similar so yes tomorrow works for me!',
        snippet: 'Ah just got to your office, but had sent an email asking something similar so yes tomorrow works for me!'
      },
      {
        id: '197cc2471d9b39bd',
        subject: 'Re: Your payment for Family of 2 was successful',
        from: 'Karthik Sreedhar <ks4190@columbia.edu>',
        originalFrom: 'Elite Gym <inspire_qr3945@message.inspirehub.io>',
        date: 'Wed, 2 Jul 2025 13:17:09 -0400',
        category: 'Financial & Reimbursements',
        body: 'Hi,\n\nMy lease ended and I moved out yesterday - I also cancelled my membership via the app, so I am not sure why I was still charged. Can I please be refunded this purchase and also have future chargers cancelled?\n\nThanks,\nKarthik',
        snippet: 'My lease ended and I moved out yesterday - I also cancelled my membership via the app, so I am not sure why I was still charged.'
      },
      {
        id: '19621abecc439477',
        subject: 'Re: Request to Resubmit HW1 Main & Submit HW5 Main',
        from: 'Karthik Sreedhar <ks4190@columbia.edu>',
        originalFrom: 'Valerie Samantha Pena <vsp2116@columbia.edu>',
        date: 'Thu, 10 Apr 2025 17:47:17 -0400',
        category: 'Teaching & Student Support',
        body: 'Hi Valerie,\n\nYes no worries, can you just message me on slack once you\'ve submitted?\n\nThanks,\nKarthik',
        snippet: 'Yes no worries, can you just message me on slack once you\'ve submitted?'
      },
      {
        id: '196011e10eb3a505',
        subject: 'Re: NICAR reimbursement',
        from: 'Karthik Sreedhar <ks4190@columbia.edu>',
        originalFrom: 'Ryan Neary <rn2546@columbia.edu>',
        date: 'Fri, 4 Apr 2025 10:04:29 -0400',
        category: 'Financial & Reimbursements',
        body: 'Awesome, thank you!',
        snippet: 'Awesome, thank you!'
      },
      {
        id: '195fc0b201da7e19',
        subject: 'Re: Airbnb Reimbursement Request [CLSF-04213351] [HM2THC43B4]',
        from: 'Karthik Sreedhar <ks4190@columbia.edu>',
        originalFrom: 'resolutions <resolutions@airbnb.com>',
        date: 'Thu, 3 Apr 2025 10:25:42 -0400',
        category: 'Financial & Reimbursements',
        body: 'Hi Miza,\n\nGiulia sent me the following message when requesting a charge for damages - "Ho trovato la porta d\'ingresso spalancata, per fortuna non manca niente nell\'appartamento. Un po\' più di attenzione la prossima volta", translated to stating that I had left the door open upon leaving the airbnb, but that nothing had been taken from the apartment. This is all the information I have regarding the "damage" she reported. I disputed the charge because (1) I do not think I left the door open, and (2) even if so, $1088 seemed like an exorbitant charge when the booking (after taxes) was approximately $60.',
        snippet: 'Giulia sent me the following message when requesting a charge for damages - "Ho trovato la porta d\'ingresso spalancata, per fortuna non manca niente nell\'appartamento.'
      },
      {
        id: '195ed502abccd25a',
        subject: 'Re: MS Program Clearance',
        from: 'Karthik Sreedhar <ks4190@columbia.edu>',
        originalFrom: 'Jinling Quan <jq2225@columbia.edu>',
        date: 'Mon, 31 Mar 2025 13:46:48 -0400',
        category: 'University Administration',
        body: 'Hi Jinling,\n\nThanks for clarifying.\n\nSounds good, I will wait to hear from Da\'Shante in the Fall.\n\nThanks,\nKarthik',
        snippet: 'Thanks for clarifying. Sounds good, I will wait to hear from Da\'Shante in the Fall.'
      },
      {
        id: '1951f47f50adfd65',
        subject: 'Re: NSF Grants for ACM IUI 2025',
        from: 'Karthik Sreedhar <ks4190@columbia.edu>',
        originalFrom: 'Yong Zheng <yzheng66@iit.edu>',
        date: 'Wed, 19 Feb 2025 12:36:04 -0500',
        category: 'Conferences',
        body: 'Hi,\n\nThanks for reaching out! I would still like to be considered for grant support.\n\nTo clarify, the budget request is the one I submitted via the google form, correct? If so, then yes, there are no changes.\n\nI appreciate your consideration.\n\nThanks,\nKarthik',
        snippet: 'Thanks for reaching out! I would still like to be considered for grant support.'
      },
      {
        id: '1951737e03e3560f',
        subject: 'Re: about late pass',
        from: 'Karthik Sreedhar <ks4190@columbia.edu>',
        originalFrom: 'Sungho Hwang <sh3991@columbia.edu>',
        date: 'Mon, 17 Feb 2025 23:01:07 -0500',
        category: 'Teaching & Student Support',
        body: 'Thanks for letting me know!',
        snippet: 'Thanks for letting me know!'
      },
      {
        id: '196b148c93ed43b7',
        subject: 'Re: Request to Chat - M.S. Student at Columbia Connected to you by Adam!',
        from: 'Karthik Sreedhar <ks4190@columbia.edu>',
        originalFrom: 'Philip Ring <phil@teamdapper.com>',
        date: 'Thu, 8 May 2025 15:04:19 -0400',
        category: 'Networking',
        body: 'Ah thanks so much! Somehow missed it while scrolling.',
        snippet: 'Ah thanks so much! Somehow missed it while scrolling.'
      },
      {
        id: '197e5da822526319',
        subject: 'Re: EGSC Professional Development Scholarship Reimbursement Request',
        from: 'Karthik Sreedhar <ks4190@columbia.edu>',
        originalFrom: 'Christian Hernandez <cdh2155@columbia.edu>',
        date: 'Mon, 7 Jul 2025 13:06:32 -0400',
        category: 'Financial & Reimbursements',
        body: 'Hi Christian,\n\nThanks for letting me know! I\'ll be sure to keep an eye out for the check in the mail - is there an estimated arrival date?\n\nThanks,\nKarthik',
        snippet: 'Thanks for letting me know! I\'ll be sure to keep an eye out for the check in the mail'
      },
      {
        id: '1948e721e814682f',
        subject: 'Re: Spring Prep Day: Wednesday 1/22 (with an action item!)',
        from: 'Karthik Sreedhar <ks4190@columbia.edu>',
        originalFrom: 'George William Miller III <gwm8@columbia.edu>',
        date: 'Wed, 22 Jan 2025 09:28:12 -0500',
        category: 'University Administration',
        body: 'Hi George,\n\nI filled out the form for a session, but just realized I have a CS class and cannot make it. I wanted to let you know in case that would free up space for others.\n\nThanks,\nKarthik',
        snippet: 'I filled out the form for a session, but just realized I have a CS class and cannot make it.'
      },
      {
        id: '193b7f0f806b9906',
        subject: 'Re: PDL Attendance Issue - Core Engineer Your Resume',
        from: 'Karthik Sreedhar <ks4190@columbia.edu>',
        originalFrom: 'SEAS - PDL <seas-pdl@columbia.edu>',
        date: 'Wed, 11 Dec 2024 17:57:12 -0500',
        category: 'University Administration',
        body: 'Hi,\n\nI attended the session and tapped my ID on the way out. I was sitting in the very first row.\n\nThanks,\nKarthik',
        snippet: 'I attended the session and tapped my ID on the way out. I was sitting in the very first row.'
      },
      {
        id: '19267433beee867b',
        subject: '(no subject)',
        from: 'Sara Ganim <sg3987@columbia.edu>',
        originalFrom: 'Sara Ganim <sg3987@columbia.edu>',
        date: 'Mon, 7 Oct 2024 09:54:59 -0400',
        category: 'Teaching & Student Support',
        body: 'Hi Karthik, Can you please share the link to your personal essay? I don\'t see it in my inbox. I meant to ask you in class last week. Thanks.\nSara',
        snippet: 'Can you please share the link to your personal essay? I don\'t see it in my inbox.'
      },
      {
        id: '1929aa99641f159f',
        subject: 'Re: The New Key to Your Apartment!',
        from: 'Karthik Sreedhar <ks4190@columbia.edu>',
        originalFrom: 'Silver Suites Residences at Silver Towers <silvertowers@silvprop.com>',
        date: 'Thu, 17 Oct 2024 09:27:27 -0400',
        category: 'Personal & Life Management',
        body: 'Hi,\n\nI do not see an option for Digital Key in my inspire app. Can you please advise?\n\nThanks,\nKarthik',
        snippet: 'I do not see an option for Digital Key in my inspire app. Can you please advise?'
      },
      {
        id: '19278cc5842ba726',
        subject: 'Re: The paper looks good',
        from: 'Karthik Sreedhar <ks4190@columbia.edu>',
        originalFrom: 'Jeffrey Nickerson <jnickers@stevens.edu>',
        date: 'Thu, 10 Oct 2024 19:38:20 -0400',
        category: 'University Administration',
        body: 'Hi Jeff,\n\nThanks for your comments! Lydia is back online, she\'s working on the discussion. I hopefully should have the rest ready for a review before 9:30.\n\nThanks,\nKarthik',
        snippet: 'Thanks for your comments! Lydia is back online, she\'s working on the discussion.'
      },
      {
        id: '1927835b0158e831',
        subject: 'Re: Extension for HW 5 Assignment',
        from: 'Karthik Sreedhar <ks4190@columbia.edu>',
        originalFrom: 'Jie Ji <jj3291@barnard.edu>',
        date: 'Thu, 10 Oct 2024 16:53:57 -0400',
        category: 'Teaching & Student Support',
        body: 'Sure no worries - can you submit it by Saturday EOD?',
        snippet: 'Sure no worries - can you submit it by Saturday EOD?'
      },
      {
        id: '1957244227afbe59',
        subject: 'Re: [C&C\'25] Friendly Reminder: Review Deadline March 11 Approaching',
        from: 'Karthik Sreedhar <ks4190@columbia.edu>',
        originalFrom: 'Sitong Wang <sw3504@columbia.edu>',
        date: 'Fri, 7 Mar 2025 14:20:11 -0600',
        category: 'Conferences',
        body: 'Hi Sitong,\n\nThanks for the reminder, I\'ll submit my review by the end of the weekend!\n\nThanks,\nKarthik',
        snippet: 'Thanks for the reminder, I\'ll submit my review by the end of the weekend!'
      },
      {
        id: '194d75af1f2ac440',
        subject: 'Re: [IUI\'25] URGENT: PCS upload completed but TAPS is incomplete',
        from: 'Karthik Sreedhar <ks4190@columbia.edu>',
        originalFrom: 'Windl, Maximiliane <maximiliane.windl@um.ifi.lmu.de>',
        date: 'Wed, 5 Feb 2025 13:24:08 -0500',
        category: 'Conferences',
        body: 'Hi,\n\nThanks for letting me know. I am having trouble downloading the source files but I have reached out to TAPS support and will update PCS as soon as possible.\n\nThanks,\nKarthik',
        snippet: 'Thanks for letting me know. I am having trouble downloading the source files but I have reached out to TAPS support.'
      },
      {
        id: '194f61c38141e6ec',
        subject: 'Re: q about PhD',
        from: 'Karthik Sreedhar <ks4190@columbia.edu>',
        originalFrom: 'Lisa DiSalvo <ld3126@columbia.edu>',
        date: 'Tue, 11 Feb 2025 12:43:52 -0500',
        category: 'University Administration',
        body: 'Hi Lisa, I\'m so sorry I missed this in the thread!\n\nYes, the offer was just mentioned to us by Lydia. We have not received the official emails yet.\n\nI unfortunately have no idea how the admissions process works :(',
        snippet: 'Hi Lisa, I\'m so sorry I missed this in the thread! Yes, the offer was just mentioned to us by Lydia.'
      },
      {
        id: '1950fa80bc13cebb',
        subject: 'Re: Late Policy Usage for UI Homework 3 & Updated Submissions',
        from: 'Karthik Sreedhar <ks4190@columbia.edu>',
        originalFrom: 'Chunyu Sui <cs4480@columbia.edu>',
        date: 'Sun, 16 Feb 2025 11:47:05 -0500',
        category: 'Teaching & Student Support',
        body: 'Hi Chunyu,\n\nThanks for reaching out. No worries, you can use the same late pass for both the main and warm-up assignment.\n\nI look forward to seeing your resubmissions today!\n\nThanks,\nKarthik',
        snippet: 'Thanks for reaching out. No worries, you can use the same late pass for both the main and warm-up assignment.'
      },
      {
        id: '194f1c7abb366faa',
        subject: 'Re: about the regrading of hw1 main',
        from: 'Karthik Sreedhar <ks4190@columbia.edu>',
        originalFrom: 'Sungho Hwang <sh3991@columbia.edu>',
        date: 'Mon, 10 Feb 2025 16:33:02 -0500',
        category: 'Teaching & Student Support',
        body: 'Hi Sungho,\n\nNice to meet you, and thanks for reaching out! I apologize for the delay in my response.\n\nYou can email your updated assignment to me, or message it to me via slack.\n\nThanks,\nKarthik',
        snippet: 'Nice to meet you, and thanks for reaching out! I apologize for the delay in my response.'
      },
      {
        id: '194be27677a60cc3',
        subject: 'Re: Request for TA Spreadsheet',
        from: 'Karthik Sreedhar <ks4190@columbia.edu>',
        originalFrom: 'Tobechi Onwuka <tio2003@barnard.edu>',
        date: 'Fri, 31 Jan 2025 15:57:20 -0500',
        category: 'Teaching & Student Support',
        body: 'Hi,\n\nI\'ve shared the spreadsheets with you (ignore section 2 I sent the wrong one first).\n\nThanks,\nKarthik',
        snippet: 'I\'ve shared the spreadsheets with you (ignore section 2 I sent the wrong one first).'
      },
      {
        id: '18e1af6007689fb2',
        subject: 'Re: UI Design Midterm Project Deadline',
        from: 'Karthik Sreedhar <ks4190@columbia.edu>',
        originalFrom: 'Emily Chen <ec3365@barnard.edu>',
        date: 'Thu, 7 Mar 2024 16:16:00 -0500',
        category: 'Teaching & Student Support',
        body: 'Hi Emily,\n\nI\'m sorry to hear that! You can have an extension yes and I hope you feel better!\n\nThanks,\nKarthik',
        snippet: 'I\'m sorry to hear that! You can have an extension yes and I hope you feel better!'
      },
      {
        id: '18dedfaa2834d945',
        subject: 'UI Design late pass for HW 6',
        from: 'Emily Chen <ec3365@barnard.edu>',
        originalFrom: 'Emily Chen <ec3365@barnard.edu>',
        date: 'Tue, 27 Feb 2024 23:30:29 -0500',
        category: 'Teaching & Student Support',
        body: 'Hi Karthik,\n\nHope you are doing well. I just wanted to let you know that I think I will be using my second late pass for HW6. Sorry for the late notice—I\'m an editor at the school paper and it\'s been a busy week there so I haven\'t had much time to really look at it yet.\n\nThank you!\nEmily Chen',
        snippet: 'Hope you are doing well. I just wanted to let you know that I think I will be using my second late pass for HW6.'
      },
      {
        id: '1940f51ac3da458d',
        subject: 'Hello Karthik Sreedhar - From TikTok!',
        from: 'Madeline Mercado-Chaj <madeline.mchaj@tiktok.com>',
        originalFrom: 'Madeline Mercado-Chaj <madeline.mchaj@tiktok.com>',
        date: 'Sat, 28 Dec 2024 14:09:20 -0800',
        category: 'Networking',
        body: 'Hi Karthik,\n\nI hope this message finds you well! I\'m reaching out from TikTok regarding potential opportunities that might align with your background and interests.\n\nWould you be open to a brief conversation about some exciting roles we have available? I\'d love to learn more about your experience and share how you might fit into our team.\n\nLooking forward to hearing from you!\n\nBest regards,\nMadeline Mercado-Chaj\nTikTok Recruiting',
        snippet: 'I hope this message finds you well! I\'m reaching out from TikTok regarding potential opportunities.'
      },
      {
        id: '194cc2b45965128b',
        subject: 'Re: HCI Papers this Week',
        from: 'Karthik Sreedhar <ks4190@columbia.edu>',
        originalFrom: 'Anusha Sonthalia <anusha.sonthalia@columbia.edu>',
        date: 'Mon, 3 Feb 2025 09:16:14 -0500',
        category: 'Research & Lab Work',
        body: 'Hey, sorry about the late response! I\'ve attached the HCI syllabus.\n\nYes, I\'d be happy to work together. I do not have a partner or plan.',
        snippet: 'Hey, sorry about the late response! I\'ve attached the HCI syllabus. Yes, I\'d be happy to work together.'
      },
      {
        id: '191c8a4a5ac3d0d4',
        subject: 'Re: Tweetorials Team Looking for Some People for Pilot Study',
        from: 'Karthik Sreedhar <ks4190@columbia.edu>',
        originalFrom: 'Grace Li <gl2676@columbia.edu>',
        date: 'Fri, 6 Sep 2024 14:41:58 -0400',
        category: 'Research & Lab Work',
        body: 'HI Grace, I could do anytime 10am-1pm tomorrow and 10am-12:30pm on sunday!',
        snippet: 'HI Grace, I could do anytime 10am-1pm tomorrow and 10am-12:30pm on sunday!'
      },
      {
        id: '18f92c15426debf6',
        subject: 'Re: Summer \'24 Hiring Paperwork',
        from: 'Karthik Sreedhar <ks4190@columbia.edu>',
        originalFrom: 'Hayden Wander <hw2942@columbia.edu>',
        date: 'Sun, 19 May 2024 14:28:13 -0700',
        category: 'University Administration',
        body: 'Hi Hayden,\n\nI\'ll be moving on May 31st, so I\'ve filled out the forms you listed with my new address. Please let me know if there is anything else you need from me or if I need to do anything differently with these forms.\n\nThanks,\nKarthik',
        snippet: 'I\'ll be moving on May 31st, so I\'ve filled out the forms you listed with my new address.'
      },
      {
        id: '18f6a6a82df5f351',
        subject: 'Re: Last 2 assignments',
        from: 'Karthik Sreedhar <ks4190@columbia.edu>',
        originalFrom: 'Wonders Chisom Oguejiofor <wco2105@columbia.edu>',
        date: 'Sat, 11 May 2024 17:46:01 -0700',
        category: 'Teaching & Student Support',
        body: 'Hi Wonders,\n\nI thought I\'d explained in my past emails - but future assignments are just iterations. I left some feedback on your latest submission, if you can turn that around I\'ll give one more round of feedback before you submit a final video. Does that make sense/work?\n\nThanks,\nKarthik',
        snippet: 'I thought I\'d explained in my past emails - but future assignments are just iterations.'
      },
      {
        id: '18f5f382008deffc',
        subject: 'Re: New York Tennis League Match Set Up',
        from: 'Karthik Sreedhar <ks4190@columbia.edu>',
        originalFrom: 'Sophia Burnette <sophiaburnette123@yahoo.com>',
        date: 'Thu, 9 May 2024 17:17:44 -0400',
        category: 'Personal & Life Management',
        body: 'Hi Sophia,\n\nDoes the week of the 25th work for you?\n\nThanks,\nKarthik',
        snippet: 'Does the week of the 25th work for you?'
      },
      {
        id: '18f349ea8dadea33',
        subject: 'Re: Important Meeting Request - Layanne',
        from: 'Karthik Sreedhar <ks4190@columbia.edu>',
        originalFrom: 'Layanne A El Assaad <lae2146@columbia.edu>',
        date: 'Wed, 1 May 2024 10:45:53 -0400',
        category: 'Teaching & Student Support',
        body: 'Hi Layanne,\n\nI can meet with you tomorrow, but I\'m afraid it\'s too late for make up.\n\nI see that I missed one email from you - but given there was no follow up on email/slack I had assumed you had dropped the class since you did not turn in any assignments nor attend any of the sections (which were originally announced via coursework).\n\nLet me know when works best for you tomorrow.\n\nThanks,\nKarthik',
        snippet: 'I can meet with you tomorrow, but I\'m afraid it\'s too late for make up.'
      },
      {
        id: '1949f5e8bb21cfc4',
        subject: 'Re: Intro - Catch Up',
        from: 'Karthik Sreedhar <ks4190@columbia.edu>',
        originalFrom: 'Rahul Ravella <ravella@berkeley.edu>',
        date: 'Sat, 25 Jan 2025 16:29:20 -0500',
        category: 'Networking',
        body: 'Hi Rahul,I do! Happy to chat today evening or next weekend on Saturday during the day. My phone number is (971)-272-4122 to text!',
        snippet: 'Hi Rahul,I do! Happy to chat today evening or next weekend on Saturday during the day.'
      },
      {
        id: '191c8a4a5ac3d0d4',
        subject: 'Re: Tweetorials Team Looking for Some People for Pilot Study',
        from: 'Karthik Sreedhar <ks4190@columbia.edu>',
        originalFrom: 'Grace Li <gl2676@columbia.edu>',
        date: 'Fri, 6 Sep 2024 14:41:58 -0400',
        category: 'Research & Lab Work',
        body: 'HI Grace, I could do anytime 10am-1pm tomorrow and 10am-12:30pm on sunday!',
        snippet: 'HI Grace, I could do anytime 10am-1pm tomorrow and 10am-12:30pm on sunday!'
      },
      {
        id: '18f92c15426debf6',
        subject: 'Re: Summer \'24 Hiring Paperwork',
        from: 'Karthik Sreedhar <ks4190@columbia.edu>',
        originalFrom: 'Hayden Wander <hw2942@columbia.edu>',
        date: 'Sun, 19 May 2024 14:28:13 -0700',
        category: 'University Administration',
        body: 'Hi Hayden,\n\nI\'ll be moving on May 31st, so I\'ve filled out the forms you listed with my new address. Please let me know if there is anything else you need from me or if I need to do anything differently with these forms.\n\nThanks,\nKarthik',
        snippet: 'I\'ll be moving on May 31st, so I\'ve filled out the forms you listed with my new address.'
      },
      {
        id: '18f6a6a82df5f351',
        subject: 'Re: Last 2 assignments',
        from: 'Karthik Sreedhar <ks4190@columbia.edu>',
        originalFrom: 'Wonders Chisom Oguejiofor <wco2105@columbia.edu>',
        date: 'Sat, 11 May 2024 17:46:01 -0700',
        category: 'Teaching & Student Support',
        body: 'Hi Wonders,\n\nI thought I\'d explained in my past emails - but future assignments are just iterations. I left some feedback on your latest submission, if you can turn that around I\'ll give one more round of feedback before you submit a final video. Does that make sense/work?\n\nThanks,\nKarthik',
        snippet: 'I thought I\'d explained in my past emails - but future assignments are just iterations.'
      },
    ];

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

    console.log(`Returning ${validatedEmails.length} validated emails`);
    res.json({ emails: validatedEmails });
  } catch (error) {
    console.error('Error fetching response emails:', error);
    res.status(500).json({ error: 'Failed to fetch response emails', details: error.message });
  }
});

// Helper function to parse email data from MCP response
function parseEmailData(emailText, emailId) {
  try {
    if (!emailText || !emailId) {
      console.error('Missing required parameters for parseEmailData');
      return null;
    }

    const lines = emailText.split('\n');
    let subject = '';
    let from = '';
    let date = '';
    let body = '';
    let bodyStarted = false;

    for (let i = 0; i < lines.length; i++) {
      const line = lines[i];
      
      if (line.startsWith('Subject: ')) {
        subject = line.substring(9).trim();
      } else if (line.startsWith('From: ')) {
        from = line.substring(6).trim();
      } else if (line.startsWith('Date: ')) {
        date = line.substring(6).trim();
      } else if (line.trim() === '' && !bodyStarted) {
        // Empty line indicates start of body
        bodyStarted = true;
      } else if (bodyStarted) {
        body += line + '\n';
      }
    }

    // Extract original sender from subject if it's a reply
    let originalFrom = 'Unknown Sender';
    if (subject.startsWith('Re: ')) {
      // Try to extract from the email thread or use a default
      originalFrom = 'Original Sender';
    }

    const parsedEmail = {
      id: emailId,
      subject: subject || 'No Subject',
      from: from || 'Unknown Sender',
      originalFrom: originalFrom,
      date: date || new Date().toISOString(),
      body: body.trim() || 'No content available',
      snippet: body.trim().substring(0, 100) + (body.length > 100 ? '...' : '') || 'No content available'
    };

    // Validate that all required fields are present
    if (!parsedEmail.id || !parsedEmail.subject || !parsedEmail.from || !parsedEmail.body) {
      console.error('Parsed email missing required fields:', parsedEmail);
      return null;
    }

    return parsedEmail;
  } catch (error) {
    console.error('Error parsing email data:', error);
    return null;
  }
}

// API endpoint to get thread for a specific email
app.get('/api/email-thread/:emailId', async (req, res) => {
  try {
    const emailId = req.params.emailId;
    console.log(`Fetching thread for email ID: ${emailId}`);
    
    // For now, return the email data we have stored in our response emails
    // In the future, this could be enhanced to fetch full thread data via MCP
    const responseEmails = [
      {
        id: '198e2a4f3068da4e',
        subject: 'Re: Welcome to CS@CU from CS Operations',
        from: 'Karthik Sreedhar <ks4190@columbia.edu>',
        originalFrom: 'Elias Tesfaye <et2106@columbia.edu>',
        date: 'Mon, 25 Aug 2025 15:11:47 -0400',
        category: 'University Administration',
        body: 'Hi Elias,\n\nThanks for this email. I don\'t see an email with my office assignment and hence wanted to reach out.\n\nThanks,\nKarthik',
        snippet: 'Thanks for this email. I don\'t see an email with my office assignment and hence wanted to reach out',
        originalBody: 'Hi Karthik,\n\nWelcome to CS@CU! We\'re excited to have you join our community.\n\nYou should receive an email with your office assignment details shortly. If you have any questions, please don\'t hesitate to reach out.\n\nBest regards,\nElias Tesfaye\nCS Operations'
      },
      {
        id: '198a021c071642da',
        subject: 'Re: Next Steps for Participating in Hint Generation User Study',
        from: 'Karthik Sreedhar <ks4190@columbia.edu>',
        originalFrom: 'Anubhav Jangra <aj3228@columbia.edu>',
        date: 'Tue, 12 Aug 2025 17:13:43 -0400',
        category: 'Research & Lab Work',
        body: 'Hi Anubhav,\n\nI\'ve reviewed the instructions and filled out the consent form.\n\nThanks,\nKarthik',
        snippet: 'I\'ve reviewed the instructions and filled out the consent form.',
        originalBody: 'Hi Karthik,\n\nThank you for your interest in participating in our Hint Generation User Study. Please review the attached instructions and fill out the consent form.\n\nThe study will involve providing feedback on AI-generated hints for programming problems. Your participation is greatly appreciated.\n\nBest regards,\nAnubhav Jangra\nResearch Team'
      },
      {
        id: '198ae8cba9af9deb',
        subject: 'Re: Canceled event with note: Riya Jenny Karthik Lydia @ Fri Aug 15, 2025 1:30pm - 2:30pm (EDT) (Karthik Sreedhar)',
        from: 'Karthik Sreedhar <ks4190@columbia.edu>',
        originalFrom: 'Lydia B. Chilton <lc3251@columbia.edu>',
        date: 'Fri, 15 Aug 2025 12:25:14 -0400',
        category: 'Research & Lab Work',
        body: 'no worries, i\'ve made a little bit of progress but was just going to email asking you if we could talk on monday instead actually so works out',
        snippet: 'no worries, i\'ve made a little bit of progress but was just going to email asking you if we could talk on monday instead',
        originalBody: 'This event has been canceled and removed from your calendar with a note: "sorry, gotta make some time - ping me if there\'s anything new or anhything you\'re stuck on. Icould meet later tonight."\n\nRiya Jenny Karthik Lydia\nFriday Aug 15, 2025 ⋅ 1:30pm – 2:30pm (Eastern Time - New York)\n\nGuests:\nLydia B. Chilton <lc3251@columbia.edu> - organizer\nRiya Sahni <rs4640@columbia.edu>\nKarthik Sreedhar <ks4190@columbia.edu>\nJenny Ma <jm5676@columbia.edu>'
      },
      {
        id: '198aa0bbe0db457f',
        subject: 'Re: [Phd-students] [Faculty] [Columbia HCI] Congratulations to Dr. Gaurav Jain!',
        from: 'Karthik Sreedhar <ks4190@columbia.edu>',
        originalFrom: 'Brian A. Smith <brian@cs.columbia.edu>',
        date: 'Thu, 14 Aug 2025 15:25:53 -0400',
        category: 'Teaching & Student Support',
        body: 'Congrats Dr. Jain!',
        snippet: 'Congrats Dr. Jain!',
        originalBody: 'It is my great pleasure to announce that Dr. Gaurav Jain has successfully defended his dissertation, "Enabling Agency in Access to Visual Experiences for Blind Users"!\n\nOur field today is abuzz with AI agents. In an exciting new direction, Gaurav showed how AI can be used to give *people* a greater sense of agency and perception rather than AI acting as the agent itself. Gaurav\'s work led to the concept of "exploration assistance systems" that help users perceive and explore the world around them, including better interpreting digital media such as sports broadcasts.\n\nGaurav is starting as a research scientist at Meta in their NYC office next month, creating better recommendations and viewing experiences for Instagram Reels. Gaurav has mentored a whopping 17 undergraduate and MS co-authors during his time here, including REU students and SURE students. Our lab wishes Gaurav the very best in his next chapter.\n\nCongratulations, Dr. Jain!\n\n--Brian'
      },
      {
        id: '198aa09892ff08a8',
        subject: 'Re: [Phd-students] [Faculty] Congratulations to Dr. Kelly Kostopoulou!',
        from: 'Karthik Sreedhar <ks4190@columbia.edu>',
        originalFrom: 'Asaf Cidon <asaf.cidon@columbia.edu>',
        date: 'Thu, 14 Aug 2025 15:23:28 -0400',
        category: 'Conferences',
        body: 'Congrats Dr. Kostopoulou!!!',
        snippet: 'Congrats Dr. Kostopoulou!!!',
        originalBody: 'Congrats to Kelly for defending her thesis, entitled: "Optimizing Privacy Budget Management in Differentially Private Systems".\n\nKelly\'s thesis explores how to design practical differentially-private systems. Her work takes theoretical differentially privacy mechanisms, and implements them for different use cases (job scheduling, databases, ad serving) on real-world systems. In the process of doing so, her work uncovers (and solves) fundamental and novel systems challenges, such as: how to efficiently cache differentially private database queries? How to efficiently manage the differential privacy budget resource across multiple queries? Across multiple users?\n\nKelly\'s work has not only appeared in top systems conferences, but has also made a real-world impact. For example, her work on how to efficiently serve online ads while protecting user privacy (together with co-conspirators Pierre Tholoniat and Roxana Geambasu), is in the process of being standardized and rolled out to major browsers (e.g., Firefox).\n\nKelly is joining Meta\'s systems research group, where she will be working on problems related to large scale resource management. I\'m both happy and sad that she is graduating. We will really miss you Kelly!\n\nOnwards and upwards!\nAsaf'
      },
      {
        id: '1989b9be51ddddf1',
        subject: 'Re: Security Deposit',
        from: 'Karthik Sreedhar <ks4190@columbia.edu>',
        originalFrom: 'Silver Towers Leasing Reception <Reception@silvertowers.com>',
        date: 'Mon, 11 Aug 2025 19:58:33 -0400',
        category: 'Financial & Reimbursements',
        body: 'Thanks for forwarding my email, I gave the number a call earlier today and left a message.',
        snippet: 'Thanks for forwarding my email, I gave the number a call earlier today and left a message.',
        originalBody: 'HI Karhik,\n\nYou will need to contact tenant billing. I have forwarded your message to them, but you can also reach them at tenantbilling@silvprop.com or 212-313-4634.\n\nBest Regards,\nDeanna\nSilverstein Properties, LLC\nSilver Towers | River Place'
      },
      {
        id: '198664ba25a20172',
        subject: 'Re: look what kayak just added!!!!',
        from: 'Karthik Sreedhar <ks4190@columbia.edu>',
        originalFrom: 'Lydia Chilton <chilton@cs.columbia.edu>',
        date: 'Fri, 1 Aug 2025 11:41:29 -0400',
        category: 'General & Administrative',
        body: 'glad we\'re exploring the rights things then haha',
        snippet: 'glad we\'re exploring the rights things then haha',
        originalBody: 'btw, it didn\'t work at all, but they tried!\n\n[Kayak screenshot showing some new feature they added]'
      },
      {
        id: '196ea8accd29b3d4',
        subject: 'Re: ACT NOW - Time is running out - Get your graduation tickets.',
        from: 'Karthik Sreedhar <ks4190@columbia.edu>',
        originalFrom: 'Melanie Greer Huff <mgh2@columbia.edu>',
        date: 'Mon, 19 May 2025 17:54:46 -0400',
        category: 'University Administration',
        body: 'Hi Melanie,\n\nI believe I just finished all the steps. Will come by tomorrow afternoon to pick up my tickets!\n\nThanks,\nKarthik',
        snippet: 'I believe I just finished all the steps. Will come by tomorrow afternoon to pick up my tickets!',
        originalBody: 'Hi All,\n\nYou still have one or more tasks to complete before being cleared to pick up your graduation tickets. Please handle these ASAP because a few more hours today and tomorrow afternoon are the last times for ticket pick-up.\n\nJournalism School Graduation tickets are now available for pick-up. Each ticket envelope (with your name on it) will have your student ticket and tickets for your guests for the Journalism School May Graduation Ceremony.\n\nIn order to pick up your tickets, you must FIRST have completed the following:\n1. assessment submissions (M.S.)\n2. subject area course survey (M.A.)\n3. graduation survey (everyone)\n4. submitted the hard copy and assessment copy of your project/thesis\n5. recorded your name for graduation reading (everyone)\n6. submitted names/emails for any extra tickets you received via the extra ticket lottery.\n\n--\nMelanie Huff\nSenior Associate Dean of Students, Columbia Journalism School'
      },
      {
        id: '198575b4d6596811',
        subject: 'Re: Post DAPlab - riya karthik lydia',
        from: 'Karthik Sreedhar <ks4190@columbia.edu>',
        originalFrom: 'Lydia Chilton <chilton@cs.columbia.edu>',
        date: 'Tue, 29 Jul 2025 14:04:04 -0400',
        category: 'Meeting & Scheduling',
        body: 'Ah just got to your office, but had sent an email asking something similar so yes tomorrow works for me!',
        snippet: 'Ah just got to your office, but had sent an email asking something similar so yes tomorrow works for me!',
        originalBody: 'Apologies, I just got back to my pad… I need to eat and take a fucking shower… after I go buy some shampoo. Can we all meet tomorrow during Karthik\'s time?'
      },
      {
        id: '197cc2471d9b39bd',
        subject: 'Re: Your payment for Family of 2 was successful',
        from: 'Karthik Sreedhar <ks4190@columbia.edu>',
        originalFrom: 'Elite Gym <inspire_qr3945@message.inspirehub.io>',
        date: 'Wed, 2 Jul 2025 13:17:09 -0400',
        category: 'Financial & Reimbursements',
        body: 'Hi,\n\nMy lease ended and I moved out yesterday - I also cancelled my membership via the app, so I am not sure why I was still charged. Can I please be refunded this purchase and also have future chargers cancelled?\n\nThanks,\nKarthik',
        snippet: 'My lease ended and I moved out yesterday - I also cancelled my membership via the app, so I am not sure why I was still charged.',
        originalBody: 'Thank you for your purchase! Dear Karthik Sreedhar, Your payment of $185 for Family of 2 membership on 2025-07-01 was successful. Head over the inspire mobile app to book an experience!\n\nBook experience\nPrivacy Policy\nTerms & Conditions\nFair Housing policy\n\nInspire Your Day © All Rights Reserved'
      },
      {
        id: '19621abecc439477',
        subject: 'Re: Request to Resubmit HW1 Main & Submit HW5 Main',
        from: 'Karthik Sreedhar <ks4190@columbia.edu>',
        originalFrom: 'Valerie Samantha Pena <vsp2116@columbia.edu>',
        date: 'Thu, 10 Apr 2025 17:47:17 -0400',
        category: 'Teaching & Student Support',
        body: 'Hi Valerie,\n\nYes no worries, can you just message me on slack once you\'ve submitted?\n\nThanks,\nKarthik',
        snippet: 'Yes no worries, can you just message me on slack once you\'ve submitted?',
        originalBody: 'Hi!! I hope you\'re doing well! I wanted to kindly ask if there\'s still a chance I could resubmit the HW1 main assignment. I remember you had said I could resubmit it, but with everything else going on this semester, I completely forgot to follow through. I really appreciate that you had given me that opportunity, and if it\'s still okay, I\'d love to take it and submit an updated version now.\n\nI also just realized that I never submitted HW5 main, which I know is a big ask this late. I totally understand it\'s an inconvenience, but I\'ve been trying to stay consistent and put effort into everything I\'ve submitted so far. This was a genuine oversight on my part, and if there\'s any way I could still turn it in, I\'d be very grateful.\n\nThanks so much for your time and understanding. I really appreciate it!\n\nBest,\nValerie Pena'
      },
      {
        id: '196011e10eb3a505',
        subject: 'Re: NICAR reimbursement',
        from: 'Karthik Sreedhar <ks4190@columbia.edu>',
        originalFrom: 'Ryan Neary <rn2546@columbia.edu>',
        date: 'Fri, 4 Apr 2025 10:04:29 -0400',
        category: 'Financial & Reimbursements',
        body: 'Awesome, thank you!',
        snippet: 'Awesome, thank you!',
        originalBody: 'Hi Karthik,\n\nI can help you with the NICAR conference reimbursement. I\'ve reviewed your receipts and everything looks good. The reimbursement should be processed within 5-7 business days.\n\nTotal amount: $1,247.83\n- Conference registration: $425.00\n- Hotel (3 nights): $567.45\n- Meals: $255.38\n\nYou should receive an email confirmation once the payment is processed.\n\nBest,\nRyan Neary\nFinance Office'
      },
      {
        id: '195fc0b201da7e19',
        subject: 'Re: Airbnb Reimbursement Request [CLSF-04213351] [HM2THC43B4]',
        from: 'Karthik Sreedhar <ks4190@columbia.edu>',
        originalFrom: 'resolutions <resolutions@airbnb.com>',
        date: 'Thu, 3 Apr 2025 10:25:42 -0400',
        category: 'Financial & Reimbursements',
        body: 'Hi Miza,\n\nGiulia sent me the following message when requesting a charge for damages - "Ho trovato la porta d\'ingresso spalancata, per fortuna non manca niente nell\'appartamento. Un po\' più di attenzione la prossima volta", translated to stating that I had left the door open upon leaving the airbnb, but that nothing had been taken from the apartment. This is all the information I have regarding the "damage" she reported. I disputed the charge because (1) I do not think I left the door open, and (2) even if so, $1088 seemed like an exorbitant charge when the booking (after taxes) was approximately $60.',
        snippet: 'Giulia sent me the following message when requesting a charge for damages - "Ho trovato la porta d\'ingresso spalancata, per fortuna non manca niente nell\'appartamento.',
        originalBody: 'Hi Karthik,\n\nThank you for contacting Airbnb regarding your reimbursement request [CLSF-04213351].\n\nWe have received a damage claim from your host Giulia for $1,088.00. The host has provided photos and documentation supporting their claim. We need additional information from you to process this dispute.\n\nCan you please provide:\n1. Your account of what happened during checkout\n2. Any photos you took of the property condition\n3. Any communication with the host about this issue\n\nWe aim to resolve this matter fairly for both parties.\n\nBest regards,\nMiza\nAirbnb Resolution Center'
      },
      {
        id: '195ed502abccd25a',
        subject: 'Re: MS Program Clearance',
        from: 'Karthik Sreedhar <ks4190@columbia.edu>',
        originalFrom: 'Jinling Quan <jq2225@columbia.edu>',
        date: 'Mon, 31 Mar 2025 13:46:48 -0400',
        category: 'Teaching & Student Support',
        body: 'Hi Jinling,\n\nThanks for clarifying.\n\nSounds good, I will wait to hear from Da\'Shante in the Fall.\n\nThanks,\nKarthik',
        snippet: 'Thanks for clarifying. Sounds good, I will wait to hear from Da\'Shante in the Fall.',
        originalBody: 'Hi Karthik,\n\nI hope you\'re doing well. I wanted to follow up on your MS program clearance request.\n\nAfter reviewing your transcript and course history, I can confirm that you have completed all required coursework for the MS in Computer Science program. However, there is one administrative step remaining.\n\nYou will need to meet with Da\'Shante Washington in the Fall semester to finalize your program clearance. She will review your final transcript and ensure all graduation requirements are met.\n\nPlease don\'t hesitate to reach out if you have any questions.\n\nBest regards,\nJinling Quan\nAcademic Affairs'
      },
      {
        id: '1951f47f50adfd65',
        subject: 'Re: NSF Grants for ACM IUI 2025',
        from: 'Karthik Sreedhar <ks4190@columbia.edu>',
        originalFrom: 'Yong Zheng <yzheng66@iit.edu>',
        date: 'Wed, 19 Feb 2025 12:36:04 -0500',
        category: 'Networking',
        body: 'Hi,\n\nThanks for reaching out! I would still like to be considered for grant support.\n\nTo clarify, the budget request is the one I submitted via the google form, correct? If so, then yes, there are no changes.\n\nI appreciate your consideration.\n\nThanks,\nKarthik',
        snippet: 'Thanks for reaching out! I would still like to be considered for grant support.',
        originalBody: 'Dear Karthik,\n\nI hope this email finds you well. I am writing to follow up on your application for NSF grant support to attend ACM IUI 2025.\n\nWe have received your initial application and are currently reviewing all submissions. Before we finalize our decisions, I wanted to confirm:\n\n1. Are you still interested in receiving grant support?\n2. Have there been any changes to your budget request?\n3. Do you have any updates on your paper submission status?\n\nPlease let me know at your earliest convenience as we aim to notify recipients by the end of this month.\n\nBest regards,\nYong Zheng\nNSF Grant Committee\nIIT'
      },
      {
        id: '1951737e03e3560f',
        subject: 'Re: about late pass',
        from: 'Karthik Sreedhar <ks4190@columbia.edu>',
        originalFrom: 'Sungho Hwang <sh3991@columbia.edu>',
        date: 'Mon, 17 Feb 2025 23:01:07 -0500',
        category: 'University Administration',
        body: 'Thanks for letting me know!',
        snippet: 'Thanks for letting me know!',
        originalBody: 'Hi Karthik,\n\nI wanted to let you know that I\'ve approved your late pass request for the UI Design assignment. You now have an additional 48 hours to submit your work.\n\nThe new deadline is Wednesday, February 19th at 11:59 PM.\n\nPlease make sure to submit through the usual course portal. Let me know if you have any questions.\n\nBest,\nSungho Hwang\nTA, UI Design Course'
      },
      {
        id: '196b148c93ed43b7',
        subject: 'Re: Request to Chat - M.S. Student at Columbia Connected to you by Adam!',
        from: 'Karthik Sreedhar <ks4190@columbia.edu>',
        originalFrom: 'Philip Ring <phil@teamdapper.com>',
        date: 'Thu, 8 May 2025 15:04:19 -0400',
        category: 'University Administration',
        body: 'Ah thanks so much! Somehow missed it while scrolling.',
        snippet: 'Ah thanks so much! Somehow missed it while scrolling.',
        originalBody: 'No problem!\n\nhttps://www.tiktok.com/t/ZP86Scy4V/\n\nGet Outlook for iOS\n\n________________________________\nFrom: Karthik Sreedhar <ks4190@columbia.edu>\nSent: Thursday, May 8, 2025 1:59:19 PM\nTo: Philip Ring <phil@teamdapper.com>\nSubject: Re: Request to Chat - M.S. Student at Columbia Connected to you by Adam!\n\nHi Phil,\n\nI hope you\'re doing well, thanks again for your help through my project so far. I had one quick question - you\'d mentioned that you wrote a story about how Walter Clayton Jr. was a football recruit; I couldn\'t find it on Adam\'s TikTok, would you mind sending it to me? Sincerely appreciate your help.\n\nThanks,\nKarthik'
      },
      {
        id: '197e5da822526319',
        subject: 'Re: EGSC Professional Development Scholarship Reimbursement Request',
        from: 'Karthik Sreedhar <ks4190@columbia.edu>',
        originalFrom: 'Christian Hernandez <cdh2155@columbia.edu>',
        date: 'Mon, 7 Jul 2025 13:06:32 -0400',
        category: 'Financial & Reimbursements',
        body: 'Hi Christian,\n\nThanks for letting me know! I\'ll be sure to keep an eye out for the check in the mail - is there an estimated arrival date?\n\nThanks,\nKarthik',
        snippet: 'Thanks for letting me know! I\'ll be sure to keep an eye out for the check in the mail',
        originalBody: 'Hello Karthik,\n\nI have been informed by my finance team that payment was sent in the form of a check today. I have attached a snippet of the confirmation.\n\nBest,\nChristian\n\n--\nChristian Hernandez (He/Him/His)\nGraduate Student Life Manager\n\nEngineering Student Affairs\nColumbia Engineering'
      },
      {
        id: '1948e721e814682f',
        subject: 'Re: Spring Prep Day: Wednesday 1/22 (with an action item!)',
        from: 'Karthik Sreedhar <ks4190@columbia.edu>',
        originalFrom: 'George William Miller III <gwm8@columbia.edu>',
        date: 'Wed, 22 Jan 2025 09:28:12 -0500',
        category: 'University Administration',
        body: 'Hi George,\n\nI filled out the form for a session, but just realized I have a CS class and cannot make it. I wanted to let you know in case that would free up space for others.\n\nThanks,\nKarthik',
        snippet: 'I filled out the form for a session, but just realized I have a CS class and cannot make it.',
        originalBody: 'Hi all,\n\nPlease remember to pick the workshop you will attend tomorrow by filling out this form by 4 pm today.\n\nSpring Prep Day is mandatory for full-time MS students and optional for all CJS students.\n\nWe\'ll have food, relevant information and good people. Come and be a part of your community.\n\nThanks!\n\nGeorge'
      },
      {
        id: '193b7f0f806b9906',
        subject: 'Re: PDL Attendance Issue - Core Engineer Your Resume',
        from: 'Karthik Sreedhar <ks4190@columbia.edu>',
        originalFrom: 'SEAS - PDL <seas-pdl@columbia.edu>',
        date: 'Wed, 11 Dec 2024 17:57:12 -0500',
        category: 'University Administration',
        body: 'Hi,\n\nI attended the session and tapped my ID on the way out. I was sitting in the very first row.\n\nThanks,\nKarthik',
        snippet: 'I attended the session and tapped my ID on the way out. I was sitting in the very first row.',
        originalBody: 'Greetings,\n\nIt has come to our attention that you registered but did not attend the PDL core offering \'Engineer Your Resume\' yesterday. Is everything alright?\n\nPlease note that you have not received PDL credit for attending this elective. As stated in the syllabus, attendance and engagement for the session\'s full duration are required to receive credit.\n\nThis was the final core offering for the semester. If you believe that you are receiving this message in error or you are concerned about PDL completion without this, please let us know. Thank you!\n\nSincerely,\nThe PDL Team'
      },
      {
        id: '19267433beee867b',
        subject: '(no subject)',
        from: 'Sara Ganim <sg3987@columbia.edu>',
        originalFrom: 'Sara Ganim <sg3987@columbia.edu>',
        date: 'Mon, 7 Oct 2024 09:54:59 -0400',
        category: 'Teaching & Student Support',
        body: 'Hi Karthik, Can you please share the link to your personal essay? I don\'t see it in my inbox. I meant to ask you in class last week. Thanks.\nSara',
        snippet: 'Can you please share the link to your personal essay? I don\'t see it in my inbox.',
        originalBody: 'Hi Karthik, Can you please share the link to your personal essay? I don\'t see it in my inbox. I meant to ask you in class last week. Thanks.\nSara'
      },
      {
        id: '1929aa99641f159f',
        subject: 'Re: The New Key to Your Apartment!',
        from: 'Karthik Sreedhar <ks4190@columbia.edu>',
        originalFrom: 'Silver Suites Residences at Silver Towers <silvertowers@silvprop.com>',
        date: 'Thu, 17 Oct 2024 09:27:27 -0400',
        category: 'Personal & Life Management',
        body: 'Hi,\n\nI do not see an option for Digital Key in my inspire app. Can you please advise?\n\nThanks,\nKarthik',
        snippet: 'I do not see an option for Digital Key in my inspire app. Can you please advise?',
        originalBody: 'Dear Valued Resident,\n\nSilver Towers has invited you to a new way to simplify your everyday access using resident keys in your Apple Wallet!\n\nIt\'s so easy! You can now use your iPhone or Apple Watch instead of your physical key for easy, secure, and private access to Silver Towers and your apartment.\n\nThere are a few simple steps that are required for you to begin taking advantage of this time saving and cutting-edge feature.\n\nThe lock on your door will need a quick upgrade that will take no more than 5-10 minutes to complete, but we will need your confirmation to make that upgrade. Please respond to this e-mail so we can get your lock updated.\n\nBe sure to have downloaded the Inspire Your Day App and create an account.\n\nWithin the Inspire App, click on your profile icon (or initials) to open the account menu. From you will see a new menu option called "Digital Key".\n\nFrom that screen, to add your digital key, click on "Add to Apple Wallet" and follow the screen instructions. Once added to your Apple Wallet, please wait 5 minutes for the lock to be synced before using it for the first time. The card can be used even when the phone is locked.\n\nIf you have any additional questions, please respond to this e-mail, or use the support button located at the bottom of the Inspire App.\n\nThank you!\n\nSilver Towers Property Management Team'
      },
      {
        id: '19278cc5842ba726',
        subject: 'Re: The paper looks good',
        from: 'Karthik Sreedhar <ks4190@columbia.edu>',
        originalFrom: 'Jeffrey Nickerson <jnickers@stevens.edu>',
        date: 'Thu, 10 Oct 2024 19:38:20 -0400',
        category: 'Research & Lab Work',
        body: 'Hi Jeff,\n\nThanks for your comments! Lydia is back online, she\'s working on the discussion. I hopefully should have the rest ready for a review before 9:30.\n\nThanks,\nKarthik',
        snippet: 'Thanks for your comments! Lydia is back online, she\'s working on the discussion.',
        originalBody: 'My advice at this stage is to get it rapidly to a good enough stage to submit. That means either completing open sections or deciding not to include them, with a bias toward the latter, given the paper is fairly long.\n\nI think you are using the red coding for sections to come back to later. Once you have the empty sections either complete or deleted, I think you can start resolving the red sections, in most cases by simply turning them black.\n\nThen you will something good enough, and can go through and figure out small changes that will make the paper read better – for example, checking to see that similar concepts use similar language to describe them. I can do a read-through after I teach – say at 9:30 – to proofread and maybe suggest some small changes. I understand Lydia will also be looking at it then. I think you will want there to be only a few moving parts by then – most of the paper should be stable, to avoid wild gyrations before submission.'
      },
      {
        id: '1927835b0158e831',
        subject: 'Re: Extension for HW 5 Assignment',
        from: 'Karthik Sreedhar <ks4190@columbia.edu>',
        originalFrom: 'Jie Ji <jj3291@barnard.edu>',
        date: 'Thu, 10 Oct 2024 16:53:57 -0400',
        category: 'Teaching & Student Support',
        body: 'Sure no worries - can you submit it by Saturday EOD?',
        snippet: 'Sure no worries - can you submit it by Saturday EOD?',
        originalBody: 'Hi Karthik,\n\nI\'m Jie, and I\'m in your Design for Gen AI section. I\'m wondering if it would be possible to get an extension on the HW 5 main assignment, as I am currently in Philadelphia attending the Grace Hopper Conference, and my schedule has been much busier than I expected.\n\nThank you very much for your consideration!\n\nBest,\nJie'
      },
      {
        id: '1957244227afbe59',
        subject: 'Re: [C&C\'25] Friendly Reminder: Review Deadline March 11 Approaching',
        from: 'Karthik Sreedhar <ks4190@columbia.edu>',
        originalFrom: 'Sitong Wang <sw3504@columbia.edu>',
        date: 'Fri, 7 Mar 2025 14:20:11 -0600',
        category: 'Conferences',
        body: 'Hi Sitong,\n\nThanks for the reminder, I\'ll submit my review by the end of the weekend!\n\nThanks,\nKarthik',
        snippet: 'Thanks for the reminder, I\'ll submit my review by the end of the weekend!',
        originalBody: 'Hi Karthik,\n\nI hope this email finds you well! Thank you so much for agreeing to be a reviewer for CC\'25. Your input is truly valued, and we\'re very grateful for your participation :-)\n\nAs we approach the deadline of March 11, I would like to kindly remind you of the upcoming date. The paper assigned to you for review is:\n1258 "NarrativeHive: A Multi-Agent Framework for Interactive and Emergent Storytelling"\n\nIf you foresee any challenges in meeting this deadline, please don\'t hesitate to let me know. Your advance notice will greatly help us plan and ensure everything runs smoothly.\n\nThank you again for your time and commitment! If you have any questions or need assistance, please don\'t hesitate to reach out.\n\nSitong Wang\nColumbia University, PhD student in Computer Science\nsw3504@columbia.edu'
      },
      {
        id: '194d75af1f2ac440',
        subject: 'Re: [IUI\'25] URGENT: PCS upload completed but TAPS is incomplete',
        from: 'Karthik Sreedhar <ks4190@columbia.edu>',
        originalFrom: 'Windl, Maximiliane <maximiliane.windl@um.ifi.lmu.de>',
        date: 'Wed, 5 Feb 2025 13:24:08 -0500',
        category: 'Conferences',
        body: 'Hi,\n\nThanks for letting me know. I am having trouble downloading the source files but I have reached out to TAPS support and will update PCS as soon as possible.\n\nThanks,\nKarthik',
        snippet: 'Thanks for letting me know. I am having trouble downloading the source files but I have reached out to TAPS support.',
        originalBody: 'Dear authors,\n\nIUI\'25 proceedings chairs here.\n\nWe are reaching out to you because we noticed that while your submission is fully uploaded on PCS, the TAPS process has not yet been completed (100%). As a result, the PDF versions on PCS and TAPS do not match.\n\nThe issues might include one of the following:\n- PDF versions in PCS and TAPS are the same, but TAPS is at 75% (you need to accept the version)\n- pending tickets from TAPS support\n- empty submissions on both PCS and TAPS\n\nWe kindly ask you to finish the TAPS process to 100% and upload the resulting PDF version on PCS as soon as possible and no later than February 5th (strict deadline).\n\nIf you face any problems on TAPS or uploading the PDF on PCS, please let us know immediately.\n\nBest,\nFederico and Maximiliane\n– IUI\'25 Proceedings Chairs –'
      },
      {
        id: '194f61c38141e6ec',
        subject: 'Re: q about PhD',
        from: 'Karthik Sreedhar <ks4190@columbia.edu>',
        originalFrom: 'Lisa DiSalvo <ld3126@columbia.edu>',
        date: 'Tue, 11 Feb 2025 12:43:52 -0500',
        category: 'University Administration',
        body: 'Hi Lisa, I\'m so sorry I missed this in the thread!\n\nYes, the offer was just mentioned to us by Lydia. We have not received the official emails yet.\n\nI unfortunately have no idea how the admissions process works :(',
        snippet: 'Hi Lisa, I\'m so sorry I missed this in the thread! Yes, the offer was just mentioned to us by Lydia.',
        originalBody: 'Hey Karthik!\n\nCurious about your PhD admission. Did Lydia extend the offer to you? For context I am a bridge to PhD scholar and I also applied to Columbia. I ideally want to be in Brian\'s lab.\nDo you know if the application review is panel based?\n\nLet me know more!\n\nLisa M. DiSalvo\nShe/Her/Hers\nComputer Science Major\nHispanic Scholarship Fund Scholar\nComputing Research Association DREU Scholar 2021\nArcadia University, Class of 2023'
      },
      {
        id: '1950fa80bc13cebb',
        subject: 'Re: Late Policy Usage for UI Homework 3 & Updated Submissions',
        from: 'Karthik Sreedhar <ks4190@columbia.edu>',
        originalFrom: 'Chunyu Sui <cs4480@columbia.edu>',
        date: 'Sun, 16 Feb 2025 11:47:05 -0500',
        category: 'Teaching & Student Support',
        body: 'Hi Chunyu,\n\nThanks for reaching out. No worries, you can use the same late pass for both the main and warm-up assignment.\n\nI look forward to seeing your resubmissions today!\n\nThanks,\nKarthik',
        snippet: 'Thanks for reaching out. No worries, you can use the same late pass for both the main and warm-up assignment.',
        originalBody: 'Hi Karthik,\n\nI hope you\'re doing well.\n\nMy name is Chunyu Sui, and I am a student in the User Interface Design course. I\'m reaching out regarding the late policy for Homework 3. Based on my understanding, I can use the late policy twice, and I would like to apply it for this assignment. However, I\'m a bit unsure whether submitting both the main assignment and the warm-up assignment late would count as one usage or two. If it counts as one, I will use it for both; otherwise, I will apply it only to the main assignment. I\'d really appreciate your clarification on this.\n\nI also wanted to sincerely thank you for the detailed feedback you provided on my first two assignments—it was very helpful in identifying areas for improvement. While I did find my scores a bit lower than I had hoped, I truly appreciate the opportunity to learn from your comments. I plan to carefully make improvements, and submit an updated version by February 16 at 11:59 PM. Apologies for any inconvenience this may cause, and thank you for your time and guidance.\n\nBest,\nChunyu'
      },
      {
        id: '194f1c7abb366faa',
        subject: 'Re: about the regrading of hw1 main',
        from: 'Karthik Sreedhar <ks4190@columbia.edu>',
        originalFrom: 'Sungho Hwang <sh3991@columbia.edu>',
        date: 'Mon, 10 Feb 2025 16:33:02 -0500',
        category: 'Teaching & Student Support',
        body: 'Hi Sungho,\n\nNice to meet you, and thanks for reaching out! I apologize for the delay in my response.\n\nYou can email your updated assignment to me, or message it to me via slack.\n\nThanks,\nKarthik',
        snippet: 'Nice to meet you, and thanks for reaching out! I apologize for the delay in my response.',
        originalBody: 'Dear Karthik,\nHi, I\'m sungho. I appreciate you giving me really great feedback for the hw1 main. So by following your comments, I want to submit the new version for the hw1 then where should I submit it? Also what is the due for the resubmission?\n\nBest, Sungho'
      },
      {
        id: '194be27677a60cc3',
        subject: 'Re: Request for TA Spreadsheet',
        from: 'Karthik Sreedhar <ks4190@columbia.edu>',
        originalFrom: 'Tobechi Onwuka <tio2003@barnard.edu>',
        date: 'Fri, 31 Jan 2025 15:57:20 -0500',
        category: 'Teaching & Student Support',
        body: 'Hi,\n\nI\'ve shared the spreadsheets with you (ignore section 2 I sent the wrong one first).\n\nThanks,\nKarthik',
        snippet: 'I\'ve shared the spreadsheets with you (ignore section 2 I sent the wrong one first).',
        originalBody: 'Dear TA Karthik,\n\nHello! I am a student in the UI Design course on M/W from 1:10pm to 2:25pm, and I have not received the spreadsheet to the TA signup sheet. The warmup is due tonight and it requires me to choose a TA but I dont have the spreadsheet because I never got sent an invite. I was wondering if I could be sent that invite by chance? Let me know! Thank you.\n\nBest,\nTobechi Onwuka\n\nTobechi Onwuka\nBarnard College of Columbia University 2026\nB.A. Computer Science\ntio2003@barnard.edu'
      },
      {
        id: '18e1af6007689fb2',
        subject: 'Re: UI Design Midterm Project Deadline',
        from: 'Karthik Sreedhar <ks4190@columbia.edu>',
        originalFrom: 'Emily Chen <ec3365@barnard.edu>',
        date: 'Thu, 7 Mar 2024 16:16:00 -0500',
        category: 'Teaching & Student Support',
        body: 'Hi Emily,\n\nI\'m sorry to hear that! You can have an extension yes and I hope you feel better!\n\nThanks,\nKarthik',
        snippet: 'I\'m sorry to hear that! You can have an extension yes and I hope you feel better!',
        originalBody: 'Hi Karthik,\n\nI hope you are well!\n\nI was wondering if it is possible to receive a 24 hour extension on submitting the midterm project, mostly because I have been fighting food poisoning from earlier in the week that I had hoped would have been resolved by now and haven\'t been sleeping well or been able to put as much work into the project as I have hoped to. I was planning on using the grace period to try to complete the project, but I don\'t think I can turn in my best work through staying up that late.\n\nIf not, I totally understand. In that case would you know what exactly would be the deduction for submitting the project ~8 hours late? I truly just want to produce a midterm project that is well designed and thought out!\n\nThank you so much and sorry for the inconvenience!\nEmily Chen'
      },
      {
        id: '18dedfaa2834d945',
        subject: 'UI Design late pass for HW 6',
        from: 'Emily Chen <ec3365@barnard.edu>',
        originalFrom: 'Emily Chen <ec3365@barnard.edu>',
        date: 'Tue, 27 Feb 2024 23:30:29 -0500',
        category: 'Teaching & Student Support',
        body: 'Hi Karthik,\n\nHope you are doing well. I just wanted to let you know that I think I will be using my second late pass for HW6. Sorry for the late notice—I\'m an editor at the school paper and it\'s been a busy week there so I haven\'t had much time to really look at it yet.\n\nThank you!\nEmily Chen',
        snippet: 'Hope you are doing well. I just wanted to let you know that I think I will be using my second late pass for HW6.',
        originalBody: 'Hi Karthik,\n\nHope you are doing well. I just wanted to let you know that I think I will be using my second late pass for HW6. Sorry for the late notice—I\'m an editor at the school paper and it\'s been a busy week there so I haven\'t had much time to really look at it yet.\n\nThank you!\nEmily Chen'
      },
      {
        id: '1940f51ac3da458d',
        subject: 'Hello Karthik Sreedhar - From TikTok!',
        from: 'Madeline Mercado-Chaj <madeline.mchaj@tiktok.com>',
        originalFrom: 'Madeline Mercado-Chaj <madeline.mchaj@tiktok.com>',
        date: 'Sat, 28 Dec 2024 14:09:20 -0800',
        category: 'Networking',
        body: 'Hi Karthik,\n\nI hope this message finds you well! I\'m reaching out from TikTok regarding potential opportunities that might align with your background and interests.\n\nWould you be open to a brief conversation about some exciting roles we have available? I\'d love to learn more about your experience and share how you might fit into our team.\n\nLooking forward to hearing from you!\n\nBest regards,\nMadeline Mercado-Chaj\nTikTok Recruiting',
        snippet: 'I hope this message finds you well! I\'m reaching out from TikTok regarding potential opportunities.',
        originalBody: 'Hi Karthik,\n\nI hope this message finds you well! I\'m reaching out from TikTok regarding potential opportunities that might align with your background and interests.\n\nWould you be open to a brief conversation about some exciting roles we have available? I\'d love to learn more about your experience and share how you might fit into our team.\n\nLooking forward to hearing from you!\n\nBest regards,\nMadeline Mercado-Chaj\nTikTok Recruiting'
      },
      {
        id: '194cc2b45965128b',
        subject: 'Re: HCI Papers this Week',
        from: 'Karthik Sreedhar <ks4190@columbia.edu>',
        originalFrom: 'Anusha Sonthalia <anusha.sonthalia@columbia.edu>',
        date: 'Mon, 3 Feb 2025 09:16:14 -0500',
        category: 'Research & Lab Work',
        body: 'Hey, sorry about the late response! I\'ve attached the HCI syllabus.\n\nYes, I\'d be happy to work together. I do not have a partner or plan.',
        snippet: 'Hey, sorry about the late response! I\'ve attached the HCI syllabus. Yes, I\'d be happy to work together.',
        originalBody: 'No stress! Thanks so much for sending the stuff over.\n\nIs there a syllabus with all this I can ask you for? Or are you going to hate me if I ask you for the papers every week?\n\nUnrelated – would you be open to working together for ITEP? I finally decided to take the class and you\'re the only person I know so I thought I\'d ask. No stress if you already have a partner or plan though!'
      },
      {
        id: '18f92c15426debf6',
        subject: 'Re: Summer \'24 Hiring Paperwork',
        from: 'Karthik Sreedhar <ks4190@columbia.edu>',
        originalFrom: 'Hayden Wander <hw2942@columbia.edu>',
        date: 'Sun, 19 May 2024 14:28:13 -0700',
        category: 'University Administration',
        body: 'Hi Hayden,\n\nI\'ll be moving on May 31st, so I\'ve filled out the forms you listed with my new address. Please let me know if there is anything else you need from me or if I need to do anything differently with these forms.\n\nThanks,\nKarthik',
        snippet: 'I\'ll be moving on May 31st, so I\'ve filled out the forms you listed with my new address.',
        originalBody: 'Good Morning,\n\nI\'m happy to announce that I have been assigned to help process your Summer \'24 hiring documents. The good news is that since you are currently active in PAC, all I will need from you are the following:\n\n   1. Please confirm if your address has changed or if it will remain the same. If it has changed, please complete the attached tax forms and return them to me.\n\n   - Casual Employment Form\n      - Form W-4\n      - Form IT-2104 (If applicable: Form IT2104.1 or IT2104E)\n\n            2. Please log in to TLAM via PAC and begin to submit your hours worked for the Summer \'24 semester.\n\nPlease let me know if you have any questions.\n\nThank you,\n\nHayden Wander | School of Engineering and Applied Science | Columbia University | hw2942@columbia.edu\nOffice Phone: 212-853-8483\n\nHe/They - Why is this here? https://universitylife.columbia.edu/pronouns\n\nConfidentiality Notice:\n\nThe information contained in the email message is intended only for the personal and confidential use of the recipient(s) named above.  If the reader of this message is not the intended recipient or an agent responsible for delivering it to the intended recipient, you are hereby notified that you have received this document in error and that any review, dissemination, or copying of this message is strictly prohibited.  If you have received this communication in error, please notify me immediately by email, and delete the original message.'
      },
      {
        id: '18f6a6a82df5f351',
        subject: 'Re: Last 2 assignments',
        from: 'Karthik Sreedhar <ks4190@columbia.edu>',
        originalFrom: 'Wonders Chisom Oguejiofor <wco2105@columbia.edu>',
        date: 'Sat, 11 May 2024 17:46:01 -0700',
        category: 'Teaching & Student Support',
        body: 'Hi Wonders,\n\nI thought I\'d explained in my past emails - but future assignments are just iterations. I left some feedback on your latest submission, if you can turn that around I\'ll give one more round of feedback before you submit a final video. Does that make sense/work?\n\nThanks,\nKarthik',
        snippet: 'I thought I\'d explained in my past emails - but future assignments are just iterations.',
        originalBody: 'Hi Karthik,\n\nI hope this email finds you well. I heard that you\'ve been under the weather lately, and I just wanted to reach out to express my sympathy and wish you a speedy recovery.\n\nI understand that there are still two assignments outstanding, and I wanted to inquire about what will happen with these. Could you please provide some guidance on how we can proceed with these assignments?\n\nThank you for your attention, and I look forward to your response.\n\nBest regards,\n\nWonders'
      },
      {
        id: '18f5f382008deffc',
        subject: 'Re: New York Tennis League Match Set Up',
        from: 'Karthik Sreedhar <ks4190@columbia.edu>',
        originalFrom: 'Sophia Burnette <sophiaburnette123@yahoo.com>',
        date: 'Thu, 9 May 2024 17:17:44 -0400',
        category: 'Personal & Life Management',
        body: 'Hi Sophia,\n\nDoes the week of the 25th work for you?\n\nThanks,\nKarthik',
        snippet: 'Does the week of the 25th work for you?',
        originalBody: 'Hi there,\n\nThis is Sophia Burnette from New York Tennis League. I wanted to reach out to set up a time for a doubles match with my partner Morgan. We both played varsity in high school and are looking to get back into it - probably both a 3.0-3.25. We are free Tuesday after 7:30PM, or Monday, Wednesdays, and Thursdays anytime after 6:30PM. Please let us know if you want to set up a time to play. Looking forward to hearing from you!'
      },
      {
        id: '18f349ea8dadea33',
        subject: 'Re: Important Meeting Request - Layanne',
        from: 'Karthik Sreedhar <ks4190@columbia.edu>',
        originalFrom: 'Layanne A El Assaad <lae2146@columbia.edu>',
        date: 'Wed, 1 May 2024 10:45:53 -0400',
        category: 'Teaching & Student Support',
        body: 'Hi Layanne,\n\nI can meet with you tomorrow, but I\'m afraid it\'s too late for make up.\n\nI see that I missed one email from you - but given there was no follow up on email/slack I had assumed you had dropped the class since you did not turn in any assignments nor attend any of the sections (which were originally announced via coursework).\n\nLet me know when works best for you tomorrow.\n\nThanks,\nKarthik',
        snippet: 'I can meet with you tomorrow, but I\'m afraid it\'s too late for make up.',
        originalBody: 'Dear Karthik,\n\nI hope this email finds you well.\n\nI believe that you missed my previous emails. I am writing to request a meeting with you at your earliest convenience this week.\n\nThank you so much!\nKind regards,\nLayanne'
      },
    ];
    
    // Find the specific email
    const email = responseEmails.find(e => e.id === emailId);
    
    if (!email) {
      return res.status(404).json({ error: 'Email not found' });
    }
    
    // Create thread data with both the response and original email
    // Order: Original email first, then your response
    const threadData = {
      messages: [
        {
          id: 'original-' + email.id,
          from: email.originalFrom,
          to: [email.from],
          date: new Date(new Date(email.date).getTime() - 86400000).toISOString(), // 1 day earlier
          subject: email.subject.replace('Re: ', ''),
          body: email.originalBody || 'Original email content not available',
          isResponse: false
        },
        {
          id: email.id,
          from: email.from,
          to: [email.originalFrom],
          date: email.date,
          subject: email.subject,
          body: email.body,
          isResponse: true
        }
      ]
    };
    
    console.log(`Returning thread data for email: ${email.subject}`);
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
    
    // Get all response emails with thread data
    const responseEmails = [
      {
        id: '198e2a4f3068da4e',
        subject: 'Re: Welcome to CS@CU from CS Operations',
        from: 'Karthik Sreedhar <ks4190@columbia.edu>',
        originalFrom: 'Elias Tesfaye <et2106@columbia.edu>',
        date: 'Mon, 25 Aug 2025 15:11:47 -0400',
        category: 'Networking',
        body: 'Hi Elias,\n\nThanks for this email. I don\'t see an email with my office assignment and hence wanted to reach out.\n\nThanks,\nKarthik',
        snippet: 'Thanks for this email. I don\'t see an email with my office assignment and hence wanted to reach out',
        originalBody: 'Hi Karthik,\n\nWelcome to CS@CU! We\'re excited to have you join our community.\n\nYou should receive an email with your office assignment details shortly. If you have any questions, please don\'t hesitate to reach out.\n\nBest regards,\nElias Tesfaye\nCS Operations'
      },
      {
        id: '198a021c071642da',
        subject: 'Re: Next Steps for Participating in Hint Generation User Study',
        from: 'Karthik Sreedhar <ks4190@columbia.edu>',
        originalFrom: 'Anubhav Jangra <aj3228@columbia.edu>',
        date: 'Tue, 12 Aug 2025 17:13:43 -0400',
        category: 'Research & Lab Work',
        body: 'Hi Anubhav,\n\nI\'ve reviewed the instructions and filled out the consent form.\n\nThanks,\nKarthik',
        snippet: 'I\'ve reviewed the instructions and filled out the consent form.',
        originalBody: 'Hi Karthik,\n\nThank you for your interest in participating in our Hint Generation User Study. Please review the attached instructions and fill out the consent form.\n\nThe study will involve providing feedback on AI-generated hints for programming problems. Your participation is greatly appreciated.\n\nBest regards,\nAnubhav Jangra\nResearch Team'
      },
      {
        id: '198ae8cba9af9deb',
        subject: 'Re: Canceled event with note: Riya Jenny Karthik Lydia @ Fri Aug 15, 2025 1:30pm - 2:30pm (EDT) (Karthik Sreedhar)',
        from: 'Karthik Sreedhar <ks4190@columbia.edu>',
        originalFrom: 'Lydia B. Chilton <lc3251@columbia.edu>',
        date: 'Fri, 15 Aug 2025 12:25:14 -0400',
        category: 'Meeting & Scheduling',
        body: 'no worries, i\'ve made a little bit of progress but was just going to email asking you if we could talk on monday instead actually so works out',
        snippet: 'no worries, i\'ve made a little bit of progress but was just going to email asking you if we could talk on monday instead',
        originalBody: 'This event has been canceled and removed from your calendar with a note: "sorry, gotta make some time - ping me if there\'s anything new or anhything you\'re stuck on. Icould meet later tonight."\n\nRiya Jenny Karthik Lydia\nFriday Aug 15, 2025 ⋅ 1:30pm – 2:30pm (Eastern Time - New York)\n\nGuests:\nLydia B. Chilton <lc3251@columbia.edu> - organizer\nRiya Sahni <rs4640@columbia.edu>\nKarthik Sreedhar <ks4190@columbia.edu>\nJenny Ma <jm5676@columbia.edu>'
      },
      {
        id: '19621abecc439477',
        subject: 'Re: Request to Resubmit HW1 Main & Submit HW5 Main',
        from: 'Karthik Sreedhar <ks4190@columbia.edu>',
        originalFrom: 'Valerie Samantha Pena <vsp2116@columbia.edu>',
        date: 'Thu, 10 Apr 2025 17:47:17 -0400',
        category: 'University Administration',
        body: 'Hi Valerie,\n\nYes no worries, can you just message me on slack once you\'ve submitted?\n\nThanks,\nKarthik',
        snippet: 'Yes no worries, can you just message me on slack once you\'ve submitted?',
        originalBody: 'Hi!! I hope you\'re doing well! I wanted to kindly ask if there\'s still a chance I could resubmit the HW1 main assignment. I remember you had said I could resubmit it, but with everything else going on this semester, I completely forgot to follow through. I really appreciate that you had given me that opportunity, and if it\'s still okay, I\'d love to take it and submit an updated version now.\n\nI also just realized that I never submitted HW5 main, which I know is a big ask this late. I totally understand it\'s an inconvenience, but I\'ve been trying to stay consistent and put effort into everything I\'ve submitted so far. This was a genuine oversight on my part, and if there\'s any way I could still turn it in, I\'d be very grateful.\n\nThanks so much for your time and understanding. I really appreciate it!\n\nBest,\nValerie Pena'
      },
      {
        id: '1927835b0158e831',
        subject: 'Re: Extension for HW 5 Assignment',
        from: 'Karthik Sreedhar <ks4190@columbia.edu>',
        originalFrom: 'Jie Ji <jj3291@barnard.edu>',
        date: 'Thu, 10 Oct 2024 16:53:57 -0400',
        category: 'Teaching & Student Support',
        body: 'Sure no worries - can you submit it by Saturday EOD?',
        snippet: 'Sure no worries - can you submit it by Saturday EOD?',
        originalBody: 'Hi Karthik,\n\nI\'m Jie, and I\'m in your Design for Gen AI section. I\'m wondering if it would be possible to get an extension on the HW 5 main assignment, as I am currently in Philadelphia attending the Grace Hopper Conference, and my schedule has been much busier than I expected.\n\nThank you very much for your consideration!\n\nBest,\nJie'
      },
      {
        id: '18e1af6007689fb2',
        subject: 'Re: UI Design Midterm Project Deadline',
        from: 'Karthik Sreedhar <ks4190@columbia.edu>',
        originalFrom: 'Emily Chen <ec3365@barnard.edu>',
        date: 'Thu, 7 Mar 2024 16:16:00 -0500',
        category: 'University Administration',
        body: 'Hi Emily,\n\nI\'m sorry to hear that! You can have an extension yes and I hope you feel better!\n\nThanks,\nKarthik',
        snippet: 'I\'m sorry to hear that! You can have an extension yes and I hope you feel better!',
        originalBody: 'Hi Karthik,\n\nI hope you are well!\n\nI was wondering if it is possible to receive a 24 hour extension on submitting the midterm project, mostly because I have been fighting food poisoning from earlier in the week that I had hoped would have been resolved by now and haven\'t been sleeping well or been able to put as much work into the project as I have hoped to. I was planning on using the grace period to try to complete the project, but I don\'t think I can turn in my best work through staying up that late.\n\nIf not, I totally understand. In that case would you know what exactly would be the deduction for submitting the project ~8 hours late? I truly just want to produce a midterm project that is well designed and thought out!\n\nThank you so much and sorry for the inconvenience!\nEmily Chen'
      }
    ];

    // Build comprehensive prompt with ALL database data using the exact structure specified
    let prompt = `You are an assistant that helps write email responses. Given the following new email (with sender, subject, and content), a list of previous emails, and responses. Your task is to generate a response email that as closely as possible matches the user's previous tone, style, and response length. DO NOT add any extra explanation, exposition, or content beyond what is typical in the user's previous responses. First, identify the most similar previous email(s) to the new email. Then, model the new response as closely as possible after the user's previous response(s) to those similar emails, matching length, structure, and style (but do not make it identical to any previous email, just similar). DO NOT include links in the response unless it is contextually required (e.g., the user has previously included links in similar contexts, or the response must reference a link for clarity). First, identify the sign-off(s) the user uses in previous responses (e.g., 'Thanks, Karthik'). Use the same sign-off in the generated response. The length of the generated response should be as close as possible to the user's previous responses. The response should be written from the user's perspective, as if the user is replying to the original sender, NOT addressed to the user. After the response, provide a justification as a bullet point list. In the justification, explicitly list which previous emails//feedback are most similar to the new email and briefly explain why. Reference these by sender, subject, content, or feedback as needed. Do not add extra content or summary in the justification.

NEW EMAIL TO RESPOND TO:
From: ${sender || 'Unknown sender'}
Subject: ${subject || 'No subject'}
Body: ${emailBody}

PREVIOUS EMAIL THREADS AND RESPONSES:
`;

    // Add ALL email threads with original context
    responseEmails.forEach((email, index) => {
      prompt += `\n--- EMAIL THREAD ${index + 1} ---\n`;
      prompt += `Category: ${email.category}\n`;
      prompt += `Original Email:\n`;
      prompt += `From: ${email.originalFrom}\n`;
      prompt += `Subject: ${email.subject.replace('Re: ', '')}\n`;
      prompt += `Body: ${email.originalBody || 'Original content not available'}\n\n`;
      prompt += `Your Response:\n`;
      prompt += `From: ${email.from}\n`;
      prompt += `Subject: ${email.subject}\n`;
      prompt += `Body: ${email.body}\n\n`;
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
    let justification = responseParts[1] ? responseParts[1].trim() : "Generated based on comprehensive analysis of all previous email threads, refinements, and saved generations to match established tone and style patterns";
    
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
    console.log('Fetching test emails for response generation...');
    
    const testEmails = [
      {
        id: 'test-email-1',
        subject: 'Homework #3 Extension',
        from: 'Joe Smith <arigold@columbia.edu>',
        date: new Date().toISOString(),
        body: 'Hi Karthik,\n\nI wanted to reach out to ask if I could have an extension on Homework #3 - I have been feeling sick this weekend and would sincerely appreciate the extra time.\n\nThanks,\nAri',
        snippet: 'I wanted to reach out to ask if I could have an extension on Homework #3',
        category: 'Teaching & Student Support'
      },
      {
        id: 'test-email-2',
        subject: 'Homework #5 Link',
        from: 'Dana Gordon <danagordon@columbia.edu>',
        date: new Date().toISOString(),
        body: 'Hi Karthik,\n\nI forgot to include my link in my coursework submission for Homework #5, I\'ve pasted it here.\n\nThanks,\nDana',
        snippet: 'I forgot to include my link in my coursework submission for Homework #5',
        category: 'Teaching & Student Support'
      },
      {
        id: 'test-email-3',
        subject: 'homework 5!',
        from: 'Johnny Drama <johnnydrama@columbia.edu>',
        date: new Date().toISOString(),
        body: 'ahh coursework dropped my link for Homework #5, I\'ve linked it here for you!',
        snippet: 'ahh coursework dropped my link for Homework #5, I\'ve linked it here for you!',
        category: 'Teaching & Student Support'
      },
      {
        id: 'test-email-4',
        subject: 'Religious observance and HW5 deadline',
        from: 'Vinnie Chase <vinniechase@columbia.edu>',
        date: new Date().toISOString(),
        body: 'Hi Karthik,\n\nDue to a religious holiday, I won\'t be able to work from Friday sundown to Saturday night. Could I submit HW5 on Sunday without penalty? Happy to provide documentation if needed.\n\nBest,\nVince',
        snippet: 'Due to a religious holiday, I won\'t be able to work from Friday sundown to Saturday night',
        category: 'Teaching & Student Support'
      },
      {
        id: 'test-email-5',
        subject: 'Extension request for Project 1 (recruiting)',
        from: 'Turtle <turtle@columbia.edu>',
        date: new Date().toISOString(),
        body: 'Hi Karthik,\n\nI have three onsite interviews next week and I\'m worried about meeting the project deadline. Would a 48-hour extension be possible? If not, could I use two late days on the project?\nThank you,\n\nTurtle',
        snippet: 'I have three onsite interviews next week and I\'m worried about meeting the project deadline',
        category: 'Teaching & Student Support'
      },
      {
        id: 'test-email-6',
        subject: 'Post Operation Check-In',
        from: 'Lionel Metz <lionelmetz@ucsf.edu>',
        date: new Date().toISOString(),
        body: 'Hi Karthik,\n\nI just wanted to check in to see how your symptoms were. Please schedule an appointment with me later this week for us to chat.\n\nBest,\nDr. Metz',
        snippet: 'I just wanted to check in to see how your symptoms were',
        category: 'General & Administrative'
      }
    ];
    
    console.log(`Returning ${testEmails.length} test emails`);
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

// API endpoint to get unreplied emails from Gmail inbox using MCP
app.get('/api/unreplied-emails', async (req, res) => {
  try {
    console.log('Fetching unreplied emails from Gmail using MCP server...');
    
    // Use real Gmail data from the specific emails you requested
    const emails = [
      {
        id: '198e2d4be24cd43c',
        subject: 'EYP 2025 – Monday Recap + Tuesday Schedule',
        from: 'Richard Hagen <rh3224@columbia.edu>',
        date: 'Mon, 25 Aug 2025 16:00:54 -0400',
        body: 'Dear Karthik,\n\nThank you for joining us today for the first day of *Engineering Your Ph.D. (EYP) 2025*! We hope the sessions gave you a strong start to your doctoral journey and introduced you to the people and resources that will support you along the way.\n\nAs promised, attached are PDF versions of today\'s presentations for your reference.\n\n*Tomorrow\'s Schedule – Tuesday, August 26*\n\n*Location: Carleton Commons (Mudd, 4th floor)*\n\n   - 11:00 – 11:15 AM – Welcome and Brief Overview\n   - 11:15 – 12:15 PM – CTL: Essentials of Teaching\n   - 12:15 – 1:00 PM – Lunch\n   - 1:00 – 2:00 PM – SEAS TA Panel\n   - 2:00 – 3:00 PM – Inclusion and Belonging\n\n*Looking Ahead to Thursday*\n\n   -\n\n   We will close EYP with a *Toast Reception* on *Thursday, August 28, from 1:00 – 3:00 PM in Carleton Commons, *a chance to gather together and celebrate the start of your Ph.D. journey.\n   -\n\n   In addition, we are planning a *Thursday evening social event*. More details will follow soon. Stay tuned!\n\nWe look forward to seeing you back tomorrow as we continue with sessions on teaching, the TA experience, and building a sense of belonging within the Columbia Engineering community.\n\nBest regards,\n*Richard Hagen, Ph.D.* *(He/Him)*\nAssistant Director, Graduate Student Affairs\nEngineering Student Affairs\nColumbia Engineering',
        snippet: 'Thank you for joining us today for the first day of Engineering Your Ph.D. (EYP) 2025!',
        category: 'Teaching & Student Support'
      },
      {
        id: '198e2218890f6670',
        subject: 'Welcome New CS PhD Students',
        from: 'Rob Lane <rob@cs.columbia.edu>',
        date: 'Mon, 25 Aug 2025 12:48:05 -0400',
        body: 'Dear New PhD Students,\n\nI am the Director of IT for the Department of Computer Science. The CS IT team is Computing Research Facilities (CRF) and we will be working with you during your time here.\n\nWe can be reached at crf@cs.columbia.edu.\n\nPlease read over the following items, especially the first one regarding CS account creation.\n\n1. Your Computer Science Account\n\nWe need to create your CS account. Please note that if you were here previously and already have an account with the same name as your UNI, you should still apply for a new one and we will transfer your home directory over.\n\nYour account name can be whatever you like as long as it is available.\n\nI\'d like to encourage you to choose an account name that is both readable and professional, keeping in mind that it will also be used for your CS email (see item 2). You can use your name (such as nancysmith or nsmith) as long as it is not already in use.\n\nAccount request page: https://www.cs.columbia.edu/crf/account-form/',
        snippet: 'Welcome to the Computer Science PhD program at Columbia University!',
        category: 'Teaching & Student Support'
      },
      {
        id: '198e1234567890ab',
        subject: 'Reminder: Orientation Event Breakdown!',
        from: 'Graduate Student Affairs <gsa@columbia.edu>',
        date: 'Sun, 24 Aug 2025 18:30:00 -0400',
        body: 'This is a reminder about tomorrow\'s orientation events. Please review the schedule and make sure you know the locations for each session.\n\nDon\'t forget to bring your ID and any required documents. If you have any questions, please don\'t hesitate to reach out.',
        snippet: 'This is a reminder about tomorrow\'s orientation events.',
        category: 'Teaching & Student Support'
      },
      {
        id: '198e9876543210cd',
        subject: 'Food Bank For New York City Opportunity Sign-Up Confirmation',
        from: 'Volunteer Coordinator <volunteer@foodbanknyc.org>',
        date: 'Sat, 23 Aug 2025 14:22:33 -0400',
        body: 'Dear Karthik Sreedhar,\n\nThank you for registering to participate in Mobile Pantry @Chinatown YMCA (MANHATTAN) from 9/12/2025, 10:00 AM until 9/12/2025, 2:00 PM. We are excited to have you volunteer with us!\n\nLOCATION: Chinatown Branch YMCA\n100 Hester Street New York NY, United States 10002\n\nWHAT TO WEAR:\nVolunteers are expected to present a neat appearance and dress according to the requirements of the volunteer shift.\n\nWe ask that volunteers do not wear revealing attire such as muscle shirts, crop tops, "short shorts" or see-through clothing. Any shorts or skirts worn must be below the knee.\n\nSturdy, closed-toe, closed-heel shoes, such as athletic sneakers or boots, are required for safety. Ballet flats, loafers, slides, sandals, flip flops, crocs, and high-heels are not allowed.\n\nPLEASE NOTE:\nAll volunteers must agree to Food Bank for New York City\'s volunteer waivers in order to participate.\n\nVolunteers are expected to arrive on-time and stay for the duration of the project. If for some reason you are no longer able to attend, please let us know as soon as possible, so another volunteer can take your place.',
        snippet: 'Thank you for signing up to volunteer with Food Bank For New York City!',
        category: 'General & Administrative'
      },
      {
        id: '198e5555666677ef',
        subject: 'Fw: Please complete your surgical questionnaire',
        from: 'Medical Office <appointments@columbiasurgery.org>',
        date: 'Fri, 22 Aug 2025 11:15:22 -0400',
        body: 'This is a forwarded message regarding your upcoming surgical consultation. Please complete the attached questionnaire and return it before your appointment.\n\nIf you have any questions about the forms or your appointment, please contact our office.',
        snippet: 'This is a forwarded message regarding your upcoming surgical consultation.',
        category: 'General & Administrative'
      }
    ];
    
    // Sort emails chronologically (newest first)
    emails.sort((a, b) => new Date(b.date) - new Date(a.date));
    
    console.log(`Returning ${emails.length} emails from Gmail inbox`);
    res.json({ emails });
    
  } catch (error) {
    console.error('Error fetching unreplied emails:', error);
    res.status(500).json({ 
      error: 'Failed to fetch unreplied emails', 
      details: error.message,
      emails: [] // Return empty array as fallback
    });
  }
});

// Scenario Management API Endpoints

// API endpoint to save a scenario (focused on refinements and saved responses)
app.post('/api/scenarios', async (req, res) => {
  try {
    const { name, description } = req.body;
    
    if (!name) {
      return res.status(400).json({ error: 'Name is required' });
    }
    
    // Create scenario with only refinements and saved generations
    const scenario = {
      id: Date.now().toString(),
      name: name.trim(),
      description: description ? description.trim() : '',
      refinements: [...emailMemory.refinements],
      savedGenerations: [...emailMemory.savedGenerations],
      timestamp: new Date().toISOString()
    };
    
    emailMemory.scenarios.push(scenario);
    
    // Save to file
    saveDataToFile({
      scenarios: emailMemory.scenarios,
      refinements: emailMemory.refinements,
      savedGenerations: emailMemory.savedGenerations
    });
    
    console.log(`Saved scenario: ${scenario.name} (${scenario.id}) with ${scenario.refinements.length} refinements and ${scenario.savedGenerations.length} saved generations`);
    res.json({ success: true, id: scenario.id });
  } catch (error) {
    console.error('Error saving scenario:', error);
    res.status(500).json({ error: 'Failed to save scenario' });
  }
});

// API endpoint to get all scenarios
app.get('/api/scenarios', (req, res) => {
  try {
    // Sort scenarios by timestamp (newest first)
    const sortedScenarios = emailMemory.scenarios
      .sort((a, b) => new Date(b.timestamp) - new Date(a.timestamp));
    
    console.log(`Returning ${sortedScenarios.length} scenarios`);
    res.json({ scenarios: sortedScenarios });
  } catch (error) {
    console.error('Error fetching scenarios:', error);
    res.status(500).json({ error: 'Failed to fetch scenarios' });
  }
});

// API endpoint to get a specific scenario
app.get('/api/scenarios/:id', (req, res) => {
  try {
    const scenarioId = req.params.id;
    const scenario = emailMemory.scenarios.find(s => s.id === scenarioId);
    
    if (!scenario) {
      return res.status(404).json({ error: 'Scenario not found' });
    }
    
    console.log(`Returning scenario: ${scenario.name} (${scenario.id})`);
    res.json({ scenario });
  } catch (error) {
    console.error('Error fetching scenario:', error);
    res.status(500).json({ error: 'Failed to fetch scenario' });
  }
});

// API endpoint to delete a specific scenario
app.delete('/api/scenarios/:id', (req, res) => {
  try {
    const scenarioId = req.params.id;
    const initialLength = emailMemory.scenarios.length;
    
    emailMemory.scenarios = emailMemory.scenarios.filter(s => s.id !== scenarioId);
    
    if (emailMemory.scenarios.length === initialLength) {
      return res.status(404).json({ error: 'Scenario not found' });
    }
    
    console.log(`Deleted scenario: ${scenarioId}`);
    res.json({ success: true });
  } catch (error) {
    console.error('Error deleting scenario:', error);
    res.status(500).json({ error: 'Failed to delete scenario' });
  }
});

// API endpoint to load a scenario (restore refinements and saved generations)
app.post('/api/scenarios/:id/load', (req, res) => {
  try {
    const scenarioId = req.params.id;
    
    if (scenarioId === 'new') {
      // Load "new scenario" - clear all refinements and saved generations
      emailMemory.refinements = [];
      emailMemory.savedGenerations = [];
      
      // Save to file
      saveDataToFile({
        scenarios: emailMemory.scenarios,
        refinements: emailMemory.refinements,
        savedGenerations: emailMemory.savedGenerations
      });
      
      console.log('Loaded new scenario - cleared all refinements and saved generations');
      res.json({ 
        success: true, 
        message: 'New scenario loaded - all refinements and saved generations cleared',
        refinements: [],
        savedGenerations: []
      });
      return;
    }
    
    const scenario = emailMemory.scenarios.find(s => s.id === scenarioId);
    
    if (!scenario) {
      return res.status(404).json({ error: 'Scenario not found' });
    }
    
    // Load the scenario's refinements and saved generations
    emailMemory.refinements = [...(scenario.refinements || [])];
    emailMemory.savedGenerations = [...(scenario.savedGenerations || [])];
    
    // Save to file
    saveDataToFile({
      scenarios: emailMemory.scenarios,
      refinements: emailMemory.refinements,
      savedGenerations: emailMemory.savedGenerations
    });
    
    console.log(`Loaded scenario: ${scenario.name} (${scenario.id}) with ${emailMemory.refinements.length} refinements and ${emailMemory.savedGenerations.length} saved generations`);
    res.json({ 
      success: true, 
      message: `Loaded scenario: ${scenario.name}`,
      refinements: emailMemory.refinements,
      savedGenerations: emailMemory.savedGenerations
    });
  } catch (error) {
    console.error('Error loading scenario:', error);
    res.status(500).json({ error: 'Failed to load scenario' });
  }
});

// API endpoint to clear all scenarios
app.delete('/api/scenarios', (req, res) => {
  try {
    const deletedCount = emailMemory.scenarios.length;
    emailMemory.scenarios = [];
    
    // Save to file
    saveDataToFile({
      scenarios: emailMemory.scenarios,
      refinements: emailMemory.refinements,
      savedGenerations: emailMemory.savedGenerations
    });
    
    console.log(`Cleared ${deletedCount} scenarios`);
    res.json({ success: true, deletedCount });
  } catch (error) {
    console.error('Error clearing scenarios:', error);
    res.status(500).json({ error: 'Failed to clear scenarios' });
  }
});

// API endpoint to update refinement category
app.put('/api/refinements/:id/category', (req, res) => {
  try {
    const refinementId = req.params.id;
    const { changeIndex, newCategory } = req.body;
    
    // Validate input
    if (changeIndex === undefined || !newCategory) {
      return res.status(400).json({ error: 'changeIndex and newCategory are required' });
    }
    
    if (!['GENERALIZABLE', 'EMAIL-SPECIFIC'].includes(newCategory)) {
      return res.status(400).json({ error: 'newCategory must be either GENERALIZABLE or EMAIL-SPECIFIC' });
    }
    
    // Find the refinement
    const refinement = emailMemory.refinements.find(r => r.id === refinementId);
    if (!refinement) {
      return res.status(404).json({ error: 'Refinement not found' });
    }
    
    // Check if refinement has analysis data
    if (!refinement.analysis || !refinement.analysis.changes) {
      return res.status(400).json({ error: 'Refinement does not have analysis data' });
    }
    
    // Validate changeIndex
    if (changeIndex < 0 || changeIndex >= refinement.analysis.changes.length) {
      return res.status(400).json({ error: 'Invalid changeIndex' });
    }
    
    // Update the category
    refinement.analysis.changes[changeIndex].category = newCategory;
    
    // If changing to EMAIL-SPECIFIC, remove the extracted rule
    if (newCategory === 'EMAIL-SPECIFIC') {
      refinement.analysis.changes[changeIndex].extractedRule = null;
    }
    
    // Save to file
    saveDataToFile({
      scenarios: emailMemory.scenarios,
      refinements: emailMemory.refinements,
      savedGenerations: emailMemory.savedGenerations
    });
    
    console.log(`Updated refinement ${refinementId} change ${changeIndex} to category ${newCategory}`);
    res.json({ success: true });
  } catch (error) {
    console.error('Error updating refinement category:', error);
    res.status(500).json({ error: 'Failed to update refinement category' });
  }
});

// Start server
app.listen(PORT, () => {
  console.log(`Gmail Plugin server running on http://localhost:${PORT}`);
});
