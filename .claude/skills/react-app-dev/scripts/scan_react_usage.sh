#!/usr/bin/env bash
set -euo pipefail

echo "== Store usage in components/hooks/pages =="
rg -n "use[A-Za-z]+Store" src/components src/hooks src/pages || true

echo "== Potential store destructuring patterns =="
rg -n "const \{[^}]+\} = use[A-Za-z]+Store" src/components src/hooks src/pages || true

echo "== Direct vendor SDK imports outside the provider layer (should be empty) =="
rg -n "@anthropic-ai|openai|@google/genai|google-generativeai|ollama" src/components src/hooks src/pages src/lib || true

echo "== Provider layer surface =="
rg -n "ProviderInterface|createProvider|StreamChunk|provider" src/providers || true
