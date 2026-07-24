# Dual Column Inbox Layout

## Overview

The Dual Column Inbox Layout feature reorganizes your Gmail inbox display into a more intuitive two-column layout. Important emails appear in the left column, starred emails in the right column, and all remaining emails are displayed below in a single column. This layout helps you prioritize and quickly locate your most critical messages at a glance.

## Features

- **Dual Column Display**: View important and starred emails side-by-side at the top of your inbox
- **Smart Email Categorization**: Automatically separates emails into three categories:
  - Important emails (left column)
  - Starred emails (right column)
  - Other emails (below)
- **Toggle On/Off**: Easily enable or disable the layout with a single button click
- **Persistent Settings**: Your layout preference is saved in browser storage and persists across sessions
- **Responsive Design**: Layout automatically adapts to smaller screens by stacking columns vertically
- **Email Count Badges**: Each section displays the number of emails in that category
- **Color-Coded Headers**: Visual distinction between sections with red (Important), orange (Starred), and green (Other) headers

## Installation

1. Navigate to your Gmail Plugin installation directory
2. Copy the feature files to the `data/features/` directory
3. Ensure the feature ID is `dual-column-inbox-layout`
4. Restart your server to load the feature
5. The feature will automatically initialize when the Gmail Plugin loads

## Usage

### Enabling the Feature

1. Open your Gmail inbox in the plugin
2. Look for the **"Toggle Dual Column"** button in the header toolbar (blue button)
3. Click the button to enable the dual column layout
4. Your inbox will reorganize to display important emails on the left and starred emails on the right
5. A success message will confirm the layout has been enabled

### Disabling the Feature

1. Click the **"Toggle Dual Column"** button again
2. Your inbox will return to the standard single-column layout
3. A success message will confirm the layout has been disabled

### Viewing Your Emails

- **Important Emails**: Located in the left column with a red header showing the count
- **Starred Emails**: Located in the right column with an orange header showing the count
- **Other Emails**: Displayed below the dual columns with a green header showing the count
- Click any email to open and read its full content
- Use action buttons on each email item without affecting the layout

## UI Components

### Header Button
- **Name**: Toggle Dual Column
- **Style**: Blue information button
- **Location**: Email header toolbar
- **Function**: Toggles the dual column layout on and off

### Dual Column Container
- **Layout**: CSS Grid with two equal-width columns
- **Gap**: 20px spacing between columns
- **Responsive**: Stacks to single column on screens smaller than 1024px width

### Column Headers
- **Important Header**: Red (#d9534f) with bottom border
- **Starred Header**: Orange (#f0ad4e) with bottom border
- **Other Header**: Green (#5cb85c) with bottom border
- Each header displays the category name and email count in parentheses

### Email Items
- Maintains original styling and functionality
- Displays within their respective columns
- 12px gap between individual email items
- Click handlers preserved for opening emails

## Troubleshooting

### Layout Not Appearing

**Problem**: The dual column layout doesn't appear after clicking the toggle button.

**Solution**:
1. Check browser console for error messages (F12 → Console tab)
2. Verify that the `.email-list` container exists in the DOM
3. Ensure the EmailAssistant API is properly loaded
4. Try refreshing the page and toggling the layout again
5. Clear browser cache and reload

### Emails Not Displaying Correctly

**Problem**: Emails appear in the wrong columns or some emails are missing.

**Solution**:
1. Verify that emails have proper category tags (`.email-category` elements)
2. Check that email items have the `.email-item` class
3. Ensure the email categorization system is working correctly
4. Try disabling and re-enabling the layout
5. Reload the page to refresh the email list

### Click Handlers Not Working

**Problem**: Clicking on emails doesn't open them.

**Solution**:
1. Verify that the `openEmailThread` function is available in the window object
2. Ensure email items have the `data-email-id` attribute
3. Check that action buttons are not interfering with click events
4. Try disabling the layout and re-enabling it
5. Check browser console for JavaScript errors

### Layout Not Responsive on Mobile

**Problem**: Columns don't stack on smaller screens.

**Solution**:
1. Verify window resize event listeners are active
2. Check that the viewport meta tag is properly configured
3. Ensure CSS media queries are not conflicting
4. Try rotating your device or resizing the browser window
5. Clear browser cache and reload

### Settings Not Persisting

**Problem**: Layout preference resets after closing the browser.

**Solution**:
1. Check that localStorage is enabled in your browser
2. Verify that private/incognito mode is not active
3. Check browser storage quota hasn't been exceeded
4. Clear browser cache and cookies, then try again
5. Check browser console for localStorage errors

### Performance Issues

**Problem**: Layout reorganization is slow or causes lag.

**Solution**:
1. Reduce the number of emails displayed at once
2. Disable other browser extensions that might interfere
3. Check browser console for performance warnings
4. Try disabling and re-enabling the layout
5. Ensure your browser is up to date

### API Not Available

**Problem**: Error message "EmailAssistant API not available"

**Solution**:
1. Verify the Gmail Plugin is properly installed and running
2. Check that the plugin has fully loaded before using the feature
3. Ensure no JavaScript errors are preventing API initialization
4. Restart the server and reload the page
5. Check browser console for detailed error messages