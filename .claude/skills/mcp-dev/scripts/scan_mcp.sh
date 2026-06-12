#!/usr/bin/env bash
set -euo pipefail

rg -n "mcp" src dev-docs || true
