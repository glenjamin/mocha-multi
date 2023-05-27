#!/bin/bash

multi_file_out=$(mktemp /tmp/mocha-multi-custom-esm-reporter.stdout.XXXXXXXXX)
test_results=$(MOCHA_MULTI_TMP_STDOUT=$multi_file_out node mocha-run-esm-reporter.mjs)
actual=$?
expected=2

function log {
  local color
  if [ "$2" = "info" ]; then
    color="" # normal
  elif [ "$2" = "fail" ]; then
    color="\033[01;31m" # red
  elif [ "$2" = "pass" ]; then
    color="\033[01;32m" # green
  else
    color="\033[01;30m" # grey
  fi
  echo -e "${color}VERIFY: $1${normal}" 1>&2
}

log "$test_results" info

# Clean up temporary files
rm $multi_file_out

if [[ "$actual" == "$expected" ]]; then
  log "Expected $expected test(s) to fail. Custom reporter working as expected." pass
else
  log "Expected $expected test(s) to fail, but we got $actual failures instead." fail
  exit 1
fi
