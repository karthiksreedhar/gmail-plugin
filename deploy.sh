#!/bin/bash

# Gmail Plugin - Vercel Deployment Script
# This script automates the deployment process to Vercel

set -e  # Exit on error

echo "🚀 Gmail Plugin - Vercel Deployment"
echo "===================================="
echo ""

# Check if .env file exists
if [ ! -f .env ]; then
    echo "⚠️  .env file not found!"
    echo "Creating from .env.example..."
    cp .env.example .env
    echo "✓ Created .env file"
    echo ""
    echo "⚠️  IMPORTANT: Edit .env with your credentials before deploying:"
    echo "   - OPENAI_API_KEY"
    echo "   - MONGODB_URI"
    echo "   - BASE_URL (will be your Vercel URL)"
    echo "   - CRON_SECRET (generate with: openssl rand -hex 32)"
    echo ""
    read -p "Press Enter when you've updated .env file..."
fi

# Check if Vercel CLI is installed
if ! command -v vercel &> /dev/null; then
    echo "⚠️  Vercel CLI not found!"
    echo "Installing Vercel CLI..."
    npm install -g vercel
    echo "✓ Vercel CLI installed"
    echo ""
fi

# Check if user is logged in to Vercel
echo "Checking Vercel authentication..."
if ! vercel whoami &> /dev/null; then
    echo "Please log in to Vercel:"
    vercel login
fi
echo "✓ Authenticated with Vercel"
echo ""

# Check if project is linked to Vercel
echo "Checking project link..."
if [ ! -f .vercel/project.json ]; then
    echo "⚠️  Project not linked to Vercel yet"
    echo "Creating new Vercel project..."
    echo ""
    echo "You'll be prompted to:"
    echo "  1. Set up and deploy? → Yes"
    echo "  2. Which scope? → Choose your account"
    echo "  3. Link to existing project? → No"
    echo "  4. Project name? → gmail-plugin (or your choice)"
    echo "  5. Code location? → ./ (press Enter)"
    echo ""
    read -p "Press Enter to continue with vercel link..."
    vercel link
    echo "✓ Project linked to Vercel"
else
    echo "✓ Project already linked to Vercel"
fi
echo ""

# Confirm deployment
echo "Ready to deploy to Vercel!"
echo ""
read -p "Deploy to production? (y/N): " confirm

if [[ $confirm != [yY] ]]; then
    echo "❌ Deployment cancelled"
    exit 0
fi

echo ""
echo "📦 Deploying to Vercel..."
echo ""

# Deploy to production
vercel --prod

echo ""
echo "✅ Deployment complete!"
echo ""
echo "📋 Next Steps:"
echo "   1. Go to Vercel dashboard: https://vercel.com/dashboard"
echo "   2. Navigate to your project > Settings > Environment Variables"
echo "   3. Add the following variables from your .env file:"
echo "      - OPENAI_API_KEY"
echo "      - MONGODB_URI"
echo "      - CURRENT_USER_EMAIL"
echo "      - SENDING_EMAIL"
echo "      - BASE_URL (your Vercel deployment URL)"
echo "      - CRON_SECRET"
echo "      - NODE_ENV=production"
echo ""
echo "   4. Redeploy after adding environment variables:"
echo "      vercel --prod"
echo ""
echo "   5. Visit your deployment URL and authenticate with Gmail"
echo ""
echo "📖 Full deployment guide: VERCEL_DEPLOYMENT.md"
