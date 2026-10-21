#!/bin/bash
# Production server is hosted on Railway Cloud: https://breeze-production-0f70.up.railway.app
# Zero local deployments or ephemeral tunnels allowed.

echo "================================================================="
echo "  🚀 ENTERPRISE WABA AI BOT IS HOSTED 24/7 ON RAILWAY CLOUD"
echo "================================================================="
echo "  Cloud Health URL:   https://breeze-production-0f70.up.railway.app/health"
echo "  Cloud Webhook URL:  https://breeze-production-0f70.up.railway.app/webhook"
echo "  Verify Token:       guri_enterprise_waba_token_2026"
echo "================================================================="

node /root/enterprise-waba-ai/subscribe_cloud_railway.js
