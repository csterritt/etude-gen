#!/bin/bash
set -euo pipefail

if [ $(/bin/ls .wrangler/state/v3/d1/miniflare-D1DatabaseObject/*.sqlite  | wc -l) != 1 ] ; then
  echo "Cannot find a single sqlite database in .wrangler."
  exit 1
fi
DB_PATH=$(/bin/ls .wrangler/state/v3/d1/miniflare-D1DatabaseObject/*.sqlite)

sqlite-utils insert $DB_PATH account - --pk id < tmp/account_dump.json
sqlite-utils insert $DB_PATH user - --pk id < tmp/user_dump.json
