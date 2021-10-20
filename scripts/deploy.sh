#!/usr/bin/env bash
set -euo pipefail

SCRIPTS_DIR="$( cd "$( dirname "${BASH_SOURCE[0]}" )" >/dev/null 2>&1 && pwd )"
PROJECT_DIR="$( cd "${SCRIPTS_DIR}" && cd .. && pwd )"

if [[ -f "${PROJECT_DIR}/.env" ]]; then
  set -o allexport
  source "${PROJECT_DIR}/.env"
  set +o allexport
fi

cd "${PROJECT_DIR}"

yarn build



ssh $1 "mkdir -p ~/hive-watcher/data"
scp -r ./dist $1:~/hive-watcher
scp package.json $1:~/hive-watcher
ssh $1 "cd ~/hive-watcher/data; yarn install"
