#!/bin/bash
set -e
pnpm install --frozen-lockfile
# This setup hook targets development only. Publish applies the additive schema
# diff to production; never run a whole-schema push from the production app.
pnpm --filter @workspace/db push
pnpm --filter @workspace/scripts run import-postal-directory
